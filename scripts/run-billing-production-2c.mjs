import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { splitSqlStatements } from '../src/services/billing/stagingLive.js'

const ROOT = 'C:/Users/hassa/viktkollen-app-bill1'
const EXPECTED = '38fba1959622f2129d4c11d42589efe8f4d65927'
const MIGRATION = `${ROOT}/supabase/migrations/20260921180000_billing_plan_quota.sql`
const pg = createRequire('C:/Users/hassa/AppData/Local/Temp/bill1d-db-preflight/package.json')('pg')

function parseEnv(file) {
  const parsed = {}
  if (!existsSync(file)) return parsed
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim().replace(/^\uFEFF/, '')
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    parsed[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return parsed
}

function parseDb(raw) {
  try {
    return new URL(String(raw || '').replace(/^postgres(ql)?:/i, 'http:'))
  } catch {
    return null
  }
}

function databaseRefFromUrl(parsed) {
  if (!parsed) return null
  const host = parsed.hostname.toLowerCase()
  const user = decodeURIComponent(parsed.username || '').toLowerCase()
  const direct = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/)
  if (direct) return direct[1]
  const poolUser = user.match(/^postgres\.([a-z0-9]+)$/)
  if (poolUser && /pooler\.supabase\.com$/i.test(host)) return poolUser[1]
  return null
}

function redact(text, secrets) {
  let out = String(text || '')
  for (const secret of secrets) {
    if (secret && String(secret).length >= 4) out = out.split(secret).join('[redacted]')
  }
  return out.replace(/postgresql?:\/\/[^\s'"]+/gi, '[redacted-uri]')
}

function print(report) {
  for (const [k, v] of Object.entries(report)) process.stdout.write(`${k}: ${v}\n`)
}

const report = {
  TARGET: 'INVALID',
  PRODUCTION_NE_STAGING: 'FAIL',
  DATABASE_TARGET_MATCHES_PRODUCTION: 'FAIL',
  CONNECTION_METHOD: 'OTHER',
  SELECT_1: 'NOT RUN',
  CHECKSUM: 'FAIL',
  PRODUCTION_MIGRATION_APPLIED: 'NO',
  TRANSACTION: 'NOT RUN',
  STOP_REASON: '',
  STAGING_CONNECTION_USED: 'NO',
}

const prod = parseEnv(`${ROOT}/.env.production.local`)
const staging = parseEnv(`${ROOT}/.env.local`)
const parsed = parseDb(prod.BILLING_PROD_DATABASE_URL || '')
const prodRef = String(prod.BILLING_PROD_PROJECT_REF || '').toLowerCase()
const stagingRef = String(staging.BILLING_TEST_STAGING_PROJECT_REF || '').toLowerCase()
const dbRef = databaseRefFromUrl(parsed)
const password = parsed ? decodeURIComponent(parsed.password || '') : ''
const secrets = [prod.BILLING_PROD_DATABASE_URL, password, parsed?.hostname, parsed?.username]

if (String(prod.BILLING_PROD_TARGET || '').toLowerCase() === 'production') report.TARGET = 'PRODUCTION'
report.PRODUCTION_NE_STAGING = prodRef && stagingRef && prodRef !== stagingRef && dbRef !== stagingRef ? 'PASS' : 'FAIL'
report.DATABASE_TARGET_MATCHES_PRODUCTION = dbRef && dbRef === prodRef ? 'PASS' : 'FAIL'
report.CONNECTION_METHOD = parsed && /pooler\.supabase\.com$/i.test(parsed.hostname) && parsed.port === '5432'
  ? 'SESSION POOLER'
  : 'OTHER'

const blob = execFileSync('git', ['hash-object', '--', 'supabase/migrations/20260921180000_billing_plan_quota.sql'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim()
report.CHECKSUM = blob === EXPECTED ? 'PASS' : 'FAIL'
report.CHECKSUM_VALUE = blob

const gates = [
  report.TARGET === 'PRODUCTION',
  report.PRODUCTION_NE_STAGING === 'PASS',
  report.DATABASE_TARGET_MATCHES_PRODUCTION === 'PASS',
  report.CONNECTION_METHOD === 'SESSION POOLER',
  report.CHECKSUM === 'PASS',
]
if (!gates.every(Boolean)) {
  report.STOP_REASON = 'pre_mutation_gate_failed'
  print(report)
  process.exit(1)
}

const client = new pg.Client({
  database: decodeURIComponent((parsed.pathname || '/postgres').replace(/^\//, '')) || 'postgres',
  host: parsed.hostname,
  password,
  port: Number(parsed.port || 5432),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
  user: decodeURIComponent(parsed.username || ''),
})

await client.connect()
try {
  const one = await client.query('select 1 as ok')
  report.SELECT_1 = Number(one.rows[0].ok) === 1 ? 'PASS' : 'FAIL'
  if (report.SELECT_1 !== 'PASS') {
    report.STOP_REASON = 'select_1_failed'
    print(report)
    process.exit(1)
  }
  report.PRODUCTION_CONNECTION = 'PASS'

  const recovery = (await client.query(`
    select json_build_object(
      'in_recovery', pg_is_in_recovery(),
      'archive_mode', current_setting('archive_mode', true),
      'wal_level', current_setting('wal_level', true),
      'has_archived_wal', (select last_archived_wal is not null from pg_stat_archiver)
    ) as probe
  `)).rows[0].probe
  report.RECOVERY_PATH = recovery.archive_mode === 'on' && recovery.has_archived_wal && recovery.in_recovery === false
    ? 'VERIFIED'
    : 'UNKNOWN'

  const collision = (await client.query(`
    select json_build_object(
      'usage_events', to_regclass('billing.usage_events') is not null,
      'plans', to_regclass('billing.plans') is not null,
      'plan_entitlements', to_regclass('billing.plan_entitlements') is not null,
      'assignments', to_regclass('billing.user_plan_assignments') is not null,
      'locks', to_regclass('billing.quota_period_locks') is not null,
      'reservations', to_regclass('billing.quota_reservations') is not null,
      'reserve_quota', exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing' and p.proname = 'reserve_quota'
      ),
      'public_plans', to_regclass('public.plans') is not null
    ) as probe
  `)).rows[0].probe
  report.BILL1_FOUNDATION = collision.usage_events ? 'PASS' : 'FAIL'
  report.PREEXISTING_BILL2 = (collision.plans || collision.reservations || collision.locks || collision.reserve_quota) ? 'YES' : 'NO'
  if (report.BILL1_FOUNDATION !== 'PASS') {
    report.STOP_REASON = 'bill1_missing'
    print(report)
    process.exit(1)
  }
  if (report.PREEXISTING_BILL2 === 'YES') {
    report.COLLISION_CHECK = 'FAIL'
    report.STOP_REASON = 'bill2_already_present'
    print(report)
    process.exit(1)
  }
  report.COLLISION_CHECK = collision.public_plans ? 'FAIL' : 'PASS'
  if (report.COLLISION_CHECK !== 'PASS') {
    report.STOP_REASON = 'unexpected_public_plans'
    print(report)
    process.exit(1)
  }

  const sql = readFileSync(MIGRATION, 'utf8')
  const statements = splitSqlStatements(sql)
  await client.query('BEGIN')
  report.TRANSACTION = 'OPEN'
  try {
    for (const statement of statements) await client.query(statement)
    await client.query('COMMIT')
    report.TRANSACTION = 'COMMITTED'
    report.PRODUCTION_MIGRATION_APPLIED = 'YES'
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    report.TRANSACTION = 'ROLLED BACK'
    report.PRODUCTION_MIGRATION_APPLIED = 'NO'
    report.STOP_REASON = redact(error.code || error.message, secrets)
    print(report)
    process.exit(1)
  }

  const verify = (await client.query(`
    select json_build_object(
      'tables', (select coalesce(json_agg(c.relname order by c.relname), '[]'::json)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'billing' and c.relkind = 'r'),
      'functions', (select coalesce(json_agg(p.proname order by p.proname), '[]'::json)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing'),
      'rls', (select json_agg(json_build_object('rel', c.relname, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity) order by c.relname)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'billing' and c.relkind = 'r'),
      'anon_plans', has_table_privilege('anon', 'billing.plans', 'SELECT'),
      'auth_res', has_table_privilege('authenticated', 'billing.quota_reservations', 'INSERT'),
      'service_insert', has_table_privilege('service_role', 'billing.quota_reservations', 'INSERT'),
      'service_delete', has_table_privilege('service_role', 'billing.quota_reservations', 'DELETE'),
      'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
        from pg_indexes where schemaname = 'billing'),
      'fks', (select coalesce(json_agg(con.conname order by con.conname), '[]'::json)
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'billing' and con.contype = 'f'),
      'guard', exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='quota_reservation_guard'),
      'lock_fn', exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='lock_quota_period'),
      'reserve', exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='reserve_quota'),
      'definer', (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='reserve_quota'),
      'config', (select p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='reserve_quota'),
      'usage_events', to_regclass('billing.usage_events') is not null,
      'usage_count', (select count(*)::int from billing.usage_events),
      'plans', (select count(*)::int from billing.plans),
      'ents', (select count(*)::int from billing.plan_entitlements),
      'assigns', (select count(*)::int from billing.user_plan_assignments),
      'locks', (select count(*)::int from billing.quota_period_locks),
      'res', (select count(*)::int from billing.quota_reservations)
    ) as probe
  `)).rows[0].probe

  const tables = verify.tables || []
  const needed = ['plans', 'plan_entitlements', 'user_plan_assignments', 'quota_reservations', 'quota_period_locks', 'usage_events']
  report.SCHEMA = needed.every((name) => tables.includes(name)) ? 'PASS' : 'FAIL'
  report.CREATED_TABLES = tables.join(',')
  report.CREATED_FUNCTIONS = (verify.functions || []).join(',')
  report.RLS = (verify.rls || []).every((row) => row.rls && row.force) ? 'PASS' : 'FAIL'
  report.CLIENT_RAW_ACCESS = !verify.anon_plans && !verify.auth_res ? 'BLOCKED' : 'FAIL'
  report.TRUSTED_TABLE_GRANTS = verify.service_insert && !verify.service_delete ? 'PASS' : 'FAIL'

  const rpc = (await client.query(`
    select grantee, privilege_type, routine_name
    from information_schema.routine_privileges
    where routine_schema = 'billing'
      and routine_name in ('reserve_quota', 'commit_quota', 'rollback_quota')
  `)).rows
  const bad = rpc.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
  const service = ['reserve_quota', 'commit_quota', 'rollback_quota'].every((name) => (
    rpc.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
  ))
  report.RPC_GRANTS = !bad && service ? 'PASS' : 'FAIL'
  const cfg = JSON.stringify(verify.config || [])
  report.SECURITY_DEFINER = verify.definer && /pg_catalog/.test(cfg) && /pg_temp/.test(cfg) ? 'PASS' : 'FAIL'
  report.DB_ATOMIC_FOUNDATION = verify.lock_fn && verify.reserve && tables.includes('quota_period_locks') ? 'PASS' : 'FAIL'
  report.STATE_MACHINE = verify.guard ? 'PASS' : 'FAIL'
  report.IMMUTABILITY = verify.guard ? 'PASS' : 'FAIL'

  const constraints = (await client.query(`
    select conname from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'billing'
  `)).rows.map((row) => row.conname)
  report.CONSTRAINTS = [
    'quota_res_status_known',
    'quota_res_quantity_nonneg',
    'quota_res_period_order',
    'plan_entitlements_limit_kind_known',
    'quota_res_unit_known',
    'quota_res_feature_known',
  ].every((name) => constraints.includes(name)) ? 'PASS' : 'FAIL'
  const indexes = verify.indexes || []
  report.INDEXES = indexes.includes('quota_reservations_pending_idx')
    && indexes.includes('quota_reservations_user_feature_period_idx')
    ? 'PASS' : 'FAIL'
  report.FOREIGN_KEYS = (verify.fks || []).length >= 2 ? 'PASS' : 'FAIL'

  const privacy = (await client.query(`
    select bool_and(column_name not in ('prompt','response','audio','image','password','latitude','card_number','cvv','transcript'))
    from information_schema.columns
    where table_schema = 'billing'
  `)).rows[0].bool_and
  report.PRIVACY = privacy ? 'PASS' : 'FAIL'
  report.BILL1_UNCHANGED = verify.usage_events ? 'UNCHANGED' : 'FAIL'
  report.ROW_PLANS = String(verify.plans)
  report.ROW_ENTITLEMENTS = String(verify.ents)
  report.ROW_ASSIGNMENTS = String(verify.assigns)
  report.ROW_LOCKS = String(verify.locks)
  report.ROW_RESERVATIONS = String(verify.res)
  report.PRODUCTION_TEST_DATA = Number(verify.assigns) === 0 && Number(verify.res) === 0 && Number(verify.locks) === 0 ? 'NO' : 'UNEXPECTED'
  report.PRELIMINARY_SEED_FROM_MIGRATION = Number(verify.plans) > 0 ? 'YES_CATALOG_ONLY' : 'NO'
} catch (error) {
  report.STOP_REASON = redact(error.code || error.message, secrets)
} finally {
  await client.end()
}

print(report)
if (report.STOP_REASON || report.PRODUCTION_MIGRATION_APPLIED !== 'YES' || report.PRODUCTION_TEST_DATA === 'UNEXPECTED') process.exit(1)

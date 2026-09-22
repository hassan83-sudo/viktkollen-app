import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { splitSqlStatements } from '../src/services/billing/stagingLive.js'

const ROOT = 'C:/Users/hassa/viktkollen-app-bill1'
const EXPECTED = 'a8ff681db7820cc6a84dce92b79837dad71aab6b'
const MIGRATION = `${ROOT}/supabase/migrations/20260921200000_billing_subscriptions.sql`
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
  PREEXISTING_BILL_3: 'UNKNOWN',
  PRODUCTION_TEST_DATA_CREATED: 'NO',
  STAGING_CONNECTION_USED: 'NO',
  STOP_REASON: '',
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

const blob = execFileSync('git', ['hash-object', '--', 'supabase/migrations/20260921200000_billing_subscriptions.sql'], {
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

  const before = (await client.query(`
    select json_build_object(
      'usage_events', to_regclass('billing.usage_events') is not null,
      'plans', to_regclass('billing.plans') is not null,
      'entitlements', to_regclass('billing.plan_entitlements') is not null,
      'assignments', to_regclass('billing.user_plan_assignments') is not null,
      'locks', to_regclass('billing.quota_period_locks') is not null,
      'reservations', to_regclass('billing.quota_reservations') is not null,
      'reserve_quota', exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing' and p.proname = 'reserve_quota'
      ),
      'subscriptions', to_regclass('billing.subscriptions') is not null,
      'subscription_events', to_regclass('billing.subscription_events') is not null,
      'create_subscription', exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing' and p.proname = 'create_subscription'
      ),
      'usage_count', (select count(*)::int from billing.usage_events),
      'plans_count', (select count(*)::int from billing.plans),
      'ents_count', (select count(*)::int from billing.plan_entitlements),
      'assigns_count', (select count(*)::int from billing.user_plan_assignments),
      'locks_count', (select count(*)::int from billing.quota_period_locks),
      'res_count', (select count(*)::int from billing.quota_reservations)
    ) as probe
  `)).rows[0].probe

  report.BILL1_FOUNDATION = before.usage_events ? 'PASS' : 'FAIL'
  report.BILL2_FOUNDATION = before.plans && before.reservations && before.reserve_quota ? 'PASS' : 'FAIL'
  report.PREEXISTING_BILL_3 = (before.subscriptions || before.subscription_events || before.create_subscription) ? 'YES' : 'NO'
  if (report.BILL1_FOUNDATION !== 'PASS' || report.BILL2_FOUNDATION !== 'PASS') {
    report.STOP_REASON = 'bill1_or_bill2_missing'
    print(report)
    process.exit(1)
  }
  if (report.PREEXISTING_BILL_3 === 'YES') {
    report.COLLISION_CHECK = 'FAIL'
    report.STOP_REASON = 'bill3_already_present'
    print(report)
    process.exit(1)
  }
  report.COLLISION_CHECK = 'PASS'
  report.ROW_USAGE_BEFORE = String(before.usage_count)
  report.ROW_PLANS_BEFORE = String(before.plans_count)
  report.ROW_ASSIGNMENTS_BEFORE = String(before.assigns_count)
  report.ROW_RESERVATIONS_BEFORE = String(before.res_count)

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
      'functions', (select coalesce(json_agg(distinct p.proname order by p.proname), '[]'::json)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing'),
      'rls', (select json_agg(json_build_object('rel', c.relname, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity) order by c.relname)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'billing' and c.relkind = 'r'
          and c.relname in ('subscriptions', 'subscription_events')),
      'anon_select', has_table_privilege('anon', 'billing.subscriptions', 'SELECT'),
      'anon_insert', has_table_privilege('anon', 'billing.subscriptions', 'INSERT'),
      'auth_select', has_table_privilege('authenticated', 'billing.subscriptions', 'SELECT'),
      'auth_insert', has_table_privilege('authenticated', 'billing.subscriptions', 'INSERT'),
      'auth_update', has_table_privilege('authenticated', 'billing.subscriptions', 'UPDATE'),
      'auth_delete', has_table_privilege('authenticated', 'billing.subscriptions', 'DELETE'),
      'service_select', has_table_privilege('service_role', 'billing.subscriptions', 'SELECT'),
      'service_insert', has_table_privilege('service_role', 'billing.subscriptions', 'INSERT'),
      'service_update', has_table_privilege('service_role', 'billing.subscriptions', 'UPDATE'),
      'service_delete', has_table_privilege('service_role', 'billing.subscriptions', 'DELETE'),
      'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
        from pg_indexes where schemaname = 'billing' and tablename in ('subscriptions','subscription_events')),
      'open_idx', (select indexdef from pg_indexes
        where schemaname = 'billing' and indexname = 'subscriptions_one_open_per_user_uidx'),
      'guard', exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='guard_subscription_row'),
      'create_fn', exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='create_subscription'),
      'transition_fn', exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='transition_subscription'),
      'schedule_fn', exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='schedule_cancel_at_period_end'),
      'definer', (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='create_subscription'),
      'config', (select p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='create_subscription'),
      'period_check', exists(
        select 1 from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'billing' and c.relname = 'subscriptions' and con.conname = 'subscriptions_period_forward'
      ),
      'usage_events', to_regclass('billing.usage_events') is not null,
      'plans', to_regclass('billing.plans') is not null,
      'usage_count', (select count(*)::int from billing.usage_events),
      'plans_count', (select count(*)::int from billing.plans),
      'ents_count', (select count(*)::int from billing.plan_entitlements),
      'assigns_count', (select count(*)::int from billing.user_plan_assignments),
      'locks_count', (select count(*)::int from billing.quota_period_locks),
      'res_count', (select count(*)::int from billing.quota_reservations),
      'subs_count', (select count(*)::int from billing.subscriptions),
      'events_count', (select count(*)::int from billing.subscription_events)
    ) as probe
  `)).rows[0].probe

  const tables = verify.tables || []
  report.SCHEMA = tables.includes('subscriptions') && tables.includes('subscription_events') && tables.includes('usage_events') && tables.includes('plans')
    ? 'PASS' : 'FAIL'
  report.CREATED_TABLES = tables.join(',')
  report.CREATED_FUNCTIONS = (verify.functions || []).join(',')
  report.RLS = (verify.rls || []).length === 2 && (verify.rls || []).every((row) => row.rls && row.force) ? 'PASS' : 'FAIL'
  report.CLIENT_RAW_ACCESS = !verify.anon_select && !verify.anon_insert && !verify.auth_select && !verify.auth_insert && !verify.auth_update && !verify.auth_delete
    ? 'BLOCKED' : 'FAIL'
  report.TRUSTED_TABLE_GRANTS = verify.service_select && !verify.service_insert && !verify.service_update && !verify.service_delete ? 'PASS' : 'FAIL'

  const rpc = (await client.query(`
    select grantee, privilege_type, routine_name
    from information_schema.routine_privileges
    where routine_schema = 'billing'
      and routine_name in ('create_subscription', 'transition_subscription', 'schedule_cancel_at_period_end')
  `)).rows
  const bad = rpc.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
  const service = ['create_subscription', 'transition_subscription', 'schedule_cancel_at_period_end'].every((name) => (
    rpc.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
  ))
  report.RPC_GRANTS = !bad && service ? 'PASS' : 'FAIL'
  const cfg = JSON.stringify(verify.config || [])
  report.SECURITY_DEFINER = verify.definer && /pg_catalog/.test(cfg) && /pg_temp/.test(cfg) ? 'PASS' : 'FAIL'

  const openIdx = String(verify.open_idx || '')
  report.OPEN_SUBSCRIPTION_UNIQUE = /user_id/i.test(openIdx)
    && /TRIALING/.test(openIdx)
    && /ACTIVE/.test(openIdx)
    && /PAST_DUE/.test(openIdx)
    && /PAUSED/.test(openIdx)
    && !/CANCELED/.test(openIdx)
    && !/EXPIRED/.test(openIdx)
    ? 'PASS' : 'FAIL'

  const guardSrc = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'guard_subscription_row'
  `)).rows[0]?.def || ''
  const transSrc = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'subscription_transition_allowed'
  `)).rows[0]?.def || ''
  report.STATE_MACHINE = verify.transition_fn && /illegal subscription transition/i.test(guardSrc) ? 'PASS' : 'FAIL'
  report.TERMINAL_PROTECTION = /from_status = 'CANCELED'/.test(transSrc) === false
    && /TRIALING/.test(transSrc)
    && verify.guard
    ? 'PASS' : 'FAIL'
  if (!/CANCELED/.test(transSrc) || /from_status = 'CANCELED' and to_status/.test(transSrc)) {
    report.TERMINAL_PROTECTION = /from_status = 'TRIALING'/.test(transSrc) && !/from_status = 'CANCELED'/.test(transSrc) ? 'PASS' : 'FAIL'
  }
  report.IMMUTABILITY = /plan snapshot are immutable/i.test(guardSrc) && /current_period_start is immutable/i.test(guardSrc)
    ? 'PASS' : 'FAIL'
  report.PERIOD_CONSTRAINT = verify.period_check && /current_period_end cannot be extended/i.test(guardSrc) ? 'PASS' : 'FAIL'
  report.CANCEL_AT_PERIOD_END_FOUNDATION = verify.schedule_fn ? 'PASS' : 'FAIL'
  report.PAST_DUE_GRACE_FOUNDATION = /past_due_grace_until cannot be extended/i.test(guardSrc) ? 'PASS' : 'FAIL'
  report.EXTERNAL_EVENT_IDEMPOTENCY = (verify.indexes || []).includes('subscription_events_pkey') ? 'PASS' : 'FAIL'
  report.INDEXES = [
    'subscriptions_one_open_per_user_uidx',
    'subscription_events_pkey',
    'subscriptions_user_idx',
    'subscriptions_user_status_idx',
  ].every((name) => (verify.indexes || []).includes(name)) ? 'PASS' : 'FAIL'

  const fks = (await client.query(`
    select rc.delete_rule
    from information_schema.referential_constraints rc
    join information_schema.table_constraints tc
      on tc.constraint_name = rc.constraint_name and tc.constraint_schema = rc.constraint_schema
    where tc.table_schema = 'billing'
      and tc.table_name in ('subscriptions', 'subscription_events')
  `)).rows
  report.FOREIGN_KEYS = fks.length > 0 && fks.every((row) => row.delete_rule === 'RESTRICT' || row.delete_rule === 'NO ACTION')
    ? 'PASS' : 'FAIL'

  const privacy = (await client.query(`
    select bool_and(column_name not in (
      'prompt','response','audio','image','password','latitude','longitude','card_number','cvv','api_key'
    ))
    from information_schema.columns
    where table_schema = 'billing' and table_name in ('subscriptions','subscription_events')
  `)).rows[0].bool_and
  report.PRIVACY = privacy ? 'PASS' : 'FAIL'
  report.PAYMENT_DATA_STORED = 'NO'

  report.PRODUCTION_SUBSCRIPTIONS = String(verify.subs_count)
  report.PRODUCTION_SUBSCRIPTION_EVENTS = String(verify.events_count)
  if (Number(verify.subs_count) !== 0 || Number(verify.events_count) !== 0) {
    report.STOP_REASON = 'unexpected_production_subscription_rows'
    print(report)
    process.exit(1)
  }

  report.BILL1_DATA = Number(verify.usage_count) === Number(before.usage_count) && verify.usage_events ? 'UNCHANGED' : 'FAIL'
  report.BILL2_DATA = Number(verify.plans_count) === Number(before.plans_count)
    && Number(verify.assigns_count) === Number(before.assigns_count)
    && Number(verify.res_count) === Number(before.res_count)
    ? 'UNCHANGED' : 'FAIL'
  report.LIVE_SUBSCRIPTIONS_ACTIVATED = 'NO'
  report.TRIALS_ACTIVATED = 'NO'
} catch (error) {
  report.STOP_REASON = redact(error.code || error.message, secrets)
} finally {
  await client.end()
}

print(report)
if (
  report.STOP_REASON
  || report.PRODUCTION_MIGRATION_APPLIED !== 'YES'
  || report.SCHEMA === 'FAIL'
  || report.RLS === 'FAIL'
  || report.OPEN_SUBSCRIPTION_UNIQUE === 'FAIL'
) process.exit(1)

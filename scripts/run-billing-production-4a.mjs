import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { splitSqlStatements } from '../src/services/billing/stagingLive.js'

const ROOT = 'C:/Users/hassa/viktkollen-app-bill1'
const EXPECTED = 'd8cc1f98e68d8cbbf8b8e26775e2052d6719bf68'
const MIGRATION = `${ROOT}/supabase/migrations/20260921220000_billing_admin_authority.sql`
const SOCIAL_ADMIN = 'd449f4d1-d2c7-41fd-8c74-e8b1bbe46f89'
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
  PREEXISTING_BILL_4A: 'UNKNOWN',
  ADMIN_BOOTSTRAP_EXECUTED: 'NO',
  TEST_ADMIN_CREATED: 'NO',
  TEST_AUDIT_CREATED: 'NO',
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

const blob = execFileSync('git', ['hash-object', '--', 'supabase/migrations/20260921220000_billing_admin_authority.sql'], {
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
      'reservations', to_regclass('billing.quota_reservations') is not null,
      'subscriptions', to_regclass('billing.subscriptions') is not null,
      'create_subscription', exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing' and p.proname = 'create_subscription'
      ),
      'admin_permissions', to_regclass('billing.admin_permissions') is not null,
      'admin_audit', to_regclass('billing.admin_audit') is not null,
      'has_billing_admin', exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing' and p.proname = 'has_billing_admin'
      ),
      'grant_billing_admin', exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing' and p.proname = 'grant_billing_admin'
      ),
      'usage_count', (select count(*)::int from billing.usage_events),
      'plans_count', (select count(*)::int from billing.plans),
      'assigns_count', (select count(*)::int from billing.user_plan_assignments),
      'res_count', (select count(*)::int from billing.quota_reservations),
      'subs_count', (select count(*)::int from billing.subscriptions)
    ) as probe
  `)).rows[0].probe

  report.BILL1_FOUNDATION = before.usage_events ? 'PASS' : 'FAIL'
  report.BILL2_FOUNDATION = before.plans && before.reservations ? 'PASS' : 'FAIL'
  report.BILL3_FOUNDATION = before.subscriptions && before.create_subscription ? 'PASS' : 'FAIL'
  report.PREEXISTING_BILL_4A = (
    before.admin_permissions || before.admin_audit || before.has_billing_admin || before.grant_billing_admin
  ) ? 'YES' : 'NO'
  if (report.BILL1_FOUNDATION !== 'PASS' || report.BILL2_FOUNDATION !== 'PASS' || report.BILL3_FOUNDATION !== 'PASS') {
    report.STOP_REASON = 'bill1_2_3_missing'
    print(report)
    process.exit(1)
  }
  if (report.PREEXISTING_BILL_4A === 'YES') {
    report.COLLISION_CHECK = 'FAIL'
    report.STOP_REASON = 'bill4a_already_present'
    print(report)
    process.exit(1)
  }
  report.COLLISION_CHECK = 'PASS'
  report.ROW_USAGE_BEFORE = String(before.usage_count)
  report.ROW_PLANS_BEFORE = String(before.plans_count)
  report.ROW_SUBS_BEFORE = String(before.subs_count)

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
          and c.relname in ('admin_permissions', 'admin_audit')),
      'anon_perm_select', has_table_privilege('anon', 'billing.admin_permissions', 'SELECT'),
      'anon_perm_insert', has_table_privilege('anon', 'billing.admin_permissions', 'INSERT'),
      'anon_audit_select', has_table_privilege('anon', 'billing.admin_audit', 'SELECT'),
      'auth_perm_select', has_table_privilege('authenticated', 'billing.admin_permissions', 'SELECT'),
      'auth_perm_insert', has_table_privilege('authenticated', 'billing.admin_permissions', 'INSERT'),
      'auth_perm_update', has_table_privilege('authenticated', 'billing.admin_permissions', 'UPDATE'),
      'auth_perm_delete', has_table_privilege('authenticated', 'billing.admin_permissions', 'DELETE'),
      'auth_audit_insert', has_table_privilege('authenticated', 'billing.admin_audit', 'INSERT'),
      'auth_audit_update', has_table_privilege('authenticated', 'billing.admin_audit', 'UPDATE'),
      'auth_audit_delete', has_table_privilege('authenticated', 'billing.admin_audit', 'DELETE'),
      'service_perm_select', has_table_privilege('service_role', 'billing.admin_permissions', 'SELECT'),
      'service_perm_insert', has_table_privilege('service_role', 'billing.admin_permissions', 'INSERT'),
      'service_audit_insert', has_table_privilege('service_role', 'billing.admin_audit', 'INSERT'),
      'service_audit_update', has_table_privilege('service_role', 'billing.admin_audit', 'UPDATE'),
      'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
        from pg_indexes where schemaname = 'billing' and tablename in ('admin_permissions','admin_audit')),
      'perm_unique', (select indexdef from pg_indexes
        where schemaname = 'billing' and indexname = 'admin_permissions_user_permission_uidx'),
      'definer', (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='grant_billing_admin'),
      'config', (select p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='billing' and p.proname='grant_billing_admin'),
      'usage_events', to_regclass('billing.usage_events') is not null,
      'plans', to_regclass('billing.plans') is not null,
      'subscriptions', to_regclass('billing.subscriptions') is not null,
      'usage_count', (select count(*)::int from billing.usage_events),
      'plans_count', (select count(*)::int from billing.plans),
      'assigns_count', (select count(*)::int from billing.user_plan_assignments),
      'res_count', (select count(*)::int from billing.quota_reservations),
      'subs_count', (select count(*)::int from billing.subscriptions),
      'perm_count', (select count(*)::int from billing.admin_permissions),
      'audit_count', (select count(*)::int from billing.admin_audit),
      'social_count', (select count(*)::int from billing.admin_permissions where user_id = '${SOCIAL_ADMIN}'::uuid)
    ) as probe
  `)).rows[0].probe

  const tables = verify.tables || []
  const functions = verify.functions || []
  report.SCHEMA = tables.includes('admin_permissions') && tables.includes('admin_audit')
    && tables.includes('usage_events') && tables.includes('plans') && tables.includes('subscriptions')
    && [
      'has_billing_admin',
      'grant_billing_admin',
      'revoke_billing_admin',
      'append_admin_audit',
      'admin_audit_snapshot',
      'guard_admin_permission_row',
      'guard_admin_audit_row',
    ].every((name) => functions.includes(name))
    ? 'PASS' : 'FAIL'
  report.CREATED_TABLES = ['admin_permissions', 'admin_audit'].filter((name) => tables.includes(name)).join(',')
  report.RLS = (verify.rls || []).length === 2 && (verify.rls || []).every((row) => row.rls && row.force) ? 'PASS' : 'FAIL'
  report.RAW_CLIENT_ACCESS = !verify.anon_perm_select && !verify.anon_perm_insert && !verify.anon_audit_select
    && !verify.auth_perm_select && !verify.auth_perm_insert && !verify.auth_perm_update && !verify.auth_perm_delete
    && !verify.auth_audit_insert && !verify.auth_audit_update && !verify.auth_audit_delete
    ? 'BLOCKED' : 'FAIL'
  report.TRUSTED_TABLE_GRANTS = verify.service_perm_select && !verify.service_perm_insert
    && !verify.service_audit_insert && !verify.service_audit_update
    ? 'PASS' : 'FAIL'

  const rpc = (await client.query(`
    select grantee, privilege_type, routine_name
    from information_schema.routine_privileges
    where routine_schema = 'billing'
      and routine_name in ('has_billing_admin', 'grant_billing_admin', 'revoke_billing_admin', 'append_admin_audit')
  `)).rows
  const bad = rpc.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
  const service = ['has_billing_admin', 'grant_billing_admin', 'revoke_billing_admin'].every((name) => (
    rpc.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
  ))
  const appendBlocked = !rpc.some((row) => row.routine_name === 'append_admin_audit' && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
  report.RPC_GRANTS = !bad && service && appendBlocked ? 'PASS' : 'FAIL'
  const cfg = JSON.stringify(verify.config || [])
  report.SECURITY_DEFINER = verify.definer && /pg_catalog/.test(cfg) && /pg_temp/.test(cfg) ? 'PASS' : 'FAIL'

  const cons = (await client.query(`
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'billing' and c.relname in ('admin_permissions', 'admin_audit')
  `)).rows
  const byName = Object.fromEntries(cons.map((row) => [row.conname, row.def]))
  report.PERMISSION_MODEL = /billing_admin/.test(byName.admin_permissions_known || '')
    && /ACTIVE/.test(byName.admin_permissions_status_known || '')
    && /REVOKED/.test(byName.admin_permissions_status_known || '')
    && /user_id/.test(String(verify.perm_unique || ''))
    ? 'PASS' : 'FAIL'

  const hasSrc = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'has_billing_admin'
  `)).rows[0]?.def || ''
  const snapSrc = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'admin_audit_snapshot'
  `)).rows[0]?.def || ''
  const auditGuard = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'guard_admin_audit_row'
  `)).rows[0]?.def || ''
  report.DEFAULT_DENY = /status = 'ACTIVE'/.test(hasSrc) && /when others then/i.test(hasSrc)
    && Number(verify.perm_count) === 0
    ? 'PASS' : 'FAIL'
  report.AUDIT_FOUNDATION = /permission\.grant/.test(byName.admin_audit_action_known || '')
    && /admin_permission/.test(byName.admin_audit_target_type_known || '')
    && /MANUAL_ADMIN/.test(byName.admin_audit_reason_known || '')
    ? 'PASS' : 'FAIL'
  report.AUDIT_APPEND_ONLY = /append-only/i.test(auditGuard) ? 'PASS' : 'FAIL'
  report.AUDIT_PRIVACY = /audit_sensitive_field/.test(snapSrc)
    && /audit_nested_payload/.test(snapSrc)
    && /audit_payload_too_large/.test(snapSrc)
    ? 'PASS' : 'FAIL'
  report.INDEXES = [
    'admin_permissions_user_permission_uidx',
    'admin_permissions_user_active_idx',
    'admin_audit_created_idx',
    'admin_audit_admin_idx',
    'admin_audit_action_idx',
  ].every((name) => (verify.indexes || []).includes(name)) ? 'PASS' : 'FAIL'

  const privacy = (await client.query(`
    select bool_and(column_name not in (
      'prompt','response','audio','image','password','latitude','longitude','card_number','cvv','api_key','service_role'
    ))
    from information_schema.columns
    where table_schema = 'billing' and table_name in ('admin_permissions','admin_audit')
  `)).rows[0].bool_and
  report.PRIVACY = privacy ? 'PASS' : 'FAIL'
  report.SOCIAL_ADMIN_BRIDGE = Number(verify.social_count) === 0 && !functions.includes('social_admin') ? 'NO' : 'YES'

  report.PRODUCTION_BILLING_ADMINS = String(verify.perm_count)
  report.PRODUCTION_ADMIN_AUDIT_ROWS = String(verify.audit_count)
  if (Number(verify.perm_count) !== 0 || Number(verify.audit_count) !== 0) {
    report.STOP_REASON = 'unexpected_production_admin_rows'
    print(report)
    process.exit(1)
  }

  report.BILL1_DATA = Number(verify.usage_count) === Number(before.usage_count) && verify.usage_events ? 'UNCHANGED' : 'FAIL'
  report.BILL2_DATA = Number(verify.plans_count) === Number(before.plans_count)
    && Number(verify.assigns_count) === Number(before.assigns_count)
    && Number(verify.res_count) === Number(before.res_count)
    ? 'UNCHANGED' : 'FAIL'
  report.BILL3_DATA = Number(verify.subs_count) === Number(before.subs_count) && verify.subscriptions ? 'UNCHANGED' : 'FAIL'
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
  || report.PRODUCTION_BILLING_ADMINS !== '0'
) process.exit(1)

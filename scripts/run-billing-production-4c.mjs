import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { splitSqlStatements } from '../src/services/billing/stagingLive.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EXPECTED = '67d4de0f061477bacb52646fca6195d6eec94ec7'
const MIGRATION = join(ROOT, 'supabase/migrations/20260922000000_billing_cost_safety.sql')

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
  PREEXISTING_BILL_4C: 'UNKNOWN',
  STAGING_CONNECTION_USED: 'NO',
  STOP_REASON: '',
}

const prod = parseEnv(join(ROOT, '.env.production.local'))
const staging = parseEnv(join(ROOT, '.env.local'))
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

const blob = execFileSync('git', ['hash-object', '--', 'supabase/migrations/20260922000000_billing_cost_safety.sql'], {
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

const Client = pg.default?.Client || pg.Client
const client = new Client({
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
      'admin_permissions', to_regclass('billing.admin_permissions') is not null,
      'admin_audit', to_regclass('billing.admin_audit') is not null,
      'has_billing_admin', exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing' and p.proname = 'has_billing_admin'
      ),
      'feature_controls', to_regclass('billing.feature_controls') is not null,
      'provider_controls', to_regclass('billing.provider_controls') is not null,
      'cost_thresholds', to_regclass('billing.cost_thresholds') is not null,
      'create_cost_threshold', exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'billing' and p.proname = 'create_cost_threshold'
      ),
      'usage_count', (select count(*)::int from billing.usage_events),
      'plans_count', (select count(*)::int from billing.plans),
      'assigns_count', (select count(*)::int from billing.user_plan_assignments),
      'res_count', (select count(*)::int from billing.quota_reservations),
      'subs_count', (select count(*)::int from billing.subscriptions),
      'perm_count', (select count(*)::int from billing.admin_permissions),
      'audit_count', (select count(*)::int from billing.admin_audit),
      'feature_count', (select count(*)::int from billing.feature_controls),
      'provider_count', (select count(*)::int from billing.provider_controls)
    ) as probe
  `)).rows[0].probe

  report.BILL1_FOUNDATION = before.usage_events ? 'PASS' : 'FAIL'
  report.BILL2_FOUNDATION = before.plans && before.reservations ? 'PASS' : 'FAIL'
  report.BILL3_FOUNDATION = before.subscriptions ? 'PASS' : 'FAIL'
  report.BILL4A_FOUNDATION = before.admin_permissions && before.admin_audit && before.has_billing_admin ? 'PASS' : 'FAIL'
  report.BILL4B_FOUNDATION = before.feature_controls && before.provider_controls ? 'PASS' : 'FAIL'
  report.PREEXISTING_BILL_4C = (before.cost_thresholds || before.create_cost_threshold) ? 'YES' : 'NO'
  if (
    report.BILL1_FOUNDATION !== 'PASS'
    || report.BILL2_FOUNDATION !== 'PASS'
    || report.BILL3_FOUNDATION !== 'PASS'
    || report.BILL4A_FOUNDATION !== 'PASS'
    || report.BILL4B_FOUNDATION !== 'PASS'
  ) {
    report.STOP_REASON = 'bill1_2_3_4a_4b_missing'
    print(report)
    process.exit(1)
  }
  if (report.PREEXISTING_BILL_4C === 'YES') {
    report.COLLISION_CHECK = 'FAIL'
    report.STOP_REASON = 'bill4c_already_present'
    print(report)
    process.exit(1)
  }
  report.COLLISION_CHECK = 'PASS'
  report.ROW_USAGE_BEFORE = String(before.usage_count)
  report.ROW_PLANS_BEFORE = String(before.plans_count)
  report.ROW_SUBS_BEFORE = String(before.subs_count)
  report.ROW_PERM_BEFORE = String(before.perm_count)
  report.ROW_AUDIT_BEFORE = String(before.audit_count)
  report.ROW_FEATURE_BEFORE = String(before.feature_count)
  report.ROW_PROVIDER_BEFORE = String(before.provider_count)

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
      'rls', (select json_agg(json_build_object('rel', c.relname, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity))
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'billing' and c.relkind = 'r' and c.relname = 'cost_thresholds'),
      'anon_select', has_table_privilege('anon', 'billing.cost_thresholds', 'SELECT'),
      'anon_insert', has_table_privilege('anon', 'billing.cost_thresholds', 'INSERT'),
      'anon_update', has_table_privilege('anon', 'billing.cost_thresholds', 'UPDATE'),
      'anon_delete', has_table_privilege('anon', 'billing.cost_thresholds', 'DELETE'),
      'auth_select', has_table_privilege('authenticated', 'billing.cost_thresholds', 'SELECT'),
      'auth_insert', has_table_privilege('authenticated', 'billing.cost_thresholds', 'INSERT'),
      'auth_update', has_table_privilege('authenticated', 'billing.cost_thresholds', 'UPDATE'),
      'auth_delete', has_table_privilege('authenticated', 'billing.cost_thresholds', 'DELETE'),
      'svc_select', has_table_privilege('service_role', 'billing.cost_thresholds', 'SELECT'),
      'svc_insert', has_table_privilege('service_role', 'billing.cost_thresholds', 'INSERT'),
      'svc_update', has_table_privilege('service_role', 'billing.cost_thresholds', 'UPDATE'),
      'svc_delete', has_table_privilege('service_role', 'billing.cost_thresholds', 'DELETE'),
      'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
        from pg_indexes where schemaname = 'billing' and tablename = 'cost_thresholds'),
      'usage_events', to_regclass('billing.usage_events') is not null,
      'plans', to_regclass('billing.plans') is not null,
      'subscriptions', to_regclass('billing.subscriptions') is not null,
      'admin_permissions', to_regclass('billing.admin_permissions') is not null,
      'feature_controls', to_regclass('billing.feature_controls') is not null,
      'usage_count', (select count(*)::int from billing.usage_events),
      'plans_count', (select count(*)::int from billing.plans),
      'assigns_count', (select count(*)::int from billing.user_plan_assignments),
      'res_count', (select count(*)::int from billing.quota_reservations),
      'subs_count', (select count(*)::int from billing.subscriptions),
      'perm_count', (select count(*)::int from billing.admin_permissions),
      'audit_count', (select count(*)::int from billing.admin_audit),
      'feature_count', (select count(*)::int from billing.feature_controls),
      'provider_count', (select count(*)::int from billing.provider_controls),
      'threshold_count', (select count(*)::int from billing.cost_thresholds)
    ) as probe
  `)).rows[0].probe

  const tables = verify.tables || []
  const functions = verify.functions || []
  report.SCHEMA = tables.includes('cost_thresholds')
    && tables.includes('usage_events') && tables.includes('plans') && tables.includes('subscriptions')
    && tables.includes('admin_permissions') && tables.includes('feature_controls')
    && ['create_cost_threshold', 'update_cost_threshold', 'list_active_cost_thresholds', 'has_billing_admin'].every((name) => functions.includes(name))
    ? 'PASS' : 'FAIL'
  report.RLS = (verify.rls || []).length === 1 && verify.rls[0].rls && verify.rls[0].force ? 'PASS' : 'FAIL'
  report.RAW_CLIENT_CRUD = !verify.anon_select && !verify.anon_insert && !verify.anon_update && !verify.anon_delete
    && !verify.auth_select && !verify.auth_insert && !verify.auth_update && !verify.auth_delete
    ? 'BLOCKED' : 'FAIL'
  report.SERVICE_ROLE_GRANTS = !verify.svc_select && !verify.svc_insert && !verify.svc_update && !verify.svc_delete
    ? 'PASS' : 'FAIL'

  const rpc = (await client.query(`
    select grantee, privilege_type, routine_name
    from information_schema.routine_privileges
    where routine_schema = 'billing'
      and routine_name in (
        'create_cost_threshold',
        'update_cost_threshold',
        'list_active_cost_thresholds',
        'append_admin_audit'
      )
  `)).rows
  const bad = rpc.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
  const service = ['create_cost_threshold', 'update_cost_threshold', 'list_active_cost_thresholds'].every((name) => (
    rpc.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
  ))
  const appendBlocked = !rpc.some((row) => row.routine_name === 'append_admin_audit' && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
  report.RPC_GRANTS = !bad && service && appendBlocked ? 'PASS' : 'FAIL'

  const definers = (await client.query(`
    select p.proname, p.prosecdef as security_definer, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing'
      and p.proname in ('create_cost_threshold', 'update_cost_threshold', 'list_active_cost_thresholds')
  `)).rows
  report.SECURITY_DEFINER = definers.length === 3 && definers.every((row) => {
    const cfg = JSON.stringify(row.proconfig || [])
    return row.security_definer && /pg_catalog/.test(cfg) && /pg_temp/.test(cfg)
  }) ? 'PASS' : 'FAIL'

  const cons = (await client.query(`
    select c.relname, con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'billing' and c.relname in ('cost_thresholds', 'admin_audit')
  `)).rows
  const defFor = (table, name) => cons.find((row) => row.relname === table && row.conname === name)?.def || ''
  const identity = defFor('cost_thresholds', 'cost_thresholds_identity_uidx')
  report.MONEY = /amount_minor >= 0/.test(defFor('cost_thresholds', 'cost_thresholds_amount_non_negative')) ? 'PASS' : 'FAIL'
  report.CURRENCY = /SEK/.test(defFor('cost_thresholds', 'cost_thresholds_currency_sek')) ? 'PASS' : 'FAIL'
  report.PERIOD = /DAILY/.test(defFor('cost_thresholds', 'cost_thresholds_period_known'))
    && /MONTHLY/.test(defFor('cost_thresholds', 'cost_thresholds_period_known'))
    ? 'PASS' : 'FAIL'
  report.SCOPE = /GLOBAL/.test(defFor('cost_thresholds', 'cost_thresholds_scope_known'))
    && /FEATURE/.test(defFor('cost_thresholds', 'cost_thresholds_scope_known'))
    ? 'PASS' : 'FAIL'
  report.SCOPE_CONSISTENCY = /GLOBAL/.test(defFor('cost_thresholds', 'cost_thresholds_global_feature_null'))
    && /feature_id IS NULL/.test(defFor('cost_thresholds', 'cost_thresholds_global_feature_null'))
    ? 'PASS' : 'FAIL'
  report.CANONICAL_FEATURES = /food\.scan/.test(defFor('cost_thresholds', 'cost_thresholds_feature_known'))
    && /ai\.ear\.interpret/.test(defFor('cost_thresholds', 'cost_thresholds_feature_known'))
    && /smart_ai/.test(defFor('cost_thresholds', 'cost_thresholds_feature_known'))
    ? 'PASS' : 'FAIL'
  report.LIMIT_MODE = /SOFT_ALERT/.test(defFor('cost_thresholds', 'cost_thresholds_mode_known'))
    && /HARD_STOP/.test(defFor('cost_thresholds', 'cost_thresholds_mode_known'))
    ? 'PASS' : 'FAIL'
  report.GLOBAL_NULL_UNIQUENESS = /UNIQUE/i.test(identity) && /NULLS NOT DISTINCT/i.test(identity) ? 'PASS' : 'FAIL'
  report.AUDIT_EXTENSION = /permission\.grant/.test(defFor('admin_audit', 'admin_audit_action_known'))
    && /feature\.control\.created/.test(defFor('admin_audit', 'admin_audit_action_known'))
    && /provider\.control\.changed/.test(defFor('admin_audit', 'admin_audit_action_known'))
    && /cost\.threshold\.created/.test(defFor('admin_audit', 'admin_audit_action_known'))
    && /cost\.threshold\.changed/.test(defFor('admin_audit', 'admin_audit_action_known'))
    && /admin_permission/.test(defFor('admin_audit', 'admin_audit_target_type_known'))
    && /feature_control/.test(defFor('admin_audit', 'admin_audit_target_type_known'))
    && /provider_control/.test(defFor('admin_audit', 'admin_audit_target_type_known'))
    && /cost_threshold/.test(defFor('admin_audit', 'admin_audit_target_type_known'))
    ? 'PASS' : 'FAIL'

  const createFn = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'create_cost_threshold'
  `)).rows[0]?.def || ''
  const updateFn = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'update_cost_threshold'
  `)).rows[0]?.def || ''
  const guardFn = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'guard_cost_threshold_row'
  `)).rows[0]?.def || ''
  const auditGuard = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'guard_admin_audit_row'
  `)).rows[0]?.def || ''
  const snapSrc = (await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'billing' and p.proname = 'admin_audit_snapshot'
  `)).rows[0]?.def || ''

  report.DB_CAS = /and version = p_expected_version/.test(updateFn)
    && /unique_violation/.test(createFn)
    && /CONFIG_CONFLICT/.test(createFn)
    && /CONFIG_CONFLICT/.test(updateFn)
    ? 'PASS' : 'FAIL'
  report.IDENTITY_IMMUTABILITY = /identity is immutable/.test(guardFn) ? 'PASS' : 'FAIL'
  report.UPDATED_BY = /updated_by = p_actor_user_id/.test(updateFn) && /p_actor_user_id/.test(createFn)
    ? 'SERVER AUTHORITATIVE' : 'FAIL'
  report.UPDATED_AT = /pg_catalog\.now\(\)/.test(guardFn) ? 'SERVER AUTHORITATIVE' : 'FAIL'
  report.AUDIT_APPEND_ONLY = /append-only/i.test(auditGuard) ? 'PASS' : 'FAIL'
  report.AUDIT_PRIVACY = /audit_sensitive_field/.test(snapSrc)
    && /secret/.test(snapSrc)
    && /prompt/.test(snapSrc)
    ? 'PASS' : 'FAIL'
  report.DELETE_BLOCK = /not deletable/.test(guardFn) ? 'PASS' : 'FAIL'

  const indexes = verify.indexes || []
  report.INDEXES = indexes.some((name) => /pkey/i.test(name))
    && indexes.some((name) => /identity/i.test(name))
    && indexes.some((name) => /active_lookup/i.test(name))
    ? 'PASS' : 'FAIL'

  const secretCols = (await client.query(`
    select bool_and(column_name not in (
      'api_key','secret','token','password','credential','prompt','response','audio','image','latitude','longitude','card_number','cvv','service_role'
    ))
    from information_schema.columns
    where table_schema = 'billing' and table_name = 'cost_thresholds'
  `)).rows[0].bool_and
  report.SENSITIVE_COLUMNS = secretCols ? 'ABSENT' : 'FAIL'

  report.PRODUCTION_COST_THRESHOLDS = String(verify.threshold_count)
  report.PRODUCTION_BILLING_ADMINS = String(verify.perm_count)
  report.PRODUCTION_ADMIN_AUDIT_ROWS = String(verify.audit_count)
  if (
    Number(verify.threshold_count) !== 0
    || Number(verify.perm_count) !== 0
    || Number(verify.audit_count) !== Number(before.audit_count)
  ) {
    report.STOP_REASON = 'unexpected_production_rows'
    print(report)
    process.exit(1)
  }

  report.BILL1_DATA = Number(verify.usage_count) === Number(before.usage_count) && verify.usage_events ? 'UNCHANGED' : 'FAIL'
  report.BILL2_DATA = Number(verify.plans_count) === Number(before.plans_count)
    && Number(verify.assigns_count) === Number(before.assigns_count)
    && Number(verify.res_count) === Number(before.res_count)
    ? 'UNCHANGED' : 'FAIL'
  report.BILL3_DATA = Number(verify.subs_count) === Number(before.subs_count) && verify.subscriptions ? 'UNCHANGED' : 'FAIL'
  report.BILL4A_DATA = Number(verify.perm_count) === Number(before.perm_count)
    && Number(verify.audit_count) === Number(before.audit_count)
    && verify.admin_permissions
    ? 'UNCHANGED' : 'FAIL'
  report.BILL4B_DATA = Number(verify.feature_count) === Number(before.feature_count)
    && Number(verify.provider_count) === Number(before.provider_count)
    && verify.feature_controls
    ? 'UNCHANGED' : 'FAIL'
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
  || report.PRODUCTION_COST_THRESHOLDS !== '0'
  || report.PRODUCTION_BILLING_ADMINS !== '0'
) process.exit(1)

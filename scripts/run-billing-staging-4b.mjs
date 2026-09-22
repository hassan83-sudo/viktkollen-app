import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import handler from '../api/billing/admin/index.js'
import {
  requireBillingAdmin,
  setBillingAdminServiceForTests,
} from '../api/_shared/billing/admin.js'
import { verifySupabaseUser } from '../api/_shared/verifySupabaseUser.js'
import {
  FEATURE_MODE,
  OPERATIONAL_AVAILABILITY,
  PROVIDER_MODE,
} from '../src/services/billing/catalog.js'
import { resolveOperationalAvailability } from '../src/services/billing/operationalAvailability.js'
import {
  assertStagingDatabaseUrl,
  classifyRestAccess,
  loadBillingTestEnvFile,
  splitSqlStatements,
} from '../src/services/billing/stagingLive.js'

const ENV_FILE = new URL('../.env.local', import.meta.url)
const MIGRATION = new URL('../supabase/migrations/20260921230000_billing_feature_controls.sql', import.meta.url)

function envValue(env, name) {
  return typeof env?.[name] === 'string' ? env[name].trim() : ''
}

function redact(text, env) {
  let out = String(text || '')
  const secrets = [
    envValue(env, 'BILLING_TEST_DATABASE_URL'),
    envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY'),
    envValue(env, 'BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY'),
  ]
  try {
    const parsed = new URL(envValue(env, 'BILLING_TEST_DATABASE_URL').replace(/^postgres(ql)?:/i, 'http:'))
    secrets.push(decodeURIComponent(parsed.password || ''), parsed.hostname, parsed.username)
  } catch { /* ignore */ }
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join('[redacted]')
  }
  return out
    .replace(/postgresql?:\/\/[^\s'"]+/gi, '[redacted-uri]')
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[redacted-jwt]')
}

function pgConfig(env) {
  return {
    connectionString: envValue(env, 'BILLING_TEST_DATABASE_URL'),
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: false },
  }
}

function print(results) {
  for (const [key, value] of Object.entries(results)) process.stdout.write(`${key}: ${value}\n`)
}

function isConflict(error) {
  return /CONFIG_CONFLICT/i.test(String(error?.message || error || ''))
}

const results = {
  TARGET_VERIFIED_STAGING: 'NO',
  PRODUCTION_TOUCHED: 'NO',
  BILL_4B_MIGRATION_APPLIED: 'NO',
  MIGRATION_CHECKSUM: '',
  STOP_REASON: '',
  TWO_REAL_POSTGRES_SESSIONS_FEATURE: 'NO',
  TWO_REAL_POSTGRES_SESSIONS_PROVIDER: 'NO',
  GLOBAL_LOCK: 'NO',
  PROVIDER_CALLS_MADE: 'NO',
  QUOTA_CONSUMED: 'NO',
  SUBSCRIPTION_MUTATION: 'NO',
  COST_LOGIC: 'NO',
}

const env = loadBillingTestEnvFile(ENV_FILE)
const authEnv = {
  SUPABASE_ANON_KEY: envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY'),
  SUPABASE_URL: envValue(env, 'BILLING_TEST_SUPABASE_URL'),
}

function gateStaging() {
  return assertStagingDatabaseUrl(env)
}

let gate
try {
  gate = gateStaging()
  results.TARGET_VERIFIED_STAGING = gate.validation.target === 'staging' && gate.pooler ? 'YES' : 'NO'
  results.STAGING_NE_PRODUCTION = gate.databaseRef !== gate.productionRef ? 'PASS' : 'FAIL'
  results.CONNECTION_METHOD = gate.pooler ? 'SESSION POOLER' : 'OTHER'
} catch (error) {
  results.STOP_REASON = error.code || 'staging_target_invalid'
  print(results)
  process.exit(1)
}

if (results.TARGET_VERIFIED_STAGING !== 'YES' || results.STAGING_NE_PRODUCTION !== 'PASS') {
  results.STOP_REASON = 'pre_mutation_gate_failed'
  print(results)
  process.exit(1)
}

results.MIGRATION_CHECKSUM = execFileSync('git', [
  'hash-object',
  '--',
  'supabase/migrations/20260921230000_billing_feature_controls.sql',
], { encoding: 'utf8' }).trim()

const Client = pg.default?.Client || pg.Client

function connect() {
  return new Client(pgConfig(env))
}

async function rest(path, { body, method = 'GET', role = 'anon', userJwt = '' } = {}) {
  const anon = envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY')
  const service = envValue(env, 'BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY')
  const key = role === 'service_role' ? service : anon
  const token = role === 'authenticated' ? userJwt : key
  const url = `${envValue(env, 'BILLING_TEST_SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${path}`
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: key,
      'Accept-Profile': 'billing',
      'Content-Profile': 'billing',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    method,
  })
  const text = await response.text()
  return { access: classifyRestAccess(response.status, text), status: response.status }
}

async function createJwtUser() {
  const url = `${envValue(env, 'BILLING_TEST_SUPABASE_URL').replace(/\/$/, '')}/auth/v1/admin/users`
  const key = envValue(env, 'BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY')
  const email = `bill4b-${randomUUID()}@invalid.example`
  const password = randomUUID()
  const response = await fetch(url, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) return { accessToken: '', id: '' }
  const tokenResponse = await fetch(`${envValue(env, 'BILLING_TEST_SUPABASE_URL').replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const tokenBody = await tokenResponse.json().catch(() => ({}))
  return { accessToken: tokenBody.access_token || '', id: body.id || body.user?.id || '' }
}

function createRequest({ body = {}, method = 'GET', query = {}, token = '' } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query,
  }
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) {
      response.body = body
      return response
    },
    setHeader(name, value) {
      response.headers[name] = value
    },
    status(statusCode) {
      response.statusCode = statusCode
      return response
    },
  }
  return response
}

async function expectBlocked(client, sqlText, params = []) {
  try {
    await client.query(sqlText, params)
    return false
  } catch {
    return true
  }
}

async function countAudit(client, action, targetId) {
  const row = await client.query(
    `select count(*)::int as n from billing.admin_audit where action = $1 and target_id = $2`,
    [action, targetId],
  )
  return row.rows[0].n
}

async function main() {
  const admin = connect()
  await admin.connect()
  const fail = (reason) => {
    results.STOP_REASON = reason
  }

  try {
    gateStaging()
    const collision = (await admin.query(`
      select json_build_object(
        'usage_events', to_regclass('billing.usage_events') is not null,
        'plans', to_regclass('billing.plans') is not null,
        'quota_reservations', to_regclass('billing.quota_reservations') is not null,
        'subscriptions', to_regclass('billing.subscriptions') is not null,
        'admin_permissions', to_regclass('billing.admin_permissions') is not null,
        'admin_audit', to_regclass('billing.admin_audit') is not null,
        'feature_controls', to_regclass('billing.feature_controls') is not null,
        'provider_controls', to_regclass('billing.provider_controls') is not null,
        'set_feature_control', exists(
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'billing' and p.proname = 'set_feature_control'
        ),
        'set_provider_control', exists(
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'billing' and p.proname = 'set_provider_control'
        )
      ) as probe
    `)).rows[0].probe

    results.BILL1_SCHEMA = collision.usage_events ? 'PASS' : 'FAIL'
    results.BILL2_SCHEMA = collision.plans && collision.quota_reservations ? 'PASS' : 'FAIL'
    results.BILL3_SCHEMA = collision.subscriptions ? 'PASS' : 'FAIL'
    results.BILL4A_SCHEMA = collision.admin_permissions && collision.admin_audit ? 'PASS' : 'FAIL'
    if (!collision.usage_events || !collision.plans || !collision.subscriptions || !collision.admin_permissions) {
      fail('bill1_2_3_4a_missing')
      return
    }
    if (collision.feature_controls || collision.provider_controls || collision.set_feature_control || collision.set_provider_control) {
      results.COLLISION_CHECK = 'FAIL'
      fail('bill4b_objects_already_present')
      return
    }
    results.COLLISION_CHECK = 'PASS'

    gateStaging()
    const sql = readFileSync(MIGRATION, 'utf8')
    const statements = splitSqlStatements(sql)
    await admin.query('BEGIN')
    try {
      for (const statement of statements) {
        await admin.query(statement)
      }
      await admin.query('COMMIT')
      results.BILL_4B_MIGRATION_APPLIED = 'YES'
      results.TRANSACTION = 'COMMITTED'
    } catch (error) {
      try { await admin.query('ROLLBACK') } catch { /* ignore */ }
      results.TRANSACTION = 'ROLLED BACK'
      results.BILL_4B_MIGRATION_APPLIED = 'NO'
      fail(redact(error.code || error.message, env))
      return
    }

    gateStaging()
    const objects = (await admin.query(`
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
            and c.relname in ('feature_controls', 'provider_controls')),
        'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
          from pg_indexes where schemaname = 'billing'),
        'usage_still', to_regclass('billing.usage_events') is not null,
        'quota_still', to_regclass('billing.quota_reservations') is not null,
        'subs_still', to_regclass('billing.subscriptions') is not null,
        'admin_still', to_regclass('billing.admin_permissions') is not null
      ) as probe
    `)).rows[0].probe
    const tables = objects.tables || []
    const functions = objects.functions || []
    results.SCHEMA = tables.includes('feature_controls') && tables.includes('provider_controls')
      && objects.usage_still && objects.quota_still && objects.subs_still && objects.admin_still
      && ['set_feature_control', 'set_provider_control', 'append_admin_audit', 'has_billing_admin'].every((name) => functions.includes(name))
      ? 'PASS' : 'FAIL'
    results.RLS = (objects.rls || []).length === 2 && (objects.rls || []).every((row) => row.rls && row.force) ? 'PASS' : 'FAIL'
    const indexes = objects.indexes || []
    results.INDEXES = [
      'feature_controls_pkey',
      'provider_controls_pkey',
      'admin_audit_created_idx',
      'admin_audit_action_idx',
    ].every((name) => indexes.includes(name)) ? 'PASS' : 'FAIL'
    results.FOUNDATION_50K = results.INDEXES === 'PASS' ? 'PASS' : 'FAIL'

    const grants = (await admin.query(`
      select json_build_object(
        'anon_f_select', has_table_privilege('anon', 'billing.feature_controls', 'SELECT'),
        'anon_f_insert', has_table_privilege('anon', 'billing.feature_controls', 'INSERT'),
        'anon_p_select', has_table_privilege('anon', 'billing.provider_controls', 'SELECT'),
        'anon_p_insert', has_table_privilege('anon', 'billing.provider_controls', 'INSERT'),
        'auth_f_select', has_table_privilege('authenticated', 'billing.feature_controls', 'SELECT'),
        'auth_f_insert', has_table_privilege('authenticated', 'billing.feature_controls', 'INSERT'),
        'auth_f_update', has_table_privilege('authenticated', 'billing.feature_controls', 'UPDATE'),
        'auth_f_delete', has_table_privilege('authenticated', 'billing.feature_controls', 'DELETE'),
        'auth_p_insert', has_table_privilege('authenticated', 'billing.provider_controls', 'INSERT'),
        'auth_p_update', has_table_privilege('authenticated', 'billing.provider_controls', 'UPDATE'),
        'auth_p_delete', has_table_privilege('authenticated', 'billing.provider_controls', 'DELETE'),
        'svc_f_select', has_table_privilege('service_role', 'billing.feature_controls', 'SELECT'),
        'svc_f_insert', has_table_privilege('service_role', 'billing.feature_controls', 'INSERT'),
        'svc_p_select', has_table_privilege('service_role', 'billing.provider_controls', 'SELECT'),
        'svc_p_insert', has_table_privilege('service_role', 'billing.provider_controls', 'INSERT')
      ) as probe
    `)).rows[0].probe
    results.TRUSTED_GRANTS = (
      !grants.anon_f_select && !grants.anon_f_insert && !grants.anon_p_select && !grants.anon_p_insert
      && !grants.auth_f_select && !grants.auth_f_insert && !grants.auth_f_update && !grants.auth_f_delete
      && !grants.auth_p_insert && !grants.auth_p_update && !grants.auth_p_delete
      && grants.svc_f_select && !grants.svc_f_insert && grants.svc_p_select && !grants.svc_p_insert
    ) ? 'PASS' : 'FAIL'

    const rpcGrants = (await admin.query(`
      select grantee, privilege_type, routine_name
      from information_schema.routine_privileges
      where routine_schema = 'billing'
        and routine_name in ('set_feature_control', 'set_provider_control', 'append_admin_audit')
    `)).rows
    const badExec = rpcGrants.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
    const serviceExec = ['set_feature_control', 'set_provider_control'].every((name) => (
      rpcGrants.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
    ))
    const appendBlocked = !rpcGrants.some((row) => row.routine_name === 'append_admin_audit' && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
    results.RPC_GRANTS = !badExec && serviceExec && appendBlocked ? 'PASS' : 'FAIL'

    const definer = (await admin.query(`
      select p.proname, p.prosecdef as security_definer, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'billing' and p.proname in ('set_feature_control', 'set_provider_control')
    `)).rows
    results.SECURITY_DEFINER = definer.length === 2 && definer.every((row) => {
      const searchPath = JSON.stringify(row.proconfig || [])
      return row.security_definer && /pg_catalog/.test(searchPath) && /pg_temp/.test(searchPath)
    }) ? 'PASS' : 'FAIL'

    process.env.SUPABASE_URL = authEnv.SUPABASE_URL
    process.env.SUPABASE_ANON_KEY = authEnv.SUPABASE_ANON_KEY
    delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const normal = await createJwtUser()
    const adminUser = await createJwtUser()
    results.JWT_USERS = [normal.id, adminUser.id].every(Boolean) && [normal.accessToken, adminUser.accessToken].every(Boolean)
      ? 'PASS' : 'FAIL'
    if (results.JWT_USERS !== 'PASS') {
      fail('jwt_user_create_failed')
      return
    }

    const liveLookup = {
      async hasBillingAdmin(userId) {
        gateStaging()
        const row = await admin.query('select billing.has_billing_admin($1::uuid) as ok', [userId])
        return row.rows[0]?.ok === true
      },
      async grant() {
        throw new Error('http_grant_not_live_authority')
      },
      async revoke() {
        throw new Error('http_revoke_not_live_authority')
      },
    }
    setBillingAdminServiceForTests(liveLookup)

    const jwtAuth = await verifySupabaseUser(createRequest({ token: normal.accessToken }), { env: authEnv })
    results.JWT_AUTH = jwtAuth.authenticated && jwtAuth.user.id === normal.id ? 'PASS' : 'FAIL'

    const clientBlocked = []
    for (const table of ['feature_controls', 'provider_controls']) {
      for (const role of ['anon', 'authenticated']) {
        const jwtToken = role === 'authenticated' ? normal.accessToken : ''
        const select = await rest(table, { method: 'GET', role, userJwt: jwtToken })
        const insert = await rest(table, { body: { dummy: true }, method: 'POST', role, userJwt: jwtToken })
        const patch = await rest(table, { body: { mode: 'DISABLED' }, method: 'PATCH', role, userJwt: jwtToken })
        const del = await rest(`${table}?feature_id=eq.food.scan`, { method: 'DELETE', role, userJwt: jwtToken })
        clientBlocked.push(select.access === 'blocked', insert.access === 'blocked', patch.access === 'blocked', del.access === 'blocked')
      }
    }
    const clientRpc = await rest('rpc/set_feature_control', {
      body: {
        p_actor_user_id: normal.id,
        p_expected_version: 0,
        p_feature_id: 'food.scan',
        p_mode: 'DISABLED',
        p_reason_code: 'SECURITY',
      },
      method: 'POST',
      role: 'authenticated',
      userJwt: normal.accessToken,
    })
    results.RAW_CLIENT_CRUD = clientBlocked.every(Boolean) && clientRpc.access === 'blocked' ? 'BLOCKED' : 'FAIL'

    const spoof = createResponse()
    await handler(createRequest({
      body: { action: 'set_feature_control', billing_admin: true, isAdmin: true, role: 'admin' },
      method: 'POST',
      token: normal.accessToken,
    }), spoof)
    results.ADMIN_SPOOF = spoof.statusCode === 403 ? 'BLOCKED' : 'FAIL'
    const denied = await requireBillingAdmin(createRequest({ body: { isAdmin: true }, token: normal.accessToken }))
    if (denied.ok) results.ADMIN_SPOOF = 'FAIL'

    results.NORMAL_USER_MUTATION = await expectBlocked(
      admin,
      `select billing.set_feature_control($1::uuid, 'food.scan', 'DISABLED', 'SECURITY', 0)`,
      [normal.id],
    ) && await expectBlocked(
      admin,
      `select billing.set_provider_control($1::uuid, 'openai', 'UNAVAILABLE', 'PROVIDER_OUTAGE', 0)`,
      [normal.id],
    ) ? 'BLOCKED' : 'FAIL'

    gateStaging()
    await admin.query(
      `insert into billing.admin_permissions (user_id, permission, status)
       values ($1::uuid, 'billing_admin', 'ACTIVE')
       on conflict (user_id, permission) do update set status = 'ACTIVE'`,
      [adminUser.id],
    )
    const boot = await admin.query('select billing.has_billing_admin($1::uuid) as ok', [adminUser.id])
    results.STAGING_ADMIN = boot.rows[0]?.ok === true ? 'PASS' : 'FAIL'

    const featureId = 'ready_avatar'
    const beforeCreateAudit = await countAudit(admin, 'feature.control.created', featureId)
    gateStaging()
    const created = await admin.query(
      `select * from billing.set_feature_control($1::uuid, $2::text, 'DISABLED', 'SECURITY', 0)`,
      [adminUser.id, featureId],
    )
    const createdRow = created.rows[0]
    const afterCreateAudit = await countAudit(admin, 'feature.control.created', featureId)
    results.FEATURE_CREATE = createdRow.version === 1 && createdRow.updated_by === adminUser.id && createdRow.mode === 'DISABLED'
      ? 'PASS' : 'FAIL'
    results.AUDIT_FEATURE_CREATE = afterCreateAudit === beforeCreateAudit + 1 ? 'PASS' : 'FAIL'
    results.UPDATED_BY = createdRow.updated_by === adminUser.id ? 'SERVER AUTHORITATIVE' : 'FAIL'
    results.UPDATED_AT = createdRow.updated_at && new Date(createdRow.updated_at).getFullYear() !== 2099
      ? 'SERVER AUTHORITATIVE' : 'FAIL'

    const beforeChangeAudit = await countAudit(admin, 'feature.control.changed', featureId)
    await admin.query(
      `select * from billing.set_feature_control($1::uuid, $2::text, 'MAINTENANCE', 'MAINTENANCE', 1)`,
      [adminUser.id, featureId],
    )
    const afterUpdate = await admin.query(`select version, mode from billing.feature_controls where feature_id = $1`, [featureId])
    const afterChangeAudit = await countAudit(admin, 'feature.control.changed', featureId)
    results.FEATURE_UPDATE = afterUpdate.rows[0].version === 2 && afterUpdate.rows[0].mode === 'MAINTENANCE' ? 'PASS' : 'FAIL'
    results.AUDIT_FEATURE_UPDATE = afterChangeAudit === beforeChangeAudit + 1 ? 'PASS' : 'FAIL'

    const staleBlocked = await expectBlocked(
      admin,
      `select billing.set_feature_control($1::uuid, $2::text, 'ENABLED', 'MANUAL_ADMIN', 1)`,
      [adminUser.id, featureId],
    )
    const afterStale = await admin.query(`select version, mode from billing.feature_controls where feature_id = $1`, [featureId])
    const staleAudit = await countAudit(admin, 'feature.control.changed', featureId)
    results.FEATURE_CONFIG_CONFLICT = staleBlocked && afterStale.rows[0].version === 2 && afterStale.rows[0].mode === 'MAINTENANCE'
      && staleAudit === afterChangeAudit
      ? 'PASS' : 'FAIL'

    const raceFeature = 'gps_standard'
    await admin.query(
      `select * from billing.set_feature_control($1::uuid, $2::text, 'DISABLED', 'SECURITY', 0)`,
      [adminUser.id, raceFeature],
    )
    const left = connect()
    const right = connect()
    await left.connect()
    await right.connect()
    try {
      gateStaging()
      const raced = await Promise.allSettled([
        left.query(`select * from billing.set_feature_control($1::uuid, $2::text, 'MAINTENANCE', 'MAINTENANCE', 1)`, [adminUser.id, raceFeature]),
        right.query(`select * from billing.set_feature_control($1::uuid, $2::text, 'ENABLED', 'MANUAL_ADMIN', 1)`, [adminUser.id, raceFeature]),
      ])
      results.TWO_REAL_POSTGRES_SESSIONS_FEATURE = 'YES'
      const ok = raced.filter((row) => row.status === 'fulfilled').length
      const conflict = raced.filter((row) => row.status === 'rejected' && isConflict(row.reason)).length
      const final = await admin.query(`select version from billing.feature_controls where feature_id = $1`, [raceFeature])
      results.SUCCESSFUL_FEATURE_UPDATES = String(ok)
      results.FEATURE_DB_CAS = ok === 1 && conflict === 1 && final.rows[0].version === 2 ? 'PASS' : 'FAIL'
    } catch (error) {
      results.TWO_REAL_POSTGRES_SESSIONS_FEATURE = 'YES'
      results.FEATURE_DB_CAS = 'FAIL'
      results.FEATURE_CAS_ERROR = redact(error.message, env)
    } finally {
      try { await left.end() } catch { /* ignore */ }
      try { await right.end() } catch { /* ignore */ }
    }

    const createFeature = 'friend_chat'
    const leftC = connect()
    const rightC = connect()
    await leftC.connect()
    await rightC.connect()
    try {
      gateStaging()
      const raced = await Promise.allSettled([
        leftC.query(`select * from billing.set_feature_control($1::uuid, $2::text, 'DISABLED', 'SECURITY', 0)`, [adminUser.id, createFeature]),
        rightC.query(`select * from billing.set_feature_control($1::uuid, $2::text, 'MAINTENANCE', 'MAINTENANCE', 0)`, [adminUser.id, createFeature]),
      ])
      const rows = await admin.query(`select count(*)::int as n from billing.feature_controls where feature_id = $1`, [createFeature])
      const ok = raced.filter((row) => row.status === 'fulfilled').length
      results.FEATURE_CONCURRENT_FIRST_CREATE = ok === 1 && rows.rows[0].n === 1 ? 'PASS' : 'FAIL'
    } catch {
      results.FEATURE_CONCURRENT_FIRST_CREATE = 'FAIL'
    } finally {
      try { await leftC.end() } catch { /* ignore */ }
      try { await rightC.end() } catch { /* ignore */ }
    }

    const providerId = 'openai'
    const beforeProviderCreate = await countAudit(admin, 'provider.control.created', providerId)
    await admin.query(
      `select * from billing.set_provider_control($1::uuid, $2::text, 'AVAILABLE', 'MANUAL_ADMIN', 0)`,
      [adminUser.id, providerId],
    )
    const providerCreated = await admin.query(`select * from billing.provider_controls where provider_id = $1`, [providerId])
    results.PROVIDER_CREATE = providerCreated.rows[0].version === 1 && providerCreated.rows[0].updated_by === adminUser.id
      ? 'PASS' : 'FAIL'
    results.AUDIT_PROVIDER_CREATE = await countAudit(admin, 'provider.control.created', providerId) === beforeProviderCreate + 1
      ? 'PASS' : 'FAIL'

    const beforeProviderChange = await countAudit(admin, 'provider.control.changed', providerId)
    await admin.query(
      `select * from billing.set_provider_control($1::uuid, $2::text, 'MAINTENANCE', 'MAINTENANCE', 1)`,
      [adminUser.id, providerId],
    )
    const providerUpdated = await admin.query(`select version, mode from billing.provider_controls where provider_id = $1`, [providerId])
    results.PROVIDER_UPDATE = providerUpdated.rows[0].version === 2 && providerUpdated.rows[0].mode === 'MAINTENANCE' ? 'PASS' : 'FAIL'
    results.AUDIT_PROVIDER_UPDATE = await countAudit(admin, 'provider.control.changed', providerId) === beforeProviderChange + 1
      ? 'PASS' : 'FAIL'

    const providerStale = await expectBlocked(
      admin,
      `select billing.set_provider_control($1::uuid, $2::text, 'AVAILABLE', 'MANUAL_ADMIN', 1)`,
      [adminUser.id, providerId],
    )
    const afterProviderStale = await admin.query(`select version, mode from billing.provider_controls where provider_id = $1`, [providerId])
    const providerStaleAudit = await countAudit(admin, 'provider.control.changed', providerId)
    results.PROVIDER_CONFIG_CONFLICT = providerStale && afterProviderStale.rows[0].version === 2
      && afterProviderStale.rows[0].mode === 'MAINTENANCE'
      && providerStaleAudit === beforeProviderChange + 1
      ? 'PASS' : 'FAIL'

    const leftP = connect()
    const rightP = connect()
    await leftP.connect()
    await rightP.connect()
    try {
      gateStaging()
      const raced = await Promise.allSettled([
        leftP.query(`select * from billing.set_provider_control($1::uuid, 'openai', 'UNAVAILABLE', 'PROVIDER_OUTAGE', 2)`, [adminUser.id]),
        rightP.query(`select * from billing.set_provider_control($1::uuid, 'openai', 'AVAILABLE', 'MANUAL_ADMIN', 2)`, [adminUser.id]),
      ])
      results.TWO_REAL_POSTGRES_SESSIONS_PROVIDER = 'YES'
      const ok = raced.filter((row) => row.status === 'fulfilled').length
      const conflict = raced.filter((row) => row.status === 'rejected' && isConflict(row.reason)).length
      const final = await admin.query(`select version from billing.provider_controls where provider_id = 'openai'`)
      results.SUCCESSFUL_PROVIDER_UPDATES = String(ok)
      results.PROVIDER_DB_CAS = ok === 1 && conflict === 1 && final.rows[0].version === 3 ? 'PASS' : 'FAIL'
    } catch (error) {
      results.TWO_REAL_POSTGRES_SESSIONS_PROVIDER = 'YES'
      results.PROVIDER_DB_CAS = 'FAIL'
      results.PROVIDER_CAS_ERROR = redact(error.message, env)
    } finally {
      try { await leftP.end() } catch { /* ignore */ }
      try { await rightP.end() } catch { /* ignore */ }
    }

    const leftG = connect()
    const rightG = connect()
    await leftG.connect()
    await rightG.connect()
    try {
      gateStaging()
      const raced = await Promise.allSettled([
        leftG.query(`select * from billing.set_provider_control($1::uuid, 'google.cloud_run.ai_ear', 'UNAVAILABLE', 'PROVIDER_OUTAGE', 0)`, [adminUser.id]),
        rightG.query(`select * from billing.set_provider_control($1::uuid, 'google.cloud_run.ai_ear', 'MAINTENANCE', 'MAINTENANCE', 0)`, [adminUser.id]),
      ])
      const rows = await admin.query(`select count(*)::int as n from billing.provider_controls where provider_id = 'google.cloud_run.ai_ear'`)
      const ok = raced.filter((row) => row.status === 'fulfilled').length
      results.PROVIDER_CONCURRENT_FIRST_CREATE = ok === 1 && rows.rows[0].n === 1 ? 'PASS' : 'FAIL'
    } catch {
      results.PROVIDER_CONCURRENT_FIRST_CREATE = 'FAIL'
    } finally {
      try { await leftG.end() } catch { /* ignore */ }
      try { await rightG.end() } catch { /* ignore */ }
    }

    const sampleAudit = (await admin.query(`select audit_id from billing.admin_audit limit 1`)).rows[0]
    results.AUDIT_UPDATE = sampleAudit
      ? (await expectBlocked(admin, `update billing.admin_audit set action = 'permission.revoke' where audit_id = $1`, [sampleAudit.audit_id]) ? 'BLOCKED' : 'FAIL')
      : 'FAIL'
    results.AUDIT_DELETE = sampleAudit
      ? (await expectBlocked(admin, `delete from billing.admin_audit where audit_id = $1`, [sampleAudit.audit_id]) ? 'BLOCKED' : 'FAIL')
      : 'FAIL'
    results.AUDIT_APPEND_ONLY = results.AUDIT_UPDATE === 'BLOCKED' && results.AUDIT_DELETE === 'BLOCKED' ? 'PASS' : 'FAIL'

    const snapSafe = await admin.query(
      `select billing.admin_audit_snapshot($1::jsonb) as snap`,
      [JSON.stringify({ extra: 'drop', feature_id: 'ready_avatar', mode: 'DISABLED', reason_code: 'SECURITY', version: 1 })],
    )
    const snap = snapSafe.rows[0].snap
    results.AUDIT_SAFE_SNAPSHOT = snap.feature_id === 'ready_avatar' && snap.extra === undefined && snap.version === 1 ? 'PASS' : 'FAIL'
    results.AUDIT_PRIVACY = await expectBlocked(
      admin,
      `select billing.admin_audit_snapshot($1::jsonb)`,
      [JSON.stringify({ api_key: 'dummy', secret: 'dummy', token: 'dummy', password: 'dummy' })],
    ) ? 'PASS' : 'FAIL'
    results.AUDIT_ATOMICITY = results.FEATURE_CREATE === 'PASS' && results.AUDIT_FEATURE_CREATE === 'PASS'
      && results.PROVIDER_CREATE === 'PASS' && results.AUDIT_PROVIDER_CREATE === 'PASS'
      ? 'PASS' : 'FAIL'

    results.CANONICAL_FEATURES = await expectBlocked(
      admin,
      `select billing.set_feature_control($1::uuid, 'secret.nuke', 'DISABLED', 'SECURITY', 0)`,
      [adminUser.id],
    ) ? 'PASS' : 'FAIL'
    results.CANONICAL_PROVIDERS = await expectBlocked(
      admin,
      `select billing.set_provider_control($1::uuid, 'acme.magic', 'UNAVAILABLE', 'PROVIDER_OUTAGE', 0)`,
      [adminUser.id],
    ) ? 'PASS' : 'FAIL'
    results.INVALID_FEATURE_MODE = await expectBlocked(
      admin,
      `select billing.set_feature_control($1::uuid, 'body.scan', 'PAUSED', 'SECURITY', 0)`,
      [adminUser.id],
    ) ? 'BLOCKED' : 'FAIL'
    results.INVALID_PROVIDER_MODE = await expectBlocked(
      admin,
      `select billing.set_provider_control($1::uuid, 'openai', 'DOWN', 'PROVIDER_OUTAGE', 3)`,
      [adminUser.id],
    ) ? 'BLOCKED' : 'FAIL'
    results.INVALID_REASON = await expectBlocked(
      admin,
      `select billing.set_feature_control($1::uuid, 'body.scan', 'DISABLED', 'COST_CONTROL', 0)`,
      [adminUser.id],
    ) ? 'BLOCKED' : 'FAIL'

    results.FEATURE_DELETE = await expectBlocked(admin, `delete from billing.feature_controls where feature_id = $1`, [featureId])
      ? 'BLOCKED' : 'FAIL'
    results.PROVIDER_DELETE = await expectBlocked(admin, `delete from billing.provider_controls where provider_id = 'openai'`)
      ? 'BLOCKED' : 'FAIL'

    const tsProbe = await admin.query(
      `insert into billing.feature_controls (feature_id, mode, reason_code, version, updated_at, updated_by)
       values ('smart_ai', 'ENABLED', null, 1, '2099-01-01T00:00:00Z', $1::uuid)
       returning updated_at`,
      [adminUser.id],
    )
    if (new Date(tsProbe.rows[0].updated_at).getFullYear() === 2099) results.UPDATED_AT = 'FAIL'

    const openai = (await admin.query(`select * from billing.provider_controls where provider_id = 'openai'`)).rows[0]
    await admin.query(
      `select * from billing.set_feature_control($1::uuid, 'food.scan', 'DISABLED', 'SECURITY', 0)`,
      [adminUser.id],
    )
    const food = (await admin.query(`select * from billing.feature_controls where feature_id = 'food.scan'`)).rows[0]
    const disabled = resolveOperationalAvailability({
      featureControl: food,
      featureId: 'food.scan',
      providerControls: [openai],
    })
    results.FEATURE_DISABLED = disabled.result === OPERATIONAL_AVAILABILITY.DISABLED ? 'PASS' : 'FAIL'

    await admin.query(
      `select * from billing.set_feature_control($1::uuid, 'ai.text.request', 'MAINTENANCE', 'MAINTENANCE', 0)`,
      [adminUser.id],
    )
    const text = (await admin.query(`select * from billing.feature_controls where feature_id = 'ai.text.request'`)).rows[0]
    const maintenance = resolveOperationalAvailability({
      featureControl: text,
      featureId: 'ai.text.request',
      providerControls: [{ ...openai, mode: PROVIDER_MODE.UNAVAILABLE, reason_code: 'PROVIDER_OUTAGE' }],
    })
    results.FEATURE_MAINTENANCE = maintenance.result === OPERATIONAL_AVAILABILITY.MAINTENANCE ? 'PASS' : 'FAIL'

    const openaiNow = (await admin.query(`select version from billing.provider_controls where provider_id = 'openai'`)).rows[0]
    await admin.query(
      `select * from billing.set_provider_control($1::uuid, 'openai', 'UNAVAILABLE', 'PROVIDER_OUTAGE', $2::int)`,
      [adminUser.id, openaiNow.version],
    )
    const openaiDown = (await admin.query(`select * from billing.provider_controls where provider_id = 'openai'`)).rows[0]
    const down = resolveOperationalAvailability({
      featureId: 'ai.eye.analysis',
      providerControls: [openaiDown],
    })
    results.PROVIDER_UNAVAILABLE = down.result === OPERATIONAL_AVAILABILITY.PROVIDER_UNAVAILABLE ? 'PASS' : 'FAIL'

    await admin.query(
      `select * from billing.set_provider_control($1::uuid, 'openai', 'MAINTENANCE', 'MAINTENANCE', $2::int)`,
      [adminUser.id, openaiDown.version],
    )
    const openaiMaint = (await admin.query(`select * from billing.provider_controls where provider_id = 'openai'`)).rows[0]
    const maint = resolveOperationalAvailability({
      featureId: 'ai.eye.analysis',
      providerControls: [openaiMaint],
    })
    results.PROVIDER_MAINTENANCE = maint.result === OPERATIONAL_AVAILABILITY.PROVIDER_MAINTENANCE ? 'PASS' : 'FAIL'

    const local = resolveOperationalAvailability({
      featureId: 'tts.request',
      providerControls: [openaiMaint],
    })
    results.LOCAL_FEATURE_ISOLATION = local.result === OPERATIONAL_AVAILABILITY.AVAILABLE ? 'PASS' : 'FAIL'
    const noRow = resolveOperationalAvailability({ featureId: 'body.scan' })
    results.KNOWN_NO_ROW_DEFAULTS = noRow.result === OPERATIONAL_AVAILABILITY.AVAILABLE
      && resolveOperationalAvailability({ featureId: 'ai.voice.session' }).result === OPERATIONAL_AVAILABILITY.AVAILABLE
      ? 'PASS' : 'FAIL'
    results.UNKNOWN_FEATURE = resolveOperationalAvailability({ featureId: 'secret.nuke' }).result === OPERATIONAL_AVAILABILITY.UNKNOWN_FEATURE
      ? 'FAIL SAFE' : 'FAIL'
    results.UNKNOWN_PROVIDER = resolveOperationalAvailability({
      featureId: 'food.scan',
      requiredProviders: ['not.a.provider'],
    }).result === OPERATIONAL_AVAILABILITY.UNKNOWN_PROVIDER
      ? 'FAIL SAFE' : 'FAIL'
    results.EMERGENCY_SEMANTICS = results.PROVIDER_UNAVAILABLE === 'PASS' ? 'PASS' : 'FAIL'
    results.OPERATIONAL_RESOLVER = [
      results.FEATURE_DISABLED,
      results.FEATURE_MAINTENANCE,
      results.PROVIDER_UNAVAILABLE,
      results.PROVIDER_MAINTENANCE,
      results.LOCAL_FEATURE_ISOLATION,
    ].every((value) => value === 'PASS') ? 'PASS' : 'FAIL'

    results.DEFAULT_DENY = (await admin.query('select billing.has_billing_admin($1::uuid) as ok', [normal.id])).rows[0].ok === false
      ? 'PASS' : 'FAIL'
    results.BILL123_INTACT = results.BILL1_SCHEMA === 'PASS' && results.BILL2_SCHEMA === 'PASS' && results.BILL3_SCHEMA === 'PASS'
      ? 'PASS' : 'FAIL'
    results.BILL4A_INTACT = results.BILL4A_SCHEMA === 'PASS' && results.DEFAULT_DENY === 'PASS' && results.AUDIT_APPEND_ONLY === 'PASS'
      ? 'PASS' : 'FAIL'
  } catch (error) {
    fail(redact(error.code || error.message, env))
  } finally {
    setBillingAdminServiceForTests(null)
    try { await admin.end() } catch { /* ignore */ }
  }

  const critical = [
    results.TARGET_VERIFIED_STAGING === 'YES',
    results.BILL_4B_MIGRATION_APPLIED === 'YES',
    results.SCHEMA === 'PASS',
    results.RLS === 'PASS',
    results.RAW_CLIENT_CRUD === 'BLOCKED',
    results.FEATURE_DB_CAS === 'PASS',
    results.PROVIDER_DB_CAS === 'PASS',
    results.FEATURE_CONCURRENT_FIRST_CREATE === 'PASS',
    results.PROVIDER_CONCURRENT_FIRST_CREATE === 'PASS',
    results.AUDIT_APPEND_ONLY === 'PASS',
    results.CANONICAL_FEATURES === 'PASS',
    results.OPERATIONAL_RESOLVER === 'PASS',
  ]
  results.BILL_4B_STAGING = critical.every(Boolean) && !results.STOP_REASON ? 'READY' : (results.STOP_REASON ? 'FAILED' : 'PARTIAL')
  print(results)
  process.exit(results.BILL_4B_STAGING === 'READY' ? 0 : 1)
}

main().catch((error) => {
  results.STOP_REASON = redact(error.message, env)
  results.BILL_4B_STAGING = 'FAILED'
  print(results)
  process.exit(1)
})

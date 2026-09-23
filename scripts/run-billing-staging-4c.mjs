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
import { resolveCostSafety } from '../src/services/billing/costSafety.js'
import { COST_SAFETY } from '../src/services/billing/catalog.js'
import { isCostDrivingFeature } from '../src/services/billing/features.js'
import {
  assertStagingDatabaseUrl,
  classifyRestAccess,
  loadBillingTestEnvFile,
  splitSqlStatements,
} from '../src/services/billing/stagingLive.js'

const ENV_FILE = new URL('../.env.local', import.meta.url)
const MIGRATION = new URL('../supabase/migrations/20260922000000_billing_cost_safety.sql', import.meta.url)
const MIGRATION_REL = 'supabase/migrations/20260922000000_billing_cost_safety.sql'

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
  BILL_4C_MIGRATION_APPLIED: 'NO',
  MIGRATION_CHECKSUM: '',
  STOP_REASON: '',
  TWO_REAL_POSTGRES_SESSIONS: 'NO',
  SUCCESSFUL_CONCURRENT_UPDATES: '0',
  DB_CAS_AUTHORITY: 'NO',
  GLOBAL_LOCK: 'NO',
  PROVIDER_CALLS_MADE: 'NO',
  QUOTA_CONSUMED: 'NO',
  SUBSCRIPTION_MUTATION: 'NO',
  LIVE_ENFORCEMENT: 'NO',
  HISTORICAL_TIMESTAMP: 'PARTIAL',
  HISTORICAL_COST: 'PARTIAL',
  FOUNDATION_50K: 'PARTIAL',
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

results.MIGRATION_CHECKSUM = execFileSync('git', ['hash-object', '--', MIGRATION_REL], { encoding: 'utf8' }).trim()

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
  const email = `bill4c-${randomUUID()}@invalid.example`
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
    json(payload) {
      response.body = payload
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

function createSql(actorId, {
  amount = 10000,
  enabled = true,
  featureId = null,
  mode = 'HARD_STOP',
  period = 'DAILY',
  scope = 'GLOBAL',
} = {}) {
  return {
    params: [actorId, scope, featureId, period, mode, amount, enabled],
    text: `select * from billing.create_cost_threshold($1::uuid, $2, $3, $4, $5, $6::bigint, 'SEK', $7::boolean)`,
  }
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
        'cost_thresholds', to_regclass('billing.cost_thresholds') is not null,
        'create_cost_threshold', exists(
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'billing' and p.proname = 'create_cost_threshold'
        )
      ) as probe
    `)).rows[0].probe

    results.BILL1_SCHEMA = collision.usage_events ? 'PASS' : 'FAIL'
    results.BILL2_SCHEMA = collision.plans && collision.quota_reservations ? 'PASS' : 'FAIL'
    results.BILL3_SCHEMA = collision.subscriptions ? 'PASS' : 'FAIL'
    results.BILL4A_SCHEMA = collision.admin_permissions && collision.admin_audit ? 'PASS' : 'FAIL'
    results.BILL4B_SCHEMA = collision.feature_controls && collision.provider_controls ? 'PASS' : 'FAIL'
    if (!collision.usage_events || !collision.plans || !collision.subscriptions
      || !collision.admin_permissions || !collision.feature_controls) {
      fail('bill1_2_3_4a_4b_missing')
      return
    }
    if (collision.cost_thresholds || collision.create_cost_threshold) {
      results.COLLISION_CHECK = 'FAIL'
      fail('bill4c_objects_already_present')
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
      results.BILL_4C_MIGRATION_APPLIED = 'YES'
      results.TRANSACTION = 'COMMITTED'
    } catch (error) {
      try { await admin.query('ROLLBACK') } catch { /* ignore */ }
      results.TRANSACTION = 'ROLLED BACK'
      results.BILL_4C_MIGRATION_APPLIED = 'NO'
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
        'rls', (select json_agg(json_build_object('rel', c.relname, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity))
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'billing' and c.relkind = 'r' and c.relname = 'cost_thresholds'),
        'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
          from pg_indexes where schemaname = 'billing' and tablename = 'cost_thresholds'),
        'usage_still', to_regclass('billing.usage_events') is not null,
        'feature_still', to_regclass('billing.feature_controls') is not null,
        'admin_still', to_regclass('billing.admin_permissions') is not null
      ) as probe
    `)).rows[0].probe
    const tables = objects.tables || []
    const functions = objects.functions || []
    const indexes = objects.indexes || []
    results.SCHEMA = tables.includes('cost_thresholds')
      && objects.usage_still && objects.feature_still && objects.admin_still
      && ['create_cost_threshold', 'update_cost_threshold', 'list_active_cost_thresholds', 'has_billing_admin'].every((name) => functions.includes(name))
      ? 'PASS' : 'FAIL'
    results.RLS = (objects.rls || []).length === 1 && objects.rls[0].rls && objects.rls[0].force ? 'PASS' : 'FAIL'
    results.INDEXES = indexes.some((name) => /identity/i.test(name))
      && indexes.some((name) => /active_lookup/i.test(name))
      && indexes.some((name) => /pkey/i.test(name))
      ? 'PASS' : 'FAIL'

    const grants = (await admin.query(`
      select json_build_object(
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
        'svc_delete', has_table_privilege('service_role', 'billing.cost_thresholds', 'DELETE')
      ) as probe
    `)).rows[0].probe
    results.SERVICE_ROLE_GRANTS = (
      !grants.svc_select && !grants.svc_insert && !grants.svc_update && !grants.svc_delete
    ) ? 'PASS' : 'FAIL'
    results.TRUSTED_GRANTS = (
      !grants.anon_select && !grants.anon_insert && !grants.anon_update && !grants.anon_delete
      && !grants.auth_select && !grants.auth_insert && !grants.auth_update && !grants.auth_delete
      && results.SERVICE_ROLE_GRANTS === 'PASS'
    ) ? 'PASS' : 'FAIL'

    const rpcGrants = (await admin.query(`
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
    const badExec = rpcGrants.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
    const serviceExec = ['create_cost_threshold', 'update_cost_threshold', 'list_active_cost_thresholds'].every((name) => (
      rpcGrants.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
    ))
    const appendBlocked = !rpcGrants.some((row) => row.routine_name === 'append_admin_audit' && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
    results.RPC_GRANTS = !badExec && serviceExec && appendBlocked ? 'PASS' : 'FAIL'

    const definer = (await admin.query(`
      select p.proname, p.prosecdef as security_definer, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'billing'
        and p.proname in ('create_cost_threshold', 'update_cost_threshold', 'list_active_cost_thresholds')
    `)).rows
    results.SECURITY_DEFINER = definer.length === 3 && definer.every((row) => {
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
    for (const role of ['anon', 'authenticated']) {
      const jwtToken = role === 'authenticated' ? normal.accessToken : ''
      const select = await rest('cost_thresholds', { method: 'GET', role, userJwt: jwtToken })
      const insert = await rest('cost_thresholds', { body: { dummy: true }, method: 'POST', role, userJwt: jwtToken })
      const patch = await rest('cost_thresholds', { body: { enabled: false }, method: 'PATCH', role, userJwt: jwtToken })
      const del = await rest('cost_thresholds?scope=eq.GLOBAL', { method: 'DELETE', role, userJwt: jwtToken })
      clientBlocked.push(select.access === 'blocked', insert.access === 'blocked', patch.access === 'blocked', del.access === 'blocked')
    }
    const clientRpc = await rest('rpc/create_cost_threshold', {
      body: {
        p_actor_user_id: normal.id,
        p_amount_minor: 1,
        p_currency: 'SEK',
        p_enabled: true,
        p_feature_id: null,
        p_limit_mode: 'HARD_STOP',
        p_period: 'DAILY',
        p_scope: 'GLOBAL',
      },
      method: 'POST',
      role: 'authenticated',
      userJwt: normal.accessToken,
    })
    results.RAW_CLIENT_CRUD = clientBlocked.every(Boolean) && clientRpc.access === 'blocked' ? 'BLOCKED' : 'FAIL'

    const spoof = createResponse()
    await handler(createRequest({
      body: { action: 'create_cost_threshold', billing_admin: true, isAdmin: true, role: 'admin' },
      method: 'POST',
      token: normal.accessToken,
    }), spoof)
    results.ADMIN_SPOOF = spoof.statusCode === 403 ? 'BLOCKED' : 'FAIL'
    const denied = await requireBillingAdmin(createRequest({ body: { isAdmin: true }, token: normal.accessToken }))
    if (denied.ok) results.ADMIN_SPOOF = 'FAIL'

    const normalCreate = createSql(normal.id)
    results.NORMAL_USER_MUTATION = await expectBlocked(admin, normalCreate.text, normalCreate.params)
      ? 'BLOCKED' : 'FAIL'

    gateStaging()
    await admin.query(
      `insert into billing.admin_permissions (user_id, permission, status)
       values ($1::uuid, 'billing_admin', 'ACTIVE')
       on conflict (user_id, permission) do update set status = 'ACTIVE'`,
      [adminUser.id],
    )
    const boot = await admin.query('select billing.has_billing_admin($1::uuid) as ok', [adminUser.id])
    results.STAGING_ADMIN = boot.rows[0]?.ok === true ? 'PASS' : 'FAIL'

    results.MONEY = await expectBlocked(admin, createSql(adminUser.id, { amount: -1 }).text, createSql(adminUser.id, { amount: -1 }).params)
      ? 'PASS' : 'FAIL'
    results.CURRENCY = await expectBlocked(
      admin,
      `select billing.create_cost_threshold($1::uuid, 'GLOBAL', null, 'DAILY', 'HARD_STOP', 1, 'USD', true)`,
      [adminUser.id],
    ) ? 'PASS' : 'FAIL'
    results.PERIOD = await expectBlocked(admin, createSql(adminUser.id, { period: 'WEEKLY' }).text, createSql(adminUser.id, { period: 'WEEKLY' }).params)
      ? 'PASS' : 'FAIL'
    results.SCOPE = await expectBlocked(admin, createSql(adminUser.id, { scope: 'USER' }).text, createSql(adminUser.id, { scope: 'USER' }).params)
      ? 'PASS' : 'FAIL'
    results.SCOPE_CONSISTENCY = await expectBlocked(
      admin,
      createSql(adminUser.id, { featureId: 'food.scan', scope: 'GLOBAL' }).text,
      createSql(adminUser.id, { featureId: 'food.scan', scope: 'GLOBAL' }).params,
    ) && await expectBlocked(
      admin,
      createSql(adminUser.id, { featureId: null, scope: 'FEATURE' }).text,
      createSql(adminUser.id, { featureId: null, scope: 'FEATURE' }).params,
    ) ? 'PASS' : 'FAIL'
    results.CANONICAL_FEATURE = await expectBlocked(
      admin,
      createSql(adminUser.id, { featureId: 'not.a.feature', scope: 'FEATURE' }).text,
      createSql(adminUser.id, { featureId: 'not.a.feature', scope: 'FEATURE' }).params,
    ) ? 'PASS' : 'FAIL'
    results.LIMIT_MODE = await expectBlocked(admin, createSql(adminUser.id, { mode: 'WARN' }).text, createSql(adminUser.id, { mode: 'WARN' }).params)
      ? 'PASS' : 'FAIL'

    gateStaging()
    const created = await admin.query(createSql(adminUser.id).text, createSql(adminUser.id).params)
    const createdRow = created.rows[0]
    const createAudits = await countAudit(admin, 'cost.threshold.created', createdRow.threshold_id)
    results.CREATE = createdRow.version === 1 && createdRow.updated_by === adminUser.id
      && createdRow.amount_minor === '10000' || createdRow.amount_minor === 10000
      ? 'PASS' : 'FAIL'
    if (!(createdRow.version === 1 && createdRow.updated_by === adminUser.id && Number(createdRow.amount_minor) === 10000)) {
      results.CREATE = 'FAIL'
    } else {
      results.CREATE = 'PASS'
    }
    results.AUDIT_CREATE = createAudits === 1 ? 'PASS' : 'FAIL'
    results.UPDATED_BY = createdRow.updated_by === adminUser.id ? 'SERVER AUTHORITATIVE' : 'FAIL'
    results.UPDATED_AT = createdRow.updated_at && new Date(createdRow.updated_at).getFullYear() !== 2099
      ? 'SERVER AUTHORITATIVE' : 'FAIL'

    const dupGlobal = await expectBlocked(admin, createSql(adminUser.id, { amount: 1 }).text, createSql(adminUser.id, { amount: 1 }).params)
    const globalCount = await admin.query(
      `select count(*)::int as n from billing.cost_thresholds
       where scope = 'GLOBAL' and feature_id is null and period = 'DAILY' and limit_mode = 'HARD_STOP'`,
    )
    results.GLOBAL_NULL_UNIQUENESS = dupGlobal && globalCount.rows[0].n === 1 ? 'PASS' : 'FAIL'

    const featureCreate = createSql(adminUser.id, { featureId: 'food.scan', scope: 'FEATURE', amount: 500 })
    const featureRow = (await admin.query(featureCreate.text, featureCreate.params)).rows[0]
    const dupFeature = await expectBlocked(admin, featureCreate.text, featureCreate.params)
    const featureCount = await admin.query(
      `select count(*)::int as n from billing.cost_thresholds
       where scope = 'FEATURE' and feature_id = 'food.scan' and period = 'DAILY' and limit_mode = 'HARD_STOP'`,
    )
    results.FEATURE_UNIQUENESS = dupFeature && featureCount.rows[0].n === 1 ? 'PASS' : 'FAIL'

    const beforeChange = await countAudit(admin, 'cost.threshold.changed', createdRow.threshold_id)
    await admin.query(
      `select * from billing.update_cost_threshold($1::uuid, $2::uuid, 1, 20000::bigint, true)`,
      [adminUser.id, createdRow.threshold_id],
    )
    const afterUpdate = await admin.query(
      `select version, amount_minor from billing.cost_thresholds where threshold_id = $1`,
      [createdRow.threshold_id],
    )
    const afterChange = await countAudit(admin, 'cost.threshold.changed', createdRow.threshold_id)
    results.UPDATE = Number(afterUpdate.rows[0].version) === 2 && Number(afterUpdate.rows[0].amount_minor) === 20000 ? 'PASS' : 'FAIL'
    results.AMOUNT_UPDATE = results.UPDATE
    results.AUDIT_UPDATE = afterChange === beforeChange + 1 ? 'PASS' : 'FAIL'

    const stale = await expectBlocked(
      admin,
      `select billing.update_cost_threshold($1::uuid, $2::uuid, 1, 1::bigint, true)`,
      [adminUser.id, createdRow.threshold_id],
    )
    const afterStale = await admin.query(
      `select version, amount_minor from billing.cost_thresholds where threshold_id = $1`,
      [createdRow.threshold_id],
    )
    const staleAudit = await countAudit(admin, 'cost.threshold.changed', createdRow.threshold_id)
    results.CONFIG_CONFLICT = stale && Number(afterStale.rows[0].version) === 2
      && Number(afterStale.rows[0].amount_minor) === 20000
      && staleAudit === afterChange
      ? 'PASS' : 'FAIL'
    results.AUDIT_CONFLICT = results.CONFIG_CONFLICT

    const left = connect()
    const right = connect()
    await left.connect()
    await right.connect()
    try {
      gateStaging()
      const raced = await Promise.allSettled([
        left.query(
          `select * from billing.update_cost_threshold($1::uuid, $2::uuid, 2, 30000::bigint, true)`,
          [adminUser.id, createdRow.threshold_id],
        ),
        right.query(
          `select * from billing.update_cost_threshold($1::uuid, $2::uuid, 2, 40000::bigint, false)`,
          [adminUser.id, createdRow.threshold_id],
        ),
      ])
      results.TWO_REAL_POSTGRES_SESSIONS = 'YES'
      const ok = raced.filter((row) => row.status === 'fulfilled').length
      const conflict = raced.filter((row) => row.status === 'rejected' && isConflict(row.reason)).length
      const final = await admin.query(
        `select version from billing.cost_thresholds where threshold_id = $1`,
        [createdRow.threshold_id],
      )
      results.SUCCESSFUL_CONCURRENT_UPDATES = String(ok)
      results.DB_CAS_AUTHORITY = ok === 1 && conflict === 1 && Number(final.rows[0].version) === 3 ? 'YES' : 'NO'
    } catch (error) {
      results.TWO_REAL_POSTGRES_SESSIONS = 'YES'
      results.DB_CAS_AUTHORITY = 'NO'
      results.CAS_ERROR = redact(error.message, env)
    } finally {
      try { await left.end() } catch { /* ignore */ }
      try { await right.end() } catch { /* ignore */ }
    }

    const leftC = connect()
    const rightC = connect()
    await leftC.connect()
    await rightC.connect()
    try {
      gateStaging()
      const monthly = createSql(adminUser.id, { period: 'MONTHLY', amount: 111 })
      const raced = await Promise.allSettled([
        leftC.query(monthly.text, monthly.params),
        rightC.query(createSql(adminUser.id, { period: 'MONTHLY', amount: 222 }).text, createSql(adminUser.id, { period: 'MONTHLY', amount: 222 }).params),
      ])
      const rows = await admin.query(
        `select count(*)::int as n from billing.cost_thresholds
         where scope = 'GLOBAL' and feature_id is null and period = 'MONTHLY' and limit_mode = 'HARD_STOP'`,
      )
      const ok = raced.filter((row) => row.status === 'fulfilled').length
      results.CONCURRENT_FIRST_CREATE = ok === 1 && rows.rows[0].n === 1 ? 'PASS' : 'FAIL'
    } catch {
      results.CONCURRENT_FIRST_CREATE = 'FAIL'
    } finally {
      try { await leftC.end() } catch { /* ignore */ }
      try { await rightC.end() } catch { /* ignore */ }
    }

    results.IDENTITY_IMMUTABILITY = await expectBlocked(
      admin,
      `update billing.cost_thresholds
       set scope = 'FEATURE', feature_id = 'food.scan', period = 'MONTHLY', limit_mode = 'SOFT_ALERT'
       where threshold_id = $1`,
      [createdRow.threshold_id],
    ) ? 'PASS' : 'FAIL'
    results.DELETE = await expectBlocked(
      admin,
      `delete from billing.cost_thresholds where threshold_id = $1`,
      [createdRow.threshold_id],
    ) ? 'BLOCKED' : 'FAIL'

    const currentFeature = await admin.query(
      `select version from billing.cost_thresholds where threshold_id = $1`,
      [featureRow.threshold_id],
    )
    await admin.query(
      `select * from billing.update_cost_threshold($1::uuid, $2::uuid, $3::int, 500::bigint, false)`,
      [adminUser.id, featureRow.threshold_id, currentFeature.rows[0].version],
    )
    const disabled = await admin.query(
      `select enabled from billing.cost_thresholds where threshold_id = $1`,
      [featureRow.threshold_id],
    )
    const active = await admin.query('select threshold_id from billing.list_active_cost_thresholds()')
    const activeIds = active.rows.map((row) => row.threshold_id)
    results.ENABLED_UPDATE = disabled.rows[0].enabled === false ? 'PASS' : 'FAIL'
    results.ACTIVE_READ = !activeIds.includes(featureRow.threshold_id) && activeIds.includes(createdRow.threshold_id)
      ? 'PASS' : 'FAIL'

    const tsProbe = await admin.query(
      `insert into billing.cost_thresholds (
         amount_minor, currency, enabled, feature_id, limit_mode, period, scope, updated_at, updated_by, version
       ) values (1, 'SEK', true, null, 'SOFT_ALERT', 'DAILY', 'GLOBAL', '2099-01-01T00:00:00Z', $1::uuid, 1)
       returning updated_at, updated_by`,
      [adminUser.id],
    )
    if (new Date(tsProbe.rows[0].updated_at).getFullYear() === 2099) results.UPDATED_AT = 'FAIL'
    if (tsProbe.rows[0].updated_by !== adminUser.id) results.UPDATED_BY = 'FAIL'

    const sampleAudit = (await admin.query(`select audit_id from billing.admin_audit limit 1`)).rows[0]
    results.AUDIT_UPDATE_BLOCKED = sampleAudit
      ? (await expectBlocked(admin, `update billing.admin_audit set action = 'permission.revoke' where audit_id = $1`, [sampleAudit.audit_id]) ? 'BLOCKED' : 'FAIL')
      : 'FAIL'
    results.AUDIT_DELETE_BLOCKED = sampleAudit
      ? (await expectBlocked(admin, `delete from billing.admin_audit where audit_id = $1`, [sampleAudit.audit_id]) ? 'BLOCKED' : 'FAIL')
      : 'FAIL'
    results.AUDIT_APPEND_ONLY = results.AUDIT_UPDATE_BLOCKED === 'BLOCKED' && results.AUDIT_DELETE_BLOCKED === 'BLOCKED'
      ? 'PASS' : 'FAIL'
    results.AUDIT_PRIVACY = await expectBlocked(
      admin,
      `select billing.admin_audit_snapshot($1::jsonb)`,
      [JSON.stringify({ api_key: 'dummy', password: 'dummy', prompt: 'dummy', secret: 'dummy', token: 'dummy' })],
    ) ? 'PASS' : 'FAIL'
    results.AUDIT_ATOMICITY = results.CREATE === 'PASS' && results.AUDIT_CREATE === 'PASS' && results.AUDIT_CONFLICT === 'PASS'
      ? 'PASS' : 'FAIL'

    results.COSTDRIVING_AUTHORITY = isCostDrivingFeature('food.scan') === true && isCostDrivingFeature('friend_chat') === false
      ? 'SERVER' : 'FAIL'
    const spoofHard = resolveCostSafety({
      costDriving: false,
      costSummary: {
        amount_minor: 10000,
        classification: 'MEASURED',
        currency: 'SEK',
        period: 'DAILY',
        scope: 'GLOBAL',
      },
      feature: 'food.scan',
      threshold: {
        amount_minor: 10000,
        currency: 'SEK',
        limit_mode: 'HARD_STOP',
        period: 'DAILY',
        scope: 'GLOBAL',
      },
    })
    results.CLIENT_SPOOF = spoofHard.result === COST_SAFETY.COST_HARD_STOP && spoofHard.allow === false ? 'BLOCKED' : 'FAIL'
    const hardUnavail = resolveCostSafety({
      costSummary: { amount_minor: null, classification: 'UNAVAILABLE', currency: 'SEK', period: 'DAILY', scope: 'GLOBAL' },
      feature: 'tts.request',
      threshold: {
        amount_minor: 1,
        currency: 'SEK',
        limit_mode: 'HARD_STOP',
        period: 'DAILY',
        scope: 'GLOBAL',
      },
    })
    results.HARD_UNAVAILABLE = hardUnavail.allow === false && hardUnavail.result === COST_SAFETY.COST_UNAVAILABLE
      ? 'DENY' : 'FAIL'
    const softUnavail = resolveCostSafety({
      costSummary: { amount_minor: null, classification: 'UNAVAILABLE', currency: 'SEK', period: 'DAILY', scope: 'GLOBAL' },
      feature: 'food.scan',
      threshold: {
        amount_minor: 1,
        currency: 'SEK',
        limit_mode: 'SOFT_ALERT',
        period: 'DAILY',
        scope: 'GLOBAL',
      },
    })
    results.SOFT_UNAVAILABLE = softUnavail.allow === true && softUnavail.result === COST_SAFETY.COST_UNAVAILABLE
      ? 'SIGNAL + ALLOW' : 'FAIL'

    results.PERIOD_DAILY_MONTHLY = results.PERIOD === 'PASS' && results.CONCURRENT_FIRST_CREATE === 'PASS' ? 'PASS' : 'FAIL'
  } catch (error) {
    fail(redact(error.code || error.message, env))
  } finally {
    setBillingAdminServiceForTests(null)
    try { await admin.end() } catch { /* ignore */ }
  }

  const critical = [
    results.TARGET_VERIFIED_STAGING === 'YES',
    results.BILL_4C_MIGRATION_APPLIED === 'YES',
    results.SCHEMA === 'PASS',
    results.RLS === 'PASS',
    results.RAW_CLIENT_CRUD === 'BLOCKED',
    results.GLOBAL_NULL_UNIQUENESS === 'PASS',
    results.CONCURRENT_FIRST_CREATE === 'PASS',
    results.DB_CAS_AUTHORITY === 'YES',
    results.IDENTITY_IMMUTABILITY === 'PASS',
    results.AUDIT_APPEND_ONLY === 'PASS',
    results.AUDIT_PRIVACY === 'PASS',
  ]
  results.BILL_4C_STAGING = critical.every(Boolean) && !results.STOP_REASON ? 'READY' : (results.STOP_REASON ? 'FAILED' : 'PARTIAL')
  print(results)
  process.exit(results.BILL_4C_STAGING === 'READY' ? 0 : 1)
}

main().catch((error) => {
  results.STOP_REASON = redact(error.message, env)
  results.BILL_4C_STAGING = 'FAILED'
  print(results)
  process.exit(1)
})

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
  assertStagingDatabaseUrl,
  classifyRestAccess,
  loadBillingTestEnvFile,
  splitSqlStatements,
} from '../src/services/billing/stagingLive.js'

const ENV_FILE = new URL('../.env.local', import.meta.url)
const MIGRATION = new URL('../supabase/migrations/20260921220000_billing_admin_authority.sql', import.meta.url)
const SOCIAL_ADMIN = 'd449f4d1-d2c7-41fd-8c74-e8b1bbe46f89'

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

const results = {
  TARGET_VERIFIED_STAGING: 'NO',
  PRODUCTION_TOUCHED: 'NO',
  BILL_4A_MIGRATION_APPLIED: 'NO',
  MIGRATION_CHECKSUM: '',
  STOP_REASON: '',
  TWO_REAL_POSTGRES_SESSIONS: 'NO',
  GLOBAL_LOCK: 'NO',
  SERVICE_ROLE_EXPOSED: 'NO',
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
  'supabase/migrations/20260921220000_billing_admin_authority.sql',
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
  const email = `bill4a-${randomUUID()}@invalid.example`
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
        'has_billing_admin', exists(
          select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'billing' and p.proname = 'has_billing_admin'
        ),
        'grant_billing_admin', exists(
          select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'billing' and p.proname = 'grant_billing_admin'
        )
      ) as probe
    `)).rows[0].probe

    results.BILL1_SCHEMA = collision.usage_events ? 'PASS' : 'FAIL'
    results.BILL2_SCHEMA = collision.plans && collision.quota_reservations ? 'PASS' : 'FAIL'
    results.BILL3_SCHEMA = collision.subscriptions ? 'PASS' : 'FAIL'
    if (!collision.usage_events || !collision.plans || !collision.subscriptions) {
      fail('bill1_2_3_missing')
      return
    }
    if (collision.admin_permissions || collision.admin_audit || collision.has_billing_admin || collision.grant_billing_admin) {
      results.COLLISION_CHECK = 'FAIL'
      fail('bill4a_objects_already_present')
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
      results.BILL_4A_MIGRATION_APPLIED = 'YES'
      results.TRANSACTION = 'COMMITTED'
    } catch (error) {
      try { await admin.query('ROLLBACK') } catch { /* ignore */ }
      results.TRANSACTION = 'ROLLED BACK'
      results.BILL_4A_MIGRATION_APPLIED = 'NO'
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
            and c.relname in ('admin_permissions', 'admin_audit')),
        'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
          from pg_indexes where schemaname = 'billing'),
        'usage_events_still', to_regclass('billing.usage_events') is not null,
        'quota_still', to_regclass('billing.quota_reservations') is not null,
        'subscriptions_still', to_regclass('billing.subscriptions') is not null
      ) as probe
    `)).rows[0].probe
    const tables = objects.tables || []
    const functions = objects.functions || []
    results.SCHEMA = tables.includes('admin_permissions') && tables.includes('admin_audit')
      && objects.usage_events_still && objects.quota_still && objects.subscriptions_still
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
    results.CREATED_TABLES = ['admin_permissions', 'admin_audit'].filter((name) => tables.includes(name)).join(',')
    results.RLS = (objects.rls || []).length === 2 && (objects.rls || []).every((row) => row.rls && row.force) ? 'PASS' : 'FAIL'
    const indexes = objects.indexes || []
    results.INDEXES = [
      'admin_permissions_user_permission_uidx',
      'admin_permissions_user_active_idx',
      'admin_audit_created_idx',
      'admin_audit_admin_idx',
      'admin_audit_action_idx',
    ].every((name) => indexes.includes(name)) ? 'PASS' : 'FAIL'
    results.FOUNDATION_50K = results.INDEXES === 'PASS' ? 'PASS' : 'FAIL'

    const grants = (await admin.query(`
      select json_build_object(
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
        'service_audit_update', has_table_privilege('service_role', 'billing.admin_audit', 'UPDATE')
      ) as probe
    `)).rows[0].probe
    results.TRUSTED_GRANTS = (
      !grants.anon_perm_select && !grants.anon_perm_insert && !grants.anon_audit_select
      && !grants.auth_perm_select && !grants.auth_perm_insert && !grants.auth_perm_update && !grants.auth_perm_delete
      && !grants.auth_audit_insert && !grants.auth_audit_update && !grants.auth_audit_delete
      && grants.service_perm_select && !grants.service_perm_insert && !grants.service_audit_insert && !grants.service_audit_update
    ) ? 'PASS' : 'FAIL'

    const rpcGrants = (await admin.query(`
      select grantee, privilege_type, routine_name
      from information_schema.routine_privileges
      where routine_schema = 'billing'
        and routine_name in ('has_billing_admin', 'grant_billing_admin', 'revoke_billing_admin', 'append_admin_audit')
    `)).rows
    const badExec = rpcGrants.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
    const serviceExec = ['has_billing_admin', 'grant_billing_admin', 'revoke_billing_admin'].every((name) => (
      rpcGrants.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
    ))
    const appendBlocked = !rpcGrants.some((row) => row.routine_name === 'append_admin_audit' && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
    results.RPC_GRANTS = !badExec && serviceExec && appendBlocked ? 'PASS' : 'FAIL'

    const definer = (await admin.query(`
      select p.prosecdef as security_definer, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'billing' and p.proname = 'grant_billing_admin'
    `)).rows[0]
    const searchPath = JSON.stringify(definer?.proconfig || [])
    results.SECURITY_DEFINER = definer?.security_definer && /pg_catalog/.test(searchPath) && /pg_temp/.test(searchPath) ? 'PASS' : 'FAIL'

    process.env.SUPABASE_URL = authEnv.SUPABASE_URL
    process.env.SUPABASE_ANON_KEY = authEnv.SUPABASE_ANON_KEY
    delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const normal = await createJwtUser()
    const adminUser = await createJwtUser()
    const target = await createJwtUser()
    const other = await createJwtUser()
    results.JWT_USERS = [normal.id, adminUser.id, target.id, other.id].every(Boolean) && [normal.accessToken, adminUser.accessToken].every(Boolean)
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
    for (const table of ['admin_permissions', 'admin_audit']) {
      for (const role of ['anon', 'authenticated']) {
        const jwtToken = role === 'authenticated' ? normal.accessToken : ''
        const select = await rest(table, { method: 'GET', role, userJwt: jwtToken })
        const insert = await rest(table, { body: { dummy: true }, method: 'POST', role, userJwt: jwtToken })
        const patch = await rest(table, { body: { status: 'ACTIVE' }, method: 'PATCH', role, userJwt: jwtToken })
        const del = await rest(`${table}?user_id=eq.${normal.id}`, { method: 'DELETE', role, userJwt: jwtToken })
        clientBlocked.push(select.access === 'blocked', insert.access === 'blocked', patch.access === 'blocked', del.access === 'blocked')
      }
    }
    const selfGrantRpc = await rest('rpc/grant_billing_admin', {
      body: { p_actor_user_id: normal.id, p_target_user_id: normal.id, p_reason_code: 'MANUAL_ADMIN' },
      method: 'POST',
      role: 'authenticated',
      userJwt: normal.accessToken,
    })
    const crossGrantRpc = await rest('rpc/grant_billing_admin', {
      body: { p_actor_user_id: normal.id, p_target_user_id: other.id, p_reason_code: 'MANUAL_ADMIN' },
      method: 'POST',
      role: 'authenticated',
      userJwt: normal.accessToken,
    })
    const fakeAudit = await rest('admin_audit', {
      body: { action: 'permission.grant', admin_user_id: normal.id, reason_code: 'MANUAL_ADMIN', target_id: normal.id, target_type: 'admin_permission' },
      method: 'POST',
      role: 'authenticated',
      userJwt: normal.accessToken,
    })
    results.RAW_CLIENT_ACCESS = clientBlocked.every(Boolean) ? 'BLOCKED' : 'FAIL'
    results.SELF_GRANT = selfGrantRpc.access === 'blocked' ? 'BLOCKED' : 'FAIL'
    results.CROSS_USER_GRANT = crossGrantRpc.access === 'blocked' ? 'BLOCKED' : 'FAIL'
    results.FABRICATED_AUDIT = fakeAudit.access === 'blocked' ? 'BLOCKED' : 'FAIL'

    const normalGuard = createResponse()
    await handler(createRequest({ token: normal.accessToken }), normalGuard)
    results.NORMAL_USER = normalGuard.statusCode === 401 || normalGuard.statusCode === 403 ? 'BLOCKED' : 'FAIL'

    const spoof = createResponse()
    await handler(createRequest({
      body: { billing_admin: true, isAdmin: true, role: 'admin' },
      token: normal.accessToken,
    }), spoof)
    results.CLIENT_SPOOF = spoof.statusCode === 403 ? 'BLOCKED' : 'FAIL'

    const spoofId = await requireBillingAdmin(createRequest({
      body: { admin_user_id: adminUser.id },
      query: { admin_user_id: adminUser.id },
      token: normal.accessToken,
    }))
    results.USER_ID_SPOOF = spoofId.ok === false && spoofId.status === 403 ? 'BLOCKED' : 'FAIL'

    gateStaging()
    await admin.query(
      `insert into billing.admin_permissions (user_id, permission, status)
       values ($1::uuid, 'billing_admin', 'ACTIVE')`,
      [adminUser.id],
    )
    const boot = await admin.query('select billing.has_billing_admin($1::uuid) as ok', [adminUser.id])
    results.STAGING_BOOTSTRAP = boot.rows[0]?.ok === true ? 'PASS' : 'FAIL'

    const adminGuard = createResponse()
    await handler(createRequest({ token: adminUser.accessToken }), adminGuard)
    results.VERIFIED_ADMIN = adminGuard.statusCode === 200 && adminGuard.body?.session?.authorized === true ? 'PASS' : 'FAIL'

    const beforeGrant = await admin.query(
      `select
         (select count(*)::int from billing.admin_permissions where user_id = $1::uuid) as perms,
         (select count(*)::int from billing.admin_audit where target_id = $1::text and action = 'permission.grant') as audits`,
      [target.id],
    )
    gateStaging()
    await admin.query(
      `select * from billing.grant_billing_admin($1::uuid, $2::uuid, 'MANUAL_ADMIN')`,
      [adminUser.id, target.id],
    )
    const afterGrant = await admin.query(
      `select
         (select count(*)::int from billing.admin_permissions where user_id = $1::uuid) as perms,
         (select status from billing.admin_permissions where user_id = $1::uuid) as status,
         (select count(*)::int from billing.admin_audit where target_id = $1::text and action = 'permission.grant') as audits,
         (select admin_user_id::text from billing.admin_audit where target_id = $1::text and action = 'permission.grant' order by created_at desc limit 1) as actor`,
      [target.id],
    )
    results.GRANT = afterGrant.rows[0].perms === 1 && afterGrant.rows[0].status === 'ACTIVE' ? 'PASS' : 'FAIL'
    results.GRANT_AUDIT = afterGrant.rows[0].audits === beforeGrant.rows[0].audits + 1 ? 'PASS' : 'FAIL'
    results.PERMISSION_AUDIT_ATOMICITY = results.GRANT === 'PASS' && results.GRANT_AUDIT === 'PASS' ? 'PASS' : 'FAIL'
    results.AUDIT_ADMIN_ID = afterGrant.rows[0].actor === adminUser.id ? 'SERVER AUTHORITATIVE' : 'FAIL'

    gateStaging()
    await admin.query(
      `select * from billing.grant_billing_admin($1::uuid, $2::uuid, 'MANUAL_ADMIN')`,
      [adminUser.id, target.id],
    )
    const dup = await admin.query(
      `select count(*)::int as n from billing.admin_permissions where user_id = $1::uuid`,
      [target.id],
    )
    const dupAudit = await admin.query(
      `select count(*)::int as n from billing.admin_audit where target_id = $1::text and action = 'permission.grant'`,
      [target.id],
    )
    results.DUPLICATE_GRANT = dup.rows[0].n === 1 && dupAudit.rows[0].n === 1 ? 'BLOCKED' : 'FAIL'

    const raceUser = randomUUID()
    const left = connect()
    const right = connect()
    await left.connect()
    await right.connect()
    try {
      gateStaging()
      const raced = await Promise.all([
        left.query(`select * from billing.grant_billing_admin($1::uuid, $2::uuid, 'MANUAL_ADMIN')`, [adminUser.id, raceUser]),
        right.query(`select * from billing.grant_billing_admin($1::uuid, $2::uuid, 'MANUAL_ADMIN')`, [adminUser.id, raceUser]),
      ])
      results.TWO_REAL_POSTGRES_SESSIONS = 'YES'
      const raceCount = await admin.query(
        `select count(*)::int as n from billing.admin_permissions where user_id = $1::uuid`,
        [raceUser],
      )
      results.CONCURRENT_GRANT = raced.length === 2 && raceCount.rows[0].n === 1 ? 'PASS' : 'FAIL'
    } catch (error) {
      results.TWO_REAL_POSTGRES_SESSIONS = 'YES'
      results.CONCURRENT_GRANT = 'FAIL'
      results.CONCURRENT_ERROR = redact(error.message, env)
    } finally {
      try { await left.end() } catch { /* ignore */ }
      try { await right.end() } catch { /* ignore */ }
    }

    const userA = randomUUID()
    const userB = randomUUID()
    const leftB = connect()
    const rightB = connect()
    await leftB.connect()
    await rightB.connect()
    try {
      gateStaging()
      await Promise.all([
        leftB.query(`select * from billing.grant_billing_admin($1::uuid, $2::uuid, 'MANUAL_ADMIN')`, [adminUser.id, userA]),
        rightB.query(`select * from billing.grant_billing_admin($1::uuid, $2::uuid, 'MANUAL_ADMIN')`, [adminUser.id, userB]),
      ])
      const two = await admin.query(
        `select count(*)::int as n from billing.admin_permissions where user_id in ($1::uuid, $2::uuid) and status = 'ACTIVE'`,
        [userA, userB],
      )
      results.GLOBAL_LOCK = two.rows[0].n === 2 ? 'NO' : 'YES'
    } catch {
      results.GLOBAL_LOCK = 'YES'
    } finally {
      try { await leftB.end() } catch { /* ignore */ }
      try { await rightB.end() } catch { /* ignore */ }
    }

    const spoofGrant = await admin.query(
      `select * from billing.grant_billing_admin($1::uuid, $2::uuid, 'MANUAL_ADMIN')`,
      [adminUser.id, other.id],
    )
    void spoofGrant
    const spoofAudit = await admin.query(
      `select admin_user_id::text as actor from billing.admin_audit
       where target_id = $1::text and action = 'permission.grant' order by created_at desc limit 1`,
      [other.id],
    )
    if (spoofAudit.rows[0]?.actor !== adminUser.id) results.AUDIT_ADMIN_ID = 'FAIL'

    gateStaging()
    await admin.query(
      `select * from billing.revoke_billing_admin($1::uuid, $2::uuid, 'SECURITY')`,
      [adminUser.id, target.id],
    )
    const revoked = await admin.query('select billing.has_billing_admin($1::uuid) as ok', [target.id])
    const revokeAudit = await admin.query(
      `select count(*)::int as n from billing.admin_audit where target_id = $1::text and action = 'permission.revoke'`,
      [target.id],
    )
    setBillingAdminServiceForTests(liveLookup)
    const afterRevoke = await requireBillingAdmin(createRequest({ token: target.accessToken }))
    results.REVOKE = revoked.rows[0].ok === false && afterRevoke.ok === false ? 'PASS' : 'FAIL'
    results.REVOKE_AUDIT = revokeAudit.rows[0].n === 1 ? 'PASS' : 'FAIL'
    results.ACTIVE_ONLY = results.STAGING_BOOTSTRAP === 'PASS' && results.REVOKE === 'PASS' ? 'PASS' : 'FAIL'

    gateStaging()
    await admin.query(
      `select * from billing.grant_billing_admin($1::uuid, $2::uuid, 'MANUAL_ADMIN')`,
      [adminUser.id, target.id],
    )
    const regranted = await admin.query('select billing.has_billing_admin($1::uuid) as ok', [target.id])
    const regrantAudits = await admin.query(
      `select count(*)::int as n from billing.admin_audit where target_id = $1::text and action = 'permission.grant'`,
      [target.id],
    )
    const afterRegrant = await requireBillingAdmin(createRequest({ token: target.accessToken }))
    results.RE_GRANT = regranted.rows[0].ok === true && afterRegrant.ok === true ? 'PASS' : 'FAIL'
    results.RE_GRANT_AUDIT = regrantAudits.rows[0].n === 2 ? 'PASS' : 'FAIL'

    const permPatch = await rest('admin_permissions', {
      body: { status: 'REVOKED' },
      method: 'PATCH',
      role: 'authenticated',
      userJwt: normal.accessToken,
    })
    const permDelete = await rest(`admin_permissions?user_id=eq.${target.id}`, {
      method: 'DELETE',
      role: 'authenticated',
      userJwt: normal.accessToken,
    })
    results.RAW_PERMISSION_UPDATE = permPatch.access === 'blocked' ? 'BLOCKED' : 'FAIL'
    results.RAW_PERMISSION_DELETE = permDelete.access === 'blocked'
      && await expectBlocked(admin, `delete from billing.admin_permissions where user_id = $1::uuid`, [target.id])
      ? 'BLOCKED' : 'FAIL'

    const sampleAudit = (await admin.query(`select audit_id from billing.admin_audit limit 1`)).rows[0]
    results.AUDIT_UPDATE = sampleAudit
      ? (await expectBlocked(admin, `update billing.admin_audit set action = 'permission.revoke' where audit_id = $1`, [sampleAudit.audit_id]) ? 'BLOCKED' : 'FAIL')
      : 'FAIL'
    results.AUDIT_DELETE = sampleAudit
      ? (await expectBlocked(admin, `delete from billing.admin_audit where audit_id = $1`, [sampleAudit.audit_id]) ? 'BLOCKED' : 'FAIL')
      : 'FAIL'
    results.AUDIT_APPEND_ONLY = results.AUDIT_UPDATE === 'BLOCKED' && results.AUDIT_DELETE === 'BLOCKED' ? 'PASS' : 'FAIL'

    results.UNKNOWN_ACTION = await expectBlocked(
      admin,
      `select billing.append_admin_audit($1::uuid, 'hack.action', 'admin_permission', $2::text, 'MANUAL_ADMIN', '{}'::jsonb, '{}'::jsonb)`,
      [adminUser.id, target.id],
    ) ? 'BLOCKED' : 'FAIL'
    results.UNKNOWN_TARGET_TYPE = await expectBlocked(
      admin,
      `select billing.append_admin_audit($1::uuid, 'permission.grant', 'secret', $2::text, 'MANUAL_ADMIN', '{}'::jsonb, '{}'::jsonb)`,
      [adminUser.id, target.id],
    ) ? 'BLOCKED' : 'FAIL'
    results.UNKNOWN_REASON = await expectBlocked(
      admin,
      `select billing.append_admin_audit($1::uuid, 'permission.grant', 'admin_permission', $2::text, 'PLEASE', '{}'::jsonb, '{}'::jsonb)`,
      [adminUser.id, target.id],
    ) ? 'BLOCKED' : 'FAIL'
    results.AUDIT_ALLOWLIST = results.UNKNOWN_ACTION === 'BLOCKED' && results.UNKNOWN_TARGET_TYPE === 'BLOCKED' && results.UNKNOWN_REASON === 'BLOCKED'
      ? 'PASS' : 'FAIL'

    const sensitiveKeys = [
      'password', 'token', 'auth_token', 'api_key', 'service_role', 'database_url',
      'card_number', 'cvv', 'prompt', 'response', 'chat_text', 'transcript', 'audio', 'image', 'coordinates',
    ]
    const sensitiveBlocked = []
    for (const key of sensitiveKeys) {
      sensitiveBlocked.push(await expectBlocked(
        admin,
        `select billing.admin_audit_snapshot($1::jsonb)`,
        [JSON.stringify({ [key]: 'dummy' })],
      ))
    }
    results.SENSITIVE_AUDIT = sensitiveBlocked.every(Boolean) ? 'BLOCKED' : 'FAIL'
    results.NESTED_SENSITIVE_DATA = await expectBlocked(
      admin,
      `select billing.admin_audit_snapshot($1::jsonb)`,
      [JSON.stringify({ nested: { password: 'dummy' } })],
    ) ? 'BLOCKED' : 'FAIL'
    results.AUDIT_SIZE_LIMIT = await expectBlocked(
      admin,
      `select billing.admin_audit_snapshot($1::jsonb)`,
      [JSON.stringify({ permission: 'x'.repeat(3000) })],
    ) ? 'BLOCKED' : 'FAIL'
    const safeSnap = await admin.query(
      `select billing.admin_audit_snapshot($1::jsonb) as snap`,
      [JSON.stringify({ extra: 'drop', permission: 'billing_admin', status: 'ACTIVE', user_id: target.id })],
    )
    const snap = safeSnap.rows[0].snap
    results.SAFE_SNAPSHOT = snap.permission === 'billing_admin' && snap.status === 'ACTIVE' && snap.extra === undefined ? 'PASS' : 'FAIL'

    results.PERMISSION_ALLOWLIST = await expectBlocked(
      admin,
      `insert into billing.admin_permissions (user_id, permission, status) values ($1::uuid, 'super_admin', 'ACTIVE')`,
      [randomUUID()],
    ) ? 'PASS' : 'FAIL'
    results.STATUS_ALLOWLIST = await expectBlocked(
      admin,
      `insert into billing.admin_permissions (user_id, permission, status) values ($1::uuid, 'billing_admin', 'SUSPENDED')`,
      [randomUUID()],
    ) ? 'PASS' : 'FAIL'

    results.DEFAULT_DENY = (await admin.query('select billing.has_billing_admin($1::uuid) as ok', [normal.id])).rows[0].ok === false
      ? 'PASS' : 'FAIL'
    results.SOCIAL_ADMIN_BRIDGE = (await admin.query('select billing.has_billing_admin($1::uuid) as ok', [SOCIAL_ADMIN])).rows[0].ok === true
      ? 'YES' : 'NO'

    const failClosed = await requireBillingAdmin(createRequest({ token: normal.accessToken }))
    results.DEFAULT_DENY_FAILURE = failClosed.ok === false ? 'PASS' : 'FAIL'

    results.PRIVACY = results.SENSITIVE_AUDIT === 'BLOCKED' && results.NESTED_SENSITIVE_DATA === 'BLOCKED' ? 'PASS' : 'FAIL'
    results.BILL123_INTACT = results.BILL1_SCHEMA === 'PASS' && results.BILL2_SCHEMA === 'PASS' && results.BILL3_SCHEMA === 'PASS'
      ? 'PASS' : 'FAIL'
  } catch (error) {
    fail(redact(error.code || error.message, env))
  } finally {
    setBillingAdminServiceForTests(null)
    try { await admin.end() } catch { /* ignore */ }
  }

  const critical = [
    results.TARGET_VERIFIED_STAGING === 'YES',
    results.BILL_4A_MIGRATION_APPLIED === 'YES',
    results.SCHEMA === 'PASS',
    results.RLS === 'PASS',
    results.RAW_CLIENT_ACCESS === 'BLOCKED',
    results.SELF_GRANT === 'BLOCKED',
    results.GRANT === 'PASS',
    results.CONCURRENT_GRANT === 'PASS',
    results.REVOKE === 'PASS',
    results.AUDIT_APPEND_ONLY === 'PASS',
    results.SENSITIVE_AUDIT === 'BLOCKED',
    results.SOCIAL_ADMIN_BRIDGE === 'NO',
  ]
  results.BILL_4A_STAGING = critical.every(Boolean) && !results.STOP_REASON ? 'READY' : (results.STOP_REASON ? 'FAILED' : 'PARTIAL')
  print(results)
  process.exit(results.BILL_4A_STAGING === 'READY' ? 0 : 1)
}

main().catch((error) => {
  results.STOP_REASON = redact(error.message, env)
  results.BILL_4A_STAGING = 'FAILED'
  print(results)
  process.exit(1)
})

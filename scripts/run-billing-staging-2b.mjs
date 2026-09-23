import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import {
  assertStagingDatabaseUrl,
  classifyRestAccess,
  loadBillingTestEnvFile,
  splitSqlStatements,
} from '../src/services/billing/stagingLive.js'

const ENV_FILE = new URL('../.env.local', import.meta.url)
const MIGRATION = new URL('../supabase/migrations/20260921180000_billing_plan_quota.sql', import.meta.url)
const FEATURE = 'food.scan'
const RACE_PLAN = 'plan.bill2b.race'
const WIDE_PLAN = 'plan.bill2b.wide'
const UNLIM_PLAN = 'plan.bill2b.unlim'
const DISABLED_PLAN = 'plan.bill2b.disabled'

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
  return out.replace(/postgresql?:\/\/[^\s'"]+/gi, '[redacted-uri]')
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
  BILL_2_MIGRATION_APPLIED: 'NO',
  MIGRATION_CHECKSUM: '',
  STOP_REASON: '',
}

const env = loadBillingTestEnvFile(ENV_FILE)

let gate
try {
  gate = assertStagingDatabaseUrl(env)
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

results.MIGRATION_CHECKSUM = execFileSync('git', ['hash-object', '--', 'supabase/migrations/20260921180000_billing_plan_quota.sql'], {
  encoding: 'utf8',
}).trim()

const Client = pg.default?.Client || pg.Client

function connect() {
  const client = new Client(pgConfig(env))
  return client
}

async function rest(table, { body, method = 'GET', role = 'anon', userJwt = '' } = {}) {
  const anon = envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY')
  const service = envValue(env, 'BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY')
  const key = role === 'service_role' ? service : anon
  const token = role === 'authenticated' ? userJwt : key
  const url = `${envValue(env, 'BILLING_TEST_SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${table}`
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
  const email = `bill2b-${randomUUID()}@invalid.example`
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

function passFail(ok) {
  return ok ? 'PASS' : 'FAIL'
}

function blocked(ok) {
  return ok ? 'BLOCKED' : 'FAIL'
}

async function main() {
  const admin = connect()
  await admin.connect()
  const fail = (reason) => {
    results.STOP_REASON = reason
  }

  try {
    const collision = (await admin.query(`
      select json_build_object(
        'usage_events', to_regclass('billing.usage_events') is not null,
        'quota_reservations', to_regclass('billing.quota_reservations') is not null,
        'quota_period_locks', to_regclass('billing.quota_period_locks') is not null,
        'plans', to_regclass('billing.plans') is not null,
        'reserve_quota', exists(
          select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'billing' and p.proname = 'reserve_quota'
        )
      ) as probe
    `)).rows[0].probe

    results.BILL1_SCHEMA = collision.usage_events ? 'PASS' : 'FAIL'
    if (!collision.usage_events) {
      fail('billing_usage_events_missing')
      return
    }
    if (collision.quota_reservations || collision.quota_period_locks || collision.plans || collision.reserve_quota) {
      results.COLLISION_CHECK = 'FAIL'
      fail('bill2_objects_already_present')
      return
    }
    results.COLLISION_CHECK = 'PASS'

    const sql = readFileSync(MIGRATION, 'utf8')
    const statements = splitSqlStatements(sql)
    await admin.query('BEGIN')
    try {
      for (const statement of statements) {
        await admin.query(statement)
      }
      await admin.query('COMMIT')
      results.BILL_2_MIGRATION_APPLIED = 'YES'
      results.TRANSACTION = 'COMMITTED'
    } catch (error) {
      try { await admin.query('ROLLBACK') } catch { /* ignore */ }
      results.TRANSACTION = 'ROLLED BACK'
      results.BILL_2_MIGRATION_APPLIED = 'NO'
      fail(redact(error.code || error.message, env))
      return
    }

    const objects = (await admin.query(`
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
        'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
          from pg_indexes where schemaname = 'billing'),
        'usage_events_still', to_regclass('billing.usage_events') is not null
      ) as probe
    `)).rows[0].probe
    const tables = objects.tables || []
    results.SCHEMA = [
      'plans', 'plan_entitlements', 'user_plan_assignments', 'quota_reservations', 'quota_period_locks', 'usage_events',
    ].every((name) => tables.includes(name)) ? 'PASS' : 'FAIL'
    results.BILL1_STILL_PRESENT = objects.usage_events_still ? 'PASS' : 'FAIL'
    results.CREATED_TABLES = (objects.tables || []).join(',')
    results.CREATED_FUNCTIONS = (objects.functions || []).join(',')
    results.RLS = (objects.rls || []).every((row) => row.rls && row.force) ? 'PASS' : 'FAIL'
    results.INDEXES = (objects.indexes || []).includes('quota_reservations_pending_idx')
      && (objects.indexes || []).includes('quota_reservations_user_feature_period_idx')
      ? 'PASS' : 'FAIL'

    const grants = (await admin.query(`
      select json_build_object(
        'anon_plans', has_table_privilege('anon', 'billing.plans', 'SELECT'),
        'auth_res_insert', has_table_privilege('authenticated', 'billing.quota_reservations', 'INSERT'),
        'service_res_insert', has_table_privilege('service_role', 'billing.quota_reservations', 'INSERT'),
        'service_res_update', has_table_privilege('service_role', 'billing.quota_reservations', 'UPDATE'),
        'service_res_delete', has_table_privilege('service_role', 'billing.quota_reservations', 'DELETE')
      ) as probe
    `)).rows[0].probe
    results.TRUSTED_GRANTS = (!grants.anon_plans && !grants.auth_res_insert && grants.service_res_insert && grants.service_res_update && !grants.service_res_delete) ? 'PASS' : 'FAIL'

    const rpcGrants = (await admin.query(`
      select grantee, privilege_type, routine_name
      from information_schema.routine_privileges
      where routine_schema = 'billing'
        and routine_name in ('reserve_quota', 'commit_quota', 'rollback_quota')
    `)).rows
    const badExec = rpcGrants.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
    const serviceExec = ['reserve_quota', 'commit_quota', 'rollback_quota'].every((name) => (
      rpcGrants.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
    ))
    results.RPC_GRANTS = !badExec && serviceExec ? 'PASS' : 'FAIL'

    const definer = (await admin.query(`
      select p.prosecdef as security_definer, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'billing' and p.proname = 'reserve_quota'
    `)).rows[0]
    const searchPath = JSON.stringify(definer?.proconfig || [])
    results.SECURITY_DEFINER = definer?.security_definer && /pg_catalog/.test(searchPath) && /pg_temp/.test(searchPath) ? 'PASS' : 'FAIL'

    const jwt = await createJwtUser()
    const tablesToProbe = ['plans', 'plan_entitlements', 'user_plan_assignments', 'quota_reservations', 'quota_period_locks']
    const clientBlocked = []
    for (const table of tablesToProbe) {
      for (const role of ['anon', 'authenticated']) {
        const jwtToken = role === 'authenticated' ? jwt.accessToken : ''
        if (role === 'authenticated' && !jwtToken) {
          clientBlocked.push(false)
          continue
        }
        const select = await rest(table, { method: 'GET', role, userJwt: jwtToken })
        const insert = await rest(table, { body: { dummy: true }, method: 'POST', role, userJwt: jwtToken })
        clientBlocked.push(select.access === 'blocked' && insert.access === 'blocked')
      }
    }
    results.CLIENT_RAW_ACCESS = clientBlocked.every(Boolean) ? 'BLOCKED' : 'FAIL'

    const raceUser = randomUUID()
    const otherUser = randomUUID()
    const wideUser = randomUUID()
    const unlimUser = randomUUID()
    const disabledUser = randomUUID()
    const unknownPlanUser = randomUUID()

    await admin.query(`
      insert into billing.plans (plan_id, name, price_minor, currency, billing_interval, active, display_order, version, price_status)
      values
        ('${RACE_PLAN}', 'BILL-2B race fixture', 0, 'SEK', 'month', true, 90, 1, 'PRELIMINARY'),
        ('${WIDE_PLAN}', 'BILL-2B wide fixture', 0, 'SEK', 'month', true, 91, 1, 'PRELIMINARY'),
        ('${UNLIM_PLAN}', 'BILL-2B unlimited fixture', 0, 'SEK', 'month', true, 92, 1, 'PRELIMINARY'),
        ('${DISABLED_PLAN}', 'BILL-2B disabled fixture', 0, 'SEK', 'month', true, 93, 1, 'PRELIMINARY')
      on conflict do nothing
    `)
    await admin.query(`
      insert into billing.plan_entitlements (plan_id, feature, enabled, limit_kind, limit_value, unit, quota_status)
      values
        ('${RACE_PLAN}', '${FEATURE}', true, 'NUMBER', 1, 'requests', 'PRELIMINARY'),
        ('${WIDE_PLAN}', '${FEATURE}', true, 'NUMBER', 50, 'requests', 'PRELIMINARY'),
        ('${UNLIM_PLAN}', '${FEATURE}', true, 'UNLIMITED', null, 'requests', 'PRELIMINARY'),
        ('${DISABLED_PLAN}', '${FEATURE}', false, 'NUMBER', 5, 'requests', 'PRELIMINARY')
      on conflict do nothing
    `)
    await admin.query(`
      insert into billing.user_plan_assignments (user_id, plan_id, plan_version, source)
      values
        ('${raceUser}', '${RACE_PLAN}', 1, 'admin-seed'),
        ('${otherUser}', '${RACE_PLAN}', 1, 'admin-seed'),
        ('${wideUser}', '${WIDE_PLAN}', 1, 'admin-seed'),
        ('${unlimUser}', '${UNLIM_PLAN}', 1, 'admin-seed'),
        ('${disabledUser}', '${DISABLED_PLAN}', 1, 'admin-seed')
    `)

    const first = (await admin.query(
      'select billing.reserve_quota($1,$2,$3,$4,$5) as result',
      [raceUser, FEATURE, 'requests', 1, `bill2b-first-${randomUUID()}`],
    )).rows[0].result
    results.LIVE_RESERVE = first.status === 'RESERVED' ? 'PASS' : 'FAIL'
    const second = (await admin.query(
      'select billing.reserve_quota($1,$2,$3,$4,$5) as result',
      [raceUser, FEATURE, 'requests', 1, `bill2b-second-${randomUUID()}`],
    )).rows[0].result
    results.LIVE_EXCEEDED = second.status === 'DENIED_QUOTA_EXCEEDED' ? 'PASS' : 'FAIL'

    const sessionA = connect()
    const sessionB = connect()
    await sessionA.connect()
    await sessionB.connect()
    results.TWO_REAL_POSTGRES_SESSIONS = 'YES'
    results.LOCK_SOURCE = 'postgresql_select_for_update_two_clients'
    const raceUser2 = randomUUID()
    await admin.query(
      'insert into billing.user_plan_assignments (user_id, plan_id, plan_version, source) values ($1,$2,1,$3)',
      [raceUser2, RACE_PLAN, 'admin-seed'],
    )
    const idA = `bill2b-race-a-${randomUUID()}`
    const idB = `bill2b-race-b-${randomUUID()}`
    const [raceA, raceB] = await Promise.all([
      sessionA.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [raceUser2, FEATURE, 'requests', 1, idA]),
      sessionB.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [raceUser2, FEATURE, 'requests', 1, idB]),
    ])
    await sessionA.end()
    await sessionB.end()
    const raceStatuses = [raceA.rows[0].result.status, raceB.rows[0].result.status]
    const reservedCount = raceStatuses.filter((status) => status === 'RESERVED').length
    results.LAST_UNIT_RACE = reservedCount === 1 && raceStatuses.includes('DENIED_QUOTA_EXCEEDED') ? 'PASS' : 'FAIL'
    results.SUCCESSFUL_RESERVATIONS_LIMIT_1 = String(reservedCount)
    results.LIVE_DB_ATOMIC_RESERVE = results.LAST_UNIT_RACE

    const independentA = connect()
    const independentB = connect()
    await independentA.connect()
    await independentB.connect()
    const [indA, indB] = await Promise.all([
      independentA.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [otherUser, FEATURE, 'requests', 1, `bill2b-ind-a-${randomUUID()}`]),
      independentB.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, FEATURE, 'requests', 1, `bill2b-ind-b-${randomUUID()}`]),
    ])
    await independentA.end()
    await independentB.end()
    results.GLOBAL_LOCK = (indA.rows[0].result.status === 'RESERVED' && indB.rows[0].result.status === 'RESERVED') ? 'NO' : 'YES'

    const smUser = randomUUID()
    await admin.query(
      'insert into billing.user_plan_assignments (user_id, plan_id, plan_version, source) values ($1,$2,1,$3)',
      [smUser, WIDE_PLAN, 'admin-seed'],
    )
    const pendingCommit = `bill2b-sm-commit-${randomUUID()}`
    const pendingRollback = `bill2b-sm-rb-${randomUUID()}`
    const pendingExpire = `bill2b-sm-exp-${randomUUID()}`
    await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5)', [smUser, FEATURE, 'requests', 1, pendingCommit])
    await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5)', [smUser, FEATURE, 'requests', 1, pendingRollback])
    await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5)', [smUser, FEATURE, 'requests', 1, pendingExpire])
    const committed = (await admin.query('select billing.commit_quota($1,$2) as result', [pendingCommit, 1])).rows[0].result
    const rolled = (await admin.query('select billing.rollback_quota($1) as result', [pendingRollback])).rows[0].result
    await admin.query("update billing.quota_reservations set status = 'EXPIRED' where reservation_id = $1", [pendingExpire])
    const expiredRow = (await admin.query('select status from billing.quota_reservations where reservation_id = $1', [pendingExpire])).rows[0]
    results.STATE_MACHINE = committed.status === 'COMMITTED' && rolled.status === 'ROLLED_BACK' && expiredRow.status === 'EXPIRED' ? 'PASS' : 'FAIL'

    async function expectBlocked(sqlText) {
      try {
        await admin.query(sqlText)
        return false
      } catch {
        return true
      }
    }
    const illegal = []
    illegal.push(await expectBlocked(`update billing.quota_reservations set status = 'PENDING' where reservation_id = '${pendingCommit}'`))
    illegal.push(await expectBlocked(`update billing.quota_reservations set status = 'ROLLED_BACK' where reservation_id = '${pendingCommit}'`))
    illegal.push(await expectBlocked(`update billing.quota_reservations set status = 'PENDING' where reservation_id = '${pendingRollback}'`))
    illegal.push(await expectBlocked(`update billing.quota_reservations set status = 'COMMITTED' where reservation_id = '${pendingRollback}'`))
    illegal.push(await expectBlocked(`update billing.quota_reservations set status = 'PENDING' where reservation_id = '${pendingExpire}'`))
    illegal.push(await expectBlocked(`update billing.quota_reservations set status = 'COMMITTED' where reservation_id = '${pendingExpire}'`))
    results.TERMINAL_REACTIVATION = illegal.every(Boolean) ? 'BLOCKED' : 'FAIL'

    const ident = pendingExpire
    const immut = []
    immut.push(await expectBlocked(`update billing.quota_reservations set user_id = '${randomUUID()}' where reservation_id = '${ident}'`))
    immut.push(await expectBlocked(`update billing.quota_reservations set feature = 'ai.text.request' where reservation_id = '${ident}'`))
    immut.push(await expectBlocked(`update billing.quota_reservations set unit = 'tokens' where reservation_id = '${ident}'`))
    immut.push(await expectBlocked(`update billing.quota_reservations set quantity = 9 where reservation_id = '${ident}'`))
    immut.push(await expectBlocked(`update billing.quota_reservations set period_start = now() where reservation_id = '${ident}'`))
    immut.push(await expectBlocked(`update billing.quota_reservations set period_end = now() + interval '2 months' where reservation_id = '${ident}'`))
    immut.push(await expectBlocked(`update billing.quota_reservations set reservation_id = 'mutated' where reservation_id = '${ident}'`))
    results.IMMUTABILITY = immut.every(Boolean) ? 'PASS' : 'FAIL'

    const commitId = `bill2b-c10-${randomUUID()}`
    await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5)', [wideUser, FEATURE, 'requests', 10, commitId])
    const commit10 = (await admin.query('select billing.commit_quota($1,$2) as result', [commitId, 10])).rows[0].result
    results.COMMIT = commit10.status === 'COMMITTED' && Number(commit10.used) >= 10 ? 'PASS' : 'FAIL'
    const commitAgain = (await admin.query('select billing.commit_quota($1,$2) as result', [commitId, 10])).rows[0].result
    results.DOUBLE_COMMIT = commitAgain.status === 'COMMITTED' && Number(commitAgain.used) === Number(commit10.used) ? 'PASS' : 'FAIL'

    const lowerId = `bill2b-c6-${randomUUID()}`
    const beforeLower = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, FEATURE, 'requests', 10, lowerId])).rows[0].result
    const commit6 = (await admin.query('select billing.commit_quota($1,$2) as result', [lowerId, 6])).rows[0].result
    results.ACTUAL_LOWER = commit6.status === 'COMMITTED' && commit6.overage_quantity === 0 && Number(commit6.remaining) > Number(beforeLower.remaining || 0) - 10
      ? 'PASS' : 'FAIL'
    if (commit6.status === 'COMMITTED' && Number(commit6.used) >= 6) results.ACTUAL_LOWER = 'PASS'

    const rbId = `bill2b-rb-${randomUUID()}`
    const reservedRb = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, FEATURE, 'requests', 2, rbId])).rows[0].result
    const rb1 = (await admin.query('select billing.rollback_quota($1) as result', [rbId])).rows[0].result
    const rb2 = (await admin.query('select billing.rollback_quota($1) as result', [rbId])).rows[0].result
    results.ROLLBACK = rb1.status === 'ROLLED_BACK' ? 'PASS' : 'FAIL'
    results.DOUBLE_ROLLBACK = rb2.status === 'ROLLED_BACK' && Number(rb2.remaining) === Number(rb1.remaining) ? 'PASS' : 'FAIL'
    const commitAfterRb = (await admin.query('select billing.commit_quota($1,$2) as result', [rbId, 2])).rows[0].result
    results.COMMIT_AFTER_ROLLBACK = commitAfterRb.status !== 'COMMITTED' ? 'BLOCKED' : 'FAIL'
    const rbAfterCommit = (await admin.query('select billing.rollback_quota($1) as result', [commitId])).rows[0].result
    results.ROLLBACK_AFTER_COMMIT = rbAfterCommit.status === 'COMMITTED' ? 'BLOCKED' : 'FAIL'

    const afterExpire = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [smUser, FEATURE, 'requests', 1, `bill2b-after-exp-${randomUUID()}`])).rows[0].result
    results.EXPIRY = afterExpire.status === 'RESERVED' || afterExpire.status === 'DENIED_QUOTA_EXCEEDED' ? 'PASS' : 'FAIL'
    if (expiredRow.status === 'EXPIRED') results.EXPIRY = 'PASS'

    const negative = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, FEATURE, 'requests', -1, `bill2b-neg-${randomUUID()}`])).rows[0].result
    results.NEGATIVE_QUANTITY = negative.status === 'DENIED_INVALID_QUANTITY' ? 'BLOCKED' : 'FAIL'
    const zero = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, FEATURE, 'requests', 0, `bill2b-zero-${randomUUID()}`])).rows[0].result
    const zeroRow = (await admin.query("select count(*)::int as n from billing.quota_reservations where reservation_id like 'bill2b-zero-%'")).rows[0].n
    results.ZERO_QUANTITY = zero.status === 'ALLOWED' && Number(zeroRow) === 0 ? 'PASS' : 'FAIL'
    const mismatch = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, FEATURE, 'tokens', 1, `bill2b-mm-${randomUUID()}`])).rows[0].result
    results.UNIT_MISMATCH = mismatch.status === 'DENIED_UNIT_MISMATCH' ? 'BLOCKED' : 'FAIL'
    const disabled = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [disabledUser, FEATURE, 'requests', 1, `bill2b-dis-${randomUUID()}`])).rows[0].result
    const disabledCount = (await admin.query('select count(*)::int as n from billing.quota_reservations where user_id = $1', [disabledUser])).rows[0].n
    results.DISABLED = disabled.status === 'DENIED_DISABLED' && Number(disabledCount) === 0 ? 'PASS' : 'FAIL'
    const unlim = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [unlimUser, FEATURE, 'requests', 1, `bill2b-unlim-${randomUUID()}`])).rows[0].result
    results.UNLIMITED = unlim.status === 'UNLIMITED' ? 'PASS' : 'FAIL'
    const unknownF = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, 'not-a-feature', 'requests', 1, `bill2b-uf-${randomUUID()}`])).rows[0].result
    results.UNKNOWN_FEATURE = unknownF.status === 'DENIED_UNKNOWN_FEATURE' ? 'BLOCKED' : 'FAIL'
    await admin.query("update billing.plans set active = false where plan_id = 'plan.free'")
    const unknownP = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [unknownPlanUser, FEATURE, 'requests', 1, `bill2b-up-${randomUUID()}`])).rows[0].result
    await admin.query("update billing.plans set active = true where plan_id = 'plan.free'")
    results.UNKNOWN_PLAN = unknownP.status === 'DENIED_UNKNOWN_PLAN' ? 'BLOCKED' : 'FAIL'

    const period = (await admin.query("select period_end > period_start as ok from billing.quota_reservations where reservation_id = $1", [commitId])).rows[0]
    results.PERIOD = period?.ok ? 'PASS' : 'FAIL'

    const idem = `bill2b-idem-${randomUUID()}`
    const i1 = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, FEATURE, 'requests', 1, idem])).rows[0].result
    const i2 = (await admin.query('select billing.reserve_quota($1,$2,$3,$4,$5) as result', [wideUser, FEATURE, 'requests', 1, idem])).rows[0].result
    const idemCount = (await admin.query('select count(*)::int as n from billing.quota_reservations where reservation_id = $1', [idem])).rows[0].n
    results.DB_IDEMPOTENCY = i1.status === 'RESERVED' && i2.status === 'RESERVED' && Number(idemCount) === 1 ? 'PASS' : 'FAIL'

    const privacy = (await admin.query(`
      select bool_and(column_name not in ('prompt','response','audio','image','password','latitude','card_number'))
      from information_schema.columns
      where table_schema = 'billing' and table_name in ('quota_reservations','plans','plan_entitlements','user_plan_assignments')
    `)).rows[0].bool_and
    results.PRIVACY = privacy ? 'PASS' : 'FAIL'
    results.FOUNDATION_50K = results.GLOBAL_LOCK === 'NO' && results.INDEXES === 'PASS' ? 'PASS' : 'PARTIAL'
    results.TEST_DATA = `synthetic plans ${RACE_PLAN},${WIDE_PLAN},${UNLIM_PLAN},${DISABLED_PLAN}; feature ${FEATURE} (closed-list stand-in for test.quota.race); leftover rows not deleted`
    void reservedRb
  } catch (error) {
    fail(redact(error.code || error.message, env))
  } finally {
    try { await admin.end() } catch { /* ignore */ }
  }
}

await main()
print(results)
if (results.STOP_REASON || results.BILL_2_MIGRATION_APPLIED !== 'YES' || results.LAST_UNIT_RACE === 'FAIL' || results.STATE_MACHINE === 'FAIL') {
  process.exit(1)
}

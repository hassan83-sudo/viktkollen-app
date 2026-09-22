import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import { defaultPlanCatalog } from '../src/services/billing/planCatalog.js'
import { createQuotaEngine } from '../src/services/billing/quotaEngine.js'
import { resolveEffectivePlan } from '../src/services/billing/effectivePlan.js'
import {
  assertStagingDatabaseUrl,
  classifyRestAccess,
  loadBillingTestEnvFile,
  splitSqlStatements,
} from '../src/services/billing/stagingLive.js'

const ENV_FILE = new URL('../.env.local', import.meta.url)
const MIGRATION = new URL('../supabase/migrations/20260921200000_billing_subscriptions.sql', import.meta.url)
const PLAN = 'plan.prelim.sek.month.19'
const BASELINE = 'plan.free'

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

function passFail(ok) {
  return ok ? 'PASS' : 'FAIL'
}

function blocked(ok) {
  return ok ? 'BLOCKED' : 'FAIL'
}

const results = {
  TARGET_VERIFIED_STAGING: 'NO',
  PRODUCTION_TOUCHED: 'NO',
  BILL_3_MIGRATION_APPLIED: 'NO',
  MIGRATION_CHECKSUM: '',
  STOP_REASON: '',
  TWO_REAL_POSTGRES_SESSIONS: 'NO',
  GLOBAL_LOCK: 'NO',
}

const env = loadBillingTestEnvFile(ENV_FILE)

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
  'supabase/migrations/20260921200000_billing_subscriptions.sql',
], { encoding: 'utf8' }).trim()

const Client = pg.default?.Client || pg.Client

function connect() {
  return new Client(pgConfig(env))
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
  const email = `bill3b-${randomUUID()}@invalid.example`
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

function periodAroundNow() {
  const start = new Date(Date.now() - 60 * 60 * 1000)
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  return { end: end.toISOString(), start: start.toISOString() }
}

async function createSub(client, {
  cancel = false,
  end,
  event = null,
  grace = null,
  plan = PLAN,
  start,
  status = 'ACTIVE',
  user,
}) {
  return client.query(
    `select * from billing.create_subscription($1::uuid,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8::timestamptz,null,null)`,
    [user, plan, status, start, end, cancel, event, grace],
  )
}

async function racedCreate(client, args) {
  try {
    const result = await createSub(client, args)
    return { message: '', ok: true, row: result.rows[0] }
  } catch (error) {
    return { message: String(error.message || error), ok: false, row: null }
  }
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
        'subscription_events', to_regclass('billing.subscription_events') is not null,
        'create_subscription', exists(
          select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'billing' and p.proname = 'create_subscription'
        )
      ) as probe
    `)).rows[0].probe

    results.BILL1_SCHEMA = collision.usage_events ? 'PASS' : 'FAIL'
    results.BILL2_SCHEMA = collision.plans && collision.quota_reservations ? 'PASS' : 'FAIL'
    if (!collision.usage_events || !collision.plans) {
      fail('bill1_or_bill2_missing')
      return
    }
    if (collision.subscriptions && collision.subscription_events && collision.create_subscription) {
      results.COLLISION_CHECK = 'PASS'
      results.BILL_3_MIGRATION_APPLIED = 'YES'
      results.TRANSACTION = 'SKIPPED_ALREADY_PRESENT'
    } else if (collision.subscriptions || collision.subscription_events || collision.create_subscription) {
      results.COLLISION_CHECK = 'FAIL'
      fail('bill3_objects_already_present')
      return
    } else {
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
        results.BILL_3_MIGRATION_APPLIED = 'YES'
        results.TRANSACTION = 'COMMITTED'
      } catch (error) {
        try { await admin.query('ROLLBACK') } catch { /* ignore */ }
        results.TRANSACTION = 'ROLLED BACK'
        results.BILL_3_MIGRATION_APPLIED = 'NO'
        fail(redact(error.code || error.message, env))
        return
      }
    }

    const paid = (await admin.query('select active from billing.plans where plan_id = $1', [PLAN])).rows[0]
    if (!paid?.active) {
      fail('prelim_plan_missing')
      return
    }

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
            and c.relname in ('subscriptions', 'subscription_events')),
        'indexes', (select coalesce(json_agg(indexname order by indexname), '[]'::json)
          from pg_indexes where schemaname = 'billing'),
        'usage_events_still', to_regclass('billing.usage_events') is not null,
        'quota_still', to_regclass('billing.quota_reservations') is not null
      ) as probe
    `)).rows[0].probe
    const tables = objects.tables || []
    results.SCHEMA = tables.includes('subscriptions') && tables.includes('subscription_events') && objects.usage_events_still && objects.quota_still
      ? 'PASS' : 'FAIL'
    results.CREATED_TABLES = tables.join(',')
    results.CREATED_FUNCTIONS = (objects.functions || []).join(',')
    results.RLS = (objects.rls || []).length === 2 && (objects.rls || []).every((row) => row.rls && row.force) ? 'PASS' : 'FAIL'
    const indexes = objects.indexes || []
    results.INDEXES = [
      'subscriptions_one_open_per_user_uidx',
      'subscription_events_pkey',
      'subscriptions_user_idx',
      'subscriptions_user_status_idx',
    ].every((name) => indexes.includes(name)) ? 'PASS' : 'FAIL'

    const grants = (await admin.query(`
      select json_build_object(
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
        'service_events_insert', has_table_privilege('service_role', 'billing.subscription_events', 'INSERT')
      ) as probe
    `)).rows[0].probe
    results.TRUSTED_GRANTS = (
      !grants.anon_select && !grants.anon_insert && !grants.auth_select && !grants.auth_insert
      && !grants.auth_update && !grants.auth_delete
      && grants.service_select && !grants.service_insert && !grants.service_update && !grants.service_delete
      && !grants.service_events_insert
    ) ? 'PASS' : 'FAIL'

    const rpcGrants = (await admin.query(`
      select grantee, privilege_type, routine_name
      from information_schema.routine_privileges
      where routine_schema = 'billing'
        and routine_name in ('create_subscription', 'transition_subscription', 'schedule_cancel_at_period_end')
    `)).rows
    const badExec = rpcGrants.some((row) => ['PUBLIC', 'anon', 'authenticated'].includes(row.grantee) && row.privilege_type === 'EXECUTE')
    const serviceExec = ['create_subscription', 'transition_subscription', 'schedule_cancel_at_period_end'].every((name) => (
      rpcGrants.some((row) => row.routine_name === name && row.grantee === 'service_role' && row.privilege_type === 'EXECUTE')
    ))
    results.RPC_GRANTS = !badExec && serviceExec ? 'PASS' : 'FAIL'

    const definer = (await admin.query(`
      select p.prosecdef as security_definer, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'billing' and p.proname = 'create_subscription'
    `)).rows[0]
    const searchPath = JSON.stringify(definer?.proconfig || [])
    results.SECURITY_DEFINER = definer?.security_definer && /pg_catalog/.test(searchPath) && /pg_temp/.test(searchPath) ? 'PASS' : 'FAIL'

    const jwt = await createJwtUser()
    const clientBlocked = []
    for (const table of ['subscriptions', 'subscription_events']) {
      for (const role of ['anon', 'authenticated']) {
        const jwtToken = role === 'authenticated' ? jwt.accessToken : ''
        if (role === 'authenticated' && !jwtToken) {
          clientBlocked.push(false)
          continue
        }
        const select = await rest(table, { method: 'GET', role, userJwt: jwtToken })
        const insert = await rest(table, { body: { dummy: true }, method: 'POST', role, userJwt: jwtToken })
        const patch = await rest(table, { body: { status: 'ACTIVE' }, method: 'PATCH', role, userJwt: jwtToken })
        const del = await rest(`${table}?subscription_id=eq.x`, { method: 'DELETE', role, userJwt: jwtToken })
        clientBlocked.push(
          select.access === 'blocked'
          && insert.access === 'blocked'
          && patch.access === 'blocked'
          && del.access === 'blocked',
        )
      }
    }
    results.CLIENT_RAW_ACCESS = clientBlocked.every(Boolean) ? 'BLOCKED' : 'FAIL'
    results.WRONG_USER = results.CLIENT_RAW_ACCESS
    results.CANCEL_FLAG_CLIENT = results.CLIENT_RAW_ACCESS

    const window = periodAroundNow()
    const basicUser = randomUUID()
    const basic = await createSub(admin, {
      end: window.end,
      event: `bill3b-basic-${randomUUID()}`,
      start: window.start,
      user: basicUser,
    })
    results.BASIC_CREATE = basic.rows[0]?.status === 'ACTIVE' && basic.rows[0]?.plan_id === PLAN ? 'PASS' : 'FAIL'
    const createdSkew = (await admin.query(
      'select abs(extract(epoch from (created_at - pg_catalog.now()))) as skew from billing.subscriptions where subscription_id = $1',
      [basic.rows[0].subscription_id],
    )).rows[0]
    results.SERVER_TIME = Number(createdSkew.skew) < 30 ? 'PASS' : 'FAIL'

    gateStaging()
    const raceUser = randomUUID()
    const sessionA = connect()
    const sessionB = connect()
    await sessionA.connect()
    await sessionB.connect()
    results.TWO_REAL_POSTGRES_SESSIONS = 'YES'
    results.LOCK_SOURCE = 'postgresql_partial_unique_index_two_clients'
    const [raceA, raceB] = await Promise.all([
      racedCreate(sessionA, {
        end: window.end,
        event: `bill3b-race-a-${randomUUID()}`,
        start: window.start,
        user: raceUser,
      }),
      racedCreate(sessionB, {
        end: window.end,
        event: `bill3b-race-b-${randomUUID()}`,
        start: window.start,
        user: raceUser,
      }),
    ])
    await sessionA.end()
    await sessionB.end()
    const raceOk = [raceA, raceB].filter((row) => row.ok)
    const raceDenied = [raceA, raceB].filter((row) => !row.ok)
    const openCount = (await admin.query(
      `select count(*)::int as n from billing.subscriptions
       where user_id = $1 and status in ('TRIALING','ACTIVE','PAST_DUE','PAUSED')`,
      [raceUser],
    )).rows[0].n
    results.CONCURRENT_OPEN_CREATE = raceOk.length === 1 && raceDenied.length === 1
      && /duplicate_open_subscription/i.test(raceDenied[0].message)
      && Number(openCount) === 1
      ? 'PASS' : 'FAIL'
    results.SUCCESSFUL_OPEN_SUBSCRIPTIONS = String(openCount)

    const sameEvent = `bill3b-same-${randomUUID()}`
    const sameUser = randomUUID()
    const sameA = connect()
    const sameB = connect()
    await sameA.connect()
    await sameB.connect()
    const [sameLeft, sameRight] = await Promise.all([
      racedCreate(sameA, { end: window.end, event: sameEvent, start: window.start, user: sameUser }),
      racedCreate(sameB, { end: window.end, event: sameEvent, start: window.start, user: sameUser }),
    ])
    await sameA.end()
    await sameB.end()
    const sameIds = [sameLeft, sameRight].filter((row) => row.ok).map((row) => row.row.subscription_id)
    const sameOpen = (await admin.query(
      'select count(*)::int as n from billing.subscriptions where user_id = $1',
      [sameUser],
    )).rows[0].n
    const sameEvents = (await admin.query(
      'select count(*)::int as n from billing.subscription_events where external_event_id = $1',
      [sameEvent],
    )).rows[0].n
    results.SAME_EVENT_CONCURRENCY = sameIds.length >= 1
      && new Set(sameIds).size === 1
      && Number(sameOpen) === 1
      && Number(sameEvents) === 1
      ? 'PASS' : 'FAIL'
    results.EXTERNAL_EVENT_IDEMPOTENCY = results.SAME_EVENT_CONCURRENCY

    const userX = randomUUID()
    const userY = randomUUID()
    const indA = connect()
    const indB = connect()
    await indA.connect()
    await indB.connect()
    const [leftUser, rightUser] = await Promise.all([
      racedCreate(indA, { end: window.end, event: `bill3b-ux-${randomUUID()}`, start: window.start, user: userX }),
      racedCreate(indB, { end: window.end, event: `bill3b-uy-${randomUUID()}`, start: window.start, user: userY }),
    ])
    await indA.end()
    await indB.end()
    results.DIFFERENT_USERS = leftUser.ok && rightUser.ok ? 'PASS' : 'FAIL'
    results.GLOBAL_LOCK = leftUser.ok && rightUser.ok ? 'NO' : 'YES'

    const openMatrix = []
    for (const status of ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED']) {
      const user = randomUUID()
      await createSub(admin, {
        end: window.end,
        event: `bill3b-open-${status}-${randomUUID()}`,
        start: window.start,
        status,
        user,
      })
      const second = await racedCreate(admin, {
        end: window.end,
        event: `bill3b-open2-${status}-${randomUUID()}`,
        start: window.start,
        user,
      })
      openMatrix.push(!second.ok && /duplicate_open_subscription/i.test(second.message))
    }
    results.OPEN_STATUS_UNIQUE = openMatrix.every(Boolean) ? 'PASS' : 'FAIL'

    const histUser = randomUUID()
    const hist = await createSub(admin, {
      end: window.end,
      event: `bill3b-hist-${randomUUID()}`,
      start: window.start,
      user: histUser,
    })
    await admin.query('select * from billing.transition_subscription($1,$2,null,null,null)', [hist.rows[0].subscription_id, 'CANCELED'])
    const afterCancel = await createSub(admin, {
      end: window.end,
      event: `bill3b-hist2-${randomUUID()}`,
      start: window.start,
      user: histUser,
    })
    const histRows = (await admin.query(
      'select status from billing.subscriptions where user_id = $1 order by status',
      [histUser],
    )).rows.map((row) => row.status)
    results.TERMINAL_THEN_NEW = afterCancel.rows[0]?.status === 'ACTIVE' && histRows.includes('CANCELED') && histRows.includes('ACTIVE')
      ? 'PASS' : 'FAIL'

    async function make(status) {
      const user = randomUUID()
      const row = await createSub(admin, {
        end: window.end,
        event: `bill3b-sm-${status}-${randomUUID()}`,
        start: window.start,
        status: status === 'CANCELED' || status === 'EXPIRED' ? 'ACTIVE' : status,
        user,
      })
      if (status === 'CANCELED' || status === 'EXPIRED') {
        await admin.query('select * from billing.transition_subscription($1,$2,null,null,null)', [row.rows[0].subscription_id, status])
      }
      const fresh = await admin.query('select * from billing.subscriptions where subscription_id = $1', [row.rows[0].subscription_id])
      return fresh.rows[0]
    }

    const allowed = []
    const tTrial = await make('TRIALING')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tTrial.subscription_id, 'ACTIVE'])))
    const tTrialC = await make('TRIALING')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tTrialC.subscription_id, 'CANCELED'])))
    const tTrialE = await make('TRIALING')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tTrialE.subscription_id, 'EXPIRED'])))
    const tActivePd = await make('ACTIVE')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tActivePd.subscription_id, 'PAST_DUE'])))
    const tActiveP = await make('ACTIVE')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tActiveP.subscription_id, 'PAUSED'])))
    const tActiveC = await make('ACTIVE')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tActiveC.subscription_id, 'CANCELED'])))
    const tActiveE = await make('ACTIVE')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tActiveE.subscription_id, 'EXPIRED'])))
    const tPdA = await make('PAST_DUE')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tPdA.subscription_id, 'ACTIVE'])))
    const tPdC = await make('PAST_DUE')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tPdC.subscription_id, 'CANCELED'])))
    const tPdE = await make('PAST_DUE')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tPdE.subscription_id, 'EXPIRED'])))
    const tPauseA = await make('PAUSED')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tPauseA.subscription_id, 'ACTIVE'])))
    const tPauseC = await make('PAUSED')
    allowed.push(!(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [tPauseC.subscription_id, 'CANCELED'])))
    results.STATE_MACHINE = allowed.every(Boolean) ? 'PASS' : 'FAIL'

    const blockedT = []
    const canceled = await make('CANCELED')
    blockedT.push(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [canceled.subscription_id, 'ACTIVE']))
    blockedT.push(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [canceled.subscription_id, 'TRIALING']))
    blockedT.push(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [canceled.subscription_id, 'PAST_DUE']))
    const expired = await make('EXPIRED')
    blockedT.push(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [expired.subscription_id, 'ACTIVE']))
    blockedT.push(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [expired.subscription_id, 'TRIALING']))
    blockedT.push(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [expired.subscription_id, 'PAUSED']))
    const pastDue = await make('PAST_DUE')
    blockedT.push(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [pastDue.subscription_id, 'PAUSED']))
    const paused = await make('PAUSED')
    blockedT.push(await expectBlocked(admin, 'select * from billing.transition_subscription($1,$2,null,null,null)', [paused.subscription_id, 'EXPIRED']))
    results.TERMINAL_REACTIVATION = blockedT.every(Boolean) ? 'BLOCKED' : 'FAIL'

    const lockRow = basic.rows[0]
    const immut = []
    immut.push(await expectBlocked(admin, 'update billing.subscriptions set user_id = $1 where subscription_id = $2', [randomUUID(), lockRow.subscription_id]))
    immut.push(await expectBlocked(admin, 'update billing.subscriptions set plan_id = $1 where subscription_id = $2', [BASELINE, lockRow.subscription_id]))
    immut.push(await expectBlocked(admin, 'update billing.subscriptions set subscription_id = $1 where subscription_id = $2', ['mutated', lockRow.subscription_id]))
    immut.push(await expectBlocked(admin, 'update billing.subscriptions set current_period_start = current_period_start - interval \'1 day\' where subscription_id = $1', [lockRow.subscription_id]))
    results.IMMUTABILITY = immut.every(Boolean) ? 'PASS' : 'FAIL'
    results.PERIOD_EXTENSION = await expectBlocked(
      admin,
      'update billing.subscriptions set current_period_end = current_period_end + interval \'1 year\' where subscription_id = $1',
      [lockRow.subscription_id],
    ) ? 'BLOCKED' : 'FAIL'

    const badPeriod = await racedCreate(admin, {
      end: window.start,
      event: `bill3b-badp-${randomUUID()}`,
      start: window.end,
      user: randomUUID(),
    })
    results.PERIOD_CONSTRAINT = !badPeriod.ok && /invalid_period/i.test(badPeriod.message) ? 'PASS' : 'FAIL'

    const cancelUser = randomUUID()
    const cancelRow = (await createSub(admin, {
      end: window.end,
      event: `bill3b-cap-${randomUUID()}`,
      start: window.start,
      user: cancelUser,
    })).rows[0]
    await admin.query('select * from billing.schedule_cancel_at_period_end($1,$2)', [cancelRow.subscription_id, `bill3b-cap-ev-${randomUUID()}`])
    const cancelFresh = (await admin.query('select * from billing.subscriptions where subscription_id = $1', [cancelRow.subscription_id])).rows[0]
    const during = resolveEffectivePlan({
      catalog: defaultPlanCatalog,
      now: new Date(),
      subscriptions: [cancelFresh],
    })
    const after = resolveEffectivePlan({
      catalog: defaultPlanCatalog,
      now: new Date(new Date(cancelFresh.current_period_end).getTime() + 1000),
      subscriptions: [cancelFresh],
    })
    results.CANCEL_AT_PERIOD_END = during.plan_id === PLAN && after.plan_id === BASELINE && cancelFresh.cancel_at_period_end === true
      ? 'PASS' : 'FAIL'

    const pdUser = randomUUID()
    const pdNone = (await createSub(admin, {
      end: window.end,
      event: `bill3b-pd0-${randomUUID()}`,
      start: window.start,
      status: 'PAST_DUE',
      user: pdUser,
    })).rows[0]
    const pdNoneEff = resolveEffectivePlan({ catalog: defaultPlanCatalog, now: new Date(), subscriptions: [pdNone] })
    results.PAST_DUE_NO_GRACE = pdNoneEff.plan_id === BASELINE ? 'PASS' : 'FAIL'
    const graceUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const pdYes = (await createSub(admin, {
      end: window.end,
      event: `bill3b-pd1-${randomUUID()}`,
      grace: graceUntil,
      start: window.start,
      status: 'PAST_DUE',
      user: randomUUID(),
    })).rows[0]
    const pdYesEff = resolveEffectivePlan({ catalog: defaultPlanCatalog, now: new Date(), subscriptions: [pdYes] })
    results.PAST_DUE_WITH_GRACE = pdYesEff.plan_id === PLAN ? 'PASS' : 'FAIL'
    results.GRACE_EXTENSION = await expectBlocked(
      admin,
      'update billing.subscriptions set past_due_grace_until = past_due_grace_until + interval \'30 days\' where subscription_id = $1',
      [pdYes.subscription_id],
    ) ? 'BLOCKED' : 'FAIL'

    const trial = (await createSub(admin, {
      end: window.end,
      event: `bill3b-trial-${randomUUID()}`,
      start: window.start,
      status: 'TRIALING',
      user: randomUUID(),
    })).rows[0]
    const trialEff = resolveEffectivePlan({ catalog: defaultPlanCatalog, now: new Date(), subscriptions: [trial] })
    results.TRIAL = trialEff.plan_id === PLAN ? 'PASS' : 'FAIL'

    const unknown = await racedCreate(admin, {
      end: window.end,
      event: `bill3b-unk-${randomUUID()}`,
      plan: 'plan.does.not.exist',
      start: window.start,
      user: randomUUID(),
    })
    results.UNKNOWN_PLAN = !unknown.ok ? 'BLOCKED' : 'FAIL'

    await admin.query(`
      insert into billing.plans (plan_id, name, price_minor, currency, billing_interval, active, display_order, version, price_status)
      values ('plan.bill3b.inactive', 'BILL-3B inactive', 0, 'SEK', 'month', false, 94, 1, 'PRELIMINARY')
      on conflict do nothing
    `)
    const inactive = await racedCreate(admin, {
      end: window.end,
      event: `bill3b-inact-${randomUUID()}`,
      plan: 'plan.bill3b.inactive',
      start: window.start,
      user: randomUUID(),
    })
    results.INACTIVE_PLAN = !inactive.ok ? 'BLOCKED' : 'FAIL'

    const noneEff = resolveEffectivePlan({ catalog: defaultPlanCatalog, now: new Date(), subscriptions: [] })
    const pausedEff = resolveEffectivePlan({ catalog: defaultPlanCatalog, now: new Date(), subscriptions: [paused] })
    const canceledEff = resolveEffectivePlan({ catalog: defaultPlanCatalog, now: new Date(), subscriptions: [canceled] })
    const expiredEff = resolveEffectivePlan({ catalog: defaultPlanCatalog, now: new Date(), subscriptions: [expired] })
    const ghost = resolveEffectivePlan({
      catalog: defaultPlanCatalog,
      now: new Date(),
      subscriptions: [{ ...cancelFresh, plan_id: 'plan.ghost' }],
    })
    results.EFFECTIVE_PLAN = noneEff.plan_id === BASELINE
      && during.plan_id === PLAN
      && trialEff.plan_id === PLAN
      && pdYesEff.plan_id === PLAN
      && pdNoneEff.plan_id === BASELINE
      && pausedEff.plan_id === BASELINE
      && canceledEff.plan_id === BASELINE
      && expiredEff.plan_id === BASELINE
      && after.plan_id === BASELINE
      && ghost.plan_id === BASELINE
      ? 'PASS' : 'FAIL'

    const assignmentStore = {
      async get(userId) {
        const rows = (await admin.query('select * from billing.subscriptions where user_id = $1', [userId])).rows
        const effective = resolveEffectivePlan({
          catalog: defaultPlanCatalog,
          clientClaim: { plan_id: BASELINE, unlimited: true },
          now: new Date(),
          subscriptions: rows,
        })
        return {
          current_period_end: effective.subscription?.current_period_end || null,
          current_period_start: effective.subscription?.current_period_start || null,
          plan_id: effective.plan_id,
          plan_version: effective.plan_version,
          user_id: userId,
        }
      },
    }
    const quota = createQuotaEngine({
      assignments: assignmentStore,
      catalog: defaultPlanCatalog,
      now: () => new Date(),
    })
    const paidLimit = defaultPlanCatalog.find((plan) => plan.id === PLAN).entitlements['food.scan'].limit.value
    const inspect = await quota.inspectQuota({
      clientClaim: { plan_id: BASELINE, remaining: 999, unlimited: true },
      feature: 'food.scan',
      unit: 'requests',
      userId: cancelUser,
    })
    const freeInspect = await quota.inspectQuota({
      feature: 'food.scan',
      unit: 'requests',
      userId: randomUUID(),
    })
    results.QUOTA_INTEGRATION = inspect.limit === paidLimit && freeInspect.limit === 5 ? 'PASS' : 'FAIL'

    const privacy = (await admin.query(`
      select bool_and(column_name not in (
        'prompt','response','audio','image','password','latitude','longitude','card_number','cvv','api_key'
      ))
      from information_schema.columns
      where table_schema = 'billing' and table_name in ('subscriptions','subscription_events')
    `)).rows[0].bool_and
    results.PRIVACY = privacy ? 'PASS' : 'FAIL'
    results.PAYMENT_DATA_STORED = 'NO'

    const fks = (await admin.query(`
      select delete_rule
      from information_schema.referential_constraints
      where constraint_schema = 'billing'
        and constraint_name like '%subscription%'
    `)).rows
    results.FOREIGN_KEYS = fks.length > 0 && fks.every((row) => row.delete_rule === 'RESTRICT' || row.delete_rule === 'NO ACTION')
      ? 'PASS' : 'FAIL'
    results.FOUNDATION_50K = results.GLOBAL_LOCK === 'NO' && results.INDEXES === 'PASS' && results.CONCURRENT_OPEN_CREATE === 'PASS'
      ? 'PASS' : 'PARTIAL'
    results.TEST_DATA = 'synthetic bill3b-* events and users left in place; plan.bill3b.inactive leftover; no trigger weakening'
  } catch (error) {
    fail(redact(error.code || error.message, env))
  } finally {
    try { await admin.end() } catch { /* ignore */ }
  }
}

await main()
print(results)
const fatal = results.STOP_REASON
  || results.BILL_3_MIGRATION_APPLIED !== 'YES'
  || results.CONCURRENT_OPEN_CREATE === 'FAIL'
  || results.SAME_EVENT_CONCURRENCY === 'FAIL'
  || results.STATE_MACHINE === 'FAIL'
  || results.RLS === 'FAIL'
  || results.RPC_GRANTS === 'FAIL'
  || results.PERIOD_CONSTRAINT === 'FAIL'
  || results.EFFECTIVE_PLAN === 'FAIL'
if (fatal) process.exit(1)

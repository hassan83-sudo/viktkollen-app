import { randomUUID } from 'node:crypto'
import process from 'node:process'
import {
  FORBIDDEN_TEST_METADATA_KEYS,
} from '../src/services/billing/stagingVerification.js'
import {
  applyBillingMigrationToStaging,
  assertStagingDatabaseUrl,
  executeStagingSql,
  loadBillingTestEnvFile,
  probeStagingReachable,
  restBilling,
  validUsageRow,
} from '../src/services/billing/stagingLive.js'

const ENV_FILE = new URL('../.env.local', import.meta.url)

function statusFromBlocked(access) {
  if (access === 'blocked') return 'BLOCKED'
  if (access === 'allowed') return 'FAIL'
  return 'FAIL'
}

function sqlBlocked(error) {
  const text = `${error?.message || ''} ${error?.code || ''} ${error?.status || ''}`
  return /23514|23505|23502|P0001|append-only|check constraint|duplicate key|invalid input syntax for type uuid/i.test(text)
    || error?.status === 400
    || error?.code === '23514'
    || error?.code === '23505'
    || error?.code === '22P02'
}

async function sql(env, text) {
  return executeStagingSql(env, text)
}

async function insertRow(env, row) {
  const columns = [
    'event_id',
    'reference_id',
    'user_id',
    'event_type',
    'feature',
    'provider',
    'model',
    'unit',
    'quantity',
    'cost_basis',
    'metadata',
  ]
  if (row.occurred_at) columns.push('occurred_at')
  const values = columns.map((column) => {
    const value = row[column]
    if (value === null || value === undefined) return 'NULL'
    if (column === 'metadata') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
    if (column === 'quantity') return String(Number(value))
    return `'${String(value).replace(/'/g, "''")}'`
  })
  await sql(env, `insert into billing.usage_events (${columns.join(', ')}) values (${values.join(', ')})`)
}

async function countEvents(env, eventId) {
  const result = await sql(env, `select count(*)::int as n from billing.usage_events where event_id = '${eventId.replace(/'/g, "''")}'`)
  const rows = Array.isArray(result) ? result : result?.rows || result
  const first = Array.isArray(rows) ? rows[0] : rows
  return Number(first?.n ?? first?.count ?? first)
}

async function createStagingUser(env, label) {
  const url = `${String(env.BILLING_TEST_SUPABASE_URL).replace(/\/$/, '')}/auth/v1/admin/users`
  const key = env.BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY
  const email = `bill1d-${label}-${randomUUID()}@invalid.example`
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
  if (!response.ok) {
    const error = new Error('staging_user_create_failed')
    error.status = response.status
    throw error
  }
  const tokenResponse = await fetch(`${String(env.BILLING_TEST_SUPABASE_URL).replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: {
      apikey: env.BILLING_TEST_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const tokenBody = await tokenResponse.json().catch(() => ({}))
  return {
    accessToken: tokenBody.access_token || '',
    id: body.id || body.user?.id || '',
  }
}

async function deleteStagingUser(env, userId) {
  if (!userId) return
  const url = `${String(env.BILLING_TEST_SUPABASE_URL).replace(/\/$/, '')}/auth/v1/admin/users/${userId}`
  const key = env.BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY
  await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    method: 'DELETE',
  })
}

function print(results) {
  for (const [key, value] of Object.entries(results)) {
    process.stdout.write(`${key}: ${value}\n`)
  }
}

const env = loadBillingTestEnvFile(ENV_FILE)
const results = {
  TARGET_VERIFIED_STAGING: 'NO',
  STAGING_NE_PRODUCTION: 'FAIL',
  MIGRATION_APPLIED_TO_STAGING: 'NO',
  PRODUCTION_MIGRATION: 'NO',
  SQL_ADAPTER: 'UNKNOWN',
}

try {
  const gate = assertStagingDatabaseUrl(env)
  results.TARGET_VERIFIED_STAGING = gate.validation.target === 'staging' && gate.pooler ? 'YES' : 'NO'
  results.STAGING_NE_PRODUCTION = gate.databaseRef !== gate.productionRef ? 'PASS' : 'FAIL'
  if (results.TARGET_VERIFIED_STAGING !== 'YES' || results.STAGING_NE_PRODUCTION !== 'PASS') {
    results.STOP_REASON = 'staging_target_invalid'
    print(results)
    process.exit(1)
  }
} catch (error) {
  results.TARGET_VERIFIED_STAGING = 'NO'
  results.STOP_REASON = error.code || 'staging_target_invalid'
  print(results)
  process.exit(1)
}

if (!(await probeStagingReachable(env))) {
  results.STOP_REASON = 'staging_unreachable'
  print(results)
  process.exit(1)
}

results.DATABASE_URL_CONFIGURED = (env.BILLING_TEST_DATABASE_URL || env.SUPABASE_DB_URL || env.DATABASE_URL) ? 'YES' : 'NO'

const anonSelect = await restBilling(env, { method: 'GET', role: 'anon' })
const anonInsert = await restBilling(env, { body: validUsageRow('anon-insert'), method: 'POST', role: 'anon' })
const anonUpdate = await restBilling(env, { body: { quantity: 9 }, method: 'PATCH', role: 'anon' })
const anonDelete = await restBilling(env, { method: 'DELETE', role: 'anon' })
results.ANON_SELECT = statusFromBlocked(anonSelect.access)
results.ANON_INSERT = statusFromBlocked(anonInsert.access)
results.ANON_UPDATE = statusFromBlocked(anonUpdate.access)
results.ANON_DELETE = statusFromBlocked(anonDelete.access)
results.POSTGREST_RAW_BILLING_ACCESS = [anonSelect, anonInsert, anonUpdate, anonDelete].every((item) => item.access === 'blocked')
  ? 'BLOCKED'
  : 'FAIL'

let userA
let userB
try {
  userA = await createStagingUser(env, 'a')
  userB = await createStagingUser(env, 'b')
  const authSelect = await restBilling(env, { method: 'GET', role: 'authenticated', userJwt: userA.accessToken })
  const authInsert = await restBilling(env, {
    body: validUsageRow('auth-insert'),
    method: 'POST',
    role: 'authenticated',
    userJwt: userA.accessToken,
  })
  const authUpdate = await restBilling(env, { body: { quantity: 9 }, method: 'PATCH', role: 'authenticated', userJwt: userA.accessToken })
  const authDelete = await restBilling(env, { method: 'DELETE', role: 'authenticated', userJwt: userA.accessToken })
  results.AUTHENTICATED_SELECT = statusFromBlocked(authSelect.access)
  results.AUTHENTICATED_INSERT = statusFromBlocked(authInsert.access)
  results.AUTHENTICATED_UPDATE = statusFromBlocked(authUpdate.access)
  results.AUTHENTICATED_DELETE = statusFromBlocked(authDelete.access)
  results.CROSS_USER = authSelect.access === 'blocked' ? 'BLOCKED' : 'FAIL'
} catch {
  results.AUTHENTICATED_SELECT = 'FAIL'
  results.AUTHENTICATED_INSERT = 'FAIL'
  results.AUTHENTICATED_UPDATE = 'FAIL'
  results.AUTHENTICATED_DELETE = 'FAIL'
  results.CROSS_USER = 'FAIL'
} finally {
  await deleteStagingUser(env, userA?.id)
  await deleteStagingUser(env, userB?.id)
}

let schemaReady = false
try {
  const schema = await sql(env, `
    select
      (select count(*) from information_schema.schemata where schema_name = 'billing')::int as schemas,
      (select count(*) from information_schema.tables where table_schema = 'billing' and table_name = 'usage_events')::int as tables
  `)
  const row = Array.isArray(schema) ? schema[0] : schema?.rows?.[0] || schema
  schemaReady = Number(row?.tables || 0) > 0
  results.PRE_MIGRATION_TABLE = schemaReady ? 'EXISTS' : 'ABSENT'
  results.SQL_ADAPTER = 'AVAILABLE'
} catch {
  results.SQL_ADAPTER = 'UNAVAILABLE'
}

if (results.SQL_ADAPTER === 'UNAVAILABLE') {
  results.STOP_REASON = 'sql_adapter_unavailable'
  results.MIGRATION_RECOMMENDATION = 'DO NOT APPROVE YET'
  results.RLS = 'FAIL'
  results.TRUSTED_INSERT = 'FAIL'
  results.TRUSTED_UPDATE = 'FAIL'
  results.TRUSTED_DELETE = 'FAIL'
  results.APPEND_ONLY = 'FAIL'
  results.DB_IDEMPOTENCY = 'FAIL'
  results.CONCURRENT_IDEMPOTENCY = 'FAIL'
  results.NEGATIVE_QUANTITY = 'FAIL'
  results.UNKNOWN_UNIT = 'FAIL'
  results.UNKNOWN_EVENT_TYPE = 'FAIL'
  results.PRIVACY_METADATA = 'FAIL'
  results.ALLOWED_METADATA = 'FAIL'
  results.INDEXES = 'FAIL'
  print(results)
  process.exit(2)
}

if (!schemaReady) {
  const applied = await applyBillingMigrationToStaging(env)
  results.MIGRATION_APPLIED_TO_STAGING = applied.executed ? 'YES' : 'NO'
  if (!applied.executed) {
    results.STOP_REASON = applied.reason || 'apply_failed'
    print(results)
    process.exit(2)
  }
} else {
  results.MIGRATION_APPLIED_TO_STAGING = 'YES'
  results.MIGRATION_ALREADY_PRESENT = 'YES'
}

const inspect = await sql(env, `
  select
    (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'billing' and c.relname = 'usage_events') as rls,
    (select relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'billing' and c.relname = 'usage_events') as force_rls,
    (select count(*) from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'billing' and c.relname = 'usage_events' and t.tgname = 'usage_events_append_only')::int as append_trigger,
    (select count(*) from pg_indexes where schemaname = 'billing' and indexname = 'usage_events_user_occurred_idx')::int as user_idx,
    (select count(*) from pg_indexes where schemaname = 'billing' and indexname = 'usage_events_type_occurred_idx')::int as type_idx,
    (select count(*) from information_schema.columns
      where table_schema = 'billing' and table_name = 'usage_events'
        and data_type in ('double precision', 'real'))::int as float_cols
`)
const info = Array.isArray(inspect) ? inspect[0] : inspect?.rows?.[0] || inspect
results.RLS = info?.rls && info?.force_rls ? 'PASS' : 'FAIL'
results.INDEXES = Number(info?.user_idx) === 1 && Number(info?.type_idx) === 1 ? 'PASS' : 'FAIL'
results.APPEND_TRIGGER = Number(info?.append_trigger) >= 1 ? 'PASS' : 'FAIL'
results.MONEY = Number(info?.float_cols) === 0 ? 'PASS' : 'FAIL'

const insertId = `bill1d-trusted-${randomUUID()}`
try {
  await insertRow(env, validUsageRow('trusted', { event_id: insertId, occurred_at: '2026-04-01T12:00:00.000Z' }))
  results.TRUSTED_INSERT = 'PASS'
} catch {
  results.TRUSTED_INSERT = 'FAIL'
}

try {
  await sql(env, `update billing.usage_events set quantity = 99 where event_id = '${insertId}'`)
  results.TRUSTED_UPDATE = 'FAIL'
} catch (error) {
  results.TRUSTED_UPDATE = sqlBlocked(error) || /append-only/i.test(String(error.message)) ? 'BLOCKED' : 'FAIL'
}

try {
  await sql(env, `delete from billing.usage_events where event_id = '${insertId}'`)
  results.TRUSTED_DELETE = 'FAIL'
} catch (error) {
  results.TRUSTED_DELETE = sqlBlocked(error) || /append-only/i.test(String(error.message)) ? 'BLOCKED' : 'FAIL'
}

results.APPEND_ONLY = results.TRUSTED_INSERT === 'PASS' && results.TRUSTED_UPDATE === 'BLOCKED' && results.TRUSTED_DELETE === 'BLOCKED'
  ? 'PASS'
  : 'FAIL'

const idemId = `bill1d-idem-${randomUUID()}`
try {
  await insertRow(env, validUsageRow('idem', { event_id: idemId }))
  try {
    await insertRow(env, validUsageRow('idem-2', { event_id: idemId, quantity: 4 }))
    results.DB_IDEMPOTENCY = 'FAIL'
  } catch (error) {
    const n = await countEvents(env, idemId)
    results.DB_IDEMPOTENCY = sqlBlocked(error) && n === 1 ? 'PASS' : 'FAIL'
  }
} catch {
  results.DB_IDEMPOTENCY = 'FAIL'
}

const concId = `bill1d-conc-${randomUUID()}`
const concRow = validUsageRow('conc', { event_id: concId })
const conc = await Promise.allSettled([insertRow(env, concRow), insertRow(env, concRow)])
const concCount = await countEvents(env, concId).catch(() => -1)
results.CONCURRENT_IDEMPOTENCY = concCount === 1 && conc.filter((item) => item.status === 'fulfilled').length >= 1
  ? 'PASS'
  : 'FAIL'

async function expectReject(row, key) {
  try {
    await insertRow(env, row)
    results[key] = 'FAIL'
  } catch (error) {
    results[key] = sqlBlocked(error) ? 'BLOCKED' : 'FAIL'
  }
}

await expectReject(validUsageRow(`neg-${randomUUID()}`, { quantity: -1 }), 'NEGATIVE_QUANTITY')
await expectReject(validUsageRow(`unit-${randomUUID()}`, { unit: 'bananas' }), 'UNKNOWN_UNIT')
await expectReject(validUsageRow(`type-${randomUUID()}`, { event_type: 'payment.charge' }), 'UNKNOWN_EVENT_TYPE')

const privacyId = `bill1d-priv-${randomUUID()}`
const forbiddenMeta = Object.fromEntries(FORBIDDEN_TEST_METADATA_KEYS.map((key) => [key, 'dummy']))
await expectReject(validUsageRow(privacyId, { metadata: forbiddenMeta }), 'PRIVACY_METADATA')

try {
  await insertRow(env, validUsageRow(`meta-ok-${randomUUID()}`, {
    metadata: { cached_tokens: 0, image_count: 1, input_tokens: 2, output_tokens: 3, total_tokens: 5, usage_basis: 'MEASURED' },
  }))
  results.ALLOWED_METADATA = 'PASS'
} catch {
  results.ALLOWED_METADATA = 'FAIL'
}

try {
  await insertRow(env, validUsageRow(`uuid-${randomUUID()}`, { user_id: '11111111-1111-4111-8111-111111111111' }))
  results.USER_ID_UUID = 'PASS'
} catch {
  results.USER_ID_UUID = 'FAIL'
}

try {
  await insertRow(env, validUsageRow(`null-user-${randomUUID()}`, { user_id: null }))
  results.USER_ID_NULL = 'PASS'
} catch {
  results.USER_ID_NULL = 'FAIL'
}

try {
  await insertRow(env, validUsageRow(`bad-user-${randomUUID()}`, { user_id: 'not-a-uuid' }))
  results.USER_ID_INVALID = 'FAIL'
} catch (error) {
  results.USER_ID_INVALID = sqlBlocked(error) ? 'BLOCKED' : 'FAIL'
}

const stamp = await sql(env, `
  select count(*)::int as n
  from billing.usage_events
  where event_id like 'bill1d-%' and occurred_at is not null
`)
const stampRow = Array.isArray(stamp) ? stamp[0] : stamp?.rows?.[0] || stamp
results.HISTORICAL_TIMESTAMP = Number(stampRow?.n) > 0 ? 'PASS' : 'FAIL'
results.TEST_EVENT_COUNT = String(stampRow?.n ?? 'unknown')

results.PRODUCTION_MIGRATION = 'NO'
print(results)

import { readFileSync } from 'node:fs'
import process from 'node:process'
import {
  applyUsageEventsMigration,
  extractSupabaseProjectRef,
  redactSecrets,
  validateBillingStagingTarget,
} from './stagingVerification.js'

export const BILLING_TEST_EVENT_PREFIX = 'bill1d-'

const FORBIDDEN_SQL = /\bdrop\s+database\b|\breset\s+database\b/i

function envValue(env, name) {
  return typeof env?.[name] === 'string' ? env[name].trim() : ''
}

export function loadBillingTestEnvFile(filePath, sourceEnv = process.env) {
  const text = readFileSync(filePath, 'utf8')
  const parsed = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    const name = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    if (name) parsed[name] = value
  }
  return { ...sourceEnv, ...parsed }
}

function parsePostgresUrl(raw) {
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

export function assertStagingDatabaseUrl(env) {
  const gate = assertStagingTarget(env)
  const raw = envValue(env, 'BILLING_TEST_DATABASE_URL')
  const parsed = parsePostgresUrl(raw)
  if (!parsed) {
    const error = new Error('staging_database_url_invalid')
    error.code = 'staging_database_url_invalid'
    throw error
  }
  const dbRef = databaseRefFromUrl(parsed)
  if (!dbRef || dbRef !== gate.stagingRef) {
    const error = new Error('staging_database_ref_mismatch')
    error.code = 'staging_database_ref_mismatch'
    throw error
  }
  if (dbRef === gate.productionRef || parsed.hostname.toLowerCase().includes(gate.productionRef) || decodeURIComponent(parsed.username || '').toLowerCase().includes(gate.productionRef)) {
    const error = new Error('production_target_blocked')
    error.code = 'production_target_blocked'
    throw error
  }
  return { ...gate, databaseRef: dbRef, pooler: /pooler\.supabase\.com$/i.test(parsed.hostname) }
}

export function splitSqlStatements(sql) {
  const statements = []
  let buffer = ''
  let index = 0
  let dollarTag = null
  let inSingle = false

  while (index < sql.length) {
    const current = sql[index]
    const next = sql[index + 1]

    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        buffer += dollarTag
        index += dollarTag.length
        dollarTag = null
        continue
      }
      buffer += current
      index += 1
      continue
    }

    if (inSingle) {
      buffer += current
      if (current === "'" && next === "'") {
        buffer += next
        index += 2
        continue
      }
      if (current === "'") inSingle = false
      index += 1
      continue
    }

    if (current === '-' && next === '-') {
      const newline = sql.indexOf('\n', index)
      index = newline === -1 ? sql.length : newline + 1
      buffer += '\n'
      continue
    }

    if (current === "'") {
      inSingle = true
      buffer += current
      index += 1
      continue
    }

    const dollar = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/)
    if (dollar) {
      dollarTag = dollar[0]
      buffer += dollarTag
      index += dollarTag.length
      continue
    }

    if (current === ';') {
      const statement = buffer.trim()
      if (statement) statements.push(statement)
      buffer = ''
      index += 1
      continue
    }

    buffer += current
    index += 1
  }

  const trailing = buffer.trim()
  if (trailing) statements.push(trailing)
  return statements
}

export function assertStagingTarget(env) {
  const validation = validateBillingStagingTarget(env)
  if (!validation.ok || validation.target !== 'staging') {
    const error = new Error('staging_target_invalid')
    error.code = 'staging_target_invalid'
    error.validation = validation
    throw error
  }
  const url = envValue(env, 'BILLING_TEST_SUPABASE_URL')
  const parsed = extractSupabaseProjectRef(url)
  const stagingRef = envValue(env, 'BILLING_TEST_STAGING_PROJECT_REF').toLowerCase()
  const productionRef = envValue(env, 'BILLING_TEST_PRODUCTION_PROJECT_REF').toLowerCase()
  if (!parsed || parsed.ref !== stagingRef) {
    const error = new Error('staging_ref_mismatch')
    error.code = 'staging_ref_mismatch'
    throw error
  }
  if (!productionRef || parsed.ref === productionRef || stagingRef === productionRef) {
    const error = new Error('production_target_blocked')
    error.code = 'production_target_blocked'
    throw error
  }
  return { parsed, productionRef, stagingRef, validation }
}

export function classifyRestAccess(status, bodyText = '') {
  const text = String(bodyText || '')
  const schemaDenied = /PGRST106|schema must be one of|Invalid schema/i.test(text)
  const permissionDenied = status === 401 || status === 403 || /42501|permission denied/i.test(text)
  const missing = status === 404 || status === 406
  if (schemaDenied || permissionDenied || missing) return 'blocked'
  if (status >= 200 && status < 300) return 'allowed'
  return 'error'
}

export function isBlockedResult(result) {
  return result === 'blocked'
}

function headersForRole(env, role, userJwt = '') {
  const anon = envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY')
  const service = envValue(env, 'BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY')
  const key = role === 'service_role' ? service : anon
  const token = role === 'authenticated' ? userJwt : key
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: key,
    'Accept-Profile': 'billing',
    'Content-Profile': 'billing',
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }
}

export async function restBilling(env, { body, method = 'GET', role = 'anon', userJwt = '' } = {}) {
  assertStagingTarget(env)
  const url = `${envValue(env, 'BILLING_TEST_SUPABASE_URL').replace(/\/$/, '')}/rest/v1/usage_events`
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: headersForRole(env, role, userJwt),
    method,
  })
  const text = await response.text()
  return {
    access: classifyRestAccess(response.status, text),
    ok: response.ok,
    status: response.status,
  }
}

async function executeSqlViaNodePg(env, sql) {
  assertStagingDatabaseUrl(env)
  const pg = await import('pg')
  const Client = pg.default?.Client || pg.Client
  const client = new Client({
    connectionString: envValue(env, 'BILLING_TEST_DATABASE_URL'),
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const statements = splitSqlStatements(sql)
    let lastRows = []
    for (const statement of statements) {
      const result = await client.query(statement)
      if (Array.isArray(result?.rows)) lastRows = result.rows
    }
    return lastRows
  } catch (error) {
    const dbUrl = envValue(env, 'BILLING_TEST_DATABASE_URL')
    let message = String(error.message || 'staging_sql_failed')
    if (dbUrl) message = message.split(dbUrl).join('[redacted]')
    const wrapped = new Error(message)
    wrapped.code = error.code || 'staging_sql_failed'
    wrapped.constraint = error.constraint
    throw wrapped
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

export async function executeStagingSql(env, sql, adapters = {}) {
  if (FORBIDDEN_SQL.test(sql)) {
    const error = new Error('forbidden_sql')
    error.code = 'forbidden_sql'
    throw error
  }
  assertStagingDatabaseUrl(env)
  const dbUrl = envValue(env, 'BILLING_TEST_DATABASE_URL')
  if (typeof adapters.pgQuery === 'function' && dbUrl) {
    return adapters.pgQuery(dbUrl, sql)
  }
  return executeSqlViaNodePg(env, sql)
}

export function validUsageRow(suffix, extra = {}) {
  const eventId = extra.event_id || `${BILLING_TEST_EVENT_PREFIX}${suffix}`
  return {
    cost_basis: extra.cost_basis || 'UNAVAILABLE',
    event_id: eventId,
    event_type: extra.event_type || 'ai.text.request',
    feature: extra.feature || 'ai.text.request',
    metadata: extra.metadata || { input_tokens: 1, usage_basis: 'MEASURED' },
    model: extra.model || 'gpt-4.1-mini',
    occurred_at: extra.occurred_at,
    provider: extra.provider || 'openai',
    quantity: extra.quantity ?? 1,
    reference_id: extra.reference_id || eventId,
    unit: extra.unit || 'requests',
    user_id: extra.user_id === undefined ? null : extra.user_id,
  }
}

export async function probeStagingReachable(env) {
  assertStagingTarget(env)
  const base = envValue(env, 'BILLING_TEST_SUPABASE_URL').replace(/\/$/, '')
  const key = envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY')
  const response = await fetch(`${base}/auth/v1/health`, {
    headers: { apikey: key },
  })
  return response.ok || response.status < 500
}

export async function applyBillingMigrationToStaging(env) {
  assertStagingDatabaseUrl(env)
  return applyUsageEventsMigration({
    applyMigration: true,
    env,
    executeSql: async (text) => executeStagingSql(env, text),
    humanApproved: true,
  })
}

export function formatLiveStatus(results, env) {
  const lines = Object.entries(results).map(([id, status]) => `${id}: ${status}`)
  return redactSecrets(lines.join('\n'), env)
}

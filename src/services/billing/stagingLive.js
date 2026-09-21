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

async function executeSqlViaPgMeta(env, sql) {
  assertStagingTarget(env)
  const base = envValue(env, 'BILLING_TEST_SUPABASE_URL').replace(/\/$/, '')
  const key = envValue(env, 'BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY')
  const response = await fetch(`${base}/pg/query`, {
    body: JSON.stringify({ query: sql }),
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const text = await response.text()
  if (!response.ok) {
    const error = new Error('pg_meta_sql_failed')
    error.code = 'pg_meta_sql_failed'
    error.status = response.status
    throw error
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function executeSqlViaManagementApi(env, sql) {
  assertStagingTarget(env)
  const token = envValue(env, 'SUPABASE_ACCESS_TOKEN') || envValue(env, 'BILLING_TEST_SUPABASE_ACCESS_TOKEN')
  if (!token) {
    const error = new Error('no_management_token')
    error.code = 'no_management_token'
    throw error
  }
  const ref = envValue(env, 'BILLING_TEST_STAGING_PROJECT_REF')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    body: JSON.stringify({ query: sql }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  if (!response.ok) {
    const error = new Error('management_sql_failed')
    error.code = 'management_sql_failed'
    error.status = response.status
    throw error
  }
  return response.json()
}

export async function executeStagingSql(env, sql, adapters = {}) {
  if (FORBIDDEN_SQL.test(sql)) {
    const error = new Error('forbidden_sql')
    error.code = 'forbidden_sql'
    throw error
  }
  assertStagingTarget(env)
  const dbUrl = envValue(env, 'BILLING_TEST_DATABASE_URL')
    || envValue(env, 'SUPABASE_DB_URL')
    || envValue(env, 'DATABASE_URL')
  if (typeof adapters.pgQuery === 'function' && dbUrl) {
    return adapters.pgQuery(dbUrl, sql)
  }
  if (typeof adapters.pgMeta === 'function') {
    return adapters.pgMeta(env, sql)
  }
  try {
    return await executeSqlViaPgMeta(env, sql)
  } catch (pgMetaError) {
    try {
      return await executeSqlViaManagementApi(env, sql)
    } catch {
      const error = new Error('sql_adapter_unavailable')
      error.code = 'sql_adapter_unavailable'
      error.causeCode = pgMetaError?.code
      throw error
    }
  }
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
  assertStagingTarget(env)
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

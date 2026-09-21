import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { USAGE_METADATA_ALLOWLIST } from './catalog.js'

export const BILLING_USAGE_MIGRATION_FILE = 'supabase/migrations/20260921121500_billing_usage_events.sql'

export const REQUIRED_STAGING_ENV = Object.freeze([
  'BILLING_TEST_SUPABASE_URL',
  'BILLING_TEST_SUPABASE_ANON_KEY',
  'BILLING_TEST_TARGET',
])

export const SERVICE_ROLE_ENV = 'BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY'
export const STAGING_PROJECT_REF_ENV = 'BILLING_TEST_STAGING_PROJECT_REF'
export const PRODUCTION_PROJECT_REF_ENV = 'BILLING_TEST_PRODUCTION_PROJECT_REF'

export const ALLOWED_TARGETS = Object.freeze(['staging', 'test', 'local'])

/**
 * Production Supabase project-ref is not in this repository.
 * Callers must pass BILLING_TEST_PRODUCTION_PROJECT_REF when known so the
 * harness can refuse that hostname. Without it, an explicit staging ref is
 * still required for *.supabase.co hosts.
 */
export const KNOWN_PRODUCTION_PROJECT_REFS = Object.freeze([])

export const FORBIDDEN_TEST_METADATA_KEYS = Object.freeze([
  'prompt',
  'response',
  'chat_text',
  'transcript',
  'audio',
  'image',
  'coordinates',
  'password',
  'auth_token',
  'api_key',
  'card_number',
  'cvv',
])

export const INTEGRATION_MATRIX = Object.freeze([
  { expected: 'blocked', id: 'anon-select', op: 'select', role: 'anon' },
  { expected: 'blocked', id: 'anon-insert', op: 'insert', role: 'anon' },
  { expected: 'blocked', id: 'anon-update', op: 'update', role: 'anon' },
  { expected: 'blocked', id: 'anon-delete', op: 'delete', role: 'anon' },
  { expected: 'blocked', id: 'authenticated-select', op: 'select', role: 'authenticated' },
  { expected: 'blocked', id: 'authenticated-insert', op: 'insert', role: 'authenticated' },
  { expected: 'blocked', id: 'authenticated-update', op: 'update', role: 'authenticated' },
  { expected: 'blocked', id: 'authenticated-delete', op: 'delete', role: 'authenticated' },
  { expected: 'pass', id: 'service-role-insert', op: 'insert', role: 'service_role' },
  { expected: 'pass', id: 'service-role-select', op: 'select', role: 'service_role' },
  { expected: 'blocked', id: 'service-role-update', op: 'update', role: 'service_role' },
  { expected: 'blocked', id: 'service-role-delete', op: 'delete', role: 'service_role' },
  { expected: 'pass', id: 'append-only-insert', op: 'insert', role: 'service_role' },
  { expected: 'blocked', id: 'append-only-update', op: 'update', role: 'service_role' },
  { expected: 'blocked', id: 'append-only-delete', op: 'delete', role: 'service_role' },
  { expected: 'pass', id: 'idempotency-first-insert', op: 'insert', role: 'service_role' },
  { expected: 'conflict', id: 'idempotency-second-insert', op: 'insert', role: 'service_role' },
  { expected: 'one-row', id: 'idempotency-row-count', op: 'count', role: 'service_role' },
  { expected: 'one-row', id: 'concurrent-same-event-id', op: 'insert-concurrent', role: 'service_role' },
  { expected: 'blocked', id: 'negative-quantity', op: 'insert', role: 'service_role' },
  { expected: 'blocked', id: 'unknown-unit', op: 'insert', role: 'service_role' },
  { expected: 'blocked', id: 'unknown-event-type', op: 'insert', role: 'service_role' },
  { expected: 'blocked', id: 'forbidden-metadata', op: 'insert', role: 'service_role' },
  { expected: 'pass', id: 'allowlisted-metadata', op: 'insert', role: 'service_role' },
  { expected: 'blocked', id: 'cross-user-raw-select', op: 'select', role: 'authenticated' },
  { expected: 'not-exposed', id: 'postgrest-billing-schema', op: 'rest', role: 'anon' },
])

function envValue(env, name) {
  return typeof env?.[name] === 'string' ? env[name].trim() : ''
}

export function extractSupabaseProjectRef(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''))
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return { host, kind: 'local', ref: 'localhost' }
    const match = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/i)
    if (match) return { host, kind: 'supabase', ref: match[1].toLowerCase() }
    return { host, kind: 'other', ref: host }
  } catch {
    return null
  }
}

export function redactSecrets(text, env = {}) {
  let output = String(text ?? '')
  const values = [
    envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY'),
    envValue(env, SERVICE_ROLE_ENV),
    envValue(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    envValue(env, 'VITE_SUPABASE_ANON_KEY'),
  ].filter((value) => value.length >= 8)

  for (const value of values) {
    output = output.split(value).join('[redacted]')
  }
  return output
}

function makeCheck(id, status, message) {
  return { id, message, status }
}

export function validateBillingStagingTarget(env = process.env) {
  const checks = []
  const abort = (id, message) => {
    checks.push(makeCheck(id, 'FAIL', message))
    return false
  }

  const viteService = Object.keys(env || {}).find((key) => /^VITE_.*SERVICE_ROLE/i.test(key) && envValue(env, key))
  if (viteService) abort('vite-service-role', `${viteService} must never exist; billing test keys are server-only.`)

  if (envValue(env, 'VITE_BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY') || envValue(env, 'VITE_BILLING_TEST_SUPABASE_ANON_KEY')) {
    abort('vite-billing-test', 'BILLING_TEST_* must not be prefixed with VITE_.')
  }

  const missing = REQUIRED_STAGING_ENV.filter((name) => !envValue(env, name))
  checks.push(missing.length
    ? makeCheck('required-env', 'FAIL', `Missing ${missing.join(', ')}.`)
    : makeCheck('required-env', 'PASS', 'Required BILLING_TEST_* env names are present.'))

  const target = envValue(env, 'BILLING_TEST_TARGET').toLowerCase()
  if (!ALLOWED_TARGETS.includes(target)) {
    abort('target-label', 'BILLING_TEST_TARGET must be staging, test, or local.')
  } else {
    checks.push(makeCheck('target-label', 'PASS', `Target label is ${target}.`))
  }

  const rawUrl = envValue(env, 'BILLING_TEST_SUPABASE_URL')
  const parsed = extractSupabaseProjectRef(rawUrl)
  if (!rawUrl || !parsed) {
    abort('url', 'BILLING_TEST_SUPABASE_URL is missing or malformed.')
  } else if (!['http:', 'https:'].includes(new URL(rawUrl).protocol)) {
    abort('url', 'BILLING_TEST_SUPABASE_URL must be http(s).')
  } else if (parsed.kind === 'local' && target !== 'local') {
    abort('url', 'localhost URL requires BILLING_TEST_TARGET=local.')
  } else if (parsed.kind !== 'local' && target === 'local') {
    abort('url', 'BILLING_TEST_TARGET=local is only valid for localhost.')
  } else {
    checks.push(makeCheck('url', 'PASS', `URL host kind is ${parsed.kind}.`))
  }

  const productionRefs = [
    ...KNOWN_PRODUCTION_PROJECT_REFS,
    ...envValue(env, PRODUCTION_PROJECT_REF_ENV).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean),
  ]
  if (parsed && productionRefs.includes(parsed.ref)) {
    abort('production-block', 'Target project ref matches production and is blocked.')
  } else {
    checks.push(makeCheck('production-block', 'PASS', 'Target is not a listed production project ref.'))
  }

  if (parsed?.kind === 'supabase') {
    const stagingRef = envValue(env, STAGING_PROJECT_REF_ENV).toLowerCase()
    if (!stagingRef) {
      abort('staging-ref', `${STAGING_PROJECT_REF_ENV} is required for *.supabase.co hosts because production ref is UNKNOWN in-repo.`)
    } else if (stagingRef !== parsed.ref) {
      abort('staging-ref', 'BILLING_TEST_STAGING_PROJECT_REF must match the URL project ref.')
    } else if (productionRefs.includes(stagingRef)) {
      abort('staging-ref', 'Staging project ref must not equal a production ref.')
    } else {
      checks.push(makeCheck('staging-ref', 'PASS', 'Explicit staging project ref matches URL.'))
    }
  }

  const anon = envValue(env, 'BILLING_TEST_SUPABASE_ANON_KEY')
  if (!anon) abort('anon-key', 'BILLING_TEST_SUPABASE_ANON_KEY is missing.')
  else checks.push(makeCheck('anon-key', 'PASS', 'Anon key env is set (value not logged).'))

  const serviceRole = envValue(env, SERVICE_ROLE_ENV)
  checks.push(serviceRole
    ? makeCheck('service-role', 'PASS', 'Service role env is set (value not logged).')
    : makeCheck('service-role', 'FAIL', `${SERVICE_ROLE_ENV} missing; trusted INSERT/UPDATE/DELETE tests cannot run.`))

  const coreOk = checks.every((check) => check.id === 'service-role' || check.status === 'PASS')
  return {
    checks,
    hostKind: parsed?.kind || null,
    ok: coreOk,
    projectRef: parsed?.ref || null,
    serviceRolePresent: Boolean(serviceRole),
    target: target || null,
    trustedReady: coreOk && Boolean(serviceRole),
  }
}

export function planBillingStagingIntegration() {
  return {
    cleanup: {
      method: 'staging-only trusted teardown: disable append-only trigger or use a staging-only admin SQL path, delete rows where event_id like bill1c-%, re-enable trigger. Never DELETE via anon/authenticated. Never run against production.',
      scope: 'billing.usage_events rows created by this harness only',
    },
    forbiddenMetadataKeys: FORBIDDEN_TEST_METADATA_KEYS,
    matrix: INTEGRATION_MATRIX,
    migrationFile: BILLING_USAGE_MIGRATION_FILE,
    testUsers: {
      createInThisSprint: false,
      later: 'Create two staging Auth users (A/B) in the staging project only. Use their JWTs for authenticated REST. Do not use production auth.',
    },
    validMetadataExample: USAGE_METADATA_ALLOWLIST.reduce((row, key) => ({
      ...row,
      [key]: key === 'usage_basis' ? 'MEASURED' : 1,
    }), {}),
  }
}

export async function applyUsageEventsMigration({
  applyMigration = false,
  cwd = process.cwd(),
  env = process.env,
  executeSql,
  humanApproved = false,
  readFile = (file) => readFileSync(resolve(cwd, file), 'utf8'),
} = {}) {
  const validation = validateBillingStagingTarget(env)
  if (!validation.ok) {
    return { executed: false, reason: 'target_invalid', validation }
  }
  if (!applyMigration || humanApproved !== true) {
    return { executed: false, reason: 'dry_run', validation }
  }
  if (typeof executeSql !== 'function') {
    return { executed: false, reason: 'no_sql_adapter', validation }
  }
  const sql = readFile(BILLING_USAGE_MIGRATION_FILE)
  await executeSql(sql)
  return { executed: true, reason: 'applied', validation }
}

export async function runBillingStagingPreflight({
  applyMigration = false,
  env = process.env,
  executeSql,
  humanApproved = false,
} = {}) {
  const validation = validateBillingStagingTarget(env)
  const applyResult = await applyUsageEventsMigration({
    applyMigration,
    env,
    executeSql,
    humanApproved,
  })

  const requiredPresent = validation.checks.some((check) => check.id === 'required-env' && check.status === 'PASS')
    && validation.checks.some((check) => check.id === 'url' && check.status === 'PASS')
  const productionBlockPass = validation.checks.some((check) => check.id === 'production-block' && check.status === 'PASS')
    && !validation.checks.some((check) => check.id === 'production-block' && check.status === 'FAIL')

  const ready = validation.trustedReady && !applyResult.executed && applyResult.reason === 'dry_run'

  return {
    applyResult,
    migrationExecuted: applyResult.executed === true,
    plan: planBillingStagingIntegration(),
    productionBlock: productionBlockPass && !validation.checks.some((check) => check.status === 'FAIL' && check.id === 'production-block'),
    readyForHumanApprovedStagingRun: ready,
    requiredEnv: requiredPresent ? 'PRESENT' : 'MISSING',
    targetValidated: validation.ok,
    validation,
  }
}

export function formatBillingStagingPreflight(result, env = {}) {
  const productionFail = result.validation.checks.some((check) => check.id === 'production-block' && check.status === 'FAIL')
  const lines = [
    `TARGET VALIDATED: ${result.targetValidated ? 'YES' : 'NO'}`,
    `PRODUCTION BLOCK: ${productionFail ? 'FAIL' : 'PASS'}`,
    `REQUIRED ENV: ${result.requiredEnv}`,
    'MIGRATION: NOT EXECUTED',
    `READY FOR HUMAN-APPROVED STAGING RUN: ${result.readyForHumanApprovedStagingRun ? 'YES' : 'NO'}`,
    ...result.validation.checks.map((check) => `${check.status} ${check.id}: ${check.message}`),
  ]
  return redactSecrets(lines.join('\n'), env)
}

export function runBillingStagingPreflightCli({
  env = process.env,
  stdout = process.stdout,
} = {}) {
  return runBillingStagingPreflight({ applyMigration: false, env, humanApproved: false })
    .then((result) => {
      stdout.write(`${formatBillingStagingPreflight(result, env)}\n`)
      return result.targetValidated && !result.migrationExecuted ? 0 : 1
    })
}

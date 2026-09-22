import { createHash, randomUUID } from 'node:crypto'
import { SENSITIVE_USAGE_FIELDS } from './catalog.js'

const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Confirmed from api/nutrition-photo-analysis/index.js:
 * callOpenAiJson({ feature: 'food.scan', type: 'photo' }).
 * timeout_ms must stay aligned with NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS.
 */
export const FOOD_SCAN_CANARY = Object.freeze({
  feature_id: 'food.scan',
  provider_id: 'openai',
  provider_path: 'api/_shared/openaiGateway.js#callOpenAiJson',
  quantity: 1,
  route: 'api/nutrition-photo-analysis/index.js',
  timeout_ms: 45000,
  unit: 'requests',
})

export const PROVIDER_BILLING_CLASS = Object.freeze({
  COMPLETED: 'COMPLETED',
  NOT_STARTED: 'NOT_STARTED',
  UNKNOWN_MAY_BE_BILLED: 'UNKNOWN_MAY_BE_BILLED',
})

export function createScopedOperationId({
  clientAttemptId = '',
  featureId = FOOD_SCAN_CANARY.feature_id,
  route = FOOD_SCAN_CANARY.route,
  userId,
} = {}) {
  const client = String(clientAttemptId || '').trim().slice(0, 80)
  if (!USER_ID_RE.test(String(userId || '')) || !client) {
    return randomUUID()
  }
  const digest = createHash('sha256')
    .update(`billing-op:v1:${userId}:${featureId}:${route}:${client}`)
    .digest('hex')
  return `op_${digest.slice(0, 32)}`
}

/**
 * Classifies OpenAI photo-gateway failures from flags the live route already
 * attaches (timeout, aborted, parseError, networkError). Does not invent
 * OpenAI invoice semantics: once the request may have left this process,
 * billing is UNKNOWN_MAY_BE_BILLED.
 */
export function classifyFoodScanProviderOutcome(result = {}) {
  if (result.ok === true) return PROVIDER_BILLING_CLASS.COMPLETED
  if (result.providerRequestStarted === false || result.billingClass === PROVIDER_BILLING_CLASS.NOT_STARTED) {
    return PROVIDER_BILLING_CLASS.NOT_STARTED
  }
  if (result.providerRequestStarted === true) return PROVIDER_BILLING_CLASS.UNKNOWN_MAY_BE_BILLED
  if (result.code === 'serverConfiguration' || result.code === 'aiNotConfigured') {
    return PROVIDER_BILLING_CLASS.NOT_STARTED
  }
  return PROVIDER_BILLING_CLASS.UNKNOWN_MAY_BE_BILLED
}

export function reservationExpiresAt(now = new Date(), timeoutMs = FOOD_SCAN_CANARY.timeout_ms) {
  return new Date(now.getTime() + Number(timeoutMs) + 5000).toISOString()
}

export function stripSensitiveBillingPayload(input) {
  if (input == null || typeof input !== 'object') return input
  if (Array.isArray(input)) return input.map(stripSensitiveBillingPayload)
  const out = {}
  for (const [key, value] of Object.entries(input)) {
    const normalized = String(key).toLowerCase()
    if (normalized === 'token' || normalized.endsWith('_token') || normalized.includes('api_key')) continue
    if (SENSITIVE_USAGE_FIELDS.some((field) => normalized === field || normalized.includes(field))) continue
    if (normalized.includes('base64') || normalized.includes('service_role') || normalized.includes('database')) continue
    out[key] = typeof value === 'object' && value !== null ? stripSensitiveBillingPayload(value) : value
  }
  return out
}

export function foodScanUsageEventPlan({ operationId, userId } = {}) {
  return Object.freeze({
    cost_basis: 'UNAVAILABLE',
    event_id: operationId,
    event_type: FOOD_SCAN_CANARY.feature_id,
    feature: FOOD_SCAN_CANARY.feature_id,
    metadata: Object.freeze({
      image_count: 1,
      usage_basis: 'UNAVAILABLE',
    }),
    provider: FOOD_SCAN_CANARY.provider_id,
    quantity: FOOD_SCAN_CANARY.quantity,
    reference_id: operationId,
    unit: FOOD_SCAN_CANARY.unit,
    user_id: userId,
  })
}

import { createHash, randomUUID } from 'node:crypto'
import { SENSITIVE_USAGE_FIELDS } from './catalog.js'

const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CLIENT_ATTEMPT_RE = /^[A-Za-z0-9._-]{8,80}$/

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

/**
 * Image fingerprint / runDedupedAiRequest is product UX only.
 * It is never the billing operation identity.
 */
export const IMAGE_DEDUP_ROLE = Object.freeze({
  billing_authority: false,
  role: 'product_ux_inflight_coalesce',
})

export const PROVIDER_DISPATCH_STATE = Object.freeze({
  DISPATCHED_BILLING_UNKNOWN: 'DISPATCHED_BILLING_UNKNOWN',
  DISPATCHED_CONFIRMED_FAILURE_NOT_BILLABLE: 'DISPATCHED_CONFIRMED_FAILURE_NOT_BILLABLE',
  DISPATCHED_CONFIRMED_SUCCESS: 'DISPATCHED_CONFIRMED_SUCCESS',
  NOT_DISPATCHED: 'NOT_DISPATCHED',
})

/** BILL-5B1 aliases. Values are the 5B1a dispatch states. */
export const PROVIDER_BILLING_CLASS = Object.freeze({
  COMPLETED: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
  NOT_STARTED: PROVIDER_DISPATCH_STATE.NOT_DISPATCHED,
  UNKNOWN_MAY_BE_BILLED: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
  ...PROVIDER_DISPATCH_STATE,
})

export function normalizeClientAttemptId(value) {
  const raw = String(value || '').trim()
  if (!CLIENT_ATTEMPT_RE.test(raw)) return ''
  return raw
}

export function createScopedOperationId({
  clientAttemptId = '',
  featureId = FOOD_SCAN_CANARY.feature_id,
  route = FOOD_SCAN_CANARY.route,
  userId,
} = {}) {
  const client = normalizeClientAttemptId(clientAttemptId)
  if (!USER_ID_RE.test(String(userId || '')) || !client) {
    return randomUUID()
  }
  const digest = createHash('sha256')
    .update(`billing-op:v1:${userId}:${featureId}:${route}:${client}`)
    .digest('hex')
  return `op_${digest.slice(0, 32)}`
}

/**
 * One logical food.scan operation = one reservation = one usage event.
 * BILL-1 event_id is a string <= 180 chars (not UUID-only). Compatible.
 * BILL-2 periodUsage skips usage rows whose event_id equals a reservation_id.
 */
export function createBillingAccountingIdentity(operationId) {
  const id = String(operationId || '').trim()
  if (!id || id.length > 180) return null
  return Object.freeze({
    event_id: id,
    operation_id: id,
    reservation_id: id,
  })
}

/**
 * OpenAI 5xx/timeout/abort-after-dispatch is never treated as proven
 * non-billable. Only a proven non-start may roll back.
 */
export function classifyFoodScanProviderOutcome(result = {}, dispatchStarted = false) {
  if (result.ok === true) return PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS
  if (result.dispatchState === PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_FAILURE_NOT_BILLABLE) {
    return PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_FAILURE_NOT_BILLABLE
  }

  const provenNotDispatched = dispatchStarted !== true && result.providerRequestStarted === false
  if (
    provenNotDispatched
    || result.billingClass === PROVIDER_DISPATCH_STATE.NOT_DISPATCHED
    || result.billingClass === 'NOT_STARTED'
  ) {
    return PROVIDER_DISPATCH_STATE.NOT_DISPATCHED
  }

  if (
    (result.code === 'serverConfiguration' || result.code === 'aiNotConfigured')
    && dispatchStarted !== true
    && result.providerRequestStarted !== true
  ) {
    return PROVIDER_DISPATCH_STATE.NOT_DISPATCHED
  }

  return PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN
}

export function createDispatchBoundedProvider(run) {
  return async function dispatchBounded(hooks = {}) {
    await hooks.markDispatched?.()
    return run(hooks)
  }
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

export function sanitizeLifecycleError(error = {}) {
  return Object.freeze({
    code: String(error.code || error.outcome || 'PROVIDER_FAILED').slice(0, 80),
  })
}

export function foodScanUsageEventPlan({ operationId, userId } = {}) {
  const identity = createBillingAccountingIdentity(operationId)
  return Object.freeze({
    cost_basis: 'UNAVAILABLE',
    event_id: identity?.event_id || operationId,
    event_type: FOOD_SCAN_CANARY.feature_id,
    feature: FOOD_SCAN_CANARY.feature_id,
    metadata: Object.freeze({
      image_count: 1,
      usage_basis: 'UNAVAILABLE',
    }),
    provider: FOOD_SCAN_CANARY.provider_id,
    quantity: FOOD_SCAN_CANARY.quantity,
    reference_id: identity?.reservation_id || operationId,
    unit: FOOD_SCAN_CANARY.unit,
    user_id: userId,
  })
}

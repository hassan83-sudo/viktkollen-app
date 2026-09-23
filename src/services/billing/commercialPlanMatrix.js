/**
 * Server-authoritative commercial plan matrix.
 * Legacy entitlement numbers remain for compatibility. They are not approved
 * commercial limits unless a dimension says authority ACTIVE.
 * No payment provider, checkout, webhook, or proration lives here.
 */

export const COMMERCIAL_QUOTA_KEYS = Object.freeze([
  'ai_text_requests',
  'food_scan_requests',
  'body_scan_requests',
  'ai_eye_requests',
])

/**
 * Reachable features that stay free at launch. They are not commercial quotas.
 * SOS uses the safety alert path and has no plan quota.
 */
export const LAUNCH_UNMETERED_FEATURES = Object.freeze([
  'friend_chat',
  'ai.voice.session',
  'tts.request',
  'gps.live.session',
  'gps_standard',
  'ai.ear.interpret',
])

/** AI text, food.scan, body.scan, ai.eye.analysis. Prices stay on the plan row. */
export const LAUNCH_QUOTA_BY_PLAN = Object.freeze({
  'plan.free': Object.freeze({ ai_text_requests: 20, food_scan_requests: 5, body_scan_requests: 3, ai_eye_requests: 25 }),
  'plan.prelim.sek.month.04': Object.freeze({ ai_text_requests: 30, food_scan_requests: 10, body_scan_requests: 4, ai_eye_requests: 40 }),
  'plan.prelim.sek.month.07': Object.freeze({ ai_text_requests: 50, food_scan_requests: 15, body_scan_requests: 6, ai_eye_requests: 60 }),
  'plan.prelim.sek.month.09': Object.freeze({ ai_text_requests: 70, food_scan_requests: 20, body_scan_requests: 8, ai_eye_requests: 80 }),
  'plan.prelim.sek.month.12': Object.freeze({ ai_text_requests: 90, food_scan_requests: 30, body_scan_requests: 10, ai_eye_requests: 100 }),
  'plan.prelim.sek.month.15': Object.freeze({ ai_text_requests: 120, food_scan_requests: 40, body_scan_requests: 12, ai_eye_requests: 125 }),
  'plan.prelim.sek.month.19': Object.freeze({ ai_text_requests: 160, food_scan_requests: 55, body_scan_requests: 15, ai_eye_requests: 150 }),
  'plan.prelim.sek.month.29': Object.freeze({ ai_text_requests: 250, food_scan_requests: 85, body_scan_requests: 25, ai_eye_requests: 250 }),
  'plan.prelim.sek.month.39': Object.freeze({ ai_text_requests: 350, food_scan_requests: 120, body_scan_requests: 35, ai_eye_requests: 350 }),
  'plan.prelim.sek.month.49': Object.freeze({ ai_text_requests: 500, food_scan_requests: 160, body_scan_requests: 50, ai_eye_requests: 500 }),
  'plan.prelim.sek.month.59': Object.freeze({ ai_text_requests: 650, food_scan_requests: 200, body_scan_requests: 65, ai_eye_requests: 650 }),
  'plan.prelim.sek.month.69': Object.freeze({ ai_text_requests: 800, food_scan_requests: 250, body_scan_requests: 80, ai_eye_requests: 800 }),
  'plan.prelim.sek.month.79': Object.freeze({ ai_text_requests: 1000, food_scan_requests: 300, body_scan_requests: 100, ai_eye_requests: 1000 }),
  'plan.prelim.sek.month.89': Object.freeze({ ai_text_requests: 1250, food_scan_requests: 350, body_scan_requests: 125, ai_eye_requests: 1250 }),
  'plan.prelim.sek.month.99': Object.freeze({ ai_text_requests: 1500, food_scan_requests: 400, body_scan_requests: 150, ai_eye_requests: 1500 }),
})

export const COMMERCIAL_QUOTA_AUTHORITY = Object.freeze({
  ACTIVE: 'ACTIVE',
  LEGACY_PRELIMINARY: 'LEGACY_PRELIMINARY',
  TO_BE_FINALIZED: 'TO_BE_FINALIZED',
})

const DIMENSIONS = Object.freeze({
  ai_eye_requests: Object.freeze({ feature: 'ai.eye.analysis', unit: 'requests' }),
  ai_text_requests: Object.freeze({ feature: 'ai.text.request', unit: 'requests' }),
  body_scan_requests: Object.freeze({ feature: 'body.scan', unit: 'requests' }),
  food_scan_requests: Object.freeze({ feature: 'food.scan', unit: 'requests' }),
})

const KNOWN_FEATURES = new Set(Object.values(DIMENSIONS).map((dimension) => dimension.feature))
const CLIENT_AUTHORITY_FIELDS = Object.freeze([
  'ai_eye_requests',
  'ai_text_requests',
  'billing_period',
  'body_scan_requests',
  'entitlements',
  'food_scan_requests',
  'gps_live_minutes',
  'limit',
  'price',
  'price_minor',
  'price_sek',
  'price_sek_minor',
  'quota',
  'quotas',
  'remaining',
  'unlimited',
  'voice_minutes',
])

function invalid(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

export function createCommercialQuota({
  authority,
  enabled = true,
  key,
  limit,
} = {}) {
  const dimension = DIMENSIONS[key]
  if (!dimension) invalid('unknown_quota_dimension')
  if (!Object.values(COMMERCIAL_QUOTA_AUTHORITY).includes(authority)) invalid('invalid_quota_authority')
  if (authority === COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED) {
    if (limit != null) invalid('final_quota_not_allowed')
  } else if (!Number.isInteger(limit) || limit < 0) {
    invalid('invalid_quota')
  }
  return Object.freeze({
    authority,
    enabled: enabled === true,
    feature: dimension.feature,
    key,
    limit: limit == null ? null : limit,
    unit: dimension.unit,
  })
}

export function createLaunchCommercialQuotas(planId) {
  const approved = LAUNCH_QUOTA_BY_PLAN[planId]
  if (!approved) invalid('unknown_plan')
  const quotas = {}
  for (const key of COMMERCIAL_QUOTA_KEYS) {
    quotas[key] = createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.ACTIVE,
      key,
      limit: approved[key],
    })
  }
  return Object.freeze(quotas)
}

export function validateCommercialPlanCatalog(catalog = []) {
  const ids = new Set()
  const paidPrices = new Set()
  for (const plan of catalog) {
    if (!plan?.id || ids.has(plan.id)) invalid('duplicate_plan_id')
    ids.add(plan.id)
    if (!Number.isInteger(plan.price_minor) || plan.price_minor < 0) invalid('invalid_price')
    if (plan.billing_interval !== 'month' || plan.billing_period !== 'month') invalid('invalid_billing_period')
    if (plan.id !== 'plan.free') {
      if (paidPrices.has(plan.price_minor)) invalid('duplicate_price')
      paidPrices.add(plan.price_minor)
      if (plan.commercial_status !== 'PRELIMINARY') invalid('invalid_commercial_status')
      if (plan.enabled_for_sale === true) invalid('paid_plan_enabled')
    }
    const approved = LAUNCH_QUOTA_BY_PLAN[plan.id]
    if (!approved) invalid('unknown_plan')
    const quotas = plan.commercial_quotas || {}
    const keys = Object.keys(quotas)
    if (keys.length !== COMMERCIAL_QUOTA_KEYS.length || COMMERCIAL_QUOTA_KEYS.some((key) => !quotas[key])) {
      invalid('incomplete_quota_matrix')
    }
    for (const key of keys) {
      if (!COMMERCIAL_QUOTA_KEYS.includes(key)) invalid('unknown_quota_dimension')
      const quota = quotas[key]
      if (!KNOWN_FEATURES.has(quota.feature)) invalid('unknown_feature')
      if (quota.limit != null && (!Number.isInteger(quota.limit) || quota.limit < 0)) invalid('invalid_quota')
      if (quota.authority !== COMMERCIAL_QUOTA_AUTHORITY.ACTIVE || quota.limit !== approved[key]) {
        invalid('quota_matrix_mismatch')
      }
      if (plan.entitlements?.[quota.feature]?.limit?.value !== quota.limit) {
        invalid('entitlement_quota_mismatch')
      }
    }
    for (const feature of LAUNCH_UNMETERED_FEATURES) {
      if (plan.entitlements?.[feature]?.limit?.kind !== 'UNLIMITED') invalid('launch_feature_metered')
      if (Object.values(quotas).some((quota) => quota.feature === feature)) invalid('launch_feature_metered')
    }
  }
  const free = catalog.find((plan) => plan.id === 'plan.free')
  if (!free || free.price_minor !== 0) invalid('invalid_free_plan')
  const food = free.commercial_quotas.food_scan_requests
  if (food.limit !== 5 || food.authority !== COMMERCIAL_QUOTA_AUTHORITY.ACTIVE || food.enabled !== true) {
    invalid('invalid_free_food_quota')
  }
  return true
}

/**
 * plan_id may be selected by the caller. Price, quotas, entitlements, and
 * period benefits are copied only from the server catalog.
 */
export function resolveAuthoritativePlan(catalog, planId, clientClaim = {}) {
  for (const field of CLIENT_AUTHORITY_FIELDS) void clientClaim?.[field]
  const plan = (catalog || []).find((entry) => entry.id === planId) || null
  if (!plan) {
    return Object.freeze({ code: 'unknown_plan', ok: false })
  }
  return Object.freeze({
    active: plan.active === true,
    billing_period: plan.billing_period,
    commercial_status: plan.commercial_status,
    entitlements: plan.entitlements,
    ok: true,
    plan_id: plan.id,
    price_sek_minor: plan.price_minor,
    quotas: plan.commercial_quotas,
  })
}

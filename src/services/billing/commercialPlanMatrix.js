/**
 * Server-authoritative commercial plan matrix.
 * Legacy entitlement numbers remain for compatibility. They are not approved
 * commercial limits unless a dimension says authority ACTIVE.
 * No payment provider, checkout, webhook, or proration lives here.
 */

export const COMMERCIAL_QUOTA_KEYS = Object.freeze([
  'food_scan_requests',
  'ai_text_requests',
  'voice_minutes',
  'gps_live_minutes',
])

export const COMMERCIAL_QUOTA_AUTHORITY = Object.freeze({
  ACTIVE: 'ACTIVE',
  LEGACY_PRELIMINARY: 'LEGACY_PRELIMINARY',
  TO_BE_FINALIZED: 'TO_BE_FINALIZED',
})

const DIMENSIONS = Object.freeze({
  ai_text_requests: Object.freeze({ feature: 'ai.text.request', unit: 'requests' }),
  food_scan_requests: Object.freeze({ feature: 'food.scan', unit: 'requests' }),
  gps_live_minutes: Object.freeze({ feature: 'gps.live.session', unit: 'minutes' }),
  voice_minutes: Object.freeze({ feature: 'ai.voice.session', unit: 'minutes' }),
})

const KNOWN_FEATURES = new Set(Object.values(DIMENSIONS).map((dimension) => dimension.feature))
const CLIENT_AUTHORITY_FIELDS = Object.freeze([
  'ai_text_requests',
  'billing_period',
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

export function createFreeCommercialQuotas() {
  return Object.freeze({
    ai_text_requests: createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.LEGACY_PRELIMINARY,
      key: 'ai_text_requests',
      limit: 5,
    }),
    food_scan_requests: createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.ACTIVE,
      key: 'food_scan_requests',
      limit: 5,
    }),
    gps_live_minutes: createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED,
      key: 'gps_live_minutes',
      limit: null,
    }),
    voice_minutes: createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED,
      key: 'voice_minutes',
      limit: null,
    }),
  })
}

/**
 * The numeric request limits are the previous shared preliminary schedule.
 * They stay available for compatibility and are explicitly not approved
 * commercial quotas. Minute dimensions are independent and unfinished.
 */
export function createPaidCommercialQuotas(legacyRequestLimit) {
  return Object.freeze({
    ai_text_requests: createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.LEGACY_PRELIMINARY,
      key: 'ai_text_requests',
      limit: legacyRequestLimit,
    }),
    food_scan_requests: createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.LEGACY_PRELIMINARY,
      key: 'food_scan_requests',
      limit: legacyRequestLimit,
    }),
    gps_live_minutes: createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED,
      key: 'gps_live_minutes',
      limit: null,
    }),
    voice_minutes: createCommercialQuota({
      authority: COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED,
      key: 'voice_minutes',
      limit: null,
    }),
  })
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
    }
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
      if (quota.authority === COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED && quota.limit != null) {
        invalid('final_quota_not_allowed')
      }
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

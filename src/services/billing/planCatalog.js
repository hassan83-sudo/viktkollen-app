import { BILLING_INTERVALS, PLAN_PRICE_STATUS } from './catalog.js'
import {
  createFreeCommercialQuotas,
  createPaidCommercialQuotas,
  validateCommercialPlanCatalog,
} from './commercialPlanMatrix.js'
import { createEntitlement, numberLimit, unlimitedLimit } from './entitlementModel.js'
import { BILLING_FEATURES } from './features.js'

const PRELIMINARY_SEK_MAJOR = Object.freeze([
  4, 7, 9, 12, 15, 19, 29, 39, 49, 59, 69, 79, 89, 99,
])

function meteredEntitlements({ enabled, limit }) {
  const entries = {}
  for (const [id, feature] of Object.entries(BILLING_FEATURES)) {
    if (!feature.metered) continue
    entries[id] = createEntitlement({
      enabled,
      feature: id,
      limit,
      quota_status: PLAN_PRICE_STATUS.PRELIMINARY,
      unit: feature.unit,
    })
  }
  return entries
}

function unmeteredEntitlements() {
  const entries = {}
  for (const [id, feature] of Object.entries(BILLING_FEATURES)) {
    if (feature.metered) continue
    entries[id] = createEntitlement({
      enabled: true,
      feature: id,
      limit: unlimitedLimit(),
      quota_status: PLAN_PRICE_STATUS.PRELIMINARY,
      unit: feature.unit,
    })
  }
  return entries
}

function createPlan({
  commercial_quotas,
  commercial_status,
  display_order,
  entitlements,
  id,
  name,
  price_minor,
}) {
  return Object.freeze({
    active: true,
    billing_interval: 'month',
    billing_period: 'month',
    commercial_quotas,
    commercial_status,
    configurability: PLAN_PRICE_STATUS.ADMIN_CONFIGURABLE,
    currency: 'SEK',
    display_order,
    entitlements: Object.freeze(entitlements),
    id,
    name,
    price_minor,
    price_status: PLAN_PRICE_STATUS.PRELIMINARY,
    version: 1,
  })
}

const freePlan = createPlan({
  commercial_quotas: createFreeCommercialQuotas(),
  commercial_status: 'ACTIVE',
  display_order: 0,
  entitlements: Object.freeze({
    ...unmeteredEntitlements(),
    ...meteredEntitlements({ enabled: true, limit: numberLimit(5) }),
  }),
  id: 'plan.free',
  name: 'Free',
  price_minor: 0,
})

const paidPlans = PRELIMINARY_SEK_MAJOR.map((major, index) => {
  const priceMinor = major * 100
  const legacyRequestLimit = 50 + index * 10
  return createPlan({
    commercial_quotas: createPaidCommercialQuotas(legacyRequestLimit),
    commercial_status: 'PRELIMINARY',
    display_order: index + 1,
    entitlements: Object.freeze({
      ...unmeteredEntitlements(),
      ...meteredEntitlements({ enabled: true, limit: numberLimit(legacyRequestLimit) }),
    }),
    id: `plan.prelim.sek.month.${String(major).padStart(2, '0')}`,
    name: `Prelim ${major} SEK/month`,
    price_minor: priceMinor,
  })
})

export const defaultPlanCatalog = Object.freeze([freePlan, ...paidPlans])

validateCommercialPlanCatalog(defaultPlanCatalog)

export function listActivePlans(catalog = defaultPlanCatalog) {
  return catalog.filter((plan) => plan.active).sort((a, b) => a.display_order - b.display_order)
}

export function getPlanById(planId, catalog = defaultPlanCatalog) {
  return catalog.find((plan) => plan.id === planId) || null
}

export function validatePlan(plan = {}) {
  if (!plan.id || typeof plan.id !== 'string') {
    const error = new Error('invalid_plan_id')
    error.code = 'invalid_plan_id'
    throw error
  }
  if (!Number.isInteger(plan.price_minor) || plan.price_minor < 0) {
    const error = new Error('invalid_price')
    error.code = 'invalid_price'
    throw error
  }
  if (plan.currency !== 'SEK') {
    const error = new Error('unsupported_currency')
    error.code = 'unsupported_currency'
    throw error
  }
  if (!BILLING_INTERVALS.includes(plan.billing_interval)) {
    const error = new Error('invalid_billing_interval')
    error.code = 'invalid_billing_interval'
    throw error
  }
  if (!Number.isInteger(plan.version) || plan.version < 1) {
    const error = new Error('invalid_plan_version')
    error.code = 'invalid_plan_version'
    throw error
  }
  return plan
}

export function getPlanEntitlement(plan, featureId) {
  return plan?.entitlements?.[featureId] || null
}

export const preliminarySekMonthMajors = PRELIMINARY_SEK_MAJOR

import {
  COST_SAFETY,
  ENFORCEMENT_DECISION,
  FEATURE_AVAILABILITY,
  PROVIDER_AVAILABILITY,
} from './catalog.js'
import { isUnlimitedLimit } from './entitlementModel.js'
import { resolveFeatureAvailability } from './featureAvailability.js'
import { requiredProvidersForFeature } from './featureProviders.js'
import { getFeatureDefinition, isCostDrivingFeature, resolveFeatureId } from './features.js'
import { FINAL_REASON, resolveFinalCostSafety } from './finalCostSafety.js'
import { resolveEffectivePlan } from './effectivePlan.js'
import { getPlanEntitlement } from './planCatalog.js'
import { indexProviderControls, resolveProviderAvailability } from './providerAvailability.js'
import { resolveProviderId } from './providers.js'
import { planQuotaEligibility, QUOTA_PLAN_ACTION } from './quotaReservationPlan.js'

const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FORBIDDEN_OUTPUT_KEYS = Object.freeze([
  'api_key',
  'audio',
  'database_url',
  'gps',
  'health',
  'image',
  'prompt',
  'response',
  'service_role',
  'token',
])

function ignoreClientAuthority(clientClaim = {}) {
  void clientClaim.amount_minor
  void clientClaim.costDriving
  void clientClaim.costSafe
  void clientClaim.featureEnabled
  void clientClaim.ignoreHardStop
  void clientClaim.isAdmin
  void clientClaim.plan_id
  void clientClaim.providerAvailable
  void clientClaim.remaining
  void clientClaim.user_id
}

function isVerifiedUserId(userId) {
  return typeof userId === 'string' && USER_ID_RE.test(userId)
}

function safeDecision(fields) {
  const output = {
    allowed: fields.allowed === true,
    cost_reason: fields.cost_reason || null,
    cost_result: fields.cost_result || null,
    decision: fields.decision,
    feature_id: fields.feature_id || null,
    live_enforcement: false,
    mutated: false,
    no_active_threshold: fields.no_active_threshold === true,
    provider_executed: false,
    quota_consumed: false,
    quota_plan: fields.quota_plan || null,
    reason_codes: Object.freeze([...(fields.reason_codes || [])]),
    warnings: Object.freeze([...(fields.warnings || [])]),
  }
  for (const key of FORBIDDEN_OUTPUT_KEYS) {
    if (key in output) delete output[key]
  }
  return Object.freeze(output)
}

function deny(decision, extra = {}) {
  return safeDecision({
    allowed: false,
    decision,
    reason_codes: extra.reason_codes || [decision],
    ...extra,
  })
}

function mapCostDeny(costDecision, featureId) {
  if (costDecision.result === COST_SAFETY.COST_HARD_STOP) {
    return deny(ENFORCEMENT_DECISION.DENY_COST_HARD_STOP, {
      cost_reason: costDecision.reason,
      cost_result: costDecision.result,
      feature_id: featureId,
    })
  }
  if (costDecision.reason === FINAL_REASON.HARD_UNAVAILABLE) {
    return deny(ENFORCEMENT_DECISION.DENY_COST_UNAVAILABLE, {
      cost_reason: costDecision.reason,
      cost_result: costDecision.result,
      feature_id: featureId,
    })
  }
  if (costDecision.result === COST_SAFETY.INVALID_COST_INPUT) {
    return deny(ENFORCEMENT_DECISION.INVALID_OPERATION, {
      cost_reason: costDecision.reason,
      cost_result: costDecision.result,
      feature_id: featureId,
      reason_codes: [ENFORCEMENT_DECISION.INVALID_OPERATION],
    })
  }
  return deny(ENFORCEMENT_DECISION.DENY_COST_UNAVAILABLE, {
    cost_reason: costDecision.reason,
    cost_result: costDecision.result,
    feature_id: featureId,
  })
}

/**
 * Server-side BILL-5A foundation. Combines existing gates; does not call
 * providers, mutate quota/subscription, or attach to live routes.
 *
 * Decision order:
 *   A verified user
 *   B canonical feature
 *   C operational feature control
 *   D required provider availability
 *   E effective subscription/plan
 *   F entitlement
 *   G cost safety (cost-driving only)
 *   H quota eligibility plan (no reserve)
 *   I ALLOW / DENY
 */
export async function evaluateBillingOperation(input = {}, deps = {}) {
  const clientClaim = input.clientClaim || {}
  ignoreClientAuthority(clientClaim)

  const executeProvider = deps.executeProvider
  void executeProvider

  const resolveFeature = deps.resolveFeatureAvailability || resolveFeatureAvailability
  const resolveProvider = deps.resolveProviderAvailability || resolveProviderAvailability
  const resolvePlan = deps.resolveEffectivePlan || resolveEffectivePlan
  const resolveCost = deps.resolveFinalCostSafety || resolveFinalCostSafety
  const inspectQuota = deps.inspectQuota
  const getRequiredProviders = deps.requiredProvidersForFeature || requiredProvidersForFeature

  let featureId = null

  try {
    if (input.requiresAuth !== false && !isVerifiedUserId(input.userId)) {
      return deny(ENFORCEMENT_DECISION.DENY_AUTH)
    }

    featureId = resolveFeatureId(input.featureId)
    if (!featureId) {
      return deny(ENFORCEMENT_DECISION.INVALID_OPERATION, {
        reason_codes: [ENFORCEMENT_DECISION.INVALID_OPERATION, 'UNKNOWN_FEATURE'],
      })
    }

    const definition = getFeatureDefinition(featureId)
    const costDriving = isCostDrivingFeature(featureId) === true

    const feature = await resolveFeature({
      clientClaim,
      control: input.featureControl,
      featureId,
    })
    if (feature.result === FEATURE_AVAILABILITY.UNKNOWN_FEATURE) {
      return deny(ENFORCEMENT_DECISION.INVALID_OPERATION, {
        feature_id: featureId,
        reason_codes: [ENFORCEMENT_DECISION.INVALID_OPERATION, 'UNKNOWN_FEATURE'],
      })
    }
    if (feature.result === FEATURE_AVAILABILITY.DISABLED) {
      return deny(ENFORCEMENT_DECISION.DENY_FEATURE_DISABLED, { feature_id: featureId })
    }
    if (feature.result === FEATURE_AVAILABILITY.MAINTENANCE) {
      return deny(ENFORCEMENT_DECISION.DENY_FEATURE_MAINTENANCE, { feature_id: featureId })
    }

    const mappedProviders = getRequiredProviders(featureId)
    if (mappedProviders == null) {
      return deny(ENFORCEMENT_DECISION.INVALID_OPERATION, {
        feature_id: featureId,
        reason_codes: [ENFORCEMENT_DECISION.INVALID_OPERATION, 'UNKNOWN_PROVIDER_MAPPING'],
      })
    }

    const indexed = indexProviderControls(input.providerControls)
    for (const providerId of mappedProviders) {
      if (!resolveProviderId(providerId)) {
        return deny(ENFORCEMENT_DECISION.INVALID_OPERATION, {
          feature_id: featureId,
          reason_codes: [ENFORCEMENT_DECISION.INVALID_OPERATION, 'UNKNOWN_PROVIDER'],
        })
      }
      const provider = await resolveProvider({
        clientClaim,
        control: indexed.get(providerId),
        providerId,
      })
      if (provider.result === PROVIDER_AVAILABILITY.UNKNOWN_PROVIDER) {
        return deny(ENFORCEMENT_DECISION.INVALID_OPERATION, {
          feature_id: featureId,
          reason_codes: [ENFORCEMENT_DECISION.INVALID_OPERATION, 'UNKNOWN_PROVIDER'],
        })
      }
      if (provider.result === PROVIDER_AVAILABILITY.PROVIDER_UNAVAILABLE) {
        return deny(ENFORCEMENT_DECISION.DENY_PROVIDER_UNAVAILABLE, { feature_id: featureId })
      }
      if (provider.result === PROVIDER_AVAILABILITY.PROVIDER_MAINTENANCE) {
        return deny(ENFORCEMENT_DECISION.DENY_PROVIDER_MAINTENANCE, { feature_id: featureId })
      }
    }

    const effective = await resolvePlan({
      catalog: input.planCatalog,
      clientClaim,
      now: input.now,
      subscriptions: input.subscriptions || [],
    })
    const entitlement = getPlanEntitlement(effective.plan, featureId)
    if (!entitlement || entitlement.enabled !== true) {
      return deny(ENFORCEMENT_DECISION.DENY_ENTITLEMENT, { feature_id: featureId })
    }
    const unlimited = isUnlimitedLimit(entitlement.limit)

    const warnings = []
    let costDecision = null
    if (costDriving) {
      costDecision = await resolveCost({
        clientClaim,
        costDriving: clientClaim.costDriving,
        featureId,
        selectedThresholds: input.selectedThresholds || [],
        summariesByKey: input.summariesByKey || {},
      })
      if (!costDecision.allow) {
        return mapCostDeny(costDecision, featureId)
      }
      if (costDecision.result === COST_SAFETY.COST_SOFT_ALERT) {
        warnings.push({ code: COST_SAFETY.COST_SOFT_ALERT, reason: costDecision.reason })
      } else if (costDecision.reason === FINAL_REASON.SOFT_UNAVAILABLE) {
        warnings.push({ code: COST_SAFETY.COST_UNAVAILABLE, reason: costDecision.reason })
      }
    }

    const metered = definition.metered === true
    let inspectResult = null
    if (metered && !unlimited) {
      if (typeof inspectQuota !== 'function') {
        return deny(ENFORCEMENT_DECISION.DENY_INTERNAL, { feature_id: featureId })
      }
      inspectResult = await inspectQuota({
        clientClaim,
        feature: featureId,
        unit: entitlement.unit,
        userId: input.userId,
      })
    }

    const quotaPlan = planQuotaEligibility({
      entitlementUnlimited: unlimited,
      inspectResult,
      metered,
      quantity: input.quantity ?? 1,
    })
    if (!quotaPlan.eligible) {
      return deny(ENFORCEMENT_DECISION.DENY_QUOTA, {
        cost_reason: costDecision?.reason || null,
        cost_result: costDecision?.result || null,
        feature_id: featureId,
        quota_plan: {
          action: QUOTA_PLAN_ACTION.NONE,
          consume: false,
          status: quotaPlan.status,
        },
        warnings,
      })
    }

    return safeDecision({
      allowed: true,
      cost_reason: costDecision?.reason || null,
      cost_result: costDecision?.result || null,
      decision: ENFORCEMENT_DECISION.ALLOW,
      feature_id: featureId,
      no_active_threshold: costDecision?.no_active_threshold === true,
      quota_plan: {
        action: quotaPlan.action,
        consume: false,
        quantity: quotaPlan.quantity,
        status: quotaPlan.status,
      },
      reason_codes: [ENFORCEMENT_DECISION.ALLOW],
      warnings,
    })
  } catch {
    return deny(ENFORCEMENT_DECISION.DENY_INTERNAL, {
      feature_id: featureId,
      reason_codes: [ENFORCEMENT_DECISION.DENY_INTERNAL],
    })
  }
}

export { FORBIDDEN_OUTPUT_KEYS, isVerifiedUserId }

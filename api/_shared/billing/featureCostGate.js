import { ENFORCEMENT_DECISION } from '../../../src/services/billing/catalog.js'
import { BASELINE_PLAN_ID, resolveEffectivePlan } from '../../../src/services/billing/effectivePlan.js'
import { evaluateBillingOperation, isVerifiedUserId } from '../../../src/services/billing/enforcementOrchestrator.js'
import { FEATURE_COST_CLASS, getFeatureCostPolicy } from '../../../src/services/billing/featureCostPolicy.js'
import { resolveFeatureId } from '../../../src/services/billing/features.js'

/**
 * BILL-AI-COST-GATE-1: server-side cost gate in front of AI routes.
 *
 * Order (nothing cost-bearing runs before ALLOW):
 *   1 AUTH          verified user id from the server's auth check
 *   2 COST CLASS    featureCostPolicy (unknown = BLOCK_UNTIL_VERIFIED)
 *   3 PLAN          effective plan from server-read subscriptions only
 *   4 FEATURE       premiumOnly features are denied to the Free baseline
 *   5 BILLING       existing evaluateBillingOperation: feature and provider
 *                   controls, entitlement, cost safety, quota
 *   6 ALLOW         only now may the caller start provider work
 *
 * Client claims (plan, premium, remaining quota, user id) are never read as
 * authority. This does not reserve or consume quota; metered live routes
 * keep using the durable metered lifecycle for that.
 */
export const COST_GATE_DECISION = Object.freeze({
  ALLOW_FREE_NEGLIGIBLE: 'ALLOW_FREE_NEGLIGIBLE',
  DENY_COST_UNVERIFIED: 'DENY_COST_UNVERIFIED',
  DENY_NOT_REGISTERED: 'DENY_NOT_REGISTERED',
  DENY_PREMIUM_REQUIRED: 'DENY_PREMIUM_REQUIRED',
})

function decision(fields) {
  return Object.freeze({
    allowed: fields.allowed === true,
    billing: fields.billing || null,
    cost_class: fields.cost_class || null,
    decision: fields.decision,
    feature_id: fields.feature_id || null,
    provider_executed: false,
  })
}

export async function evaluateFeatureCostGate(input = {}, deps = {}) {
  const featureId = String(input.featureId || '').trim()
  const getPolicy = deps.getFeatureCostPolicy || getFeatureCostPolicy
  const resolvePlan = deps.resolveEffectivePlan || resolveEffectivePlan
  const evaluateBilling = deps.evaluateBillingOperation || evaluateBillingOperation

  if (!isVerifiedUserId(input.userId)) {
    return decision({ allowed: false, decision: ENFORCEMENT_DECISION.DENY_AUTH, feature_id: featureId })
  }

  const policy = getPolicy(featureId)
  const base = { cost_class: policy.costClass, feature_id: featureId }

  if (policy.costClass === FEATURE_COST_CLASS.FREE_NEGLIGIBLE) {
    return decision({ ...base, allowed: true, decision: COST_GATE_DECISION.ALLOW_FREE_NEGLIGIBLE })
  }
  if (policy.costClass !== FEATURE_COST_CLASS.METERED) {
    return decision({ ...base, allowed: false, decision: COST_GATE_DECISION.DENY_COST_UNVERIFIED })
  }
  if (!resolveFeatureId(featureId)) {
    return decision({ ...base, allowed: false, decision: COST_GATE_DECISION.DENY_NOT_REGISTERED })
  }

  try {
    if (policy.premiumOnly) {
      const effective = await resolvePlan({
        catalog: input.planCatalog,
        now: input.now,
        subscriptions: input.subscriptions || [],
      })
      if (!effective?.plan_id || effective.plan_id === BASELINE_PLAN_ID) {
        return decision({ ...base, allowed: false, decision: COST_GATE_DECISION.DENY_PREMIUM_REQUIRED })
      }
    }

    const billing = await evaluateBilling({
      clientClaim: input.clientClaim || {},
      featureControl: input.featureControl,
      featureId,
      now: input.now,
      planCatalog: input.planCatalog,
      providerControls: input.providerControls,
      quantity: input.quantity ?? 1,
      selectedThresholds: input.selectedThresholds,
      subscriptions: input.subscriptions || [],
      summariesByKey: input.summariesByKey,
      userId: input.userId,
    }, { inspectQuota: deps.inspectQuota })
    return decision({ ...base, allowed: billing.allowed === true, billing, decision: billing.decision })
  } catch {
    return decision({ ...base, allowed: false, decision: ENFORCEMENT_DECISION.DENY_INTERNAL })
  }
}

/** Runs `execute` only after ALLOW. A denied request makes 0 provider calls. */
export async function runCostGatedOperation(input, execute, deps = {}) {
  const gate = await evaluateFeatureCostGate(input, deps)
  if (!gate.allowed) return { executed: false, gate }
  return { executed: true, gate, result: await execute(gate) }
}

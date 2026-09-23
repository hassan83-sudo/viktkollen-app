import { describe, expect, it, vi } from 'vitest'
import {
  COST_LIMIT_MODE,
  COST_SAFETY,
  COST_THRESHOLD_PERIOD,
  COST_THRESHOLD_SCOPE,
  ENFORCEMENT_DECISION,
  FEATURE_MODE,
  PROVIDER_MODE,
  QUOTA_STATUS,
} from './catalog.js'
import { createEntitlement, numberLimit, unlimitedLimit } from './entitlementModel.js'
import { evaluateBillingOperation, FORBIDDEN_OUTPUT_KEYS } from './enforcementOrchestrator.js'
import { FINAL_REASON } from './finalCostSafety.js'
import {
  costDrivingLiveRouteCount,
  mapLiveCostOperation,
} from './liveCostOperations.js'
import { defaultPlanCatalog, getPlanById } from './planCatalog.js'
import { QUOTA_PLAN_ACTION } from './quotaReservationPlan.js'

const USER = 'a1111111-1111-4111-8111-111111111111'

const CLIENT_SPOOF = {
  amount_minor: 0,
  costDriving: false,
  costSafe: true,
  featureEnabled: true,
  ignoreHardStop: true,
  isAdmin: true,
  plan_id: 'premium',
  providerAvailable: true,
  remaining: 999999,
  user_id: 'bbbbbbbb-2222-4222-8222-222222222222',
}

function disabledFood() {
  return {
    feature_id: 'food.scan',
    mode: FEATURE_MODE.DISABLED,
    reason_code: 'MANUAL_ADMIN',
    version: 1,
  }
}

function openaiUnavailable() {
  return [{
    mode: PROVIDER_MODE.UNAVAILABLE,
    provider_id: 'openai',
    reason_code: 'PROVIDER_OUTAGE',
    version: 1,
  }]
}

function laterGateSpies() {
  return {
    executeProvider: vi.fn(async () => ({ ok: true })),
    inspectQuota: vi.fn(async () => ({ remaining: 5, status: QUOTA_STATUS.ALLOWED })),
    resolveEffectivePlan: vi.fn(),
    resolveFinalCostSafety: vi.fn(),
    resolveProviderAvailability: vi.fn(),
  }
}

async function evaluate(input = {}, deps = {}) {
  return evaluateBillingOperation({
    featureId: 'food.scan',
    quantity: 1,
    userId: USER,
    ...input,
  }, deps)
}

describe('BILL-5A live route inventory mapping', () => {
  it('maps inventoried cost-driving routes to canonical feature ids', () => {
    expect(costDrivingLiveRouteCount()).toBe(6)
    expect(mapLiveCostOperation({ path: 'api/nutrition-photo-analysis/index.js' }).feature_id).toBe('food.scan')
    expect(mapLiveCostOperation({ path: 'api/forgotten-items-analysis/index.js' }).feature_id).toBe('ai.eye.analysis')
    expect(mapLiveCostOperation({ path: 'api/adaptive-coach/index.js' }).feature_id).toBe('ai.text.request')
    expect(mapLiveCostOperation({ path: 'api/body-analysis/index.js' }).feature_id).toBe('body.scan')
    expect(mapLiveCostOperation({ path: 'api/ai-ear/interpret/index.js' }).feature_id).toBe('ai.ear.interpret')
    expect(mapLiveCostOperation({ action: 'chat', path: 'api/ai/index.js' }).feature_id).toBe('ai.text.request')
    expect(mapLiveCostOperation({ action: 'realtime-session', path: 'api/ai/index.js' }).feature_id).toBe('ai.voice.session')
  })

  it('FAIL SAFE on unknown route or ambiguous api/ai action', () => {
    expect(mapLiveCostOperation({ path: 'api/not-a-route/index.js' })).toBeNull()
    expect(mapLiveCostOperation({ path: 'api/ai/index.js' })).toBeNull()
    expect(mapLiveCostOperation({ action: 'unknown-action', path: 'api/ai/index.js' })).toBeNull()
  })
})

describe('BILL-5A enforcement orchestrator', () => {
  it('DENY_AUTH before feature/provider/plan/cost/quota and ignores client user_id', async () => {
    const resolveFeatureAvailability = vi.fn()
    const deps = { ...laterGateSpies(), resolveFeatureAvailability }
    const result = await evaluate({ clientClaim: CLIENT_SPOOF, userId: CLIENT_SPOOF.user_id.slice(0, 8) }, deps)
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_AUTH)
    expect(result.allowed).toBe(false)
    expect(resolveFeatureAvailability).toHaveBeenCalledTimes(0)
    expect(deps.resolveProviderAvailability).toHaveBeenCalledTimes(0)
    expect(deps.resolveEffectivePlan).toHaveBeenCalledTimes(0)
    expect(deps.resolveFinalCostSafety).toHaveBeenCalledTimes(0)
    expect(deps.inspectQuota).toHaveBeenCalledTimes(0)
    expect(deps.executeProvider).toHaveBeenCalledTimes(0)
  })

  it('client spoof cannot bypass a server feature disable', async () => {
    const deps = laterGateSpies()
    const result = await evaluate({
      clientClaim: CLIENT_SPOOF,
      featureControl: disabledFood(),
    }, deps)
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_FEATURE_DISABLED)
    expect(result.feature_id).toBe('food.scan')
    expect(deps.resolveProviderAvailability).toHaveBeenCalledTimes(0)
    expect(deps.resolveEffectivePlan).toHaveBeenCalledTimes(0)
    expect(deps.resolveFinalCostSafety).toHaveBeenCalledTimes(0)
    expect(deps.inspectQuota).toHaveBeenCalledTimes(0)
    expect(deps.executeProvider).toHaveBeenCalledTimes(0)
  })

  it('short-circuits provider/subscription/cost/quota when feature is disabled', async () => {
    const deps = laterGateSpies()
    const result = await evaluate({ featureControl: disabledFood() }, deps)
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_FEATURE_DISABLED)
    expect(deps.resolveProviderAvailability).toHaveBeenCalledTimes(0)
    expect(deps.resolveEffectivePlan).toHaveBeenCalledTimes(0)
    expect(deps.resolveFinalCostSafety).toHaveBeenCalledTimes(0)
    expect(deps.inspectQuota).toHaveBeenCalledTimes(0)
    expect(deps.executeProvider).toHaveBeenCalledTimes(0)
  })

  it('DENY_FEATURE_MAINTENANCE', async () => {
    const result = await evaluate({
      featureControl: {
        feature_id: 'food.scan',
        mode: FEATURE_MODE.MAINTENANCE,
        reason_code: 'MAINTENANCE',
        version: 1,
      },
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_FEATURE_MAINTENANCE)
  })

  it('provider unavailable skips cost, quota, and provider execution', async () => {
    const deps = {
      executeProvider: vi.fn(async () => ({ ok: true })),
      inspectQuota: vi.fn(async () => ({ remaining: 5, status: QUOTA_STATUS.ALLOWED })),
      resolveEffectivePlan: vi.fn(),
      resolveFinalCostSafety: vi.fn(),
    }
    const result = await evaluate({ providerControls: openaiUnavailable() }, deps)
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_PROVIDER_UNAVAILABLE)
    expect(deps.resolveFinalCostSafety).toHaveBeenCalledTimes(0)
    expect(deps.inspectQuota).toHaveBeenCalledTimes(0)
    expect(deps.executeProvider).toHaveBeenCalledTimes(0)
  })

  it('cost hard stop denies before quota inspect and provider execution', async () => {
    const deps = laterGateSpies()
    const result = await evaluate({
      selectedThresholds: [{
        amount_minor: 100,
        currency: 'SEK',
        feature_id: null,
        mode: COST_LIMIT_MODE.HARD_STOP,
        period: COST_THRESHOLD_PERIOD.DAILY,
        scope: COST_THRESHOLD_SCOPE.GLOBAL,
        threshold_id: 'hard-daily',
      }],
      summariesByKey: {
        'GLOBAL::DAILY': {
          amount_minor: 100,
          classification: 'MEASURED',
          currency: 'SEK',
          feature_id: null,
          period: COST_THRESHOLD_PERIOD.DAILY,
          scope: COST_THRESHOLD_SCOPE.GLOBAL,
        },
      },
    }, { executeProvider: deps.executeProvider, inspectQuota: deps.inspectQuota })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_COST_HARD_STOP)
    expect(deps.inspectQuota).toHaveBeenCalledTimes(0)
    expect(deps.executeProvider).toHaveBeenCalledTimes(0)
  })

  it('hard unavailable denies', async () => {
    const result = await evaluate({
      inspectQuota: undefined,
      selectedThresholds: [{
        amount_minor: 100,
        currency: 'SEK',
        feature_id: null,
        mode: COST_LIMIT_MODE.HARD_STOP,
        period: COST_THRESHOLD_PERIOD.DAILY,
        scope: COST_THRESHOLD_SCOPE.GLOBAL,
        threshold_id: 'hard-unavail',
      }],
      summariesByKey: {
        'GLOBAL::DAILY': {
          amount_minor: null,
          classification: 'UNAVAILABLE',
          currency: 'SEK',
          feature_id: null,
          period: COST_THRESHOLD_PERIOD.DAILY,
          scope: COST_THRESHOLD_SCOPE.GLOBAL,
        },
      },
    }, {
      inspectQuota: vi.fn(async () => ({ remaining: 5, status: QUOTA_STATUS.ALLOWED })),
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_COST_UNAVAILABLE)
    expect(result.cost_reason).toBe(FINAL_REASON.HARD_UNAVAILABLE)
  })

  it('soft alert allows and preserves the warning', async () => {
    const inspectQuota = vi.fn(async () => ({ remaining: 5, status: QUOTA_STATUS.ALLOWED }))
    const result = await evaluate({
      selectedThresholds: [{
        amount_minor: 100,
        currency: 'SEK',
        feature_id: null,
        mode: COST_LIMIT_MODE.SOFT_ALERT,
        period: COST_THRESHOLD_PERIOD.DAILY,
        scope: COST_THRESHOLD_SCOPE.GLOBAL,
        threshold_id: 'soft-daily',
      }],
      summariesByKey: {
        'GLOBAL::DAILY': {
          amount_minor: 100,
          classification: 'MEASURED',
          currency: 'SEK',
          feature_id: null,
          period: COST_THRESHOLD_PERIOD.DAILY,
          scope: COST_THRESHOLD_SCOPE.GLOBAL,
        },
      },
    }, { inspectQuota })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
    expect(result.allowed).toBe(true)
    expect(result.warnings[0].code).toBe(COST_SAFETY.COST_SOFT_ALERT)
    expect(result.warnings[0].reason).toBe(FINAL_REASON.SOFT_ALERT_REACHED)
  })

  it('soft unavailable allows with an explicit signal', async () => {
    const result = await evaluate({
      selectedThresholds: [{
        amount_minor: 100,
        currency: 'SEK',
        feature_id: null,
        mode: COST_LIMIT_MODE.SOFT_ALERT,
        period: COST_THRESHOLD_PERIOD.DAILY,
        scope: COST_THRESHOLD_SCOPE.GLOBAL,
        threshold_id: 'soft-unavail',
      }],
      summariesByKey: {
        'GLOBAL::DAILY': {
          amount_minor: null,
          classification: 'UNAVAILABLE',
          currency: 'SEK',
          feature_id: null,
          period: COST_THRESHOLD_PERIOD.DAILY,
          scope: COST_THRESHOLD_SCOPE.GLOBAL,
        },
      },
    }, {
      inspectQuota: vi.fn(async () => ({ remaining: 5, status: QUOTA_STATUS.ALLOWED })),
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
    expect(result.warnings[0].reason).toBe(FINAL_REASON.SOFT_UNAVAILABLE)
  })

  it('no active threshold allows without treating it as measured-safe', async () => {
    const result = await evaluate({}, {
      inspectQuota: vi.fn(async () => ({ remaining: 5, status: QUOTA_STATUS.ALLOWED })),
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
    expect(result.no_active_threshold).toBe(true)
    expect(result.cost_reason).toBe(FINAL_REASON.NO_ACTIVE_THRESHOLD)
  })

  it('quota exhausted denies with zero provider execution', async () => {
    const executeProvider = vi.fn(async () => ({}))
    const result = await evaluate({}, {
      executeProvider,
      inspectQuota: vi.fn(async () => ({ remaining: 0, status: QUOTA_STATUS.ALLOWED })),
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_QUOTA)
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(result.quota_consumed).toBe(false)
  })

  it('explicit UNLIMITED entitlement continues without quota inspect', async () => {
    const free = getPlanById('plan.free', defaultPlanCatalog)
    const catalog = [{
      ...free,
      entitlements: {
        ...free.entitlements,
        'food.scan': createEntitlement({
          enabled: true,
          feature: 'food.scan',
          limit: unlimitedLimit(),
          unit: 'requests',
        }),
      },
    }]
    const inspectQuota = vi.fn()
    const result = await evaluate({ planCatalog: catalog }, { inspectQuota })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
    expect(inspectQuota).toHaveBeenCalledTimes(0)
    expect(result.quota_plan.status).toBe(QUOTA_STATUS.UNLIMITED)
  })

  it('DENY_ENTITLEMENT when the plan disables the feature', async () => {
    const free = getPlanById('plan.free', defaultPlanCatalog)
    const catalog = [{
      ...free,
      entitlements: {
        ...free.entitlements,
        'food.scan': createEntitlement({
          enabled: false,
          feature: 'food.scan',
          limit: numberLimit(0),
          unit: 'requests',
        }),
      },
    }]
    const inspectQuota = vi.fn()
    const resolveFinalCostSafety = vi.fn()
    const result = await evaluate({ planCatalog: catalog }, { inspectQuota, resolveFinalCostSafety })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_ENTITLEMENT)
    expect(resolveFinalCostSafety).toHaveBeenCalledTimes(0)
    expect(inspectQuota).toHaveBeenCalledTimes(0)
  })

  it('all gates allow but still execute zero provider calls', async () => {
    const executeProvider = vi.fn(async () => ({}))
    const result = await evaluate({ clientClaim: CLIENT_SPOOF }, { executeProvider, inspectQuota: vi.fn(async () => ({ remaining: 4, status: QUOTA_STATUS.ALLOWED })) })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
    expect(result.allowed).toBe(true)
    expect(result.live_enforcement).toBe(false)
    expect(result.provider_executed).toBe(false)
    expect(result.quota_plan.action).toBe(QUOTA_PLAN_ACTION.RESERVE_ON_EXECUTE)
    expect(result.quota_plan.consume).toBe(false)
    expect(executeProvider).toHaveBeenCalledTimes(0)
    for (const key of FORBIDDEN_OUTPUT_KEYS) {
      expect(result).not.toHaveProperty(key)
    }
  })

  it('LOCAL_FREE skips provider and cost resolvers', async () => {
    const resolveProviderAvailability = vi.fn()
    const resolveFinalCostSafety = vi.fn()
    const inspectQuota = vi.fn()
    const result = await evaluateBillingOperation({
      featureId: 'friend_chat',
      userId: USER,
    }, { inspectQuota, resolveFinalCostSafety, resolveProviderAvailability })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
    expect(resolveProviderAvailability).toHaveBeenCalledTimes(0)
    expect(resolveFinalCostSafety).toHaveBeenCalledTimes(0)
    expect(inspectQuota).toHaveBeenCalledTimes(0)
  })

  it('PARTIAL still checks the required external provider', async () => {
    const resolveProviderAvailability = vi.fn(async (args) => {
      expect(args.providerId).toBe('openai')
      return { result: 'PROVIDER_AVAILABLE' }
    })
    const result = await evaluateBillingOperation({
      featureId: 'ai.voice.session',
      providerControls: openaiUnavailable(),
      userId: USER,
    }, {
      inspectQuota: vi.fn(async () => ({ remaining: 5, status: QUOTA_STATUS.ALLOWED })),
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_PROVIDER_UNAVAILABLE)
    void resolveProviderAvailability
  })

  it('unknown feature FAIL SAFE', async () => {
    const result = await evaluate({ featureId: 'not.a.feature' })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.INVALID_OPERATION)
    expect(result.reason_codes).toContain('UNKNOWN_FEATURE')
  })

  it('unknown required provider FAIL SAFE', async () => {
    const result = await evaluate({}, {
      requiredProvidersForFeature: () => ['not-a-provider'],
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.INVALID_OPERATION)
    expect(result.reason_codes).toContain('UNKNOWN_PROVIDER')
  })

  it('dependency throw is fail-safe DENY_INTERNAL with no provider execution', async () => {
    const executeProvider = vi.fn()
    const result = await evaluate({}, {
      executeProvider,
      resolveFeatureAvailability: async () => {
        throw new Error('boom stack should not leak')
      },
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_INTERNAL)
    expect(JSON.stringify(result)).not.toMatch(/boom stack/)
    expect(executeProvider).toHaveBeenCalledTimes(0)
  })

  it('ignores client plan_id for effective plan', async () => {
    const result = await evaluate({
      clientClaim: { plan_id: 'plan.does.not.exist', remaining: 999999 },
    }, {
      inspectQuota: vi.fn(async () => ({ remaining: 5, status: QUOTA_STATUS.ALLOWED })),
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
  })
})

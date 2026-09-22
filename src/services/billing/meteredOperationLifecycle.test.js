import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENFORCEMENT_DECISION, QUOTA_STATUS, RESERVATION_STATUS } from './catalog.js'
import { evaluateBillingOperation } from './enforcementOrchestrator.js'
import {
  classifyFoodScanProviderOutcome,
  createScopedOperationId,
  FOOD_SCAN_CANARY,
  foodScanUsageEventPlan,
  PROVIDER_BILLING_CLASS,
  stripSensitiveBillingPayload,
} from './foodScanCanary.js'
import { mapLiveCostOperation } from './liveCostOperations.js'
import {
  executeMeteredBillingOperation,
  LIFECYCLE_OUTCOME,
  resetMeteredLifecycleInflightForTests,
} from './meteredOperationLifecycle.js'
import { createQuotaEngine } from './quotaEngine.js'
import { QUOTA_PLAN_ACTION } from './quotaReservationPlan.js'

const USER = 'a1111111-1111-4111-8111-111111111111'
const OP = 'op_food_scan_canary_test_0001'

const ALLOW = {
  allowed: true,
  decision: ENFORCEMENT_DECISION.ALLOW,
  feature_id: 'food.scan',
  quota_plan: {
    action: QUOTA_PLAN_ACTION.RESERVE_ON_EXECUTE,
    consume: false,
    quantity: 1,
    status: QUOTA_STATUS.ALLOWED,
  },
  warnings: [],
}

function allowEvaluate(extra = {}) {
  return vi.fn(async () => ({ ...ALLOW, ...extra }))
}

afterEach(() => {
  resetMeteredLifecycleInflightForTests()
})

describe('BILL-5B1 food.scan canary mapping', () => {
  it('confirms the live nutrition-photo route is food.scan / openai / requests', () => {
    const mapped = mapLiveCostOperation({ path: FOOD_SCAN_CANARY.route })
    expect(mapped.feature_id).toBe('food.scan')
    expect(FOOD_SCAN_CANARY.provider_id).toBe('openai')
    expect(FOOD_SCAN_CANARY.quantity).toBe(1)
    expect(FOOD_SCAN_CANARY.unit).toBe('requests')
    const source = readFileSync(new URL('../../../api/nutrition-photo-analysis/index.js', import.meta.url), 'utf8')
    expect(source).toContain("feature: 'food.scan'")
    expect(source).not.toMatch(/executeMeteredBillingOperation|meteredOperationLifecycle/)
  })
})

describe('BILL-5B1 metered lifecycle adapter', () => {
  it('early evaluate deny: reserve/provider/commit/rollback = 0', async () => {
    const reserve = vi.fn()
    const executeProvider = vi.fn()
    const commit = vi.fn()
    const rollback = vi.fn()
    const result = await executeMeteredBillingOperation({
      commit,
      evaluate: vi.fn(async () => ({ allowed: false, decision: ENFORCEMENT_DECISION.DENY_COST_HARD_STOP })),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider,
      operationId: OP,
      reserve,
      rollback,
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.DENIED_EVALUATE)
    expect(result.calls.reserve).toBe(0)
    expect(result.calls.provider).toBe(0)
    expect(result.calls.commit).toBe(0)
    expect(result.calls.rollback).toBe(0)
    expect(executeProvider).toHaveBeenCalledTimes(0)
  })

  it('reserve deny: provider = 0', async () => {
    const executeProvider = vi.fn()
    const result = await executeMeteredBillingOperation({
      commit: vi.fn(),
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider,
      operationId: OP,
      reserve: vi.fn(async () => ({ status: QUOTA_STATUS.DENIED_QUOTA_EXCEEDED })),
      rollback: vi.fn(),
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.DENIED_RESERVE)
    expect(result.calls.provider).toBe(0)
    expect(executeProvider).toHaveBeenCalledTimes(0)
  })

  it('success order is evaluate → reserve → provider → commit', async () => {
    const result = await executeMeteredBillingOperation({
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => ({ ok: true })),
      operationId: OP,
      reserve: vi.fn(async ({ reservation_id }) => ({
        reservation_id,
        status: QUOTA_STATUS.RESERVED,
      })),
      rollback: vi.fn(),
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(result.order).toEqual(['evaluate', 'reserve', 'provider', 'commit'])
    expect(result.quota_consumed).toBe(true)
    expect(result.live_wired).toBe(false)
  })

  it('provider failure before start rolls back and sanitizes the error', async () => {
    const rollback = vi.fn(async () => ({ status: QUOTA_STATUS.ROLLED_BACK }))
    const result = await executeMeteredBillingOperation({
      commit: vi.fn(),
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => {
        throw Object.assign(new Error('openai key sk-secret-should-not-leak'), {
          code: 'serverConfiguration',
          providerRequestStarted: false,
        })
      }),
      operationId: OP,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.PROVIDER_FAILED)
    expect(result.order).toEqual(['evaluate', 'reserve', 'provider', 'rollback'])
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toMatch(/sk-secret/)
    expect(result.safe_error.code).toBe(LIFECYCLE_OUTCOME.PROVIDER_FAILED)
  })

  it('commit failure after provider success is fail-safe and does not rollback', async () => {
    const rollback = vi.fn()
    const result = await executeMeteredBillingOperation({
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.DENIED_UNKNOWN_FEATURE })),
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => ({ ok: true })),
      operationId: OP,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.COMMIT_FAILED)
    expect(result.needs_recovery).toBe(true)
    expect(rollback).toHaveBeenCalledTimes(0)
  })

  it('timeout after the provider request started commits actual 1 (not a blind rollback)', async () => {
    const commit = vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED }))
    const rollback = vi.fn()
    const result = await executeMeteredBillingOperation({
      commit,
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => ({
        code: 'timeout',
        ok: false,
        providerRequestStarted: true,
        timeout: true,
      })),
      operationId: OP,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING)
    expect(result.provider_billing_class).toBe(PROVIDER_BILLING_CLASS.UNKNOWN_MAY_BE_BILLED)
    expect(commit).toHaveBeenCalledWith({ actual_quantity: 1, reservation_id: OP })
    expect(rollback).toHaveBeenCalledTimes(0)
  })

  it('abort before the provider request started rolls back', async () => {
    const rollback = vi.fn(async () => ({ status: QUOTA_STATUS.ROLLED_BACK }))
    const result = await executeMeteredBillingOperation({
      commit: vi.fn(),
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => ({
        aborted: true,
        code: 'requestAborted',
        ok: false,
        providerRequestStarted: false,
      })),
      operationId: OP,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.ABORTED)
    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('same operation id does not double-charge after a committed reservation', async () => {
    const quota = createQuotaEngine()
    const executeProvider = vi.fn(async () => ({ ok: true }))
    const deps = {
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider,
      operationId: OP,
      reserve: (input) => quota.reserveQuota(input),
      commit: (input) => quota.commitReservation(input),
      rollback: (input) => quota.rollbackReservation(input),
    }
    const first = await executeMeteredBillingOperation(deps)
    const second = await executeMeteredBillingOperation(deps)
    expect(first.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(second.outcome).toBe(LIFECYCLE_OUTCOME.ALREADY_COMPLETED)
    expect(executeProvider).toHaveBeenCalledTimes(1)
    expect(second.calls.provider).toBe(0)
    expect(second.already_completed).toBe(true)
  })

  it('double commit is idempotent on the BILL-2 engine', async () => {
    const quota = createQuotaEngine()
    const reserved = await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    expect(reserved.status).toBe(QUOTA_STATUS.RESERVED)
    const first = await quota.commitReservation({ actual_quantity: 1, reservation_id: OP })
    const second = await quota.commitReservation({ actual_quantity: 1, reservation_id: OP })
    expect(first.status).toBe(QUOTA_STATUS.COMMITTED)
    expect(second.status).toBe(QUOTA_STATUS.COMMITTED)
  })

  it('double rollback is idempotent', async () => {
    const quota = createQuotaEngine()
    await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: `${OP}_rb`,
      unit: 'requests',
      user: USER,
    })
    const first = await quota.rollbackReservation({ reservation_id: `${OP}_rb` })
    const second = await quota.rollbackReservation({ reservation_id: `${OP}_rb` })
    expect(first.status).toBe(QUOTA_STATUS.ROLLED_BACK)
    expect(second.status).toBe(QUOTA_STATUS.ROLLED_BACK)
  })

  it('commit after rollback is blocked by the BILL-2 state machine', async () => {
    const quota = createQuotaEngine()
    await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: `${OP}_car`,
      unit: 'requests',
      user: USER,
    })
    await quota.rollbackReservation({ reservation_id: `${OP}_car` })
    const committed = await quota.commitReservation({ actual_quantity: 1, reservation_id: `${OP}_car` })
    expect(committed.status).toBe(RESERVATION_STATUS.ROLLED_BACK)
  })

  it('rollback after commit is blocked', async () => {
    const quota = createQuotaEngine()
    await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: `${OP}_rac`,
      unit: 'requests',
      user: USER,
    })
    await quota.commitReservation({ actual_quantity: 1, reservation_id: `${OP}_rac` })
    const rolled = await quota.rollbackReservation({ reservation_id: `${OP}_rac` })
    expect(rolled.status).toBe(QUOTA_STATUS.COMMITTED)
  })

  it('privacy: image/base64/prompt/response/token never enter billing metadata or logs', async () => {
    const logs = []
    const dirty = {
      base64: 'aaaa',
      image: 'fake-bytes',
      prompt: 'Du analyserar en matbild',
      response: '{"calories":1}',
      token: 'secret-token',
    }
    expect(stripSensitiveBillingPayload(dirty)).toEqual({})
    const usage = foodScanUsageEventPlan({ operationId: OP, userId: USER })
    expect(JSON.stringify(usage)).not.toMatch(/matbild|fake-bytes|secret-token|calories/)
    await executeMeteredBillingOperation({
      clientClaim: dirty,
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => ({ ok: true, ...dirty })),
      log: (entry) => logs.push(entry),
      operationId: OP,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback: vi.fn(),
    })
    expect(JSON.stringify(logs)).not.toMatch(/fake-bytes|matbild|secret-token/)
  })

  it('client spoof cannot change feature, quantity, or plan authority', async () => {
    const evaluate = vi.fn(async (input) => {
      expect(input.featureId).toBe('food.scan')
      expect(input.quantity).toBe(1)
      expect(input.clientClaim.plan_id).toBe('premium')
      return ALLOW
    })
    const reserve = vi.fn(async (input) => {
      expect(input.feature).toBe('food.scan')
      expect(input.quantity).toBe(1)
      expect(input.clientClaim.plan_id).toBeUndefined()
      return { reservation_id: OP, status: QUOTA_STATUS.RESERVED }
    })
    await executeMeteredBillingOperation({
      clientClaim: {
        costSafe: true,
        feature: 'friend_chat',
        plan_id: 'premium',
        quantity: 0,
        remaining: 999,
      },
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      evaluate,
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => ({ ok: true })),
      operationId: OP,
      reserve,
      rollback: vi.fn(),
    })
    expect(evaluate).toHaveBeenCalled()
    expect(createScopedOperationId({
      clientAttemptId: 'client-1',
      userId: USER,
    })).toBe(createScopedOperationId({
      clientAttemptId: 'client-1',
      userId: USER,
    }))
    expect(createScopedOperationId({
      clientAttemptId: 'client-1',
      userId: USER,
    })).not.toBe(createScopedOperationId({
      clientAttemptId: 'client-1',
      userId: 'b1111111-1111-4111-8111-111111111111',
    }))
  })

  it('real evaluate + cost hard stop never reserves or calls the provider', async () => {
    const reserve = vi.fn()
    const executeProvider = vi.fn()
    const result = await executeMeteredBillingOperation({
      commit: vi.fn(),
      evaluate: evaluateBillingOperation,
      evaluateInput: {
        featureId: 'food.scan',
        selectedThresholds: [{
          amount_minor: 10,
          currency: 'SEK',
          feature_id: null,
          mode: 'HARD_STOP',
          period: 'DAILY',
          scope: 'GLOBAL',
          threshold_id: 'hard',
        }],
        summariesByKey: {
          'GLOBAL::DAILY': {
            amount_minor: 10,
            classification: 'MEASURED',
            currency: 'SEK',
            feature_id: null,
            period: 'DAILY',
            scope: 'GLOBAL',
          },
        },
        userId: USER,
      },
      executeProvider,
      operationId: OP,
      reserve,
      rollback: vi.fn(),
    })
    expect(result.decision).toBe(ENFORCEMENT_DECISION.DENY_COST_HARD_STOP)
    expect(reserve).toHaveBeenCalledTimes(0)
    expect(executeProvider).toHaveBeenCalledTimes(0)
  })

  it('soft cost warning is preserved into reserve', async () => {
    const result = await executeMeteredBillingOperation({
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      evaluate: allowEvaluate({
        warnings: [{ code: 'COST_SOFT_ALERT', reason: 'SOFT_ALERT_REACHED' }],
      }),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => ({ ok: true })),
      operationId: OP,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback: vi.fn(),
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(result.warnings[0].code).toBe('COST_SOFT_ALERT')
  })

  it('unknown provider failure class is not a silent rollback', () => {
    expect(classifyFoodScanProviderOutcome({
      ok: false,
      parseError: true,
    })).toBe(PROVIDER_BILLING_CLASS.UNKNOWN_MAY_BE_BILLED)
  })
})

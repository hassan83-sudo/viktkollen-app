import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENFORCEMENT_DECISION, QUOTA_STATUS } from './catalog.js'
import {
  classifyFoodScanProviderOutcome,
  createBillingAccountingIdentity,
  createDispatchBoundedProvider,
  createScopedOperationId,
  IMAGE_DEDUP_ROLE,
  normalizeClientAttemptId,
  PROVIDER_DISPATCH_STATE,
} from './foodScanCanary.js'
import {
  executeMeteredBillingOperation,
  LIFECYCLE_OUTCOME,
  resetMeteredLifecycleInflightForTests,
} from './meteredOperationLifecycle.js'
import { createQuotaEngine } from './quotaEngine.js'
import { QUOTA_PLAN_ACTION } from './quotaReservationPlan.js'
import { recordUsageEvent } from './recordUsage.js'
import { createInMemoryUsageRepository } from './usageRepository.js'

const USER = 'a1111111-1111-4111-8111-111111111111'
const OP = 'op_food_scan_5b1a_identity_01'

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

function allowEvaluate() {
  return vi.fn(async () => ALLOW)
}

function base(extra = {}) {
  return {
    evaluate: allowEvaluate(),
    evaluateInput: { featureId: 'food.scan', userId: USER },
    operationId: OP,
    ...extra,
  }
}

afterEach(() => {
  resetMeteredLifecycleInflightForTests()
})

describe('BILL-5B1a dispatch classification', () => {
  it('does not treat HTTP 502/504 as proven non-billable', () => {
    expect(classifyFoodScanProviderOutcome({
      code: 'providerUnavailable',
      ok: false,
      providerRequestStarted: true,
      status: 502,
    })).toBe(PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN)
    expect(classifyFoodScanProviderOutcome({
      code: 'timeout',
      ok: false,
      providerRequestStarted: true,
      status: 504,
    })).toBe(PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN)
    expect(classifyFoodScanProviderOutcome({
      code: 'providerUnavailable',
      ok: false,
      providerRequestStarted: true,
      status: 502,
    })).not.toBe(PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_FAILURE_NOT_BILLABLE)
  })

  it('image dedup is not billing authority', () => {
    expect(IMAGE_DEDUP_ROLE.billing_authority).toBe(false)
    const left = createScopedOperationId({ clientAttemptId: 'attempt-01', userId: USER })
    const right = createScopedOperationId({ clientAttemptId: 'attempt-01', userId: USER })
    expect(left).toBe(right)
    expect(left).not.toMatch(/image|hash|base64/i)
    expect(normalizeClientAttemptId('short')).toBe('')
    expect(normalizeClientAttemptId('good-id-01')).toBe('good-id-01')
  })

  it('reservation_id and usage event_id are the same BILL-1-compatible identity', () => {
    const identity = createBillingAccountingIdentity(OP)
    expect(identity.operation_id).toBe(OP)
    expect(identity.reservation_id).toBe(OP)
    expect(identity.event_id).toBe(OP)
    expect(identity.event_id.length).toBeLessThanOrEqual(180)
  })
})

describe('BILL-5B1a failure accounting', () => {
  it('deny before reserve never dispatches', async () => {
    const executeProvider = vi.fn()
    const result = await executeMeteredBillingOperation(base({
      commit: vi.fn(),
      evaluate: vi.fn(async () => ({ allowed: false, decision: ENFORCEMENT_DECISION.DENY_ENTITLEMENT })),
      executeProvider,
      reserve: vi.fn(),
      rollback: vi.fn(),
    }))
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.DENIED_EVALUATE)
    expect(result.calls.reserve).toBe(0)
    expect(executeProvider).toHaveBeenCalledTimes(0)
  })

  it('reserve failure never dispatches', async () => {
    const executeProvider = vi.fn()
    const result = await executeMeteredBillingOperation(base({
      commit: vi.fn(),
      executeProvider,
      reserve: vi.fn(async () => ({ status: QUOTA_STATUS.DENIED_QUOTA_EXCEEDED })),
      rollback: vi.fn(),
    }))
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.DENIED_RESERVE)
    expect(executeProvider).toHaveBeenCalledTimes(0)
  })

  it('timeout before dispatch rolls back', async () => {
    const rollback = vi.fn(async () => ({ status: QUOTA_STATUS.ROLLED_BACK }))
    const result = await executeMeteredBillingOperation(base({
      commit: vi.fn(),
      executeProvider: vi.fn(async () => ({
        code: 'timeout',
        ok: false,
        providerRequestStarted: false,
        timeout: true,
      })),
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    }))
    expect(result.dispatch_state).toBe(PROVIDER_DISPATCH_STATE.NOT_DISPATCHED)
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(result.calls.commit).toBe(0)
  })

  it('timeout after dispatch commits 1 and does not roll back', async () => {
    const commit = vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED }))
    const rollback = vi.fn()
    const result = await executeMeteredBillingOperation(base({
      commit,
      executeProvider: async ({ markDispatched }) => {
        await markDispatched()
        return { code: 'timeout', ok: false, timeout: true }
      },
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    }))
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING)
    expect(result.dispatch_state).toBe(PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN)
    expect(commit).toHaveBeenCalledWith({ actual_quantity: 1, reservation_id: OP })
    expect(rollback).toHaveBeenCalledTimes(0)
  })

  it('502-like after dispatch is unknown billing, not a free rollback', async () => {
    const rollback = vi.fn()
    const result = await executeMeteredBillingOperation(base({
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      executeProvider: createDispatchBoundedProvider(async () => ({
        code: 'providerUnavailable',
        ok: false,
        status: 502,
      })),
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    }))
    expect(result.dispatch_state).toBe(PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN)
    expect(rollback).toHaveBeenCalledTimes(0)
    expect(result.calls.commit).toBe(1)
  })

  it('abort before dispatch rolls back', async () => {
    const rollback = vi.fn(async () => ({ status: QUOTA_STATUS.ROLLED_BACK }))
    const result = await executeMeteredBillingOperation(base({
      commit: vi.fn(),
      executeProvider: vi.fn(async () => ({
        aborted: true,
        code: 'requestAborted',
        ok: false,
        providerRequestStarted: false,
      })),
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    }))
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.ABORTED)
    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('abort after dispatch is unknown billing', async () => {
    const rollback = vi.fn()
    const result = await executeMeteredBillingOperation(base({
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      executeProvider: async ({ markDispatched }) => {
        await markDispatched()
        return { aborted: true, code: 'requestAborted', ok: false }
      },
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    }))
    expect(result.dispatch_state).toBe(PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN)
    expect(rollback).toHaveBeenCalledTimes(0)
  })

  it('success writes one reservation and one usage event with the same id', async () => {
    const usageRepository = createInMemoryUsageRepository()
    const quota = createQuotaEngine({ usageRepository })
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const result = await executeMeteredBillingOperation(base({
      commit: (input) => quota.commitReservation(input),
      executeProvider,
      recordUsage: (input) => recordUsageEvent(input, usageRepository),
      reserve: (input) => quota.reserveQuota(input),
      rollback: (input) => quota.rollbackReservation(input),
    }))
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(result.event_id).toBe(OP)
    expect(result.reservation_id).toBe(OP)
    expect(result.order).toEqual(['evaluate', 'reserve', 'provider', 'commit', 'usage'])
    const events = await usageRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].event_id).toBe(OP)
    const inspect = await quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId: USER })
    expect(inspect.used).toBe(1)
  })

  it('commit failure after success does not rollback and retries without provider', async () => {
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const commit = vi.fn()
      .mockResolvedValueOnce({ status: QUOTA_STATUS.DENIED_UNKNOWN_FEATURE })
      .mockResolvedValueOnce({ status: QUOTA_STATUS.COMMITTED })
    const rollback = vi.fn()
    const first = await executeMeteredBillingOperation(base({
      commit,
      executeProvider,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback,
    }))
    const second = await executeMeteredBillingOperation(base({
      commit,
      executeProvider,
      recordUsage: vi.fn(async () => ({ ok: true })),
      reserve: vi.fn(),
      rollback,
    }))
    expect(first.outcome).toBe(LIFECYCLE_OUTCOME.COMMIT_FAILED)
    expect(first.needs_recovery).toBe(true)
    expect(rollback).toHaveBeenCalledTimes(0)
    expect(second.calls.provider).toBe(0)
    expect(executeProvider).toHaveBeenCalledTimes(1)
    expect(second.outcome).toBe(LIFECYCLE_OUTCOME.ALREADY_COMPLETED)
  })

  it('usage-event failure after commit retries usage only', async () => {
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const recordUsage = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: 'record_failed' })
      .mockResolvedValueOnce({ ok: true })
    const first = await executeMeteredBillingOperation(base({
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      executeProvider,
      recordUsage,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback: vi.fn(),
    }))
    const second = await executeMeteredBillingOperation(base({
      commit: vi.fn(),
      executeProvider,
      recordUsage,
      reserve: vi.fn(),
      rollback: vi.fn(),
    }))
    expect(first.outcome).toBe(LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED)
    expect(second.outcome).toBe(LIFECYCLE_OUTCOME.ALREADY_COMPLETED)
    expect(executeProvider).toHaveBeenCalledTimes(1)
    expect(recordUsage).toHaveBeenCalledTimes(2)
    expect(recordUsage.mock.calls[0][0].event_id).toBe(OP)
    expect(recordUsage.mock.calls[1][0].event_id).toBe(OP)
  })

  it('retry after success does not call provider or write a second usage event', async () => {
    const usageRepository = createInMemoryUsageRepository()
    const quota = createQuotaEngine({ usageRepository })
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const deps = base({
      commit: (input) => quota.commitReservation(input),
      executeProvider,
      recordUsage: (input) => recordUsageEvent(input, usageRepository),
      reserve: (input) => quota.reserveQuota(input),
      rollback: (input) => quota.rollbackReservation(input),
    })
    await executeMeteredBillingOperation(deps)
    const second = await executeMeteredBillingOperation(deps)
    expect(second.outcome).toBe(LIFECYCLE_OUTCOME.ALREADY_COMPLETED)
    expect(executeProvider).toHaveBeenCalledTimes(1)
    expect((await usageRepository.list())).toHaveLength(1)
  })

  it('retry after ambiguous failure blocks provider re-execution', async () => {
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { code: 'timeout', ok: false, timeout: true }
    })
    const deps = base({
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      executeProvider,
      recordUsage: vi.fn(async () => ({ ok: true })),
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback: vi.fn(),
    })
    const first = await executeMeteredBillingOperation(deps)
    const second = await executeMeteredBillingOperation(deps)
    expect(first.outcome).toBe(LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING)
    expect(second.provider_blocked).toBe(true)
    expect(executeProvider).toHaveBeenCalledTimes(1)
  })

  it('concurrent double submit starts the provider once', async () => {
    let providerRuns = 0
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      providerRuns += 1
      await markDispatched()
      await gate
      return { ok: true }
    })
    const deps = base({
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      executeProvider,
      recordUsage: vi.fn(async () => ({ ok: true })),
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback: vi.fn(),
    })
    const pending = [
      executeMeteredBillingOperation(deps),
      executeMeteredBillingOperation(deps),
    ]
    await vi.waitFor(() => {
      expect(providerRuns).toBe(1)
    })
    release()
    const [left, right] = await Promise.all(pending)
    expect(left.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(right.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(executeProvider).toHaveBeenCalledTimes(1)
  })

  it('retry after rollback requires a new operation id', async () => {
    const executeProvider = vi.fn(async () => ({
      code: 'serverConfiguration',
      ok: false,
      providerRequestStarted: false,
    }))
    const deps = base({
      commit: vi.fn(),
      executeProvider,
      reserve: vi.fn(async ({ reservation_id }) => ({ reservation_id, status: QUOTA_STATUS.RESERVED })),
      rollback: vi.fn(async () => ({ status: QUOTA_STATUS.ROLLED_BACK })),
    })
    const first = await executeMeteredBillingOperation(deps)
    const second = await executeMeteredBillingOperation(deps)
    expect(first.calls.rollback).toBe(1)
    expect(second.outcome).toBe(LIFECYCLE_OUTCOME.RETRY_REQUIRES_NEW_OPERATION)
    expect(executeProvider).toHaveBeenCalledTimes(1)
  })

  it('privacy and client spoof cannot change accounting identity', async () => {
    const result = await executeMeteredBillingOperation({
      clientClaim: {
        costSafe: true,
        feature: 'ai.text.request',
        image: 'bytes',
        plan_id: 'premium',
        prompt: 'secret meal prompt',
        quantity: 0,
        remaining: 999,
        token: 'sk-live',
      },
      commit: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      evaluate: allowEvaluate(),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider: vi.fn(async () => ({ ok: true, response: 'nutrition json' })),
      operationId: OP,
      reserve: vi.fn(async ({ reservation_id, quantity }) => {
        expect(quantity).toBe(1)
        expect(reservation_id).toBe(OP)
        return { reservation_id, status: QUOTA_STATUS.RESERVED }
      }),
      rollback: vi.fn(),
    })
    const blob = JSON.stringify(result)
    expect(blob).not.toMatch(/secret meal|sk-live|nutrition json|bytes/)
    expect(result.event_id).toBe(OP)
    expect(result.feature_id).toBe('food.scan')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENFORCEMENT_DECISION, QUOTA_STATUS } from './catalog.js'
import {
  createDurableOperationStore,
  createUsageBackedDispatchStore,
  FOOD_SCAN_RECOVERY_HTTP,
} from './durableOperationStore.js'
import { foodScanUsageEventPlan } from './foodScanCanary.js'
import {
  executeMeteredBillingOperation,
  LIFECYCLE_OUTCOME,
  resetMeteredLifecycleInflightForTests,
} from './meteredOperationLifecycle.js'
import { createQuotaEngine } from './quotaEngine.js'
import { QUOTA_PLAN_ACTION } from './quotaReservationPlan.js'
import { recordUsageEvent } from './recordUsage.js'
import { createInMemoryReservationStore } from './reservationStore.js'
import { createInMemoryUsageRepository } from './usageRepository.js'

const USER = 'a1111111-1111-4111-8111-111111111111'
const OP = 'op_food_scan_5b1b_crash_01'
const OP_B = 'op_food_scan_5b1b_crash_02'

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

afterEach(() => {
  resetMeteredLifecycleInflightForTests()
})

function sharedQuota() {
  const usageRepository = createInMemoryUsageRepository()
  const reservations = createInMemoryReservationStore()
  const quota = createQuotaEngine({ reservations, usageRepository })
  const recordUsage = (input) => recordUsageEvent(input, usageRepository)
  const operationStore = createUsageBackedDispatchStore({ recordUsage, usageRepository })
  return { operationStore, quota, recordUsage, usageRepository }
}

function depsFor(shared, instanceKey, extra = {}) {
  return {
    commit: (input) => shared.quota.commitReservation(input),
    evaluate: vi.fn(async () => ALLOW),
    evaluateInput: { featureId: 'food.scan', userId: USER },
    instanceKey,
    operationId: extra.operationId || OP,
    operationStore: shared.operationStore,
    recordUsage: shared.recordUsage,
    reserve: (input) => shared.quota.reserveQuota(input),
    rollback: (input) => shared.quota.rollbackReservation(input),
    ...extra,
  }
}

describe('BILL-5B1b crash recovery', () => {
  it('two isolated instances sharing durable backends execute the provider once', async () => {
    const shared = sharedQuota()
    let runs = 0
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      const claim = await markDispatched()
      if (claim?.claimed === false) {
        return { ok: false, providerRequestStarted: true, code: 'alreadyDispatched' }
      }
      runs += 1
      return { ok: true }
    })
    await Promise.all([
      executeMeteredBillingOperation(depsFor(shared, 'isolate-a', { executeProvider })),
      executeMeteredBillingOperation(depsFor(shared, 'isolate-b', { executeProvider })),
    ])
    expect(runs).toBe(1)
    expect((await shared.usageRepository.list())).toHaveLength(1)
    expect((await shared.usageRepository.list())[0].cost_basis).toBe('UNAVAILABLE')
    expect((await shared.usageRepository.list())[0].metadata.usage_basis).toBe('UNAVAILABLE')
  })

  it('crash after reserve without dispatch mark allows rollback on a new instance', async () => {
    const shared = sharedQuota()
    await shared.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    const executeProvider = vi.fn(async () => ({
      ok: false,
      providerRequestStarted: false,
      code: 'timeout',
      timeout: true,
    }))
    const result = await executeMeteredBillingOperation(depsFor(shared, 'isolate-b', { executeProvider }))
    expect(result.dispatch_state).toBe('NOT_DISPATCHED')
    expect(executeProvider).toHaveBeenCalledTimes(1)
    const again = await shared.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    expect(again.status).toBe(QUOTA_STATUS.ROLLED_BACK)
  })

  it('crash after durable dispatch mark does not re-call the provider', async () => {
    const shared = sharedQuota()
    await shared.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    const claimed = await shared.operationStore.claimDispatch(OP, { userId: USER })
    expect(claimed.claimed).toBe(true)
    const executeProvider = vi.fn()
    const result = await executeMeteredBillingOperation(depsFor(shared, 'isolate-b', { executeProvider }))
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(result.provider_blocked).toBe(true)
    expect(result.dispatch_state).toBe('DISPATCHED_BILLING_UNKNOWN')
  })

  it('crash after provider success recovers accounting only', async () => {
    const store = createDurableOperationStore()
    const shared = sharedQuota()
    await shared.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    await store.claimDispatch(OP, { userId: USER })
    await store.put(OP, {
      dispatch_started: true,
      dispatch_state: 'DISPATCHED_CONFIRMED_SUCCESS',
    })
    const executeProvider = vi.fn()
    const result = await executeMeteredBillingOperation({
      ...depsFor(shared, 'isolate-b', { executeProvider }),
      operationStore: store,
    })
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(result.calls.provider).toBe(0)
    const inspect = await shared.quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId: USER })
    expect(inspect.used).toBe(1)
  })

  it('crash after commit with missing usage event inserts the same event id', async () => {
    const usageRepository = createInMemoryUsageRepository()
    const quota = createQuotaEngine({ usageRepository })
    await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    await quota.commitReservation({ actual_quantity: 1, reservation_id: OP })
    const store = createDurableOperationStore()
    await store.put(OP, {
      dispatch_started: true,
      dispatch_state: 'DISPATCHED_CONFIRMED_SUCCESS',
      quota_committed: true,
      usage_ok: false,
    })
    const executeProvider = vi.fn()
    const result = await executeMeteredBillingOperation({
      commit: (input) => quota.commitReservation(input),
      evaluate: vi.fn(async () => ALLOW),
      evaluateInput: { featureId: 'food.scan', userId: USER },
      executeProvider,
      instanceKey: 'isolate-b',
      operationId: OP,
      operationStore: store,
      recordUsage: (input) => recordUsageEvent(input, usageRepository),
      reserve: (input) => quota.reserveQuota(input),
      rollback: (input) => quota.rollbackReservation(input),
    })
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.ALREADY_COMPLETED)
    expect((await usageRepository.list())).toHaveLength(1)
    expect((await usageRepository.list())[0].event_id).toBe(OP)
    const secondCommit = await quota.commitReservation({ actual_quantity: 1, reservation_id: OP })
    expect(secondCommit.status).toBe(QUOTA_STATUS.COMMITTED)
  })

  it('response loss: completed operation retry does not charge again', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    await executeMeteredBillingOperation(depsFor(shared, 'isolate-a', { executeProvider }))
    const retry = await executeMeteredBillingOperation(depsFor(shared, 'isolate-b', { executeProvider }))
    expect(retry.already_completed || retry.outcome === LIFECYCLE_OUTCOME.ALREADY_COMPLETED).toBe(true)
    expect(executeProvider).toHaveBeenCalledTimes(1)
    expect((await shared.usageRepository.list())).toHaveLength(1)
  })

  it('two recoverers repair usage/commit idempotently', async () => {
    const shared = sharedQuota()
    await shared.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    await shared.operationStore.claimDispatch(OP, { userId: USER })
    const executeProvider = vi.fn()
    const [left, right] = await Promise.all([
      executeMeteredBillingOperation(depsFor(shared, 'recover-a', { executeProvider })),
      executeMeteredBillingOperation(depsFor(shared, 'recover-b', { executeProvider })),
    ])
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(left.provider_blocked).toBe(true)
    expect(right.provider_blocked).toBe(true)
    expect((await shared.usageRepository.list())).toHaveLength(1)
  })

  it('different operation ids do not block each other', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const [left, right] = await Promise.all([
      executeMeteredBillingOperation(depsFor(shared, 'a', { executeProvider, operationId: OP })),
      executeMeteredBillingOperation(depsFor(shared, 'b', { executeProvider, operationId: OP_B })),
    ])
    expect(left.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(right.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(executeProvider).toHaveBeenCalledTimes(2)
  })

  it('ambiguous dispatch conservatively commits quota but does not mark cost MEASURED', async () => {
    const plan = foodScanUsageEventPlan({ operationId: OP, userId: USER })
    expect(plan.cost_basis).toBe('UNAVAILABLE')
    expect(plan.metadata.usage_basis).toBe('UNAVAILABLE')
    expect(plan.cost_basis).not.toBe('MEASURED')
    expect(plan.metadata.usage_basis).not.toBe('MEASURED')
    const shared = sharedQuota()
    const result = await executeMeteredBillingOperation(depsFor(shared, 'a', {
      executeProvider: async ({ markDispatched }) => {
        await markDispatched()
        return { code: 'providerUnavailable', ok: false, status: 502 }
      },
    }))
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING)
    const event = (await shared.usageRepository.list())[0]
    expect(event.cost_basis).toBe('UNAVAILABLE')
    expect(event.metadata.usage_basis).toBe('UNAVAILABLE')
  })

  it('privacy: durable records omit image/prompt/response/token', async () => {
    const store = createDurableOperationStore()
    await store.claimDispatch(OP, { userId: USER })
    const row = await store.get(OP)
    expect(JSON.stringify(row)).not.toMatch(/should not persist|prompt|image/)
    expect(FOOD_SCAN_RECOVERY_HTTP.BILLING_RECOVERY.status).toBe(409)
    expect(FOOD_SCAN_RECOVERY_HTTP.BILLING_RECOVERY.retryable).toBe(false)
  })

  it('client spoof cannot set dispatch or recovery state', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const result = await executeMeteredBillingOperation({
      ...depsFor(shared, 'a', { executeProvider }),
      clientClaim: {
        billingOutcome: 'COST_SAFE',
        dispatchState: 'NOT_DISPATCHED',
        eventState: 'MISSING',
        recoveryState: 'DONE',
        reservationState: 'COMMITTED',
      },
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(result.dispatch_state).toBe('DISPATCHED_CONFIRMED_SUCCESS')
  })
})

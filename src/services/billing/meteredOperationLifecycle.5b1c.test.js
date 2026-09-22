import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENFORCEMENT_DECISION, QUOTA_STATUS } from './catalog.js'
import {
  createDurableOperationStore,
  createFoodScanDurableDispatchStore,
  createUsageBackedDispatchStore,
  DISPATCH_CAS_RESULT,
  isUsageBackedDispatchStore,
  USAGE_BACKED_DISPATCH_AUTHORITY,
} from './durableOperationStore.js'
import { BILL_5B2_DISPATCH_INJECTION, foodScanUsageEventPlan } from './foodScanCanary.js'
import {
  executeDurableMeteredBillingOperation,
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
const OP = 'op_food_scan_5b1c_cas_01'
const OP_B = 'op_food_scan_5b1c_cas_02'

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
  return { quota, recordUsage, reservations, usageRepository }
}

function isolateStore(shared) {
  return createFoodScanDurableDispatchStore({
    recordUsage: shared.recordUsage,
    usageRepository: shared.usageRepository,
  })
}

function depsFor(shared, store, instanceKey, extra = {}) {
  return {
    commit: (input) => shared.quota.commitReservation(input),
    evaluate: vi.fn(async () => ALLOW),
    evaluateInput: { featureId: 'food.scan', userId: USER },
    instanceKey,
    operationId: extra.operationId || OP,
    operationStore: store,
    recordUsage: shared.recordUsage,
    requireDurableDispatch: true,
    reserve: (input) => shared.quota.reserveQuota(input),
    rollback: (input) => shared.quota.rollbackReservation(input),
    ...extra,
  }
}

describe('BILL-5B1c usage-backed dispatch CAS', () => {
  it('labels usage-backed store as the only production dispatch authority', () => {
    const shared = sharedQuota()
    const store = isolateStore(shared)
    expect(store.authority).toBe(USAGE_BACKED_DISPATCH_AUTHORITY)
    expect(store.durable).toBe(true)
    expect(isUsageBackedDispatchStore(store)).toBe(true)
    expect(isUsageBackedDispatchStore(createDurableOperationStore())).toBe(false)
    expect(BILL_5B2_DISPATCH_INJECTION.map_authority_forbidden).toBe(true)
    expect(() => createUsageBackedDispatchStore({})).toThrow(/usage_backed_store_unavailable/)
  })

  it('two independent stores sharing only usageRepository yield one FIRST_DISPATCH', async () => {
    const shared = sharedQuota()
    const storeA = isolateStore(shared)
    const storeB = isolateStore(shared)
    expect(storeA).not.toBe(storeB)
    const first = await storeA.claimDispatch(OP, { userId: USER })
    const second = await storeB.claimDispatch(OP, { userId: USER })
    expect(first.result).toBe(DISPATCH_CAS_RESULT.FIRST_DISPATCH)
    expect(second.result).toBe(DISPATCH_CAS_RESULT.ALREADY_DISPATCHED)
    expect((await shared.usageRepository.list())).toHaveLength(1)
  })

  it('two lifecycle isolates without a shared Map call the provider at most once', async () => {
    const shared = sharedQuota()
    const storeA = isolateStore(shared)
    const storeB = isolateStore(shared)
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      const claim = await markDispatched()
      if (claim?.claimed === false) return { ok: false, providerRequestStarted: false }
      return { ok: true }
    })
    const [left, right] = await Promise.all([
      executeDurableMeteredBillingOperation(depsFor(shared, storeA, 'isolate-a', { executeProvider })),
      executeDurableMeteredBillingOperation(depsFor(shared, storeB, 'isolate-b', { executeProvider })),
    ])
    const wins = [left, right].filter((row) => row.outcome === LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(wins).toHaveLength(1)
    expect(executeProvider.mock.calls.length).toBeLessThanOrEqual(1)
    expect(left.calls.provider + right.calls.provider).toBe(1)
    expect((await shared.usageRepository.list())).toHaveLength(1)
  })

  it('fail-closed: missing durable store never calls the provider', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async () => ({ ok: true }))
    const result = await executeDurableMeteredBillingOperation({
      ...depsFor(shared, null, 'prod-missing', { executeProvider }),
      operationStore: undefined,
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.PERSISTENCE_FAILURE)
    expect(result.dispatch_state).toBe('NOT_DISPATCHED')
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(result.calls.provider).toBe(0)
    expect((await shared.usageRepository.list())).toHaveLength(0)
  })

  it('fail-closed: process Map cannot become production authority', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async () => ({ ok: true }))
    const result = await executeDurableMeteredBillingOperation(
      depsFor(shared, createDurableOperationStore(), 'map-blocked', { executeProvider }),
    )
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.PERSISTENCE_FAILURE)
    expect(result.dispatch_state).toBe('NOT_DISPATCHED')
    expect(executeProvider).toHaveBeenCalledTimes(0)
  })

  it('persistence failure before dispatch CAS does not invent provider cost', async () => {
    const shared = sharedQuota()
    const store = createUsageBackedDispatchStore({
      recordUsage: async () => ({ ok: false, reason: 'database_unavailable' }),
      usageRepository: shared.usageRepository,
    })
    const executeProvider = vi.fn(async () => ({ ok: true }))
    const result = await executeDurableMeteredBillingOperation(
      depsFor(shared, store, 'persist-fail', { executeProvider }),
    )
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.PERSISTENCE_FAILURE)
    expect(result.dispatch_state).toBe('NOT_DISPATCHED')
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect((await shared.usageRepository.list())).toHaveLength(0)
    const inspect = await shared.quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId: USER })
    expect(inspect.used).toBe(0)
  })

  it('A crash before reserve: other isolate can still execute once', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const result = await executeDurableMeteredBillingOperation(
      depsFor(shared, isolateStore(shared), 'isolate-b', { executeProvider }),
    )
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(executeProvider).toHaveBeenCalledTimes(1)
  })

  it('B crash after reserve before CAS allows later dispatch', async () => {
    const shared = sharedQuota()
    await shared.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const result = await executeDurableMeteredBillingOperation(
      depsFor(shared, isolateStore(shared), 'isolate-b', { executeProvider }),
    )
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(executeProvider).toHaveBeenCalledTimes(1)
  })

  it('C CAS success then crash before provider: recoverer does not re-dispatch (false-dispatch window)', async () => {
    const shared = sharedQuota()
    await shared.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    const cas = await isolateStore(shared).claimDispatch(OP, { userId: USER })
    expect(cas.result).toBe(DISPATCH_CAS_RESULT.FIRST_DISPATCH)
    const executeProvider = vi.fn()
    const result = await executeDurableMeteredBillingOperation(
      depsFor(shared, isolateStore(shared), 'recover-c', { executeProvider }),
    )
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(result.provider_blocked).toBe(true)
    expect(result.dispatch_state).toBe('DISPATCHED_BILLING_UNKNOWN')
  })

  it('D/H response loss stays DISPATCHED_BILLING_UNKNOWN and cost UNAVAILABLE', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: false, providerRequestStarted: true, status: 502 }
    })
    const lost = await executeDurableMeteredBillingOperation(
      depsFor(shared, isolateStore(shared), 'isolate-a', { executeProvider }),
    )
    expect(lost.outcome).toBe(LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING)
    const retry = await executeDurableMeteredBillingOperation(
      depsFor(shared, isolateStore(shared), 'isolate-b', { executeProvider }),
    )
    expect(retry.provider_blocked).toBe(true)
    expect(executeProvider).toHaveBeenCalledTimes(1)
    const event = (await shared.usageRepository.list())[0]
    expect(event.cost_basis).toBe('UNAVAILABLE')
    expect(event.metadata.usage_basis).toBe('UNAVAILABLE')
  })

  it('E/F/G recoverers after dispatch do not re-call provider and commit quota once', async () => {
    const shared = sharedQuota()
    await shared.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: OP,
      unit: 'requests',
      user: USER,
    })
    await isolateStore(shared).claimDispatch(OP, { userId: USER })
    const executeProvider = vi.fn()
    const [left, right] = await Promise.all([
      executeDurableMeteredBillingOperation(depsFor(shared, isolateStore(shared), 'recover-a', { executeProvider })),
      executeDurableMeteredBillingOperation(depsFor(shared, isolateStore(shared), 'recover-b', { executeProvider })),
    ])
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(left.provider_blocked).toBe(true)
    expect(right.provider_blocked).toBe(true)
    const inspect = await shared.quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId: USER })
    expect(inspect.used).toBe(1)
  })

  it('client spoof cannot choose billing identity or dispatch state', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const result = await executeDurableMeteredBillingOperation({
      ...depsFor(shared, isolateStore(shared), 'spoof', { executeProvider }),
      clientClaim: {
        billingOutcome: 'COST_SAFE',
        dispatchState: 'NOT_DISPATCHED',
        eventState: 'MISSING',
        operationId: OP_B,
        recoveryState: 'DONE',
        reservationState: 'COMMITTED',
        userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    })
    expect(result.operation_id).toBe(OP)
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
  })

  it('privacy: usage-backed dispatch records omit image/prompt/response/secrets', async () => {
    const shared = sharedQuota()
    await isolateStore(shared).claimDispatch(OP, { userId: USER })
    const event = (await shared.usageRepository.list())[0]
    const serialized = JSON.stringify(event)
    expect(serialized).not.toMatch(/base64|prompt|image_url|Bearer |sk-/)
    const plan = foodScanUsageEventPlan({ operationId: OP, userId: USER })
    expect(plan.cost_basis).toBe('UNAVAILABLE')
    expect(Object.keys(plan.metadata)).toEqual(['image_count', 'usage_basis'])
  })

  it('non-durable unit tests may still inject a Map explicitly', async () => {
    const shared = sharedQuota()
    const executeProvider = vi.fn(async ({ markDispatched }) => {
      await markDispatched()
      return { ok: true }
    })
    const result = await executeMeteredBillingOperation({
      ...depsFor(shared, createDurableOperationStore(), 'unit-map', { executeProvider }),
      requireDurableDispatch: false,
    })
    expect(result.outcome).toBe(LIFECYCLE_OUTCOME.SUCCEEDED)
    expect(executeProvider).toHaveBeenCalledTimes(1)
  })
})

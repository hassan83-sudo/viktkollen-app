import { afterEach, describe, expect, it, vi } from 'vitest'
import { QUOTA_PLAN_ACTION } from '../../../src/services/billing/quotaReservationPlan.js'
import { createInMemoryUsageRepository } from '../../../src/services/billing/usageRepository.js'
import {
  createAiNatureOperationId,
  executeAiNatureMeteredOperation,
  installAiNatureBillingTestRuntime,
  setAiNatureBillingRuntimeForTests,
} from './aiNatureLiveBilling.js'

const userId = '11111111-1111-4111-8111-111111111111'

describe('AI Natur: faktiska API-faktureringens kvotkedja', () => {
  afterEach(() => setAiNatureBillingRuntimeForTests(null))

  it('reserverar food.scan, dispatchar en gång och registrerar naturhändelse', async () => {
    const usageRepository = createInMemoryUsageRepository()
    const runtime = installAiNatureBillingTestRuntime({
      usageRepository,
      evaluate: async () => ({
        allowed: true,
        decision: 'ALLOW',
        quota_plan: { action: QUOTA_PLAN_ACTION.RESERVE_ON_EXECUTE },
        warnings: [],
      }),
    })
    expect(runtime.ok).toBe(true)
    const operationId = createAiNatureOperationId({ clientAttemptId: 'nature-api-integration', userId })
    const provider = vi.fn(async ({ markDispatched }) => {
      const claim = await markDispatched()
      expect(claim.result).toBe('FIRST_DISPATCH')
      return { ok: true }
    })
    const { billing } = await executeAiNatureMeteredOperation({
      executeProvider: provider, operationId, runtime, userId,
    })
    expect(billing.outcome).toBe('SUCCEEDED')
    expect(billing.quota_consumed).toBe(true)
    expect(provider).toHaveBeenCalledTimes(1)
    const food = await runtime.quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId })
    const nature = await runtime.quota.inspectQuota({ feature: 'ai.nature.identification', unit: 'requests', userId })
    expect(food.used).toBe(1)
    expect(nature.used).toBe(1)
    const events = await usageRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('ai.nature.identification')
    expect(events[0].feature).toBe('ai.nature.identification')
  })
  it('nekar sjätte naturskanningen före AI-anrop när den delade kvoten är slut', async () => {
    const runtime = installAiNatureBillingTestRuntime({
      evaluate: async () => ({
        allowed: true,
        decision: 'ALLOW',
        quota_plan: { action: QUOTA_PLAN_ACTION.RESERVE_ON_EXECUTE },
        warnings: [],
      }),
    })
    for (let i = 0; i < 5; i += 1) {
      const reservation_id = `exhausted-food-${i}`
      const reserved = await runtime.quota.reserveQuota({
        feature: 'food.scan', quantity: 1, reservation_id, unit: 'requests', user: userId,
      })
      expect(reserved.status).toBe('RESERVED')
      expect((await runtime.quota.commitReservation({ reservation_id, actual_quantity: 1 })).status).toBe('COMMITTED')
    }
    const provider = vi.fn()
    const operationId = createAiNatureOperationId({ clientAttemptId: 'exhausted-nature', userId })
    const { billing } = await executeAiNatureMeteredOperation({
      executeProvider: provider, operationId, runtime, userId,
    })
    expect(billing.outcome).toBe('DENIED_RESERVE')
    expect(provider).not.toHaveBeenCalled()
  })

})

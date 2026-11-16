import { describe, expect, it } from 'vitest'
import { createQuotaEngine } from '../../../src/services/billing/quotaEngine.js'
import { sharedFoodScanQuota } from './aiNatureLiveBilling.js'

const user = '11111111-1111-4111-8111-111111111111'

describe('Mat och AI Natur: gemensam månadskvot', () => {
  it('delar fem reservationer (3 mat + 2 natur) och nekar den sjätte', async () => {
    const food = createQuotaEngine()
    const nature = sharedFoodScanQuota(food)
    const scans = [
      [food, 'food.scan'],
      [nature, 'ai.nature.identification'],
      [food, 'food.scan'],
      [nature, 'ai.nature.identification'],
      [food, 'food.scan'],
    ]
    for (const [index, [engine, feature]] of scans.entries()) {
      const reservation_id = `shared-scan-${index}`
      const result = await engine.reserveQuota({
        feature, quantity: 1, reservation_id, unit: 'requests', user,
      })
      expect(result.status).toBe('RESERVED')
      const committed = await engine.commitReservation({ actual_quantity: 1, reservation_id })
      expect(committed.status).toBe('COMMITTED')
    }
    const last = await nature.reserveQuota({
      feature: 'ai.nature.identification', quantity: 1,
      reservation_id: 'shared-scan-6', unit: 'requests', user,
    })
    expect(last.status).toBe('DENIED_QUOTA_EXCEEDED')
    const foodSnapshot = await food.inspectQuota({ userId: user, feature: 'food.scan', unit: 'requests' })
    const natureSnapshot = await nature.inspectQuota({ userId: user, feature: 'ai.nature.identification', unit: 'requests' })
    expect(foodSnapshot.remaining).toBe(0)
    expect(natureSnapshot.remaining).toBe(0)
  })
})

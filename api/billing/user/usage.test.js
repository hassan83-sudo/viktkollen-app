import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { installCatalogUsageSnapshotForTests, setUsageSnapshotReaderForTests } from '../../_shared/billing/usageSnapshotRead.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'
import { setFoodScanOwnerExemptionDepsForTests } from '../../_shared/billing/foodScanOwnerExemption.js'
import { createInMemoryPlanAssignmentStore } from '../../../src/services/billing/planAssignment.js'
import { createQuotaEngine } from '../../../src/services/billing/quotaEngine.js'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function createRequest({ query = {}, token = 'valid-token', url = '/api/billing/usage' } = {}) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method: 'GET',
    query,
    url,
  }
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json: vi.fn((body) => {
      response.body = body
      return response
    }),
    setHeader: vi.fn((name, value) => {
      response.headers[name] = value
    }),
    status: vi.fn((statusCode) => {
      response.statusCode = statusCode
      return response
    }),
  }
  return response
}

async function call(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

describe('GET /api/billing/usage', () => {
  let quota

  beforeEach(() => {
    quota = createQuotaEngine()
    installCatalogUsageSnapshotForTests({ quota })
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: USER } }
        : { error: { message: 'invalid jwt' } }
    ))
  })

  afterEach(() => {
    setUsageSnapshotReaderForTests(null)
    setSupabaseAuthVerifierForTests(null)
    setFoodScanOwnerExemptionDepsForTests(null)
    delete process.env.FOOD_SCAN_OWNER_UNLIMITED
  })

  describe('owner food.scan status', () => {
    const foodScanRow = (response) => response.body.snapshot.quotas.find((row) => row.key === 'food_scan')

    it('shows unlimited food scanning with the daily cap for the server-verified owner', async () => {
      process.env.FOOD_SCAN_OWNER_UNLIMITED = 'true'
      const isAdmin = vi.fn(async (id) => id === USER)
      setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 7, isAdmin })

      const response = await call(createRequest({ query: { user_id: OTHER } }))

      expect(response.statusCode).toBe(200)
      expect(foodScanRow(response)).toEqual({ daily_cap: 100, key: 'food_scan', owner_unlimited: true, used_last_24h: 7 })
      // Övriga kvoter är oförändrade, och behörigheten prövas bara för den inloggade användaren.
      expect(response.body.snapshot.quotas.find((row) => row.key === 'body_scan')).toMatchObject({ limit: 3 })
      expect(isAdmin.mock.calls).toEqual([[USER]])
    })

    it('keeps showing the owner status when the daily cap is reached', async () => {
      process.env.FOOD_SCAN_OWNER_UNLIMITED = 'true'
      setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 100, isAdmin: async () => true })
      expect(foodScanRow(await call(createRequest()))).toMatchObject({ owner_unlimited: true, used_last_24h: 100 })
    })

    it('shows the real monthly quota to regular users, when the flag is off, and on lookup errors', async () => {
      process.env.FOOD_SCAN_OWNER_UNLIMITED = 'true'
      setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin: async () => false })
      expect(foodScanRow(await call(createRequest()))).toEqual({ key: 'food_scan', limit: 5, remaining: 5, used: 0 })

      setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => { throw new Error('db') }, isAdmin: async () => true })
      expect(foodScanRow(await call(createRequest()))).toMatchObject({ limit: 5 })

      delete process.env.FOOD_SCAN_OWNER_UNLIMITED
      setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin: async () => true })
      expect(foodScanRow(await call(createRequest()))).toMatchObject({ limit: 5 })
    })
  })

  it('returns the signed-in free snapshot and ignores client plan claims', async () => {
    const response = await call(createRequest({
      query: {
        plan_id: 'plan.prelim.sek.month.99',
        price: '99',
        remaining: '0',
        user_id: OTHER,
      },
    }))
    expect(response.statusCode).toBe(200)
    expect(response.body.snapshot.plan).toEqual({ name: 'Gratis', priceText: '0 kr/mån' })
    expect(response.body.snapshot.quotas.map((row) => [row.key, row.limit, row.used, row.remaining])).toEqual([
      ['ai_coach', 20, 0, 20],
      ['food_scan', 5, 0, 5],
      ['body_scan', 3, 0, 3],
      ['ai_eye', 25, 0, 25],
    ])
    expect(response.body.snapshot.period.end).toMatch(/T00:00:00.000Z$/)
    expect(JSON.stringify(response.body)).not.toMatch(/ai\.text\.request|body\.scan|Köp|checkout|service_role/)
    expect(response.body.snapshot).not.toHaveProperty('purchase')
  })

  it('does not return another user usage', async () => {
    await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 5,
      reservation_id: 'other-food-reservation',
      unit: 'requests',
      user: OTHER,
    })
    await quota.commitReservation({ actual_quantity: 5, reservation_id: 'other-food-reservation' })
    await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 2,
      reservation_id: 'user-food-reservation',
      unit: 'requests',
      user: USER,
    })
    await quota.commitReservation({ actual_quantity: 2, reservation_id: 'user-food-reservation' })

    const response = await call(createRequest({ query: { user_id: OTHER } }))
    const food = response.body.snapshot.quotas.find((row) => row.key === 'food_scan')
    expect(food).toEqual({ key: 'food_scan', limit: 5, remaining: 3, used: 2 })
  })

  it('uses the server assignment when the client claims the free plan', async () => {
    const assignments = createInMemoryPlanAssignmentStore()
    await assignments.set({
      plan_id: 'plan.prelim.sek.month.04',
      plan_version: 1,
      user_id: USER,
    })
    quota = createQuotaEngine({ assignments })
    installCatalogUsageSnapshotForTests({ assignments, quota })
    const response = await call(createRequest({
      query: { plan_id: 'plan.free', remaining: '0' },
    }))
    expect(response.body.snapshot.plan.priceText).toBe('4 kr/mån')
    expect(response.body.snapshot.quotas.find((row) => row.key === 'body_scan').limit).toBe(4)
  })

  it('rejects a signed-out caller', async () => {
    const response = await call(createRequest({ token: '' }))
    expect(response.statusCode).toBe(401)
    expect(response.body.ok).toBe(false)
    expect(response.body.snapshot).toBeUndefined()
  })

  it('returns a safe error when the billing snapshot is unavailable', async () => {
    setUsageSnapshotReaderForTests(async () => null)
    const response = await call(createRequest())
    expect(response.statusCode).toBe(503)
    expect(response.body.ok).toBe(false)
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { installCatalogUsageSnapshotForTests, setUsageSnapshotReaderForTests } from '../../_shared/billing/usageSnapshotRead.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'
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

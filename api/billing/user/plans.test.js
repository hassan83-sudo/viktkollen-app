import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { installCatalogPlanComparisonForTests, setPlanComparisonReaderForTests } from '../../_shared/billing/planComparisonRead.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'
import { createInMemoryPlanAssignmentStore } from '../../../src/services/billing/planAssignment.js'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function createRequest({ query = {}, token = 'valid-token', url = '/api/billing/plans' } = {}) {
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

describe('GET /api/billing/plans', () => {
  beforeEach(() => {
    installCatalogPlanComparisonForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: USER } }
        : { error: { message: 'invalid jwt' } }
    ))
  })

  afterEach(() => {
    setPlanComparisonReaderForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('returns the signed-in catalog and ignores client plan claims', async () => {
    const response = await call(createRequest({
      query: {
        enabled_for_sale: 'true',
        plan_id: 'plan.prelim.sek.month.99',
        price: '99',
        user_id: OTHER,
      },
    }))
    expect(response.statusCode).toBe(200)
    expect(response.body.comparison.plans).toHaveLength(15)
    expect(response.body.comparison.plans.map((plan) => plan.priceText)).toEqual([
      'Gratis', '4 kr/mån', '7 kr/mån', '9 kr/mån', '12 kr/mån', '15 kr/mån',
      '19 kr/mån', '29 kr/mån', '39 kr/mån', '49 kr/mån', '59 kr/mån', '69 kr/mån',
      '79 kr/mån', '89 kr/mån', '99 kr/mån',
    ])
    const current = response.body.comparison.plans.find((plan) => plan.current)
    expect(current.priceText).toBe('Gratis')
    expect(current.quotas.map((row) => row.limit)).toEqual([20, 5, 3, 25])
    expect(response.body.comparison.plans.find((plan) => plan.priceText === '99 kr/mån').quotas.map((row) => row.limit)).toEqual([1500, 400, 150, 1500])
    expect(response.body.comparison.plans.filter((plan) => plan.forSale)).toEqual([])
    expect(JSON.stringify(response.body)).not.toMatch(/plan\.free|plan\.prelim|ai\.text\.request|Köp|checkout|service_role/)
  })

  it('uses the server assignment for the current-plan marker', async () => {
    const assignments = createInMemoryPlanAssignmentStore()
    await assignments.set({
      plan_id: 'plan.prelim.sek.month.49',
      plan_version: 1,
      user_id: USER,
    })
    await assignments.set({
      plan_id: 'plan.prelim.sek.month.99',
      plan_version: 1,
      user_id: OTHER,
    })
    installCatalogPlanComparisonForTests({ assignments })
    const response = await call(createRequest({ query: { plan_id: 'plan.free', user_id: OTHER } }))
    expect(response.body.comparison.plans.find((plan) => plan.current).priceText).toBe('49 kr/mån')
  })

  it('passes an explicit sale flag through without adding a purchase field', async () => {
    const priced = getPlanById('plan.prelim.sek.month.04')
    installCatalogPlanComparisonForTests({
      plans: [priced, getPlanById('plan.free')].map((plan) => (
        plan.id === priced.id ? { ...plan, enabled_for_sale: true } : plan
      )),
    })
    const response = await call(createRequest())
    const paid = response.body.comparison.plans.find((plan) => plan.priceText === '4 kr/mån')
    expect(paid.forSale).toBe(true)
    expect(response.body.comparison).not.toHaveProperty('purchase')
    expect(JSON.stringify(response.body)).not.toMatch(/checkout/)
  })

  it('rejects a signed-out caller', async () => {
    const response = await call(createRequest({ token: '' }))
    expect(response.statusCode).toBe(401)
    expect(response.body.ok).toBe(false)
    expect(response.body.comparison).toBeUndefined()
  })

  it('returns a safe error when the comparison is unavailable', async () => {
    setPlanComparisonReaderForTests(async () => null)
    const response = await call(createRequest())
    expect(response.statusCode).toBe(503)
    expect(response.body.ok).toBe(false)
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE')
  })
})

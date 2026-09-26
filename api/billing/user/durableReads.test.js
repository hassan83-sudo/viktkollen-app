import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../../_shared/supabaseServer.js'
import { summarizeQuotaReservations } from '../../_shared/billing/quotaRead.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-26T12:00:00.000Z')

function fakeBillingClient(tables, calls) {
  return {
    schema(name) {
      calls.push({ kind: 'schema', name })
      return {
        from(table) {
          calls.push({ kind: 'from', table })
          const rows = tables[table] || []
          const filters = []
          const api = {
            select(columns) {
              calls.push({ columns, kind: 'select', table })
              return api
            },
            eq(column, value) {
              filters.push([column, value])
              return api
            },
            maybeSingle: async () => ({
              data: rows.find((row) => filters.every(([column, value]) => row[column] === value)) || null,
              error: null,
            }),
            then(resolve, reject) {
              const data = rows.filter((row) => filters.every(([column, value]) => row[column] === value))
              return Promise.resolve({ data, error: null }).then(resolve, reject)
            },
          }
          return api
        },
        rpc(fn) {
          calls.push({ fn, kind: 'rpc' })
          throw new Error('quota read must not call rpc')
        },
      }
    },
  }
}

function createRequest({
  body = undefined,
  method = 'GET',
  query = {},
  token = 'valid-token',
  url = '/api/billing/subscription',
} = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
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
    setHeader: vi.fn(),
    status: vi.fn((statusCode) => {
      response.statusCode = statusCode
      return response
    }),
  }
  return response
}

const paidSubscription = {
  cancel_at_period_end: true,
  current_period_end: '2026-10-26T12:00:00.000Z',
  current_period_start: '2026-09-26T12:00:00.000Z',
  past_due_grace_until: '2026-10-03T12:00:00.000Z',
  pending_plan_id: 'plan.prelim.sek.month.99',
  plan_id: 'plan.prelim.sek.month.49',
  provider_customer_ref: 'cus_secret',
  provider_subscription_ref: 'sub_secret',
  status: 'PAST_DUE',
  subscription_id: 'sub-user',
  user_id: USER,
}

function tablesFor(overrides = {}) {
  return {
    plan_commercial_controls: [],
    plan_entitlements: [{
      enabled: true,
      feature: 'body.scan',
      limit_kind: 'NUMBER',
      limit_value: 15,
      plan_id: 'plan.prelim.sek.month.49',
      unit: 'requests',
    }, {
      enabled: true,
      feature: 'body.scan',
      limit_kind: 'NUMBER',
      limit_value: 3,
      plan_id: 'plan.free',
      unit: 'requests',
    }],
    plans: [
      { active: true, billing_interval: 'month', plan_id: 'plan.free' },
      { active: true, billing_interval: 'month', plan_id: 'plan.prelim.sek.month.49' },
    ],
    quota_reservations: [{
      actual_quantity: 4,
      expires_at: null,
      feature: 'body.scan',
      period_start: '2026-09-01T00:00:00.000Z',
      quantity: 9,
      status: 'COMMITTED',
      unit: 'requests',
      user_id: USER,
    }, {
      actual_quantity: null,
      expires_at: '2026-09-27T00:00:00.000Z',
      feature: 'body.scan',
      period_start: '2026-09-01T00:00:00.000Z',
      quantity: 2,
      status: 'PENDING',
      unit: 'requests',
      user_id: USER,
    }, {
      actual_quantity: null,
      expires_at: null,
      feature: 'body.scan',
      period_start: '2026-09-01T00:00:00.000Z',
      quantity: 1,
      status: 'PENDING',
      unit: 'requests',
      user_id: OTHER,
    }],
    subscriptions: [paidSubscription],
    user_plan_assignments: [{ plan_id: 'plan.prelim.sek.month.49', plan_version: 1, user_id: USER }],
    ...overrides,
  }
}

describe('BILL-7X1 durable billing reads', () => {
  let calls

  beforeEach(() => {
    calls = []
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: USER } }
        : { error: { message: 'invalid jwt' } }
    ))
    setSupabaseAdminClientForTests(fakeBillingClient(tablesFor(), calls))
  })

  afterEach(() => {
    vi.useRealTimers()
    setSupabaseAuthVerifierForTests(null)
    clearSupabaseAdminClientForTests()
  })

  it('denies an unauthenticated subscription read', async () => {
    const response = createResponse()
    await handler(createRequest({ token: '' }), response)
    expect(response.statusCode).toBe(401)
    expect(calls).toEqual([])
  })

  it('denies an unauthenticated quota read', async () => {
    const response = createResponse()
    await handler(createRequest({ token: '', url: '/api/billing/quota' }), response)
    expect(response.statusCode).toBe(401)
  })

  it('rejects a query user that is not the authenticated user', async () => {
    const response = createResponse()
    await handler(createRequest({ query: { user_id: OTHER } }), response)
    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN_USER')
    expect(calls.filter((call) => call.kind === 'from')).toEqual([])
  })

  it('uses the durable subscription row and ignores client plan, status, and quota', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { plan_id: 'plan.free', quota: 1, status: 'ACTIVE' },
      query: { plan: 'plan.free', quota: '1', status: 'ACTIVE' },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.subscription).toEqual({
      cancel_at_period_end: true,
      current_period_end: paidSubscription.current_period_end,
      current_period_start: paidSubscription.current_period_start,
      past_due_grace_until: paidSubscription.past_due_grace_until,
      pending_plan_id: 'plan.prelim.sek.month.99',
      plan_id: 'plan.prelim.sek.month.49',
      status: 'PAST_DUE',
    })
    const encoded = JSON.stringify(response.body)
    expect(encoded).not.toMatch(/provider_customer_ref|provider_subscription_ref|cus_secret|sub_secret|external_event/)
    expect(calls.some((call) => call.kind === 'rpc')).toBe(false)
  })

  it('does not fabricate a paid subscription when the user has no row', async () => {
    setSupabaseAdminClientForTests(fakeBillingClient(tablesFor({ subscriptions: [] }), calls))
    const response = createResponse()
    await handler(createRequest(), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.subscription).toEqual({
      cancel_at_period_end: false,
      current_period_end: null,
      current_period_start: null,
      past_due_grace_until: null,
      pending_plan_id: null,
      plan_id: 'plan.free',
      status: 'NONE',
    })
  })

  it('derives quota from the assignment, entitlement, and durable reservations without reserving', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { limit: 99, plan_id: 'plan.free', used: 0 },
      query: {
        feature: 'body.scan',
        limit: '99',
        plan: 'plan.free',
        unit: 'requests',
        used: '0',
        user_id: OTHER,
      },
      url: '/api/billing/quota',
    }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.quota.plan_id).toBe('plan.prelim.sek.month.49')
    expect(response.body.quota.feature).toBe('body.scan')
    expect(response.body.quota.limit).toBe(15)
    expect(response.body.quota.used).toBe(4)
    expect(response.body.quota.reserved).toBe(2)
    expect(response.body.quota.remaining).toBe(9)
    expect(response.body.quota.status).toBe('ALLOWED')
    expect(response.body.quota.period_start).toBe('2026-09-01T00:00:00.000Z')
    expect(calls.some((call) => call.kind === 'rpc' || call.table === 'quota_period_locks')).toBe(false)
  })

  it('keeps the entitlements compatibility payload out of billing authority', async () => {
    const source = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')
    const response = createResponse()
    await handler(createRequest({
      query: { plan: 'plan.prelim.sek.month.99' },
      url: '/api/entitlements',
    }), response)
    expect(response.body.authority).toBe('none')
    expect(response.body.verification).toBe('legacy_compatibility_not_authority')
    expect(response.body.entitlement.plan).toBe('free')
    expect(source).toMatch(/Not billing authority/)
    expect(source).not.toMatch(/getServerSubscription|inspectServerQuota|createSubscriptionAuthority|createQuotaEngine/)
  })

  it('counts committed actual quantity and only unexpired pending reservations', () => {
    const summary = summarizeQuotaReservations([
      { actual_quantity: 4, quantity: 9, status: 'COMMITTED' },
      { expires_at: '2026-09-27T00:00:00.000Z', quantity: 2, status: 'PENDING' },
      { expires_at: '2026-09-01T00:00:00.000Z', quantity: 7, status: 'PENDING' },
      { quantity: 3, status: 'ROLLED_BACK' },
    ], NOW)
    expect(summary).toEqual({ committed: 4, reserved: 2 })
  })
})

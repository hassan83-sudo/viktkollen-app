import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'
import { readServerPlanSale, setLifecycleIntentDepsForTests } from '../../_shared/billing/userLifecycleIntent.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CURRENT = 'plan.prelim.sek.month.49'
const TARGET = 'plan.prelim.sek.month.99'

function createRequest({
  body,
  method = 'POST',
  query = {},
  token = 'valid-token',
  url = '/api/billing/plan-change',
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

function installDeps(calls, overrides = {}) {
  const current = {
    subscription: {
      cancel_at_period_end: false,
      current_period_end: '2026-10-01T00:00:00.000Z',
      current_period_start: '2026-09-01T00:00:00.000Z',
      past_due_grace_until: '2026-10-08T00:00:00.000Z',
      pending_plan_id: null,
      plan_id: CURRENT,
      status: 'ACTIVE',
    },
    subscriptionId: 'sub-user',
    unavailable: false,
  }
  setLifecycleIntentDepsForTests({
    lifecycle: {
      async clearCancelAtPeriodEnd(input) {
        calls.push({ input, type: 'undo' })
        return {
          assignment: { plan_id: CURRENT, source: 'server', user_id: USER },
          subscription: { ...current.subscription, cancel_at_period_end: false },
        }
      },
      async scheduleCancelAtPeriodEnd(input) {
        calls.push({ input, type: 'cancel' })
        return {
          assignment: { plan_id: CURRENT, source: 'server', user_id: USER },
          subscription: { ...current.subscription, cancel_at_period_end: true, status: 'ACTIVE' },
        }
      },
      async scheduleNextPeriodPlanChange(input) {
        calls.push({ input, type: 'plan' })
        return {
          assignment: { plan_id: CURRENT, source: 'server', user_id: USER },
          subscription: { ...current.subscription, pending_plan_id: input.plan_id },
        }
      },
    },
    async readSale(planId) {
      calls.push({ planId, type: 'sale' })
      if (planId === TARGET) return { active: true, enabledForSale: true, known: true }
      if (planId === 'plan.hidden') return { active: false, enabledForSale: false, known: true }
      return { active: true, enabledForSale: false, known: planId !== 'plan.missing' }
    },
    async readSubscription(userId) {
      calls.push({ type: 'read', userId })
      return overrides.subscription || current
    },
    ...overrides.deps,
  })
}

describe('BILL-7X2 user lifecycle intents', () => {
  let calls

  beforeEach(() => {
    calls = []
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: USER } }
        : { error: { message: 'invalid jwt' } }
    ))
    installDeps(calls)
  })

  afterEach(() => {
    setSupabaseAuthVerifierForTests(null)
    setLifecycleIntentDepsForTests(null)
  })

  it('denies an unauthenticated plan change', async () => {
    const response = createResponse()
    await handler(createRequest({ token: '' }), response)
    expect(response.statusCode).toBe(401)
    expect(calls).toEqual([])
  })

  it('ignores client user, subscription, status, period, quota, and event id', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: {
        current_period_end: '1999-01-01T00:00:00.000Z',
        external_event_id: 'client-event',
        grace_until: '1999-01-02T00:00:00.000Z',
        plan_id: TARGET,
        price_minor: 1,
        quota: 0,
        status: 'ACTIVE',
        subscription_id: 'sub-other',
        user_id: OTHER,
      },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(calls[0]).toEqual({ type: 'read', userId: USER })
    const planCall = calls.find((call) => call.type === 'plan')
    expect(planCall.input.subscription_id).toBe('sub-user')
    expect(planCall.input.plan_id).toBe(TARGET)
    expect(planCall.input.external_event_id).toMatch(/^ui\.[a-f0-9]{40}$/)
    expect(planCall.input.external_event_id).not.toBe('client-event')
    expect(planCall.input.clientClaim).toEqual({})
    expect(JSON.stringify(planCall.input)).not.toMatch(/1999-01-01|price_minor|sub-other/)
    expect(response.body.assignment).toEqual({ plan_id: CURRENT, source: 'server' })
    expect(response.body.subscription.plan_id).toBe(CURRENT)
    expect(response.body.subscription.pending_plan_id).toBe(TARGET)
    expect(JSON.stringify(response.body)).not.toMatch(/user_id|sub-user/)
  })

  it('reuses the server event id for the same plan intent', async () => {
    const first = createResponse()
    const second = createResponse()
    const body = { external_event_id: 'different-client-id', plan_id: TARGET }
    await handler(createRequest({ body }), first)
    await handler(createRequest({ body: { ...body, external_event_id: 'another-client-id' } }), second)
    const events = calls.filter((call) => call.type === 'plan').map((call) => call.input.external_event_id)
    expect(events[0]).toBe(events[1])
  })

  it('rejects a plan that is not for sale and does not call the lifecycle', async () => {
    const response = createResponse()
    await handler(createRequest({ body: { plan_id: 'plan.notforsale', price_minor: 0 } }), response)
    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_PLAN')
    expect(calls.some((call) => call.type === 'plan')).toBe(false)
  })

  it('rejects an inactive plan', async () => {
    const response = createResponse()
    await handler(createRequest({ body: { plan_id: 'plan.hidden' } }), response)
    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_PLAN')
  })

  it('schedules cancellation without downgrading the assignment', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { status: 'CANCELED', subscription_id: 'sub-other', user_id: OTHER },
      url: '/api/billing/cancel',
    }), response)
    expect(response.statusCode).toBe(200)
    expect(calls.find((call) => call.type === 'cancel').input.subscription_id).toBe('sub-user')
    expect(response.body.subscription.status).toBe('ACTIVE')
    expect(response.body.subscription.cancel_at_period_end).toBe(true)
    expect(response.body.assignment.plan_id).toBe(CURRENT)
  })

  it('undoes scheduled cancellation through the durable lifecycle', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { current_period_end: '1999-01-01T00:00:00.000Z' },
      url: '/api/billing/user',
      query: { __vk_route: 'undo_cancel' },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(calls.some((call) => call.type === 'undo')).toBe(true)
    expect(response.body.subscription.cancel_at_period_end).toBe(false)
    expect(response.body.assignment.plan_id).toBe(CURRENT)
  })

  it('returns a stable code when the subscription is missing', async () => {
    installDeps(calls, {
      subscription: { subscription: { plan_id: 'plan.free', status: 'NONE' }, subscriptionId: null, unavailable: false },
    })
    const response = createResponse()
    await handler(createRequest({ url: '/api/billing/cancel' }), response)
    expect(response.statusCode).toBe(404)
    expect(response.body.error.code).toBe('SUBSCRIPTION_MISSING')
  })

  it('hides raw database errors', async () => {
    installDeps(calls, {
      deps: {
        lifecycle: {
          async scheduleCancelAtPeriodEnd() {
            const error = new Error('duplicate key value violates unique constraint "subscriptions_pkey" at https://db.example.supabase.co')
            error.code = 'billing_rpc_failed'
            throw error
          },
        },
      },
    })
    const response = createResponse()
    await handler(createRequest({ url: '/api/billing/cancel' }), response)
    expect(response.statusCode).toBe(500)
    expect(response.body.error.code).toBe('BILLING_FAILED')
    expect(JSON.stringify(response.body)).not.toMatch(/subscriptions_pkey|supabase|duplicate key/)
  })

  it('maps a conflicting event without a raw unique violation', async () => {
    installDeps(calls, {
      deps: {
        lifecycle: {
          async scheduleNextPeriodPlanChange() {
            const error = new Error('duplicate key value violates unique constraint "subscription_events_pkey"')
            error.code = 'duplicate_external_event'
            throw error
          },
        },
      },
    })
    const response = createResponse()
    await handler(createRequest({ body: { plan_id: TARGET } }), response)
    expect(response.statusCode).toBe(409)
    expect(response.body.error.code).toBe('DUPLICATE_EVENT')
    expect(JSON.stringify(response.body)).not.toMatch(/subscription_events_pkey|23505/)
  })

  it('accepts an enabled plan from the sale read and ignores client sale, price, entitlement, and quota', async () => {
    const saleCalls = []
    const client = {
      schema() {
        return {
          from(table) {
            saleCalls.push(table)
            const api = {
              select() { return api },
              eq() { return api },
              maybeSingle: async () => ({
                data: table === 'plans' ? { active: true, plan_id: TARGET } : null,
                error: null,
              }),
            }
            return api
          },
          rpc(name, args) {
            saleCalls.push({ args, name })
            return { data: true, error: null }
          },
        }
      },
    }
    installDeps(calls, {
      deps: {
        readSale: (planId) => readServerPlanSale(client, planId),
      },
    })
    const response = createResponse()
    await handler(createRequest({
      body: {
        enabled_for_sale: true,
        entitlements: { food_scan: 999 },
        plan_id: TARGET,
        price_minor: 1,
        quota: 999,
      },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.subscription.pending_plan_id).toBe(TARGET)
    expect(response.body.assignment.plan_id).toBe(CURRENT)
    expect(saleCalls).toContain('plans')
    expect(saleCalls).not.toContain('plan_commercial_controls')
    expect(saleCalls).toContainEqual({ args: { p_plan_id: TARGET }, name: 'plan_enabled_for_sale' })
    expect(JSON.stringify(calls.find((call) => call.type === 'plan').input)).not.toMatch(/999|price_minor|enabled_for_sale/)
  })

  it('rejects a disabled sale flag and a missing commercial control', async () => {
    for (const data of [false, null]) {
      calls.length = 0
      const client = {
        schema() {
          return {
            from() {
              const api = {
                select() { return api },
                eq() { return api },
                maybeSingle: async () => ({ data: { active: true, plan_id: TARGET }, error: null }),
              }
              return api
            },
            rpc() {
              return { data, error: null }
            },
          }
        },
      }
      installDeps(calls, {
        deps: { readSale: (planId) => readServerPlanSale(client, planId) },
      })
      const response = createResponse()
      await handler(createRequest({
        body: { enabled_for_sale: true, plan_id: TARGET, price: 0, quota: 1 },
      }), response)
      expect(response.statusCode).toBe(400)
      expect(response.body.error.code).toBe('INVALID_PLAN')
      expect(calls.some((call) => call.type === 'plan')).toBe(false)
    }
  })

  it('rejects an unknown plan before the lifecycle', async () => {
    const response = createResponse()
    await handler(createRequest({ body: { plan_id: 'plan.missing' } }), response)
    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_PLAN')
    expect(calls.some((call) => call.type === 'plan')).toBe(false)
  })

  it('ignores a client current plan and pending plan', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: {
        current_plan: 'plan.free',
        current_plan_id: 'plan.free',
        pending_plan: 'plan.free',
        pending_plan_id: 'plan.free',
        plan_id: TARGET,
      },
    }), response)
    expect(response.statusCode).toBe(200)
    const planCall = calls.find((call) => call.type === 'plan')
    expect(planCall.input.plan_id).toBe(TARGET)
    expect(JSON.stringify(planCall.input)).not.toMatch(/plan\.free/)
    expect(response.body.subscription.plan_id).toBe(CURRENT)
    expect(response.body.subscription.pending_plan_id).toBe(TARGET)
  })

  it('keeps a scheduled cancellation while scheduling the next-period plan', async () => {
    installDeps(calls, {
      deps: {
        lifecycle: {
          async scheduleNextPeriodPlanChange(input) {
            calls.push({ input, type: 'plan' })
            return {
              assignment: { plan_id: CURRENT, source: 'server' },
              subscription: {
                cancel_at_period_end: true,
                current_period_end: '2026-10-01T00:00:00.000Z',
                pending_plan_id: input.plan_id,
                plan_id: CURRENT,
                status: 'ACTIVE',
              },
            }
          },
        },
        readSubscription: async () => ({
          subscription: {
            cancel_at_period_end: true,
            current_period_end: '2026-10-01T00:00:00.000Z',
            pending_plan_id: null,
            plan_id: CURRENT,
            status: 'ACTIVE',
          },
          subscriptionId: 'sub-user',
          unavailable: false,
        }),
      },
    })
    const response = createResponse()
    await handler(createRequest({ body: { plan_id: TARGET, status: 'CANCELED' } }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.subscription.cancel_at_period_end).toBe(true)
    expect(response.body.subscription.plan_id).toBe(CURRENT)
    expect(response.body.subscription.pending_plan_id).toBe(TARGET)
    expect(response.body.assignment.plan_id).toBe(CURRENT)
    expect(response.body.subscription.status).toBe('ACTIVE')
  })

  it('fail-closes when the sale read is unavailable', async () => {
    installDeps(calls, {
      deps: {
        readSale: async () => {
          const error = new Error('plan_sale_read_failed')
          error.code = 'durable_operation_unavailable'
          throw error
        },
      },
    })
    const response = createResponse()
    await handler(createRequest({ body: { enabled_for_sale: true, plan_id: TARGET } }), response)
    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('DURABLE_UNAVAILABLE')
    expect(response.body.ok).toBe(false)
    expect(calls.some((call) => call.type === 'plan')).toBe(false)
  })

  it('does not report success when assignment sync is unconfirmed', async () => {
    installDeps(calls, {
      deps: {
        lifecycle: {
          async scheduleNextPeriodPlanChange() {
            return { assignment: null, subscription: { pending_plan_id: TARGET, plan_id: CURRENT, status: 'ACTIVE' } }
          },
        },
      },
    })
    const missing = createResponse()
    await handler(createRequest({ body: { plan_id: TARGET } }), missing)
    expect(missing.statusCode).toBe(503)
    expect(missing.body.error.code).toBe('ASSIGNMENT_UNCONFIRMED')
    expect(missing.body.ok).toBe(false)

    installDeps(calls, {
      deps: {
        lifecycle: {
          async scheduleNextPeriodPlanChange() {
            const error = new Error('assignment_sync_unconfirmed')
            error.code = 'assignment_sync_unconfirmed'
            throw error
          },
        },
      },
    })
    const thrown = createResponse()
    await handler(createRequest({ body: { plan_id: TARGET } }), thrown)
    expect(thrown.statusCode).toBe(503)
    expect(thrown.body.error.code).toBe('ASSIGNMENT_UNCONFIRMED')
    expect(thrown.body.ok).toBe(false)
  })

  it('does not expose a generic subscription state endpoint', async () => {
    const source = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')
    const intent = readFileSync(join(root, 'api/_shared/billing/userLifecycleIntent.js'), 'utf8')
    const generic = createResponse()
    await handler(createRequest({
      body: { action: 'set_status', status: 'PAST_DUE' },
      url: '/api/billing/subscription',
    }), generic)
    expect(generic.statusCode).toBe(405)
    expect(source).not.toMatch(/set_status|transition_subscription|schedule_next_period_plan_change|clear_cancel_at_period_end|advance_subscription_period|finalize_open_subscription/)
    expect(intent).toMatch(/createServerSubscriptionLifecycle/)
    expect(intent).not.toMatch(/stripe|sumup|checkout|webhook|proration/i)
    expect(intent).not.toMatch(/user_entitlements/)
  })
})

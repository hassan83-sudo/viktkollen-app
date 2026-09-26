import { describe, expect, it } from 'vitest'
import { createServerSubscriptionLifecycle } from './subscriptionLifecycleServer.js'

const USER = '11111111-1111-4111-8111-111111111111'
const CURRENT = 'plan.prelim.sek.month.49'
const GRACE = '2026-04-28T00:00:00.000Z'

function clientFor(handler) {
  return {
    schema(name) {
      return {
        async rpc(fn, args) {
          return handler(name, fn, args)
        },
      }
    },
  }
}

describe('BILL-7O/7P/7Q server lifecycle bridge', () => {
  it('fails a renewal once, syncs the derived assignment, and does not fall back to memory', async () => {
    const calls = []
    const client = clientFor(async (name, fn, args) => {
      calls.push({ args, fn, name })
      if (fn === 'mark_renewal_failed') {
        return {
          data: {
            cancel_at_period_end: true,
            current_period_end: '2026-05-01T00:00:00.000Z',
            current_period_start: '2026-04-01T00:00:00.000Z',
            past_due_grace_until: GRACE,
            pending_plan_change: 'next_period',
            pending_plan_id: 'plan.prelim.sek.month.09',
            plan_id: CURRENT,
            plan_version: 1,
            status: 'PAST_DUE',
            subscription_id: 'sub-1',
            user_id: USER,
          },
          error: null,
        }
      }
      return {
        data: {
          plan_id: CURRENT,
          plan_version: 1,
          source: 'server',
          user_id: USER,
        },
        error: null,
      }
    })
    const { authority, lifecycle } = createServerSubscriptionLifecycle({ client })
    expect(authority.durable).toBe(true)
    expect(authority.store).toBeUndefined()
    const result = await lifecycle.applyTrustedRenewal({
      clientClaim: { period_end: '1999-01-01T00:00:00.000Z', plan_id: 'plan.free', quota: 4 },
      current_period_end: '2026-05-01T00:00:00.000Z',
      external_event_id: 'fail-1',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: 'sub-1',
    })
    expect(result.subscription.status).toBe('PAST_DUE')
    expect(result.subscription.plan_id).toBe(CURRENT)
    expect(result.subscription.pending_plan_id).toBe('plan.prelim.sek.month.09')
    expect(result.assignment.source).toBe('server')
    expect(calls.map((call) => call.fn)).toEqual([
      'mark_renewal_failed',
      'sync_plan_assignment_from_subscription',
    ])
    expect(calls[0].args).toEqual({
      p_external_event_id: 'fail-1',
      p_past_due_grace_until: GRACE,
      p_period_end: '2026-05-01T00:00:00.000Z',
      p_subscription_id: 'sub-1',
    })
    expect(calls[1].args).toEqual({
      p_external_event_id: 'fail-1',
      p_subscription_id: 'sub-1',
    })
    expect(JSON.stringify(calls)).not.toMatch(/"plan_id"|"quota"|1999-01-01/)
  })

  it('does not construct an in-memory lifecycle when the admin client is missing', () => {
    expect(() => createServerSubscriptionLifecycle({ client: null })).toThrow(expect.objectContaining({
      code: 'durable_operation_unavailable',
    }))
  })
})

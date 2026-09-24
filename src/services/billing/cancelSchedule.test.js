import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultPlanCatalog } from './planCatalog.js'
import { createSubscriptionService } from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'
import { createInMemoryUsageRepository } from './usageRepository.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260924090000_billing_cancel_schedule.sql'), 'utf8')
const userApi = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PAID = 'plan.prelim.sek.month.49'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'

function service(iso = '2026-04-15T00:00:00.000Z') {
  const store = createInMemorySubscriptionStore()
  return {
    store,
    subscriptions: createSubscriptionService({
      catalog: defaultPlanCatalog,
      now: () => new Date(iso),
      store,
    }),
  }
}

async function row(subscriptions) {
  return subscriptions.createSubscription({
    current_period_end: END,
    current_period_start: START,
    pending_plan_change: 'next_period',
    pending_plan_id: 'plan.prelim.sek.month.09',
    plan_id: PAID,
    user_id: USER,
  })
}

describe('BILL-6C6A cancel and undo', () => {
  it('schedules cancel without ending access, the period, or the plan', async () => {
    const usage = createInMemoryUsageRepository()
    await usage.insert({
      event_id: 'keep-usage',
      event_type: 'food.scan',
      feature: 'food.scan',
      occurred_at: '2026-04-02T00:00:00.000Z',
      quantity: 1,
      unit: 'requests',
      user_id: USER,
    })
    const { store, subscriptions } = service()
    const created = await row(subscriptions)
    const scheduled = await subscriptions.scheduleCancelAtPeriodEnd({
      actor_user_id: USER,
      clientClaim: { period_end: START, plan_id: 'plan.free', price: 1, status: 'CANCELED' },
      external_event_id: 'cancel-1',
      subscription_id: created.subscription_id,
    })
    expect(scheduled.cancel_at_period_end).toBe(true)
    expect(scheduled.status).toBe('ACTIVE')
    expect(scheduled.current_period_end).toBe(END)
    expect(scheduled.plan_id).toBe(PAID)
    expect(scheduled.pending_plan_id).toBe('plan.prelim.sek.month.09')
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe(PAID)
    expect((await usage.list()).map((event) => event.event_id)).toEqual(['keep-usage'])
    expect(await store.listEvents()).toEqual([expect.objectContaining({
      current_period_end: END,
      from_cancel_at_period_end: false,
      operation: 'cancel.schedule',
      to_cancel_at_period_end: true,
    })])
  })

  it('clears a scheduled cancel before period end without extending it', async () => {
    const { store, subscriptions } = service()
    const created = await row(subscriptions)
    await subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'cancel-1',
      subscription_id: created.subscription_id,
    })
    const cleared = await subscriptions.clearCancelAtPeriodEnd({
      actor_user_id: USER,
      clientClaim: { period_end: '2026-08-01T00:00:00.000Z', plan_id: 'plan.free' },
      external_event_id: 'undo-1',
      subscription_id: created.subscription_id,
    })
    expect(cleared.cancel_at_period_end).toBe(false)
    expect(cleared.current_period_end).toBe(END)
    expect(cleared.plan_id).toBe(PAID)
    expect(cleared.pending_plan_id).toBe('plan.prelim.sek.month.09')
    expect((await store.listEvents()).map((event) => event.operation)).toEqual([
      'cancel.schedule',
      'cancel.clear',
    ])
  })

  it('replays schedule and undo without flipping the flag again', async () => {
    const { store, subscriptions } = service()
    const created = await row(subscriptions)
    await subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'cancel-1',
      subscription_id: created.subscription_id,
    })
    await subscriptions.clearCancelAtPeriodEnd({
      external_event_id: 'undo-1',
      subscription_id: created.subscription_id,
    })
    const scheduleReplay = await subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'cancel-1',
      subscription_id: created.subscription_id,
    })
    const undoReplay = await subscriptions.clearCancelAtPeriodEnd({
      external_event_id: 'undo-1',
      subscription_id: created.subscription_id,
    })
    expect(scheduleReplay.cancel_at_period_end).toBe(false)
    expect(undoReplay.cancel_at_period_end).toBe(false)
    expect(await store.listEvents()).toHaveLength(2)
  })

  it('keeps one cancel flag when two schedules race', async () => {
    const { store, subscriptions } = service()
    const created = await row(subscriptions)
    const results = await Promise.allSettled([
      subscriptions.scheduleCancelAtPeriodEnd({
        external_event_id: 'cancel-a',
        subscription_id: created.subscription_id,
      }),
      subscriptions.scheduleCancelAtPeriodEnd({
        external_event_id: 'cancel-b',
        subscription_id: created.subscription_id,
      }),
    ])
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    expect(results.every((result) => result.value.cancel_at_period_end === true)).toBe(true)
    expect((await store.listEvents()).filter((event) => event.to_cancel_at_period_end === false)).toHaveLength(0)
  })

  it('lets only one of two undos clear the flag', async () => {
    const { store, subscriptions } = service()
    const created = await row(subscriptions)
    await subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'cancel-1',
      subscription_id: created.subscription_id,
    })
    const results = await Promise.allSettled([
      subscriptions.clearCancelAtPeriodEnd({
        external_event_id: 'undo-a',
        subscription_id: created.subscription_id,
      }),
      subscriptions.clearCancelAtPeriodEnd({
        external_event_id: 'undo-b',
        subscription_id: created.subscription_id,
      }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await store.listEvents()).filter((event) => event.operation === 'cancel.clear')).toHaveLength(1)
  })

  it('does not corrupt the row when cancel and undo race', async () => {
    const { store, subscriptions } = service()
    const created = await row(subscriptions)
    await Promise.allSettled([
      subscriptions.scheduleCancelAtPeriodEnd({
        external_event_id: 'cancel-race',
        subscription_id: created.subscription_id,
      }),
      subscriptions.clearCancelAtPeriodEnd({
        external_event_id: 'undo-race',
        subscription_id: created.subscription_id,
      }),
    ])
    const current = await subscriptions.resolveForUser(USER)
    expect(current.subscription.plan_id).toBe(PAID)
    expect(current.subscription.current_period_end).toBe(END)
    expect(current.subscription.pending_plan_id).toBe('plan.prelim.sek.month.09')
    expect(typeof current.subscription.cancel_at_period_end).toBe('boolean')
    expect((await store.listEvents()).length).toBeGreaterThan(0)
  })

  it('does not restore paid access after the period by clearing cancel', async () => {
    const { subscriptions } = service('2026-05-02T00:00:00.000Z')
    const created = await row(subscriptions)
    await subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'cancel-1',
      subscription_id: created.subscription_id,
    })
    await expect(subscriptions.clearCancelAtPeriodEnd({
      external_event_id: 'undo-late',
      subscription_id: created.subscription_id,
    })).rejects.toMatchObject({ code: 'period_expired' })
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe('plan.free')
  })

  it('rejects another user and keeps the SQL on service_role', async () => {
    const { subscriptions } = service()
    const created = await row(subscriptions)
    await expect(subscriptions.scheduleCancelAtPeriodEnd({
      actor_user_id: OTHER,
      external_event_id: 'cancel-other',
      subscription_id: created.subscription_id,
    })).rejects.toMatchObject({ code: 'forbidden_subscription' })
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/grant execute on function billing\.clear_cancel_at_period_end\(text, text\) to service_role/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(sql).toMatch(/for update/)
    expect(sql).toMatch(/period_expired/)
    expect(userApi).not.toMatch(/clear_cancel_at_period_end/)
    expect(sql.replace(/--[^\n]*/g, '')).not.toMatch(/stripe|sumup|checkout|webhook|card_number|cvv/i)
  })
})

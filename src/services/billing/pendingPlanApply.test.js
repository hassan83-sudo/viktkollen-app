import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_STATUS } from './catalog.js'
import { defaultPlanCatalog } from './planCatalog.js'
import { createSubscriptionService } from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'
import { createInMemoryUsageRepository } from './usageRepository.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260924084000_billing_pending_plan_apply.sql'), 'utf8')

const USER = '11111111-1111-4111-8111-111111111111'
const PLAN_49 = 'plan.prelim.sek.month.49'
const PLAN_9 = 'plan.prelim.sek.month.09'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'
const NEXT = '2026-06-01T00:00:00.000Z'

function service(catalog = defaultPlanCatalog) {
  const store = createInMemorySubscriptionStore()
  return {
    store,
    subscriptions: createSubscriptionService({
      catalog,
      now: () => new Date('2026-04-15T00:00:00.000Z'),
      store,
    }),
  }
}

async function scheduled(subscriptions, extra = {}) {
  return subscriptions.createSubscription({
    cancel_at_period_end: true,
    current_period_end: END,
    current_period_start: START,
    pending_plan_change: 'next_period',
    pending_plan_id: PLAN_9,
    plan_id: PLAN_49,
    user_id: USER,
    ...extra,
  })
}

describe('BILL-6C5A next-period plan application', () => {
  it('keeps 49 until the verified period advance applies 9', async () => {
    const catalog = defaultPlanCatalog.map((plan) => (
      plan.id === PLAN_9 ? { ...plan, version: 7 } : plan
    ))
    const { store, subscriptions } = service(catalog)
    const row = await scheduled(subscriptions)
    const during = await subscriptions.resolveForUser(USER)
    expect(during.plan_id).toBe(PLAN_49)
    expect(row.pending_plan_id).toBe(PLAN_9)

    const advanced = await subscriptions.advancePeriod({
      clientClaim: { entitlement: 1, plan_version: 99, price: 1, quota: 1 },
      current_period_end: NEXT,
      external_event_id: 'downgrade-1',
      subscription_id: row.subscription_id,
    })
    expect(advanced.plan_id).toBe(PLAN_9)
    expect(advanced.plan_version).toBe(7)
    expect(advanced.pending_plan_id).toBeNull()
    expect(advanced.pending_plan_change).toBeNull()
    expect(advanced.current_period_start).toBe(START)
    expect(advanced.current_period_end).toBe(NEXT)
    expect(advanced.cancel_at_period_end).toBe(true)
    expect(await store.listEvents()).toEqual([expect.objectContaining({
      from_plan_id: PLAN_49,
      from_plan_version: 1,
      from_status: 'ACTIVE',
      new_period_end: NEXT,
      previous_period_end: END,
      to_plan_id: PLAN_9,
      to_plan_version: 7,
      to_status: 'ACTIVE',
    })])
  })

  it('does not apply the pending plan twice for the same event', async () => {
    const { store, subscriptions } = service()
    const row = await scheduled(subscriptions)
    await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'downgrade-1',
      subscription_id: row.subscription_id,
    })
    const replay = await subscriptions.advancePeriod({
      current_period_end: '2026-07-01T00:00:00.000Z',
      external_event_id: 'downgrade-1',
      subscription_id: row.subscription_id,
    })
    expect(replay.plan_id).toBe(PLAN_9)
    expect(replay.current_period_end).toBe(NEXT)
    expect(await store.listEvents()).toHaveLength(1)
  })

  it('lets only one concurrent advance apply the pending plan', async () => {
    const { store, subscriptions } = service()
    const row = await scheduled(subscriptions)
    const results = await Promise.allSettled([
      subscriptions.advancePeriod({
        current_period_end: NEXT,
        external_event_id: 'race-a',
        subscription_id: row.subscription_id,
      }),
      subscriptions.advancePeriod({
        current_period_end: NEXT,
        external_event_id: 'race-b',
        subscription_id: row.subscription_id,
      }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await store.listEvents()).toHaveLength(1)
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe(PLAN_9)
  })

  it('rejects an invalid pending plan without moving the period', async () => {
    const { subscriptions } = service()
    const missing = await scheduled(subscriptions, { pending_plan_id: 'plan.missing' })
    await expect(subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'bad-plan',
      subscription_id: missing.subscription_id,
    })).rejects.toMatchObject({ code: 'invalid_pending_plan' })
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe(PLAN_49)
    const current = await subscriptions.resolveForUser(USER)
    expect(current.subscription.current_period_end).toBe(END)

    const inactiveCatalog = defaultPlanCatalog.map((plan) => (
      plan.id === PLAN_9 ? { ...plan, active: false } : plan
    ))
    const inactive = service(inactiveCatalog)
    const row = await scheduled(inactive.subscriptions)
    await expect(inactive.subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'inactive-plan',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'invalid_pending_plan' })
    expect((await inactive.subscriptions.resolveForUser(USER)).subscription.current_period_end).toBe(END)
  })

  it('recovers PAST_DUE and applies the pending plan together', async () => {
    const { subscriptions } = service()
    const row = await scheduled(subscriptions, { status: SUBSCRIPTION_STATUS.PAST_DUE })
    const advanced = await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'recover-plan',
      subscription_id: row.subscription_id,
    })
    expect(advanced.status).toBe('ACTIVE')
    expect(advanced.plan_id).toBe(PLAN_9)
    expect(advanced.cancel_at_period_end).toBe(true)
  })

  it('does not touch usage history', async () => {
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
    const { subscriptions } = service()
    const row = await scheduled(subscriptions)
    await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'usage-plan',
      subscription_id: row.subscription_id,
    })
    expect((await usage.list()).map((event) => event.event_id)).toEqual(['keep-usage'])
  })

  it('keeps plan application inside the service-role advance and off the user API', () => {
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/invalid_pending_plan/)
    expect(sql).toMatch(/pending_plan_change = 'next_period'/)
    expect(sql).toMatch(/for update/)
    expect(sql).toMatch(/from_plan_id/)
    expect(sql).toMatch(/to_plan_version/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(sql.replace(/--[^\n]*/g, '')).not.toMatch(/stripe|sumup|checkout|webhook|card_number|cvv/i)
  })
})

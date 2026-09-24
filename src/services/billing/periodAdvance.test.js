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
const sql = readFileSync(join(root, 'supabase/migrations/20260924061000_billing_period_advance.sql'), 'utf8')
const userApi = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')

const USER = '11111111-1111-4111-8111-111111111111'
const PAID = 'plan.prelim.sek.month.19'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'
const NEXT = '2026-06-01T00:00:00.000Z'

function service() {
  const store = createInMemorySubscriptionStore()
  return {
    store,
    subscriptions: createSubscriptionService({
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-05-02T00:00:00.000Z'),
      store,
    }),
  }
}

async function activeRow(subscriptions) {
  return subscriptions.createSubscription({
    cancel_at_period_end: true,
    current_period_end: END,
    current_period_start: START,
    pending_plan_change: 'next_period',
    pending_plan_id: 'plan.prelim.sek.month.09',
    plan_id: PAID,
    user_id: USER,
  })
}

describe('BILL-6C4A period advance', () => {
  it('advances an ACTIVE period once and records the boundary', async () => {
    const { store, subscriptions } = service()
    const row = await activeRow(subscriptions)
    const advanced = await subscriptions.advancePeriod({
      clientClaim: { payment_success: true, plan_id: 'plan.free', price: 1, provider: 'none' },
      current_period_end: NEXT,
      external_event_id: 'period-1',
      subscription_id: row.subscription_id,
    })
    expect(advanced.status).toBe('ACTIVE')
    expect(advanced.current_period_start).toBe(START)
    expect(advanced.current_period_end).toBe(NEXT)
    expect(advanced.plan_id).toBe(PAID)
    expect(advanced.cancel_at_period_end).toBe(true)
    expect(advanced.pending_plan_id).toBe('plan.prelim.sek.month.09')
    const events = await store.listEvents()
    expect(events).toEqual([expect.objectContaining({
      external_event_id: 'period-1',
      from_status: 'ACTIVE',
      new_period_end: NEXT,
      operation: 'period.advance',
      previous_period_end: END,
      subscription_id: row.subscription_id,
      to_status: 'ACTIVE',
    })])
  })

  it('rejects an equal or earlier end', async () => {
    const { subscriptions } = service()
    const row = await activeRow(subscriptions)
    await expect(subscriptions.advancePeriod({
      current_period_end: END,
      external_event_id: 'same-end',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'period_end_not_later' })
    await expect(subscriptions.advancePeriod({
      current_period_end: START,
      external_event_id: 'earlier-end',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'period_end_not_later' })
  })

  it('replays the same event without a second advance', async () => {
    const { store, subscriptions } = service()
    const row = await activeRow(subscriptions)
    const first = await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'period-1',
      subscription_id: row.subscription_id,
    })
    const replay = await subscriptions.advancePeriod({
      current_period_end: '2026-07-01T00:00:00.000Z',
      external_event_id: 'period-1',
      subscription_id: row.subscription_id,
    })
    expect(replay.current_period_end).toBe(first.current_period_end)
    expect(await store.listEvents()).toHaveLength(1)
  })

  it('does not let a second event repeat the same period end', async () => {
    const { subscriptions } = service()
    const row = await activeRow(subscriptions)
    await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'period-1',
      subscription_id: row.subscription_id,
    })
    await expect(subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'period-2',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'period_end_not_later' })
  })

  it('lets only one of two concurrent advances apply the same end', async () => {
    const { store, subscriptions } = service()
    const row = await activeRow(subscriptions)
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
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    expect(fulfilled).toHaveLength(1)
    expect(fulfilled[0].value.current_period_end).toBe(NEXT)
    expect(await store.listEvents()).toHaveLength(1)
  })

  it('recovers PAST_DUE into ACTIVE for a later period', async () => {
    const { subscriptions } = service()
    const row = await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      status: SUBSCRIPTION_STATUS.PAST_DUE,
      user_id: USER,
    })
    const advanced = await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'recover-1',
      subscription_id: row.subscription_id,
    })
    expect(advanced.status).toBe('ACTIVE')
    expect(advanced.current_period_end).toBe(NEXT)
    expect(advanced.plan_id).toBe(PAID)
    expect(advanced.past_due_grace_until).toBeNull()
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
    const row = await activeRow(subscriptions)
    await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'period-usage',
      subscription_id: row.subscription_id,
    })
    expect((await usage.list()).map((event) => event.event_id)).toEqual(['keep-usage'])
  })

  it('keeps the RPC on service_role and out of the user API', () => {
    const ddl = sql.replace(/--[^\n]*/g, '')
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/revoke all on function billing\.advance_subscription_period\(text, timestamptz, text\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.advance_subscription_period\(text, timestamptz, text\) to service_role/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(sql).toMatch(/for update/)
    expect(sql).toMatch(/period_end_not_later/)
    expect(sql).toMatch(/current_period_end cannot be extended/)
    expect(sql).toMatch(/current_period_end cannot be shortened/)
    expect(sql).toMatch(/operation = 'period.advance'/)
    expect(ddl).not.toMatch(/stripe|sumup|checkout|webhook|card_number|cvv/i)
    expect(sql).not.toMatch(/alter table billing\.usage_events/i)
    expect(userApi).not.toMatch(/advance_subscription_period/)
  })
})

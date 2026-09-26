import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_STATUS } from './catalog.js'
import { defaultPlanCatalog } from './planCatalog.js'
import { createInMemoryUserPlanAssignmentStore, createPlanActivation } from './planAssignmentSync.js'
import { createSubscriptionService } from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'

const USER = '11111111-1111-4111-8111-111111111111'
const CURRENT = 'plan.prelim.sek.month.49'
const TARGET = 'plan.prelim.sek.month.09'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'
const NEXT = '2026-06-01T00:00:00.000Z'

function harness(iso = '2026-04-15T00:00:00.000Z') {
  const store = createInMemorySubscriptionStore()
  const subscriptions = createSubscriptionService({
    catalog: defaultPlanCatalog,
    now: () => new Date(iso),
    store,
  })
  const assignments = createInMemoryUserPlanAssignmentStore()
  return {
    activation: createPlanActivation({ assignments, now: () => new Date(iso), subscriptions }),
    assignments,
    store,
    subscriptions,
  }
}

async function openRow(subscriptions, extra = {}) {
  return subscriptions.createSubscription({
    current_period_end: END,
    current_period_start: START,
    plan_id: CURRENT,
    user_id: USER,
    ...extra,
  })
}

describe('BILL-7C plan activation', () => {
  it('assigns the entitled plan, ignores a client plan, and does not copy limits', async () => {
    const { activation, subscriptions } = harness()
    const row = await openRow(subscriptions)
    const assigned = await activation.syncFromSubscription({
      clientClaim: { limit: 9999, plan_id: TARGET, quota: 9999 },
      external_event_id: 'activate-1',
      subscription_id: row.subscription_id,
    })
    expect(assigned.plan_id).toBe(CURRENT)
    expect(assigned.source).toBe('server')
    expect(assigned).not.toHaveProperty('limit')
    expect(assigned).not.toHaveProperty('entitlements')
  })

  it('replays the same event and rejects it after the entitled plan changes', async () => {
    const { activation, subscriptions } = harness()
    const row = await openRow(subscriptions)
    const first = await activation.syncFromSubscription({
      external_event_id: 'activate-once',
      subscription_id: row.subscription_id,
    })
    const replay = await activation.syncFromSubscription({
      external_event_id: 'activate-once',
      subscription_id: row.subscription_id,
    })
    expect(replay).toEqual(first)
    await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'pending-later',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'advance-later',
      subscription_id: row.subscription_id,
    })
    await expect(activation.syncFromSubscription({
      external_event_id: 'activate-once',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'duplicate_external_event' })
    const current = await activation.syncFromSubscription({
      external_event_id: 'activate-after',
      subscription_id: row.subscription_id,
    })
    expect(current.plan_id).toBe(TARGET)
  })

  it('keeps access when cancellation is scheduled and returns to free when the subscription ends', async () => {
    const early = harness()
    const row = await openRow(early.subscriptions, { cancel_at_period_end: true })
    await early.subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'pending-keep',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    const whileOpen = await early.activation.syncFromSubscription({
      external_event_id: 'activate-open',
      subscription_id: row.subscription_id,
    })
    expect(whileOpen.plan_id).toBe(CURRENT)
    const later = createPlanActivation({
      assignments: early.assignments,
      now: () => new Date('2026-05-02T00:00:00.000Z'),
      subscriptions: createSubscriptionService({
        catalog: defaultPlanCatalog,
        now: () => new Date('2026-05-02T00:00:00.000Z'),
        store: early.store,
      }),
    })
    const closed = await later.syncFromSubscription({
      external_event_id: 'activate-ended',
      subscription_id: row.subscription_id,
    })
    expect(closed.plan_id).toBe('plan.free')
    expect(closed.source).toBe('server-default')
    await early.subscriptions.transition({
      subscription_id: row.subscription_id,
      to: SUBSCRIPTION_STATUS.CANCELED,
    })
    const terminal = await later.syncFromSubscription({
      external_event_id: 'activate-terminal',
      subscription_id: row.subscription_id,
    })
    expect(terminal.plan_id).toBe('plan.free')
  })
})

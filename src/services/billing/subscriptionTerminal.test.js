import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createQuotaEngine } from './quotaEngine.js'
import { defaultPlanCatalog } from './planCatalog.js'
import { createInMemoryReservationStore } from './reservationStore.js'
import { createSubscriptionAssignmentStore, createSubscriptionService } from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'
import { createInMemoryUsageRepository } from './usageRepository.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260924094500_billing_subscription_terminal.sql'), 'utf8')
const userApi = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')

const USER = '11111111-1111-4111-8111-111111111111'
const PAID = 'plan.prelim.sek.month.49'
const PENDING = 'plan.prelim.sek.month.09'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'
const GRACE = '2026-04-20T00:00:00.000Z'

function service(iso = '2026-05-02T00:00:00.000Z') {
  const store = createInMemorySubscriptionStore()
  const subscriptions = createSubscriptionService({
    catalog: defaultPlanCatalog,
    now: () => new Date(iso),
    store,
  })
  return { store, subscriptions }
}

async function openRow(subscriptions, extra = {}) {
  return subscriptions.createSubscription({
    cancel_at_period_end: false,
    current_period_end: END,
    current_period_start: START,
    pending_plan_change: 'next_period',
    pending_plan_id: PENDING,
    plan_id: PAID,
    status: 'ACTIVE',
    user_id: USER,
    ...extra,
  })
}

describe('BILL-6C7B terminalization', () => {
  it('cancels a scheduled active subscription at period end and keeps the flag', async () => {
    const { store, subscriptions } = service()
    const created = await openRow(subscriptions, { cancel_at_period_end: true })
    const done = await subscriptions.finalizeOpenSubscription({
      clientClaim: { plan_id: 'plan.free', status: 'ACTIVE' },
      external_event_id: 'term-cancel',
      subscription_id: created.subscription_id,
    })
    expect(done.status).toBe('CANCELED')
    expect(done.cancel_at_period_end).toBe(true)
    expect(done.plan_id).toBe(PAID)
    expect(done.current_period_end).toBe(END)
    expect(done.pending_plan_id).toBeNull()
    expect((await store.listEvents())[0]).toMatchObject({
      from_cancel_at_period_end: true,
      from_status: 'ACTIVE',
      operation: 'subscription.terminal',
      previous_pending_plan_change: 'next_period',
      previous_pending_plan_id: PENDING,
      to_status: 'CANCELED',
    })
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe('plan.free')
  })

  it('expires an unscheduled active period and a past-due grace', async () => {
    const active = service()
    const activeRow = await openRow(active.subscriptions)
    expect((await active.subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-active',
      subscription_id: activeRow.subscription_id,
    })).status).toBe('EXPIRED')

    const grace = service()
    const graceRow = await openRow(grace.subscriptions, {
      past_due_grace_until: GRACE,
      status: 'PAST_DUE',
    })
    const expired = await grace.subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-grace',
      subscription_id: graceRow.subscription_id,
    })
    expect(expired.status).toBe('EXPIRED')
    expect(expired.past_due_grace_until).toBeNull()
    expect((await grace.store.listEvents())[0].past_due_grace_until).toBe(GRACE)

    const missing = service('2026-04-10T00:00:00.000Z')
    const missingRow = await openRow(missing.subscriptions, {
      past_due_grace_until: null,
      status: 'PAST_DUE',
    })
    expect((await missing.subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-null-grace',
      subscription_id: missingRow.subscription_id,
    })).status).toBe('EXPIRED')
  })

  it('does not terminalize an entitled row early', async () => {
    const active = service('2026-04-15T00:00:00.000Z')
    const activeRow = await openRow(active.subscriptions, { cancel_at_period_end: true })
    const still = await active.subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-early',
      subscription_id: activeRow.subscription_id,
    })
    expect(still.status).toBe('ACTIVE')
    expect(await active.store.listEvents()).toHaveLength(0)

    const due = service('2026-04-15T00:00:00.000Z')
    const dueRow = await openRow(due.subscriptions, {
      past_due_grace_until: GRACE,
      status: 'PAST_DUE',
    })
    expect((await due.subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-grace-early',
      subscription_id: dueRow.subscription_id,
    })).status).toBe('PAST_DUE')
  })

  it('falls back to free quotas and keeps usage and reservations', async () => {
    const usage = createInMemoryUsageRepository()
    const reservations = createInMemoryReservationStore()
    await usage.insert({
      event_id: 'paid-use',
      event_type: 'food.scan',
      feature: 'food.scan',
      occurred_at: '2026-04-02T00:00:00.000Z',
      quantity: 1,
      unit: 'requests',
      user_id: USER,
    })
    await reservations.insert({
      feature: 'food.scan',
      plan_id: PAID,
      plan_version: 1,
      quantity: 1,
      reservation_id: 'paid-reserve',
      status: 'COMMITTED',
      unit: 'requests',
      user_id: USER,
    })
    const { store, subscriptions } = service()
    const created = await openRow(subscriptions)
    await subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-free',
      subscription_id: created.subscription_id,
    })
    const quota = createQuotaEngine({
      assignments: createSubscriptionAssignmentStore(subscriptions),
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-05-02T00:00:00.000Z'),
      reservations,
      usageRepository: usage,
    })
    expect((await quota.inspectQuota({ feature: 'food.scan', userId: USER })).limit).toBe(5)
    expect((await usage.list()).map((event) => event.event_id)).toEqual(['paid-use'])
    expect((await reservations.list()).map((row) => row.reservation_id)).toEqual(['paid-reserve'])
    expect((await store.listEvents()).map((event) => event.operation)).toEqual(['subscription.terminal'])
  })

  it('replays one event and ignores a second terminal event', async () => {
    const { store, subscriptions } = service()
    const created = await openRow(subscriptions)
    const first = await subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-1',
      subscription_id: created.subscription_id,
    })
    const replay = await subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-1',
      subscription_id: created.subscription_id,
    })
    const second = await subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-2',
      subscription_id: created.subscription_id,
    })
    expect(replay.status).toBe('EXPIRED')
    expect(second.status).toBe(first.status)
    expect(await store.listEvents()).toHaveLength(1)
    await expect(subscriptions.transition({
      subscription_id: created.subscription_id,
      to: 'ACTIVE',
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
  })

  it('keeps one terminal event when two calls race', async () => {
    const { store, subscriptions } = service()
    const created = await openRow(subscriptions)
    const results = await Promise.allSettled([
      subscriptions.finalizeOpenSubscription({
        external_event_id: 'term-a',
        subscription_id: created.subscription_id,
      }),
      subscriptions.finalizeOpenSubscription({
        external_event_id: 'term-b',
        subscription_id: created.subscription_id,
      }),
    ])
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    expect(results.every((result) => result.value.status === 'EXPIRED')).toBe(true)
    expect(await store.listEvents()).toHaveLength(1)
  })

  it('lets a committed renewal block terminalization and a terminal row block renewal', async () => {
    const renewed = service('2026-05-02T00:00:00.000Z')
    const renewedRow = await openRow(renewed.subscriptions)
    await renewed.subscriptions.advancePeriod({
      current_period_end: '2026-06-01T00:00:00.000Z',
      external_event_id: 'renew-1',
      subscription_id: renewedRow.subscription_id,
    })
    const skipped = await renewed.subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-after-renew',
      subscription_id: renewedRow.subscription_id,
    })
    expect(skipped.status).toBe('ACTIVE')
    expect(skipped.current_period_end).toBe('2026-06-01T00:00:00.000Z')
    expect(skipped.plan_id).toBe(PENDING)

    const closed = service()
    const closedRow = await openRow(closed.subscriptions)
    await closed.subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-first',
      subscription_id: closedRow.subscription_id,
    })
    await expect(closed.subscriptions.advancePeriod({
      current_period_end: '2026-06-01T00:00:00.000Z',
      external_event_id: 'renew-late',
      subscription_id: closedRow.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
  })

  it('does not let cancel or undo change a terminal row', async () => {
    const { subscriptions } = service()
    const created = await openRow(subscriptions, { cancel_at_period_end: true })
    await subscriptions.finalizeOpenSubscription({
      external_event_id: 'term-boundary',
      subscription_id: created.subscription_id,
    })
    await expect(subscriptions.clearCancelAtPeriodEnd({
      external_event_id: 'undo-late',
      subscription_id: created.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
    await expect(subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'cancel-late',
      subscription_id: created.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe('plan.free')
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/grant execute on function billing\.finalize_open_subscription\(text, text\) to service_role/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(sql).toMatch(/for update/)
    expect(userApi).not.toMatch(/finalize_open_subscription/)
    expect(sql.replace(/--[^\n]*/g, '')).not.toMatch(/stripe|sumup|checkout|webhook|card_number|cvv/i)
  })
})

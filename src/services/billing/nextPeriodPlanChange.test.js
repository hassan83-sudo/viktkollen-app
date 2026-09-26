import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLAN_CHANGE_WHEN, SUBSCRIPTION_STATUS } from './catalog.js'
import { defaultPlanCatalog } from './planCatalog.js'
import { createSubscriptionService } from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const userApi = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')
const serviceSource = readFileSync(join(root, 'src/services/billing/subscriptionService.js'), 'utf8')

const USER = '11111111-1111-4111-8111-111111111111'
const CURRENT = 'plan.prelim.sek.month.49'
const TARGET = 'plan.prelim.sek.month.09'
const OTHER = 'plan.prelim.sek.month.19'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'
const NEXT = '2026-06-01T00:00:00.000Z'

function service(iso = '2026-04-15T00:00:00.000Z', catalog = defaultPlanCatalog) {
  const store = createInMemorySubscriptionStore()
  return {
    store,
    subscriptions: createSubscriptionService({
      catalog,
      now: () => new Date(iso),
      store,
    }),
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

describe('BILL-7A next-period plan change', () => {
  it('schedules a next-period plan without changing the active plan', async () => {
    const { subscriptions } = service()
    const row = await openRow(subscriptions)
    const scheduled = await subscriptions.scheduleNextPeriodPlanChange({
      clientClaim: { payment_success: true, plan_id: OTHER, price: 1 },
      external_event_id: 'change-1',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    expect(scheduled.plan_id).toBe(CURRENT)
    expect(scheduled.plan_version).toBe(row.plan_version)
    expect(scheduled.pending_plan_id).toBe(TARGET)
    expect(scheduled.pending_plan_change).toBe(PLAN_CHANGE_WHEN.NEXT_PERIOD)
    expect(scheduled.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(scheduled.current_period_end).toBe(END)
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe(CURRENT)
  })

  it('applies the pending plan only through period advance and then clears it', async () => {
    const catalog = defaultPlanCatalog.map((plan) => (
      plan.id === TARGET ? { ...plan, version: 4 } : plan
    ))
    const { subscriptions } = service('2026-05-02T00:00:00.000Z', catalog)
    const row = await openRow(subscriptions)
    const scheduled = await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'change-apply',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    expect(scheduled.plan_id).toBe(CURRENT)
    expect(scheduled.pending_plan_id).toBe(TARGET)
    const advanced = await subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'advance-apply',
      subscription_id: row.subscription_id,
    })
    expect(advanced.plan_id).toBe(TARGET)
    expect(advanced.plan_version).toBe(4)
    expect(advanced.pending_plan_id).toBeNull()
    expect(advanced.pending_plan_change).toBeNull()
  })

  it('replays the same event and plan, and rejects a conflicting plan', async () => {
    const { subscriptions } = service()
    const row = await openRow(subscriptions)
    const first = await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'change-once',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    const replay = await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'change-once',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    expect(replay).toEqual(first)
    await expect(subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'change-once',
      plan_id: OTHER,
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'duplicate_external_event' })
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe(CURRENT)
    expect((await subscriptions.resolveForUser(USER)).subscription.pending_plan_id).toBe(TARGET)
    await subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'cancel-event',
      subscription_id: row.subscription_id,
    })
    await expect(subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'cancel-event',
      plan_id: OTHER,
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'duplicate_external_event' })
    const replaced = await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'change-next',
      plan_id: OTHER,
      subscription_id: row.subscription_id,
    })
    expect(replaced.plan_id).toBe(CURRENT)
    expect(replaced.pending_plan_id).toBe(OTHER)
    expect(replaced.cancel_at_period_end).toBe(true)
  })

  it('rejects an unknown plan, plan.free, an inactive plan, and the current plan', async () => {
    const inactive = defaultPlanCatalog.map((plan) => (
      plan.id === OTHER ? { ...plan, active: false } : plan
    ))
    const { subscriptions } = service('2026-04-15T00:00:00.000Z', inactive)
    const row = await openRow(subscriptions)
    await expect(subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'missing-plan',
      plan_id: 'plan.missing',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'invalid_pending_plan' })
    await expect(subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'free-plan',
      plan_id: 'plan.free',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'invalid_pending_plan' })
    await expect(subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'inactive-plan',
      plan_id: OTHER,
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'invalid_pending_plan' })
    await expect(subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'same-plan',
      plan_id: CURRENT,
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'invalid_pending_plan' })
    expect(row.pending_plan_id).toBeNull()
  })

  it('accepts PAST_DUE and rejects trialing, paused, and terminal rows', async () => {
    const due = service()
    const pastDue = await openRow(due.subscriptions, { status: SUBSCRIPTION_STATUS.PAST_DUE })
    const scheduled = await due.subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'past-due-change',
      plan_id: TARGET,
      subscription_id: pastDue.subscription_id,
    })
    expect(scheduled.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE)
    expect(scheduled.plan_id).toBe(CURRENT)
    expect(scheduled.pending_plan_id).toBe(TARGET)

    const trialing = service()
    const trial = await openRow(trialing.subscriptions, { status: SUBSCRIPTION_STATUS.TRIALING })
    await expect(trialing.subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'trial-change',
      plan_id: TARGET,
      subscription_id: trial.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })

    const paused = service()
    const pause = await openRow(paused.subscriptions, { status: SUBSCRIPTION_STATUS.PAUSED })
    await expect(paused.subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'pause-change',
      plan_id: TARGET,
      subscription_id: pause.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })

    const { subscriptions } = service()
    const active = await openRow(subscriptions)
    await subscriptions.transition({ subscription_id: active.subscription_id, to: SUBSCRIPTION_STATUS.CANCELED })
    await expect(subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'canceled-change',
      plan_id: TARGET,
      subscription_id: active.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
    const expired = await openRow(subscriptions)
    await subscriptions.transition({ subscription_id: expired.subscription_id, to: SUBSCRIPTION_STATUS.EXPIRED })
    await expect(subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'expired-change',
      plan_id: TARGET,
      subscription_id: expired.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
  })

  it('keeps cancellation, replaces an older pending plan, and lets terminalization clear it', async () => {
    const { subscriptions } = service()
    const row = await openRow(subscriptions, { cancel_at_period_end: true, pending_plan_change: 'next_period', pending_plan_id: OTHER })
    await subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'keep-cancel',
      subscription_id: row.subscription_id,
    })
    const scheduled = await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'replace-pending',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    expect(scheduled.cancel_at_period_end).toBe(true)
    expect(scheduled.plan_id).toBe(CURRENT)
    expect(scheduled.pending_plan_id).toBe(TARGET)
    expect(scheduled.pending_plan_change).toBe('next_period')
    const cleared = await subscriptions.clearCancelAtPeriodEnd({
      external_event_id: 'undo-cancel',
      subscription_id: row.subscription_id,
    })
    expect(cleared.cancel_at_period_end).toBe(false)
    expect(cleared.pending_plan_id).toBe(TARGET)
  })

  it('clears a pending plan when terminalization closes the subscription', async () => {
    const { subscriptions } = service('2026-05-02T00:00:00.000Z')
    const row = await openRow(subscriptions, { cancel_at_period_end: true })
    await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'change-before-close',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    const closed = await subscriptions.finalizeOpenSubscription({
      external_event_id: 'close-pending',
      subscription_id: row.subscription_id,
    })
    expect(closed.status).toBe(SUBSCRIPTION_STATUS.CANCELED)
    expect(closed.plan_id).toBe(CURRENT)
    expect(closed.pending_plan_id).toBeNull()
    expect(closed.pending_plan_change).toBeNull()
    expect((await subscriptions.resolveForUser(USER)).plan_id).toBe('plan.free')
  })

  it('does not add immediate change, payment, or an HTTP route', () => {
    expect(PLAN_CHANGE_WHEN.NOW).toBe('now')
    expect(serviceSource).not.toMatch(/stripe|sumup|klarna|checkout|webhook|proration|pro-rata/i)
    expect(serviceSource).not.toMatch(/pending_plan_change:\s*'now'/)
    expect(userApi).not.toMatch(/scheduleNextPeriodPlanChange/)
  })
})

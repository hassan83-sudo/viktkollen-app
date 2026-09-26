import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUBSCRIPTION_STATUS } from './catalog.js'
import { BASELINE_PLAN_ID } from './effectivePlan.js'
import { defaultPlanCatalog } from './planCatalog.js'
import { createPlanActivation, createInMemoryUserPlanAssignmentStore } from './planAssignmentSync.js'
import { createRenewalLifecycle } from './renewalResult.js'
import { createLocalSubscriptionLifecycle, createSubscriptionLifecycle } from './subscriptionLifecycle.js'
import { createSubscriptionService } from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'

const USER = '11111111-1111-4111-8111-111111111111'
const CURRENT = 'plan.prelim.sek.month.49'
const TARGET = 'plan.prelim.sek.month.09'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'
const NEXT = '2026-06-01T00:00:00.000Z'
const GRACE = '2026-04-28T00:00:00.000Z'

function harness(iso = '2026-04-15T00:00:00.000Z') {
  let current = iso
  const now = () => new Date(current)
  const store = createInMemorySubscriptionStore()
  const subscriptions = createSubscriptionService({ catalog: defaultPlanCatalog, now, store })
  const assignments = createInMemoryUserPlanAssignmentStore()
  const activation = createPlanActivation({ assignments, now, subscriptions })
  const renewals = createRenewalLifecycle({ now, store, subscriptions })
  return {
    assignments,
    at(next) { current = next },
    lifecycle: createSubscriptionLifecycle({ activation, renewals, subscriptions }),
    subscriptions,
  }
}

async function openRow(subscriptions) {
  return subscriptions.createSubscription({
    current_period_end: END,
    current_period_start: START,
    plan_id: CURRENT,
    user_id: USER,
  })
}

describe('subscription lifecycle alignment', () => {
  it('fails closed when a lifecycle dependency is missing', () => {
    expect(() => createSubscriptionLifecycle({})).toThrow(expect.objectContaining({
      code: 'durable_operation_unavailable',
    }))
  })

  it('keeps the current assignment when a next-period plan is only scheduled', async () => {
    const { assignments, lifecycle, subscriptions } = harness()
    const row = await openRow(subscriptions)
    const scheduled = await lifecycle.scheduleNextPeriodPlanChange({
      clientClaim: { limit: 999, plan_id: TARGET, quota: 999 },
      external_event_id: 'life-schedule',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    expect(scheduled.subscription.plan_id).toBe(CURRENT)
    expect(scheduled.subscription.pending_plan_id).toBe(TARGET)
    expect(scheduled.assignment.plan_id).toBe(CURRENT)
    expect(scheduled.assignment.source).toBe('server')
    expect(scheduled.assignment).not.toHaveProperty('limit')
    expect(scheduled.assignment).not.toHaveProperty('quota')
    const replay = await lifecycle.scheduleNextPeriodPlanChange({
      external_event_id: 'life-schedule',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    expect(replay.assignment).toEqual(scheduled.assignment)
    expect(await assignments.get(USER)).toEqual(scheduled.assignment)
  })

  it('applies the pending plan to the assignment only after period advance', async () => {
    const { lifecycle, subscriptions } = harness()
    const row = await openRow(subscriptions)
    await lifecycle.scheduleNextPeriodPlanChange({
      external_event_id: 'life-schedule-2',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    const advanced = await lifecycle.advancePeriod({
      clientClaim: { payment_success: true, plan_id: 'plan.free' },
      current_period_end: NEXT,
      external_event_id: 'life-advance',
      subscription_id: row.subscription_id,
    })
    expect(advanced.subscription.plan_id).toBe(TARGET)
    expect(advanced.subscription.pending_plan_id).toBeNull()
    expect(advanced.assignment.plan_id).toBe(TARGET)
    const replay = await lifecycle.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'life-advance',
      subscription_id: row.subscription_id,
    })
    expect(replay.subscription.current_period_end).toBe(NEXT)
    expect(replay.assignment).toEqual(advanced.assignment)
    await expect(lifecycle.applyTrustedRenewal({
      current_period_end: '2026-07-01T00:00:00.000Z',
      external_event_id: 'life-advance',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'duplicate_external_event' })
    expect(advanced.assignment.plan_id).toBe(TARGET)
  })

  it('keeps the paid assignment through scheduled cancellation and drops it at terminalization', async () => {
    const { at, lifecycle, subscriptions } = harness()
    const row = await openRow(subscriptions)
    const scheduled = await lifecycle.scheduleCancelAtPeriodEnd({
      external_event_id: 'life-cancel',
      subscription_id: row.subscription_id,
    })
    expect(scheduled.subscription.cancel_at_period_end).toBe(true)
    expect(scheduled.assignment.plan_id).toBe(CURRENT)
    const undone = await lifecycle.clearCancelAtPeriodEnd({
      external_event_id: 'life-undo',
      subscription_id: row.subscription_id,
    })
    expect(undone.subscription.cancel_at_period_end).toBe(false)
    expect(undone.assignment.plan_id).toBe(CURRENT)
    await lifecycle.scheduleCancelAtPeriodEnd({
      external_event_id: 'life-cancel-2',
      subscription_id: row.subscription_id,
    })
    at('2026-05-02T00:00:00.000Z')
    const closed = await lifecycle.finalizeOpenSubscription({
      external_event_id: 'life-close',
      subscription_id: row.subscription_id,
    })
    expect(closed.subscription.status).toBe(SUBSCRIPTION_STATUS.CANCELED)
    expect(closed.assignment.plan_id).toBe(BASELINE_PLAN_ID)
    expect(closed.assignment.source).toBe('server-default')
  })

  it('syncs a failed renewal without dropping in-period grace, then recovers on success', async () => {
    const { lifecycle, subscriptions } = harness()
    const row = await openRow(subscriptions)
    await lifecycle.scheduleNextPeriodPlanChange({
      external_event_id: 'life-pending',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    const failed = await lifecycle.applyTrustedRenewal({
      clientClaim: { payment_success: false, plan_id: 'plan.free' },
      current_period_end: END,
      external_event_id: 'life-fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(failed.subscription.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE)
    expect(failed.subscription.plan_id).toBe(CURRENT)
    expect(failed.assignment.plan_id).toBe(CURRENT)
    const failedReplay = await lifecycle.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'life-fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(failedReplay.assignment).toEqual(failed.assignment)
    const recovered = await lifecycle.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'life-recover',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })
    expect(recovered.subscription.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(recovered.subscription.plan_id).toBe(TARGET)
    expect(recovered.subscription.pending_plan_id).toBeNull()
    expect(recovered.assignment.plan_id).toBe(TARGET)
    const local = createLocalSubscriptionLifecycle({
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-04-15T00:00:00.000Z'),
    })
    expect(local.authority.durable).toBe(false)
  })
})

describe('subscription lifecycle source boundary', () => {
  it('does not recreate public.user_entitlements or choose a payment provider', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'subscriptionLifecycle.js'), 'utf8')
    expect(source).not.toMatch(/user_entitlements/)
    expect(source).not.toMatch(/stripe|sumup|klarna|checkout|webhook/i)
  })
})

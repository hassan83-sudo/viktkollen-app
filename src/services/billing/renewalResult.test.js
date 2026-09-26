import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_STATUS } from './catalog.js'
import { defaultPlanCatalog } from './planCatalog.js'
import { createRenewalLifecycle } from './renewalResult.js'
import { createSubscriptionService } from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'

const USER = '11111111-1111-4111-8111-111111111111'
const CURRENT = 'plan.prelim.sek.month.49'
const TARGET = 'plan.prelim.sek.month.09'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'
const NEXT = '2026-06-01T00:00:00.000Z'
const GRACE = '2026-05-08T00:00:00.000Z'

function harness() {
  const store = createInMemorySubscriptionStore()
  const subscriptions = createSubscriptionService({
    catalog: defaultPlanCatalog,
    now: () => new Date('2026-05-02T00:00:00.000Z'),
    store,
  })
  return {
    renewals: createRenewalLifecycle({ now: () => new Date('2026-05-02T00:00:00.000Z'), store, subscriptions }),
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

describe('BILL-7D renewal results', () => {
  it('applies one successful renewal and replays the same event', async () => {
    const { renewals, subscriptions } = harness()
    const row = await openRow(subscriptions)
    const renewed = await renewals.applyTrustedRenewal({
      clientClaim: { payment_success: true, plan_id: TARGET, price: 1 },
      current_period_end: NEXT,
      external_event_id: 'renew-ok',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })
    expect(renewed.plan_id).toBe(CURRENT)
    expect(renewed.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(renewed.current_period_end).toBe(NEXT)
    const replay = await renewals.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'renew-ok',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })
    expect(replay.current_period_end).toBe(NEXT)
    await expect(renewals.applyTrustedRenewal({
      current_period_end: '2026-07-01T00:00:00.000Z',
      external_event_id: 'renew-ok',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'duplicate_external_event' })
    await expect(renewals.applyTrustedRenewal({
      external_event_id: 'renew-ok',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'duplicate_external_event' })
  })

  it('marks a failed renewal past due and recovers on a later success', async () => {
    const { renewals, subscriptions } = harness()
    const row = await openRow(subscriptions)
    const failed = await renewals.applyTrustedRenewal({
      external_event_id: 'renew-fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(failed.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE)
    expect(failed.past_due_grace_until).toBe(GRACE)
    expect(failed.plan_id).toBe(CURRENT)
    const replay = await renewals.applyTrustedRenewal({
      external_event_id: 'renew-fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(replay.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE)
    const recovered = await renewals.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'renew-recover',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })
    expect(recovered.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(recovered.past_due_grace_until).toBeNull()
    expect(recovered.current_period_end).toBe(NEXT)
  })

  it('applies a pending plan only on success and keeps a scheduled cancellation', async () => {
    const { renewals, subscriptions } = harness()
    const row = await openRow(subscriptions, { cancel_at_period_end: true })
    await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'renew-pending',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    const failed = await renewals.applyTrustedRenewal({
      external_event_id: 'renew-fail-pending',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(failed.plan_id).toBe(CURRENT)
    expect(failed.pending_plan_id).toBe(TARGET)
    expect(failed.cancel_at_period_end).toBe(true)
    const renewed = await renewals.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'renew-apply',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })
    expect(renewed.plan_id).toBe(TARGET)
    expect(renewed.pending_plan_id).toBeNull()
    expect(renewed.cancel_at_period_end).toBe(true)
    expect(renewed.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
  })

  it('rejects renewal of a terminal subscription', async () => {
    const { renewals, subscriptions } = harness()
    const row = await openRow(subscriptions)
    await subscriptions.transition({ subscription_id: row.subscription_id, to: SUBSCRIPTION_STATUS.CANCELED })
    await expect(renewals.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'renew-terminal',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
    await expect(renewals.applyTrustedRenewal({
      external_event_id: 'renew-terminal-fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
  })
})

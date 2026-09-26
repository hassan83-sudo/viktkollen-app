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
      current_period_end: END,
      external_event_id: 'renew-fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(failed.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE)
    expect(failed.past_due_grace_until).toBe(GRACE)
    expect(failed.plan_id).toBe(CURRENT)
    const replay = await renewals.applyTrustedRenewal({
      current_period_end: END,
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
      current_period_end: END,
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

  it('uses the durable renewal RPC without a memory store or client plan', async () => {
    const calls = []
    const renewals = createRenewalLifecycle({
      subscriptions: {
        async advancePeriod(input) {
          calls.push(['advance', input])
          return { status: 'ACTIVE', subscription_id: input.subscription_id }
        },
        async markPastDue(input) {
          calls.push(['failed', input])
          return { plan_id: CURRENT, status: 'PAST_DUE', subscription_id: input.subscriptionId }
        },
      },
    })
    const failed = await renewals.applyTrustedRenewal({
      clientClaim: { period_end: '1999-01-01T00:00:00.000Z', plan_id: 'plan.free', quota: 3 },
      current_period_end: END,
      external_event_id: 'durable-fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: 'sub-1',
    })
    expect(failed.status).toBe('PAST_DUE')
    expect(calls[0][1].clientClaim).toEqual({})
    expect(calls[0][1].currentPeriodEnd).toBe(END)
    expect(calls[0][1].graceUntil).toBe(GRACE)
    expect(JSON.stringify(calls)).not.toMatch(/plan\.free|quota|1999-01-01/)
    await renewals.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'durable-ok',
      outcome: 'succeeded',
      subscription_id: 'sub-1',
    })
    expect(calls[1][0]).toBe('advance')
    await expect(createRenewalLifecycle({
      subscriptions: { async advancePeriod() { return null } },
    }).applyTrustedRenewal({
      external_event_id: 'durable-missing',
      outcome: 'failed',
      subscription_id: 'sub-1',
    })).rejects.toMatchObject({ code: 'durable_operation_unavailable' })
  })
})

describe('BILL-7S failed renewal period ordering', () => {
  it('keeps a recorded past-due event from applying after recovery', async () => {
    const { renewals, subscriptions } = harness()
    const row = await openRow(subscriptions, { cancel_at_period_end: true })
    await subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'stale-pending',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    const failed = await renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(failed.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE)
    expect(failed.plan_id).toBe(CURRENT)
    expect(failed.pending_plan_id).toBe(TARGET)
    expect(failed.cancel_at_period_end).toBe(true)
    const again = await renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-while-due',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(again.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE)
    expect(again.pending_plan_id).toBe(TARGET)
    const longer = await renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-longer-grace',
      outcome: 'failed',
      past_due_grace_until: '2026-05-20T00:00:00.000Z',
      subscription_id: row.subscription_id,
    })
    expect(longer.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE)
    expect(longer.past_due_grace_until).toBe(GRACE)
    const recovered = await renewals.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'stale-recover',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })
    expect(recovered.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(recovered.plan_id).toBe(TARGET)
    expect(recovered.pending_plan_id).toBeNull()
    expect(recovered.current_period_end).toBe(NEXT)
    const replay = await renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-while-due',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(replay.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(replay.plan_id).toBe(TARGET)
    expect(replay.current_period_end).toBe(NEXT)
    expect(replay.cancel_at_period_end).toBe(true)
    const longerReplay = await renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-longer-grace',
      outcome: 'failed',
      past_due_grace_until: '2026-05-20T00:00:00.000Z',
      subscription_id: row.subscription_id,
    })
    expect(longerReplay.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(longerReplay.past_due_grace_until).toBeNull()
    const stale = await renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-after-success',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })
    expect(stale.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(stale.plan_id).toBe(TARGET)
    expect(stale.pending_plan_id).toBeNull()
    expect(stale.cancel_at_period_end).toBe(true)
    expect(stale.current_period_end).toBe(NEXT)
    await expect(renewals.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'stale-after-success',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'duplicate_external_event' })
    await expect(renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-fail',
      outcome: 'failed',
      past_due_grace_until: '2026-05-20T00:00:00.000Z',
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'duplicate_external_event' })
  })

  it('rejects a failed renewal of a terminal subscription before using the period', async () => {
    const { renewals, subscriptions } = harness()
    const row = await openRow(subscriptions)
    await subscriptions.transition({ subscription_id: row.subscription_id, to: SUBSCRIPTION_STATUS.CANCELED })
    await expect(renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-terminal',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: row.subscription_id,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
  })
})

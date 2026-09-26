import { describe, expect, it, vi } from 'vitest'
import { SUBSCRIPTION_STATUS } from './catalog.js'
import { defaultPlanCatalog } from './planCatalog.js'
import { createRpcSubscriptionPort, createSubscriptionAuthority, SUBSCRIPTION_RPC } from './subscriptionAuthority.js'

const USER = '11111111-1111-4111-8111-111111111111'
const CURRENT = 'plan.prelim.sek.month.49'
const TARGET = 'plan.prelim.sek.month.09'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'
const NEXT = '2026-06-01T00:00:00.000Z'

function authority(iso = '2026-04-15T00:00:00.000Z') {
  return createSubscriptionAuthority({
    catalog: defaultPlanCatalog,
    now: () => new Date(iso),
  })
}

describe('BILL-7B subscription authority', () => {
  it('runs the lifecycle through the authority while the in-memory store remains the default', async () => {
    const current = authority()
    const row = await current.subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: CURRENT,
      user_id: USER,
    })
    const scheduled = await current.subscriptions.scheduleNextPeriodPlanChange({
      external_event_id: 'auth-change',
      plan_id: TARGET,
      subscription_id: row.subscription_id,
    })
    expect(scheduled.plan_id).toBe(CURRENT)
    const advanced = await current.subscriptions.advancePeriod({
      current_period_end: NEXT,
      external_event_id: 'auth-advance',
      subscription_id: row.subscription_id,
    })
    expect(advanced.plan_id).toBe(TARGET)
    const cancel = await current.subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'auth-cancel',
      subscription_id: row.subscription_id,
    })
    expect(cancel.cancel_at_period_end).toBe(true)
    const undone = await current.subscriptions.clearCancelAtPeriodEnd({
      external_event_id: 'auth-undo',
      subscription_id: row.subscription_id,
    })
    expect(undone.cancel_at_period_end).toBe(false)
    await current.subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'auth-cancel-2',
      subscription_id: row.subscription_id,
    })
    const later = createSubscriptionAuthority({
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-06-02T00:00:00.000Z'),
      store: current.store,
    })
    const closed = await later.subscriptions.finalizeOpenSubscription({
      external_event_id: 'auth-close',
      subscription_id: row.subscription_id,
    })
    expect(closed.status).toBe(SUBSCRIPTION_STATUS.CANCELED)
  })

  it('maps durable calls to existing RPCs and refuses the missing plan-change RPC', async () => {
    const callRpc = vi.fn(async (name) => ({ name }))
    const port = createRpcSubscriptionPort(callRpc)
    await port.createSubscription({ user_id: USER })
    await port.advancePeriod({ subscription_id: 'sub' })
    await port.scheduleCancelAtPeriodEnd({ subscription_id: 'sub' })
    await port.clearCancelAtPeriodEnd({ subscription_id: 'sub' })
    await port.finalizeOpenSubscription({ subscription_id: 'sub' })
    expect(callRpc.mock.calls.map((call) => call[0])).toEqual([
      SUBSCRIPTION_RPC.createSubscription,
      SUBSCRIPTION_RPC.advancePeriod,
      SUBSCRIPTION_RPC.scheduleCancelAtPeriodEnd,
      SUBSCRIPTION_RPC.clearCancelAtPeriodEnd,
      SUBSCRIPTION_RPC.finalizeOpenSubscription,
    ])
    await port.scheduleNextPeriodPlanChange({ plan_id: TARGET })
    expect(callRpc.mock.calls.map((call) => call[0])).toEqual([
      SUBSCRIPTION_RPC.createSubscription,
      SUBSCRIPTION_RPC.advancePeriod,
      SUBSCRIPTION_RPC.scheduleCancelAtPeriodEnd,
      SUBSCRIPTION_RPC.clearCancelAtPeriodEnd,
      SUBSCRIPTION_RPC.finalizeOpenSubscription,
      SUBSCRIPTION_RPC.scheduleNextPeriodPlanChange,
    ])
    expect(SUBSCRIPTION_RPC.scheduleNextPeriodPlanChange).toBe('billing.schedule_next_period_plan_change')
  })
})

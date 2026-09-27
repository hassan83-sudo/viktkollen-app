import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createLocalSubscriptionLifecycle } from '../../../src/services/billing/subscriptionLifecycle.js'
import { toPublicSubscription } from './subscriptionRead.js'
import { getConfiguredSumUpAdapter } from './providers/sumup.js'
import {
  createSumUpRecurring,
  createSumUpRecurringState,
  renewalReference,
  sumUpCustomerIdForUser,
} from './sumupRecurring.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PAID = 'plan.prelim.sek.month.04'
const NEXT = 'plan.prelim.sek.month.07'
const MERCHANT = 'MTEST01'
const TOKEN = '6878cb7f-6515-47bf-bdd9-1408d270fdce'
const NOW = new Date('2026-09-27T00:00:00.000Z')
const START = '2026-08-27T00:00:00.000Z'
const END = '2026-09-27T00:00:00.000Z'
const NEXT_END = '2026-10-27T00:00:00.000Z'

describe('BILL-10B SumUp recurring foundation', () => {
  it('requires auth and derives the user, plan, amount, and SEK without granting access', async () => {
    const { local, recurring, sumup, transport } = await world()
    const anonymous = await recurring.beginRecurringSetup({ subscription: sumup })
    expect(anonymous.code).toBe('AUTH_REQUIRED')
    expect(transport.calls.createCheckout).toBe(0)

    const started = await recurring.beginRecurringSetup({
      amount: 999,
      clientCustomerId: 'client-customer',
      clientUserId: OTHER,
      currency: 'USD',
      planId: NEXT,
      subscription: sumup,
      userId: USER,
    })
    expect(started.accessGranted).toBe(false)
    expect(started.status).toBe('pending')
    expect(started.checkoutId).toBeTruthy()
    expect(JSON.stringify(started)).not.toContain(TOKEN)
    expect(transport.calls.lastCustomer).toEqual({ customer_id: sumUpCustomerIdForUser(USER) })
    expect(transport.calls.lastCustomer.customer_id).not.toBe(sumUpCustomerIdForUser(OTHER))
    expect(transport.calls.lastCheckout).toMatchObject({
      amount: 4,
      currency: 'SEK',
      customer_id: sumUpCustomerIdForUser(USER),
      merchant_code: MERCHANT,
      purpose: 'SETUP_RECURRING_PAYMENT',
    })
    expect(transport.calls.lastCheckout.hosted_checkout).toBeUndefined()
    expect(transport.calls.lastCheckout.personal_details).toBeUndefined()
    const row = await local.subscriptions.getSubscription(sumup.subscription_id)
    expect(row.status).toBe('ACTIVE')
    expect(row.current_period_end).toBe(END)
    expect(row.plan_id).toBe(PAID)
  })

  it('rejects unverified, client-supplied, mismatched, and conflicting instruments', async () => {
    const first = await world()
    await first.recurring.beginRecurringSetup({ subscription: first.sumup, userId: USER })
    const pending = await first.recurring.confirmRecurringInstrument({ subscription: first.sumup, userId: USER })
    expect(pending.code).toBe('PAYMENT_PENDING')
    expect(first.state.instruments).toEqual([])

    const supplied = await first.recurring.confirmRecurringInstrument({
      subscription: first.sumup,
      token: TOKEN,
      userId: USER,
    })
    expect(supplied.code).toBe('CLIENT_INSTRUMENT_REJECTED')
    expect(first.state.instruments).toEqual([])

    first.transport.markSetup({ customer_id: 'someone-else', status: 'PAID' })
    const mismatch = await first.recurring.confirmRecurringInstrument({ subscription: first.sumup, userId: USER })
    expect(mismatch.code).toBe('CUSTOMER_MISMATCH')

    first.transport.markSetup({ customer_id: sumUpCustomerIdForUser(USER), status: 'PAID', token: TOKEN })
    const verified = await first.recurring.confirmRecurringInstrument({ subscription: first.sumup, userId: USER })
    expect(verified).toMatchObject({ accessGranted: false, status: 'verified', userId: USER })
    expect(JSON.stringify(verified)).not.toContain(TOKEN)
    expect(JSON.stringify(first.state.instruments)).not.toContain(TOKEN)
    expect(first.state.instruments[0].fingerprint).toMatch(/^[0-9a-f]{64}$/)

    first.transport.markSetup({ token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
    const changed = await first.recurring.confirmRecurringInstrument({ subscription: first.sumup, userId: USER })
    expect(changed.code).toBe('INSTRUMENT_CONFLICT')

    const second = await world(OTHER)
    await second.recurring.beginRecurringSetup({ subscription: second.sumup, userId: OTHER })
    second.transport.markSetup({ status: 'PAID', token: TOKEN })
    second.state.instruments.push(first.state.instruments[0])
    const conflict = await second.recurring.confirmRecurringInstrument({ subscription: second.sumup, userId: OTHER })
    expect(conflict.code).toBe('INSTRUMENT_CONFLICT')
    expect(JSON.stringify(second.state)).not.toMatch(/4111111111111111|"cvv"|card_number/)
  })

  it('keeps the instrument token out of the subscription API, logs, and client env', async () => {
    const { recurring, sumup, state, transport } = await world()
    await recurring.beginRecurringSetup({ subscription: sumup, userId: USER })
    transport.markSetup({ status: 'PAID', token: TOKEN })
    await recurring.confirmRecurringInstrument({ subscription: sumup, userId: USER })
    const publicRow = toPublicSubscription({ ...sumup, payment_instrument_token: TOKEN })
    expect(JSON.stringify(publicRow)).not.toContain(TOKEN)
    const readSource = readFileSync(join(root, 'api/_shared/billing/subscriptionRead.js'), 'utf8')
    expect(readSource).not.toMatch(/instrument_fingerprint|payment_instrument/)
    const source = readFileSync(join(root, 'api/_shared/billing/sumupRecurring.js'), 'utf8')
    const adapter = readFileSync(join(root, 'api/_shared/billing/providers/sumup.js'), 'utf8')
    expect(source).not.toMatch(/console\.|VITE_|reserve_quota|refundPayment|prorate/)
    expect(adapter).not.toMatch(/VITE_/)
    expect(getConfiguredSumUpAdapter({})).toBeNull()
    expect(JSON.stringify(state)).not.toContain(TOKEN)
    const userRoute = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')
    expect(userRoute).not.toMatch(/sumupRecurring|processDueRenewals/)
  })

  it('charges only a due SumUp subscription and advances the existing lifecycle', async () => {
    const due = await boundWorld()
    const later = await world('66666666-6666-4666-8666-666666666666', '2026-12-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z')
    const cancelled = await boundWorld(OTHER)
    await cancelled.local.lifecycle.scheduleCancelAtPeriodEnd({
      external_event_id: 'cancel-renewal',
      subscription_id: cancelled.sumup.subscription_id,
    })
    const cancelledRow = await cancelled.local.subscriptions.getSubscription(cancelled.sumup.subscription_id)
    const skipped = await cancelled.recurring.processDueRenewals({ subscriptions: [cancelledRow] })
    expect(skipped.considered).toBe(0)
    expect(cancelled.transport.calls.createCheckout).toBe(0)
    expect(cancelledRow.status).toBe('ACTIVE')
    expect(cancelledRow.cancel_at_period_end).toBe(true)
    expect(cancelledRow.current_period_end).toBe(END)

    const terminal = await world('33333333-3333-4333-8333-333333333333')
    const closed = await terminal.local.authority.store.replace({ ...terminal.sumup, status: 'CANCELED' })
    const wrong = (await world('44444444-4444-4444-8444-444444444444', END, START, { provider: '' })).sumup
    const batch = await due.recurring.processDueRenewals({
      limit: 20,
      subscriptions: [later.sumup, closed, wrong, due.sumup],
    })
    expect(batch.considered).toBe(1)
    expect(batch.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(batch.results[0].assignmentPlanId).toBe(PAID)
    expect(due.transport.calls.createCheckout).toBe(1)
    expect(due.transport.calls.lastCheckout).toMatchObject({
      amount: 4,
      currency: 'SEK',
      customer_id: sumUpCustomerIdForUser(USER),
      purpose: 'CHECKOUT',
    })
    expect(due.transport.calls.lastProcess.token).toBe(TOKEN)
    expect(due.transport.calls.lastProcess.payment_type).toBe('card')
    expect(due.transport.calls.lastProcess.number).toBeUndefined()
    const renewed = await due.local.subscriptions.getSubscription(due.sumup.subscription_id)
    expect(renewed.status).toBe('ACTIVE')
    expect(renewed.current_period_end).toBe(NEXT_END)
    expect(renewed.plan_id).toBe(PAID)
    expect(JSON.stringify(batch)).not.toContain(TOKEN)

    const again = await due.recurring.processDueRenewals({ subscriptions: [due.sumup] })
    expect(again.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(due.transport.calls.createCheckout).toBe(1)
    expect(due.transport.calls.processCheckout).toBe(1)
    const stale = await due.local.lifecycle.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'stale-failure',
      outcome: 'failed',
      past_due_grace_until: '2026-10-04T00:00:00.000Z',
      subscription_id: due.sumup.subscription_id,
    })
    expect(stale.subscription.status).toBe('ACTIVE')
    expect(stale.subscription.current_period_end).toBe(NEXT_END)
  })

  it('fails closed without a verified instrument and reuses the renewal failure lifecycle', async () => {
    const missing = await world()
    const denied = await missing.recurring.processDueRenewals({ subscriptions: [missing.sumup] })
    expect(denied.results[0].code).toBe('MISSING_INSTRUMENT')
    expect(missing.transport.calls.createCheckout).toBe(0)

    const failed = await boundWorld()
    failed.transport.outcome = 'FAILED'
    const result = await failed.recurring.processDueRenewals({ subscriptions: [failed.sumup] })
    expect(result.results[0].code).toBe('RENEWAL_FAILED')
    const row = await failed.local.subscriptions.getSubscription(failed.sumup.subscription_id)
    expect(row.status).toBe('PAST_DUE')
    expect(row.plan_id).toBe(PAID)
    expect(row.past_due_grace_until).toBe('2026-10-04T00:00:00.000Z')
    expect(row.cancel_at_period_end).toBe(false)
    expect(row.status).not.toBe('CANCELED')
    const replay = await failed.recurring.processDueRenewals({ subscriptions: [failed.sumup] })
    expect(replay.results[0].code).toBe('RENEWAL_FAILED')
    expect(failed.transport.calls.processCheckout).toBe(1)
    expect(failed.transport.calls.createCheckout).toBe(1)
  })

  it('applies a pending next-period plan on success and preserves it on failure', async () => {
    const success = await boundWorld()
    await success.local.lifecycle.scheduleNextPeriodPlanChange({
      external_event_id: 'pending-success',
      plan_id: NEXT,
      subscription_id: success.sumup.subscription_id,
    })
    const pending = await success.local.subscriptions.getSubscription(success.sumup.subscription_id)
    const charged = await success.recurring.processDueRenewals({ subscriptions: [pending] })
    expect(success.transport.calls.lastCheckout.amount).toBe(7)
    expect(charged.results[0].assignmentPlanId).toBe(NEXT)
    const advanced = await success.local.subscriptions.getSubscription(success.sumup.subscription_id)
    expect(advanced.plan_id).toBe(NEXT)
    expect(advanced.pending_plan_id).toBeNull()
    expect(advanced.status).toBe('ACTIVE')

    const failure = await boundWorld(OTHER)
    await failure.local.lifecycle.scheduleNextPeriodPlanChange({
      external_event_id: 'pending-failure',
      plan_id: NEXT,
      subscription_id: failure.sumup.subscription_id,
    })
    const scheduled = await failure.local.subscriptions.getSubscription(failure.sumup.subscription_id)
    failure.transport.outcome = 'FAILED'
    await failure.recurring.processDueRenewals({ subscriptions: [scheduled] })
    const kept = await failure.local.subscriptions.getSubscription(failure.sumup.subscription_id)
    expect(kept.status).toBe('PAST_DUE')
    expect(kept.plan_id).toBe(PAID)
    expect(kept.pending_plan_id).toBe(NEXT)
    expect(kept.pending_plan_change).toBe('next_period')
  })

  it('does not create a second charge after timeout, crash, or a conflicting attempt', async () => {
    const crashed = await boundWorld()
    crashed.transport.failProcess = true
    const ambiguous = await crashed.recurring.processDueRenewals({ subscriptions: [crashed.sumup] })
    expect(ambiguous.results[0].charged).toBe(false)
    expect(ambiguous.results[0].code).toBe('SUMUP_TIMEOUT')
    expect(crashed.transport.calls.processCheckout).toBe(1)
    const recovered = createSumUpRecurring({
      lifecycle: crashed.local.lifecycle,
      merchantCode: MERCHANT,
      now: () => NOW,
      state: crashed.state,
      transport: crashed.transport,
    })
    crashed.transport.failProcess = false
    const second = await recovered.processDueRenewals({ subscriptions: [crashed.sumup] })
    expect(second.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(crashed.transport.calls.createCheckout).toBe(1)
    expect(crashed.transport.calls.processCheckout).toBe(1)
    const row = await crashed.local.subscriptions.getSubscription(crashed.sumup.subscription_id)
    expect(row.current_period_end).toBe(NEXT_END)

    const conflicted = await boundWorld(OTHER)
    conflicted.state.attempts.push({
      periodEnd: END,
      providerCheckoutRef: '',
      reference: renewalReference(conflicted.sumup.subscription_id, conflicted.sumup.current_period_end),
      status: 'reserved',
      subscriptionId: 'other-subscription',
    })
    const rejected = await conflicted.recurring.processDueRenewals({ subscriptions: [conflicted.sumup] })
    expect(rejected.results[0].code).toBe('RENEWAL_ATTEMPT_CONFLICT')
    expect(conflicted.transport.calls.createCheckout).toBe(0)
    expect(conflicted.transport.calls.processCheckout).toBe(0)
  })

  it('locks the unapplied migration to server-only fingerprint storage', () => {
    const sql = readFileSync(join(root, 'supabase/migrations/20260926180000_billing_sumup_recurring.sql'), 'utf8')
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/revoke all on table billing\.sumup_recurring_instruments from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/revoke all on table billing\.sumup_renewal_attempts from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/using \(false\)/)
    expect(sql).toMatch(/grant execute on function billing\.bind_verified_sumup_instrument\(text, uuid, text, text, text\) to service_role/)
    expect(sql).toMatch(/grant execute on function billing\.reserve_sumup_renewal_attempt\(text, text, timestamptz\) to service_role/)
    expect(sql).not.toMatch(/grant select|grant insert|grant update|grant delete/i)
    expect(sql).not.toMatch(/user_entitlements|pg_catalog\.coalesce|card_number|cvv|pan\b/i)
    expect(sql).toMatch(/instrument_fingerprint text not null/)
    expect(sql).toMatch(/unique \(subscription_id, period_end\)/)
    expect(sql).not.toMatch(/\btoken text\b/)
    const recurring = readFileSync(join(root, 'api/_shared/billing/sumupRecurring.js'), 'utf8')
    expect(recurring).not.toMatch(/refund|prorat/i)
  })
})

async function world(userId = USER, periodEnd = END, periodStart = START, options = {}) {
  const local = createLocalSubscriptionLifecycle({ now: () => NOW })
  const created = await local.subscriptions.createSubscription({
    current_period_end: periodEnd,
    current_period_start: periodStart,
    plan_id: PAID,
    user_id: userId,
  })
  const provider = options.provider === undefined ? 'sumup' : options.provider
  const sumup = provider
    ? await local.authority.store.replace({ ...created, provider })
    : created
  const transport = fakeTransport()
  const state = createSumUpRecurringState()
  const recurring = createSumUpRecurring({
    lifecycle: local.lifecycle,
    merchantCode: MERCHANT,
    now: () => NOW,
    state,
    transport,
  })
  return { local, recurring, state, sumup, transport }
}

async function boundWorld(userId = USER) {
  const opened = await world(userId)
  await bind(opened, userId)
  return opened
}

async function bind(opened, userId = USER) {
  await opened.recurring.beginRecurringSetup({ subscription: opened.sumup, userId })
  opened.transport.markSetup({ status: 'PAID', token: TOKEN })
  const verified = await opened.recurring.confirmRecurringInstrument({ subscription: opened.sumup, userId })
  if (verified.status !== 'verified') throw new Error(verified.code || 'setup_failed')
  opened.transport.calls.createCheckout = 0
  opened.transport.calls.processCheckout = 0
}

function fakeTransport() {
  const checkouts = []
  let seq = 0
  const calls = { createCheckout: 0, createCustomer: 0, processCheckout: 0 }
  const transport = {
    calls,
    outcome: 'PAID',
    failProcess: false,
    async createCustomer(body) {
      calls.createCustomer += 1
      calls.lastCustomer = body
      return { customer_id: body.customer_id }
    },
    async createCheckout(body) {
      calls.createCheckout += 1
      calls.lastCheckout = body
      if (checkouts.some((row) => row.checkout_reference === body.checkout_reference)) {
        const error = new Error('exists')
        error.code = 'SUMUP_REFERENCE_EXISTS'
        throw error
      }
      seq += 1
      const row = {
        ...body,
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        status: 'PENDING',
      }
      checkouts.push(row)
      return { ...row }
    },
    async listCheckouts(reference) {
      return checkouts.filter((row) => row.checkout_reference === reference).map((row) => ({ ...row }))
    },
    async listPaymentInstruments() {
      return [{ token: TOKEN }]
    },
    async processCheckout(id, body) {
      calls.processCheckout += 1
      calls.lastProcess = body
      const row = checkouts.find((item) => item.id === id)
      if (row) row.status = transport.outcome
      if (transport.failProcess) {
        const error = new Error('timeout')
        error.code = 'SUMUP_TIMEOUT'
        throw error
      }
      return { id, status: row?.status || 'PENDING' }
    },
    async retrieveCheckout(id) {
      const row = checkouts.find((item) => item.id === id)
      if (!row) return null
      return {
        ...row,
        payment_instrument: row.token ? { token: row.token } : undefined,
      }
    },
    markSetup(patch) {
      const row = checkouts.find((item) => item.purpose === 'SETUP_RECURRING_PAYMENT')
      if (row) Object.assign(row, patch)
    },
  }
  return transport
}

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createLocalSubscriptionLifecycle } from '../../../src/services/billing/subscriptionLifecycle.js'
import { createProviderRegistry } from './paymentProviderContract.js'
import { ingestProviderWebhook } from './providerWebhookIngress.js'
import { toPublicSubscription } from './subscriptionRead.js'
import { getConfiguredSumUpAdapter, SUMUP_PROVIDER } from './providers/sumup.js'
import {
  createServerSumUpInstrumentFingerprintReader,
  createServerSumUpRenewalClaimer,
  createServerSumUpRenewalFinisher,
  createServerSumUpRenewalReserver,
  createSumUpRecurring,
  createSumUpRecurringState,
  instrumentFingerprint,
  renewalReference,
  SUMUP_INSTRUMENT_FINGERPRINT_RPC,
  SUMUP_RENEWAL_CLAIM_RPC,
  SUMUP_RENEWAL_FINISH_RPC,
  SUMUP_RENEWAL_RESERVE_RPC,
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
const RENEWAL_LEASE_MS = 900 * 1000

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

  it('does not bind an instrument when the retrieved setup merchant or status is wrong', async () => {
    const { recurring, sumup, state, transport } = await world()
    await recurring.beginRecurringSetup({ subscription: sumup, userId: USER })
    transport.markSetup({ merchant_code: 'MOTHER1', status: 'PAID', token: TOKEN })
    const merchant = await recurring.confirmRecurringInstrument({ subscription: sumup, userId: USER })
    expect(merchant).toMatchObject({ accessGranted: false, code: 'MERCHANT_MISMATCH' })
    expect(state.instruments).toEqual([])
    transport.markSetup({ merchant_code: MERCHANT, status: 'FAILED', token: TOKEN })
    const failed = await recurring.confirmRecurringInstrument({ subscription: sumup, userId: USER })
    expect(failed).toMatchObject({ accessGranted: false, code: 'PAYMENT_FAILED' })
    expect(state.instruments).toEqual([])
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

  it('charges only the instrument whose token matches the stored fingerprint', async () => {
    const saved = instrumentFingerprint(TOKEN)
    const other = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const opened = await world()
    opened.transport.listPaymentInstruments = async () => [
      { active: true, token: other },
      { active: true, token: TOKEN },
    ]
    const recurring = createSumUpRecurring({
      lifecycle: opened.local.lifecycle,
      merchantCode: MERCHANT,
      now: () => NOW,
      readInstrumentFingerprint: createServerSumUpInstrumentFingerprintReader(async (name, args) => {
        expect(name).toBe(SUMUP_INSTRUMENT_FINGERPRINT_RPC)
        expect(args).toEqual({ p_subscription_id: opened.sumup.subscription_id })
        return saved
      }),
      state: opened.state,
      transport: opened.transport,
    })
    const charged = await recurring.processDueRenewals({ subscriptions: [opened.sumup] })
    expect(charged.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(opened.transport.calls.lastProcess.token).toBe(TOKEN)

    const unmatched = await world(OTHER)
    unmatched.transport.listPaymentInstruments = async () => [{ active: true, token: other }]
    const stopped = createSumUpRecurring({
      lifecycle: unmatched.local.lifecycle,
      merchantCode: MERCHANT,
      now: () => NOW,
      readInstrumentFingerprint: async () => saved,
      state: unmatched.state,
      transport: unmatched.transport,
    })
    const denied = await stopped.processDueRenewals({ subscriptions: [unmatched.sumup] })
    expect(denied.results[0].code).toBe('MISSING_INSTRUMENT')
    expect(unmatched.transport.calls.createCheckout).toBe(0)
    expect(unmatched.transport.calls.processCheckout).toBe(0)
    expect(unmatched.transport.calls.lastProcess).toBeUndefined()

    const absent = await world('33333333-3333-4333-8333-333333333333')
    let listed = 0
    absent.transport.listPaymentInstruments = async () => {
      listed += 1
      return [{ active: true, token: TOKEN }]
    }
    const closed = createSumUpRecurring({
      lifecycle: absent.local.lifecycle,
      merchantCode: MERCHANT,
      now: () => NOW,
      readInstrumentFingerprint: createServerSumUpInstrumentFingerprintReader(async () => null),
      state: absent.state,
      transport: absent.transport,
    })
    const missing = await closed.processDueRenewals({ subscriptions: [absent.sumup] })
    expect(missing.results[0].code).toBe('MISSING_INSTRUMENT')
    expect(listed).toBe(0)
    expect(absent.transport.calls.createCheckout).toBe(0)
    expect(absent.transport.calls.processCheckout).toBe(0)
  })

  it('lets one shared reservation charge and stops the other server instance', async () => {
    const saved = instrumentFingerprint(TOKEN)
    const opened = await world()
    const rows = []
    const callRpc = async (name, args) => {
      if (name === SUMUP_INSTRUMENT_FINGERPRINT_RPC) {
        expect(args).toEqual({ p_subscription_id: opened.sumup.subscription_id })
        return saved
      }
      if (name !== SUMUP_RENEWAL_RESERVE_RPC) throw new Error('unexpected rpc')
      const reference = args.p_checkout_reference
      const period = args.p_period_end
      const existing = rows.find((row) => row.reference === reference)
      if (existing) {
        if (existing.subscriptionId !== args.p_subscription_id || existing.periodEnd !== period) {
          const error = new Error('renewal_attempt_conflict')
          error.code = 'renewal_attempt_conflict'
          throw error
        }
        return { checkout_reference: reference, inserted: false, status: existing.status }
      }
      rows.push({
        periodEnd: period,
        reference,
        status: 'reserved',
        subscriptionId: args.p_subscription_id,
      })
      return { checkout_reference: reference, inserted: true, status: 'reserved' }
    }
    const reader = createServerSumUpInstrumentFingerprintReader(callRpc)
    const reserver = createServerSumUpRenewalReserver(callRpc)
    const instance = () => createSumUpRecurring({
      lifecycle: opened.local.lifecycle,
      merchantCode: MERCHANT,
      now: () => NOW,
      readInstrumentFingerprint: reader,
      reserveRenewalAttempt: reserver,
      state: createSumUpRecurringState(),
      transport: opened.transport,
    })
    const [winner, loser] = await Promise.all([
      instance().processDueRenewals({ subscriptions: [opened.sumup] }),
      instance().processDueRenewals({ subscriptions: [opened.sumup] }),
    ])
    expect([winner.results[0].code, loser.results[0].code].sort()).toEqual(['RENEWAL_IN_PROGRESS', 'RENEWAL_SUCCEEDED'])
    expect(opened.transport.calls.createCheckout).toBe(1)
    expect(opened.transport.calls.processCheckout).toBe(1)
    expect(opened.transport.calls.lastProcess.token).toBe(TOKEN)
    expect(JSON.stringify(winner)).not.toContain(TOKEN)
    expect(JSON.stringify(loser)).not.toContain(TOKEN)

    const closed = createSumUpRecurring({
      lifecycle: opened.local.lifecycle,
      merchantCode: MERCHANT,
      now: () => NOW,
      readInstrumentFingerprint: async () => saved,
      reserveRenewalAttempt: createServerSumUpRenewalReserver(async (name, args) => {
        expect(name).toBe(SUMUP_RENEWAL_RESERVE_RPC)
        return { checkout_reference: args.p_checkout_reference, status: 'reserved' }
      }),
      state: createSumUpRecurringState(),
      transport: opened.transport,
    })
    const replay = await closed.processDueRenewals({ subscriptions: [opened.sumup] })
    expect(replay.results[0].code).toBe('RENEWAL_IN_PROGRESS')
    expect(opened.transport.calls.createCheckout).toBe(1)
    expect(opened.transport.calls.processCheckout).toBe(1)

    const sql = readFileSync(join(root, 'supabase/migrations/20261107120000_billing_reserve_sumup_renewal_inserted.sql'), 'utf8')
    expect(sql).toMatch(/inserted_count = 1/)
    expect(sql).toMatch(/when unique_violation then/)
    expect(sql).toMatch(/revoke all on function billing\.reserve_sumup_renewal_attempt\(text, text, timestamptz\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.reserve_sumup_renewal_attempt\(text, text, timestamptz\) to service_role/)
    expect(sql).not.toMatch(/grant execute on function billing\.reserve_sumup_renewal_attempt\(text, text, timestamptz\) to (public|anon|authenticated)/)
    expect(sql).not.toMatch(/\btoken text\b|card_number|cvv/)
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

  it('resumes one expired reservation without charging a live or unknown attempt', async () => {
    const opened = await world()
    const database = renewalDatabase(instrumentFingerprint(TOKEN))
    const reference = renewalReference(opened.sumup.subscription_id, opened.sumup.current_period_end)
    const periodEnd = new Date(END).toISOString()
    database.seed({
      periodEnd,
      reference,
      subscriptionId: opened.sumup.subscription_id,
      updatedAt: Date.now(),
    })
    const renew = () => durableRecurring(opened, database).processDueRenewals({ subscriptions: [opened.sumup] })
    const live = await renew()
    expect(live.results[0].code).toBe('RENEWAL_IN_PROGRESS')
    expect(opened.transport.calls.createCheckout).toBe(0)
    expect(opened.transport.calls.processCheckout).toBe(0)
    expect(opened.transport.calls.listCheckouts).toBe(0)

    database.rows[0].updatedAt = Date.now() - RENEWAL_LEASE_MS - 1
    const resumed = await renew()
    expect(resumed.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(opened.transport.calls.createCheckout).toBe(1)
    expect(opened.transport.calls.processCheckout).toBe(1)
    expect(opened.transport.checkoutCount()).toBe(1)
    expect(database.rows[0].status).toBe('succeeded')
    const advanced = await opened.local.subscriptions.getSubscription(opened.sumup.subscription_id)
    expect(advanced.current_period_end).toBe(NEXT_END)

    const replay = await renew()
    expect(replay.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(opened.transport.calls.processCheckout).toBe(1)
    const once = await opened.local.subscriptions.getSubscription(opened.sumup.subscription_id)
    expect(once.current_period_end).toBe(NEXT_END)

    const created = await world(OTHER)
    const createdDb = renewalDatabase(instrumentFingerprint(TOKEN))
    const createdReference = renewalReference(created.sumup.subscription_id, created.sumup.current_period_end)
    const createdCheckout = await created.transport.createCheckout({
      amount: 4,
      checkout_reference: createdReference,
      currency: 'SEK',
      customer_id: sumUpCustomerIdForUser(OTHER),
      merchant_code: MERCHANT,
      purpose: 'CHECKOUT',
    })
    createdDb.seed({
      periodEnd,
      providerCheckoutRef: createdCheckout.id,
      reference: createdReference,
      status: 'created',
      subscriptionId: created.sumup.subscription_id,
      updatedAt: Date.now(),
    })
    const held = await durableRecurring(created, createdDb).processDueRenewals({ subscriptions: [created.sumup] })
    expect(held.results[0].code).toBe('RENEWAL_IN_PROGRESS')
    expect(created.transport.calls.processCheckout).toBe(0)
    createdDb.rows[0].updatedAt = Date.now() - RENEWAL_LEASE_MS - 1
    const continued = await durableRecurring(created, createdDb).processDueRenewals({ subscriptions: [created.sumup] })
    expect(continued.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(created.transport.calls.createCheckout).toBe(1)
    expect(created.transport.calls.processCheckout).toBe(1)
    expect(created.transport.checkoutCount()).toBe(1)
  })

  it('does not charge a checkout again when its payment result is still unknown', async () => {
    const opened = await world()
    const database = renewalDatabase(instrumentFingerprint(TOKEN))
    opened.transport.failProcess = true
    opened.transport.outcome = 'PENDING'
    const crashed = await durableRecurring(opened, database).processDueRenewals({ subscriptions: [opened.sumup] })
    expect(crashed.results[0].code).toBe('SUMUP_TIMEOUT')
    expect(database.rows[0].status).toBe('processing')
    expect(opened.transport.calls.processCheckout).toBe(1)

    database.rows[0].updatedAt = Date.now() - RENEWAL_LEASE_MS - 1
    const [first, second] = await Promise.all([
      durableRecurring(opened, database).processDueRenewals({ subscriptions: [opened.sumup] }),
      durableRecurring(opened, database).processDueRenewals({ subscriptions: [opened.sumup] }),
    ])
    expect([first.results[0].code, second.results[0].code]).toEqual(['RENEWAL_AMBIGUOUS', 'RENEWAL_AMBIGUOUS'])
    expect(opened.transport.calls.processCheckout).toBe(1)
    expect(database.rows[0].status).toBe('processing')

    opened.transport.markRenewal({ status: 'PAID' })
    const settled = await durableRecurring(opened, database).processDueRenewals({ subscriptions: [opened.sumup] })
    expect(settled.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(opened.transport.calls.processCheckout).toBe(1)
    expect(database.rows[0].status).toBe('succeeded')
    const row = await opened.local.subscriptions.getSubscription(opened.sumup.subscription_id)
    expect(row.current_period_end).toBe(NEXT_END)
    const replay = await durableRecurring(opened, database).processDueRenewals({ subscriptions: [opened.sumup] })
    expect(replay.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(opened.transport.calls.processCheckout).toBe(1)
    const kept = await opened.local.subscriptions.getSubscription(opened.sumup.subscription_id)
    expect(kept.current_period_end).toBe(NEXT_END)

    const paid = await world('33333333-3333-4333-8333-333333333333')
    const paidDb = renewalDatabase(instrumentFingerprint(TOKEN))
    const paidReference = renewalReference(paid.sumup.subscription_id, paid.sumup.current_period_end)
    await paid.transport.createCheckout({
      amount: 4,
      checkout_reference: paidReference,
      currency: 'SEK',
      customer_id: sumUpCustomerIdForUser('33333333-3333-4333-8333-333333333333'),
      merchant_code: MERCHANT,
      purpose: 'CHECKOUT',
    })
    paid.transport.markRenewal({ status: 'PAID' })
    paidDb.seed({
      periodEnd: new Date(END).toISOString(),
      reference: paidReference,
      status: 'reserved',
      subscriptionId: paid.sumup.subscription_id,
      updatedAt: Date.now() - RENEWAL_LEASE_MS - 1,
    })
    const booked = await durableRecurring(paid, paidDb).processDueRenewals({ subscriptions: [paid.sumup] })
    expect(booked.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(paid.transport.calls.processCheckout).toBe(0)
    expect(paid.transport.calls.createCheckout).toBe(1)
    const paidRow = await paid.local.subscriptions.getSubscription(paid.sumup.subscription_id)
    expect(paidRow.current_period_end).toBe(NEXT_END)

    const failed = await world('44444444-4444-4444-8444-444444444444')
    const failedDb = renewalDatabase(instrumentFingerprint(TOKEN))
    const failedReference = renewalReference(failed.sumup.subscription_id, failed.sumup.current_period_end)
    await failed.transport.createCheckout({
      amount: 4,
      checkout_reference: failedReference,
      currency: 'SEK',
      customer_id: sumUpCustomerIdForUser('44444444-4444-4444-8444-444444444444'),
      merchant_code: MERCHANT,
      purpose: 'CHECKOUT',
    })
    failed.transport.markRenewal({ status: 'FAILED' })
    failedDb.seed({
      periodEnd: new Date(END).toISOString(),
      reference: failedReference,
      status: 'reserved',
      subscriptionId: failed.sumup.subscription_id,
      updatedAt: Date.now() - RENEWAL_LEASE_MS - 1,
    })
    const pastDue = await durableRecurring(failed, failedDb).processDueRenewals({ subscriptions: [failed.sumup] })
    expect(pastDue.results[0].code).toBe('RENEWAL_FAILED')
    expect(failed.transport.calls.processCheckout).toBe(0)
    const failedRow = await failed.local.subscriptions.getSubscription(failed.sumup.subscription_id)
    expect(failedRow.status).toBe('PAST_DUE')
    expect(failedRow.current_period_end).toBe(END)
  })

  it('lets one server instance charge and keeps the other from sending a second charge', async () => {
    const opened = await world()
    const database = renewalDatabase(instrumentFingerprint(TOKEN))
    const instance = () => durableRecurring(opened, database).processDueRenewals({ subscriptions: [opened.sumup] })
    const [winner, loser] = await Promise.all([instance(), instance()])
    expect(opened.transport.calls.processCheckout).toBe(1)
    expect(opened.transport.checkoutCount()).toBe(1)
    expect([winner.results[0].code, loser.results[0].code].sort()).toEqual(['RENEWAL_IN_PROGRESS', 'RENEWAL_SUCCEEDED'])
    const row = await opened.local.subscriptions.getSubscription(opened.sumup.subscription_id)
    expect(row.current_period_end).toBe(NEXT_END)

    const expired = await world(OTHER)
    const expiredDb = renewalDatabase(instrumentFingerprint(TOKEN))
    expiredDb.seed({
      periodEnd: new Date(END).toISOString(),
      reference: renewalReference(expired.sumup.subscription_id, expired.sumup.current_period_end),
      subscriptionId: expired.sumup.subscription_id,
      updatedAt: Date.now() - RENEWAL_LEASE_MS - 1,
    })
    const expiredInstance = () => durableRecurring(expired, expiredDb).processDueRenewals({ subscriptions: [expired.sumup] })
    const pair = await Promise.all([expiredInstance(), expiredInstance()])
    expect(expired.transport.calls.processCheckout).toBe(1)
    expect(expired.transport.checkoutCount()).toBe(1)
    expect(pair.map((item) => item.results[0].code).filter((code) => code === 'RENEWAL_SUCCEEDED').length).toBeGreaterThan(0)
    const expiredRow = await expired.local.subscriptions.getSubscription(expired.sumup.subscription_id)
    expect(expiredRow.current_period_end).toBe(NEXT_END)
    expect(JSON.stringify(pair)).not.toContain(TOKEN)
  })

  it('acknowledges a renewal webhook without one-time activation or another charge', async () => {
    const reference = renewalReference('sub-renewal', END)
    const checkoutId = '4f3a9c0e-6b1d-4a77-9e20-0c5d8a7b6e11'
    let checkoutReference = reference
    let processed = 0
    let rpc = 0
    const registry = createProviderRegistry()
    registry.register({
      merchantCode: MERCHANT,
      provider: SUMUP_PROVIDER,
      async verify() {
        throw new Error('renewal webhook must not verify a signature')
      },
      transport: {
        async processCheckout() {
          processed += 1
        },
        async retrieveCheckout() {
          return {
            checkout_reference: checkoutReference,
            id: checkoutId,
            purpose: 'CHECKOUT',
            status: 'PAID',
          }
        },
      },
    })
    const acked = await ingestProviderWebhook({
      callRpc: async () => {
        rpc += 1
        return null
      },
      rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: checkoutId }),
      registry,
    })
    expect(acked).toEqual({ accessGranted: false, ok: true, status: 200 })
    expect(processed).toBe(0)
    expect(rpc).toBe(0)

    checkoutReference = 'chk_one_time'
    const oneTime = await ingestProviderWebhook({
      callRpc: null,
      rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: checkoutId }),
      registry,
    })
    expect(oneTime).toMatchObject({ accessGranted: false, code: 'PROVIDER_NOT_CONFIGURED', ok: false, status: 503 })
    expect(processed).toBe(0)
  })

  it('locks the renewal claim migration to the two server-only functions', () => {
    const sql = readFileSync(join(root, 'supabase/migrations/20261107140000_billing_sumup_renewal_claim_finish.sql'), 'utf8')
    const names = [...sql.matchAll(/create or replace function ([a-z0-9_.]+)/g)].map((match) => match[1])
    expect(names).toEqual([
      'billing.claim_sumup_renewal_attempt',
      'billing.finish_sumup_renewal_attempt',
    ])
    expect(sql).toMatch(/interval '900 seconds'/)
    expect(sql).toMatch(/p_takeover/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).toMatch(/revoke all on function billing\.claim_sumup_renewal_attempt\(text, text, timestamptz, text, text, boolean\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.claim_sumup_renewal_attempt\(text, text, timestamptz, text, text, boolean\) to service_role/)
    expect(sql).toMatch(/revoke all on function billing\.finish_sumup_renewal_attempt\(text, text, timestamptz, text, text\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.finish_sumup_renewal_attempt\(text, text, timestamptz, text, text\) to service_role/)
    expect(sql).not.toMatch(/grant execute on function billing\.claim_sumup_renewal_attempt\([^)]*\) to (public|anon|authenticated)/)
    expect(sql).not.toMatch(/grant execute on function billing\.finish_sumup_renewal_attempt\([^)]*\) to (public|anon|authenticated)/)
    expect(sql).not.toMatch(/function billing\.reserve_sumup_renewal_attempt|cleanup_disposable_test_subscription|create table|drop table|delete from/i)
    expect(sql).not.toMatch(/grant select|grant insert|grant update|grant delete/i)
    expect(sql).not.toMatch(/\btoken text\b|card_number|cvv/)
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
  const calls = { createCheckout: 0, createCustomer: 0, listCheckouts: 0, processCheckout: 0 }
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
      calls.listCheckouts += 1
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
    markRenewal(patch) {
      const row = checkouts.find((item) => item.purpose === 'CHECKOUT')
      if (row) Object.assign(row, patch)
    },
    checkoutCount() {
      return checkouts.length
    },
  }
  return transport
}

function durableRecurring(opened, database) {
  const callRpc = (name, args) => database.call(name, args)
  return createSumUpRecurring({
    claimRenewalAttempt: createServerSumUpRenewalClaimer(callRpc),
    finishRenewalAttempt: createServerSumUpRenewalFinisher(callRpc),
    lifecycle: opened.local.lifecycle,
    merchantCode: MERCHANT,
    now: () => NOW,
    readInstrumentFingerprint: createServerSumUpInstrumentFingerprintReader(callRpc),
    reserveRenewalAttempt: createServerSumUpRenewalReserver(callRpc),
    state: createSumUpRecurringState(),
    transport: opened.transport,
  })
}

function renewalDatabase(fingerprint) {
  const rows = []
  const now = () => Date.now()
  function reject(code) {
    const error = new Error(code)
    error.code = code
    throw error
  }
  function rowFor(args) {
    const row = rows.find((item) => item.reference === args.p_checkout_reference)
    if (!row) reject('renewal_attempt_not_found')
    if (row.subscriptionId !== args.p_subscription_id || row.periodEnd !== args.p_period_end) reject('renewal_attempt_conflict')
    return row
  }
  function leaseOpen(row) {
    return now() - row.updatedAt < RENEWAL_LEASE_MS
  }
  function claimView(row, claimed, takeoverAllowed) {
    return {
      checkout_reference: row.reference,
      claimed,
      provider_checkout_ref: row.providerCheckoutRef,
      status: row.status,
      takeover_allowed: takeoverAllowed,
    }
  }
  return {
    rows,
    seed(fields) {
      rows.push({
        providerCheckoutRef: '',
        status: 'reserved',
        updatedAt: now(),
        ...fields,
      })
    },
    call(name, args) {
      if (name === SUMUP_INSTRUMENT_FINGERPRINT_RPC) return fingerprint
      if (name === SUMUP_RENEWAL_RESERVE_RPC) {
        const existing = rows.find((item) => item.reference === args.p_checkout_reference)
        if (existing) {
          if (existing.subscriptionId !== args.p_subscription_id || existing.periodEnd !== args.p_period_end) {
            reject('renewal_attempt_conflict')
          }
          return { checkout_reference: existing.reference, inserted: false, status: existing.status }
        }
        rows.push({
          periodEnd: args.p_period_end,
          providerCheckoutRef: '',
          reference: args.p_checkout_reference,
          status: 'reserved',
          subscriptionId: args.p_subscription_id,
          updatedAt: now(),
        })
        return { checkout_reference: args.p_checkout_reference, inserted: true, status: 'reserved' }
      }
      if (name === SUMUP_RENEWAL_CLAIM_RPC) {
        const row = rowFor(args)
        const ref = args.p_provider_checkout_ref || ''
        if (args.p_takeover === true && leaseOpen(row)) return claimView(row, false, false)
        if (args.p_to_status === 'created') {
          if (row.status === 'processing' || row.status === 'succeeded' || row.status === 'failed') return claimView(row, false, false)
          if (row.status === 'created') {
            if (ref && row.providerCheckoutRef !== ref) reject('renewal_attempt_conflict')
            return claimView(row, false, true)
          }
          if (row.status !== 'reserved') reject('illegal_renewal_transition')
          if (!ref) return claimView(row, false, true)
          row.status = 'created'
          row.providerCheckoutRef = ref
          row.updatedAt = now()
          return claimView(row, true, true)
        }
        if (row.status === 'processing' || row.status === 'succeeded' || row.status === 'failed' || row.status === 'reserved') {
          return claimView(row, false, false)
        }
        if (row.status !== 'created') reject('illegal_renewal_transition')
        if (ref && row.providerCheckoutRef !== ref) reject('renewal_attempt_conflict')
        row.status = 'processing'
        row.updatedAt = now()
        return claimView(row, true, true)
      }
      if (name === SUMUP_RENEWAL_FINISH_RPC) {
        const row = rowFor(args)
        const ref = args.p_provider_checkout_ref || ''
        if (ref && row.providerCheckoutRef && ref !== row.providerCheckoutRef) reject('renewal_attempt_conflict')
        if (row.status === args.p_status) return { checkout_reference: row.reference, status: row.status }
        if (row.status === 'succeeded' || row.status === 'failed') reject('renewal_attempt_conflict')
        if (!['reserved', 'created', 'processing'].includes(row.status)) reject('illegal_renewal_transition')
        if (!row.providerCheckoutRef && ref) row.providerCheckoutRef = ref
        row.status = args.p_status
        row.updatedAt = now()
        return { checkout_reference: row.reference, status: row.status }
      }
      throw new Error(`unexpected rpc ${name}`)
    },
  }
}

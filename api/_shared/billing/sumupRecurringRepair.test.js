import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createLocalSubscriptionLifecycle } from '../../../src/services/billing/subscriptionLifecycle.js'
import {
  createSumUpRecurring,
  createSumUpRecurringState,
  instrumentFingerprint,
  markSumUpRenewalProcessing,
  renewalReference,
  reserveSumUpRenewalAttempt,
  sumUpCustomerIdForUser,
} from './sumupRecurring.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const repairPath = join(root, 'supabase/migrations/20260927120000_billing_sumup_recurring_repair.sql')
const originalPath = join(root, 'supabase/migrations/20260926180000_billing_sumup_recurring.sql')
const USER = '11111111-1111-4111-8111-111111111111'
const PAID = 'plan.prelim.sek.month.04'
const TOKEN = '6878cb7f-6515-47bf-bdd9-1408d270fdce'
const NOW = new Date('2026-09-27T00:00:00.000Z')
const START = '2026-08-27T00:00:00.000Z'
const END = '2026-09-27T00:00:00.000Z'
const PERIOD = '2026-09-27T00:00:00.000Z'
const SUBSCRIPTION = 'sub-bill10d'
const REFERENCE = 'rnc10-synth-renewal-01'

describe('BILL-10D SumUp renewal recovery repair', () => {
  it('replays the same period and rejects a different checkout reference without 23505', () => {
    const state = createSumUpRecurringState()
    const first = reserveSumUpRenewalAttempt(state, {
      periodEnd: PERIOD,
      reference: REFERENCE,
      subscriptionId: SUBSCRIPTION,
    })
    const replay = reserveSumUpRenewalAttempt(state, {
      periodEnd: PERIOD,
      reference: REFERENCE,
      subscriptionId: SUBSCRIPTION,
    })
    expect(replay).toBe(first)
    expect(state.attempts).toHaveLength(1)
    expect(replay.status).toBe('reserved')
    let caught = null
    try {
      reserveSumUpRenewalAttempt(state, {
        periodEnd: PERIOD,
        reference: 'rnc10-synth-renewal-02',
        subscriptionId: SUBSCRIPTION,
      })
    } catch (error) {
      caught = error
    }
    expect(caught?.code).toBe('renewal_attempt_conflict')
    expect(caught?.code).not.toBe('23505')
    expect(state.attempts).toHaveLength(1)
    const sql = readFileSync(repairPath, 'utf8')
    const original = readFileSync(originalPath, 'utf8')
    expect(original).toMatch(/constraint sumup_attempts_period unique \(subscription_id, period_end\)/)
    expect(sql).not.toMatch(/drop constraint|drop index/i)
    expect(sql).toMatch(/on conflict \(checkout_reference\) do nothing/)
    expect(sql).toMatch(/when unique_violation then\s+raise exception 'renewal_attempt_conflict';/)
  })

  it('moves only a reserved attempt to processing and rejects every other state', () => {
    const state = createSumUpRecurringState()
    reserveSumUpRenewalAttempt(state, {
      periodEnd: PERIOD,
      reference: REFERENCE,
      subscriptionId: SUBSCRIPTION,
    })
    const marked = markSumUpRenewalProcessing(state, { reference: REFERENCE, subscriptionId: SUBSCRIPTION })
    expect(marked.status).toBe('processing')
    const replay = markSumUpRenewalProcessing(state, { reference: REFERENCE, subscriptionId: SUBSCRIPTION })
    expect(replay).toBe(marked)
    expect(replay.status).toBe('processing')
    expect(() => markSumUpRenewalProcessing(state, { reference: 'missing', subscriptionId: SUBSCRIPTION }))
      .toThrow(expect.objectContaining({ code: 'renewal_attempt_not_found' }))
    expect(() => markSumUpRenewalProcessing(state, { reference: REFERENCE, subscriptionId: 'other-subscription' }))
      .toThrow(expect.objectContaining({ code: 'renewal_attempt_conflict' }))
    for (const status of ['succeeded', 'failed']) {
      const terminal = createSumUpRecurringState()
      terminal.attempts.push({
        periodEnd: PERIOD,
        providerCheckoutRef: '',
        reference: REFERENCE,
        status,
        subscriptionId: SUBSCRIPTION,
      })
      expect(() => markSumUpRenewalProcessing(terminal, { reference: REFERENCE, subscriptionId: SUBSCRIPTION }))
        .toThrow(expect.objectContaining({ code: 'illegal_renewal_transition' }))
      expect(terminal.attempts[0].status).toBe(status)
    }
    const sql = readFileSync(repairPath, 'utf8')
    expect(sql).toMatch(/if stored\.status = 'processing' then/)
    expect(sql).toMatch(/if stored\.status is distinct from 'reserved' then/)
    expect(sql).toMatch(/raise exception 'illegal_renewal_transition'/)
    expect(sql).toMatch(/and attempt\.status = 'reserved'/)
    expect(sql).not.toMatch(/status = 'succeeded'/)
  })

  it('reconciles a processing attempt without a second charge', async () => {
    const opened = await dueSubscription()
    const reference = renewalReference(opened.sumup.subscription_id, opened.sumup.current_period_end)
    opened.state.attempts.push({
      periodEnd: new Date(opened.sumup.current_period_end).toISOString(),
      providerCheckoutRef: '00000000-0000-4000-8000-000000000009',
      reference,
      status: 'processing',
      subscriptionId: opened.sumup.subscription_id,
    })
    opened.transport.seed(reference)
    const result = await opened.recurring.processDueRenewals({ subscriptions: [opened.sumup] })
    expect(result.results[0].code).toBe('RENEWAL_AMBIGUOUS')
    expect(opened.transport.calls.processCheckout).toBe(0)
    expect(opened.transport.calls.createCheckout).toBe(0)
    expect(opened.state.attempts).toHaveLength(1)

    const conflicted = await dueSubscription()
    conflicted.state.attempts.push({
      periodEnd: new Date(conflicted.sumup.current_period_end).toISOString(),
      providerCheckoutRef: '',
      reference: 'rnc10-different-reference',
      status: 'reserved',
      subscriptionId: conflicted.sumup.subscription_id,
    })
    const rejected = await conflicted.recurring.processDueRenewals({ subscriptions: [conflicted.sumup] })
    expect(rejected.results[0].code).toBe('RENEWAL_ATTEMPT_CONFLICT')
    expect(conflicted.transport.calls.createCheckout).toBe(0)
    expect(conflicted.transport.calls.processCheckout).toBe(0)
    expect(conflicted.state.attempts).toHaveLength(1)
  })

  it('extends disposable cleanup to the marked recurring rows only', () => {
    const sql = readFileSync(repairPath, 'utf8')
    const cleanup = sql.slice(
      sql.indexOf('create or replace function billing.cleanup_disposable_test_subscription'),
      sql.indexOf('revoke all on function billing.reserve_sumup_renewal_attempt'),
    )
    const unsafe = cleanup.indexOf('disposable_fixture_unsafe')
    const attempts = cleanup.indexOf('delete from billing.sumup_renewal_attempts')
    const instruments = cleanup.indexOf('delete from billing.sumup_recurring_instruments')
    const subscription = cleanup.indexOf('delete from billing.subscriptions')
    expect(cleanup.indexOf('disposable_fixture_not_found')).toBeGreaterThan(-1)
    expect(unsafe).toBeGreaterThan(cleanup.indexOf('disposable_fixture_not_found'))
    expect(attempts).toBeGreaterThan(unsafe)
    expect(instruments).toBeGreaterThan(attempts)
    expect(subscription).toBeGreaterThan(instruments)
    expect(cleanup).toMatch(/delete from billing\.sumup_renewal_attempts a\s+where a\.subscription_id = target\.subscription_id/)
    expect(cleanup).toMatch(/delete from billing\.sumup_recurring_instruments i\s+where i\.subscription_id = target\.subscription_id/)
    expect(cleanup).not.toMatch(/checkout_intents|delete from billing\.plans|cascade|user_entitlements/i)
    const rows = {
      attempts: [
        { subscriptionId: 'marked' },
        { subscriptionId: 'unrelated' },
      ],
      instruments: [
        { subscriptionId: 'marked' },
        { subscriptionId: 'unrelated' },
      ],
    }
    const cleaned = {
      attempts: rows.attempts.filter((row) => row.subscriptionId !== 'marked'),
      instruments: rows.instruments.filter((row) => row.subscriptionId !== 'marked'),
    }
    expect(cleaned.attempts).toEqual([{ subscriptionId: 'unrelated' }])
    expect(cleaned.instruments).toEqual([{ subscriptionId: 'unrelated' }])
    expect(sql).toMatch(/revoke all on function billing\.cleanup_disposable_test_subscription\(text\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.cleanup_disposable_test_subscription\(text\) to service_role/)
    expect(sql).toMatch(/revoke all on function billing\.mark_sumup_renewal_attempt_processing\(text, text\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.mark_sumup_renewal_attempt_processing\(text, text\) to service_role/)
    expect(sql).not.toMatch(/grant execute on function billing\.mark_sumup_renewal_attempt_processing\(text, text\) to (public|anon|authenticated)/)
    expect(sql).not.toMatch(/disable row level security|user_entitlements|pg_catalog\.coalesce|\btoken text\b|card_number|cvv/i)
    const original = readFileSync(originalPath, 'utf8')
    expect(original).toMatch(/force row level security/)
    expect(original).toMatch(/instrument_fingerprint text not null/)
  })
})

async function dueSubscription() {
  const local = createLocalSubscriptionLifecycle({ now: () => NOW })
  const created = await local.subscriptions.createSubscription({
    current_period_end: END,
    current_period_start: START,
    plan_id: PAID,
    user_id: USER,
  })
  const sumup = await local.authority.store.replace({ ...created, provider: 'sumup' })
  const state = createSumUpRecurringState()
  state.instruments.push({
    customerId: sumUpCustomerIdForUser(USER),
    fingerprint: instrumentFingerprint(TOKEN),
    subscriptionId: sumup.subscription_id,
    userId: USER,
  })
  const transport = fakeTransport()
  const recurring = createSumUpRecurring({
    lifecycle: local.lifecycle,
    merchantCode: 'MTEST01',
    now: () => NOW,
    state,
    transport,
  })
  return { recurring, state, sumup, transport }
}

function fakeTransport() {
  const checkouts = []
  const calls = { createCheckout: 0, processCheckout: 0 }
  return {
    calls,
    seed(reference) {
      checkouts.push({
        amount: 4,
        checkout_reference: reference,
        currency: 'SEK',
        customer_id: sumUpCustomerIdForUser(USER),
        id: '00000000-0000-4000-8000-000000000009',
        merchant_code: 'MTEST01',
        purpose: 'CHECKOUT',
        status: 'PENDING',
      })
    },
    async createCheckout() {
      calls.createCheckout += 1
      return null
    },
    async createCustomer() {
      return {}
    },
    async listCheckouts(reference) {
      return checkouts.filter((row) => row.checkout_reference === reference)
    },
    async listPaymentInstruments() {
      return [{ token: TOKEN }]
    },
    async processCheckout() {
      calls.processCheckout += 1
      return { status: 'PENDING' }
    },
    async retrieveCheckout(id) {
      return checkouts.find((row) => row.id === id) || null
    },
  }
}

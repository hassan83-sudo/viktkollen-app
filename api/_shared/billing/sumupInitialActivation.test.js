import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { createSumUpCheckoutAdapter, sumUpMonthPeriod } from './providers/sumup.js'
import { createServerSubscriptionRpcCaller, mapBillingRpcError } from './subscriptionRpcCaller.js'
import {
  activateVerifiedSumUpSetup,
  createInMemorySumUpInitialActivation,
  SUMUP_INITIAL_ACTIVATION_RPC,
} from './sumupInitialActivation.js'
import { instrumentFingerprint, sumUpCustomerIdForUser } from './sumupRecurring.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PAID = 'plan.prelim.sek.month.04'
const OTHER_PLAN = 'plan.prelim.sek.month.07'
const CHECKOUT_ID = '4f3a9c0e-6b1d-4a77-9e20-0c5d8a7b6e11'
const OTHER_CHECKOUT = '8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4'
const TRANSACTION_ID = '6b425463-3e1b-431d-83fa-1e51c2925e99'
const OTHER_TRANSACTION = '7c536574-4f2c-442e-94ab-2f62d3036faa'
const TOKEN = '6878cb7f-6515-47bf-bdd9-1408d270fdce'
const OTHER_TOKEN = '7989dc80-7626-48c0-8eea-2519e3810edf'
const MERCHANT = 'MTEST01'
const INTENT = 'chk_setup_1'
const NOW = new Date('2026-09-27T12:00:00.000Z')
const PAID_AT = '2026-09-27T09:00:00.000Z'
const PERIOD = sumUpMonthPeriod(new Date(PAID_AT))
const FINGERPRINT = instrumentFingerprint(TOKEN)
const OTHER_FINGERPRINT = instrumentFingerprint(OTHER_TOKEN)

function database(now = () => NOW) {
  return createInMemorySumUpInitialActivation({
    now,
    plans: new Map([
      [PAID, { active: true, enabledForSale: true }],
      [OTHER_PLAN, { active: true, enabledForSale: true }],
    ]),
  })
}

function activationArgs(overrides = {}) {
  return {
    p_checkout_id: INTENT,
    p_instrument_fingerprint: FINGERPRINT,
    p_period_end: PERIOD.end,
    p_period_start: PERIOD.start,
    p_provider_checkout_ref: CHECKOUT_ID,
    p_provider_customer_ref: sumUpCustomerIdForUser(USER),
    p_provider_event_id: `paid:${CHECKOUT_ID}`,
    p_provider_subscription_ref: TRANSACTION_ID,
    ...overrides,
  }
}

async function ready(db, {
  checkoutId = INTENT,
  planId = PAID,
  providerCheckoutRef = CHECKOUT_ID,
  userId = USER,
} = {}) {
  await db.createIntent({ checkoutId, clientPlanId: 'plan.free', clientUserId: OTHER, planId, userId })
  await db.bindCheckoutRef({ checkoutId, providerCheckoutRef })
}

function paidSetup(overrides = {}) {
  return {
    amount: 4,
    checkout_reference: INTENT,
    currency: 'SEK',
    customer_id: sumUpCustomerIdForUser(USER),
    id: CHECKOUT_ID,
    merchant_code: MERCHANT,
    payment_instrument: { token: TOKEN },
    purpose: 'SETUP_RECURRING_PAYMENT',
    status: 'PAID',
    transactions: [{
      amount: 4,
      currency: 'SEK',
      id: TRANSACTION_ID,
      status: 'SUCCESSFUL',
      timestamp: PAID_AT,
    }],
    ...overrides,
  }
}

function empty(db) {
  expect(db.inspect()).toEqual({ assignments: [], instruments: [], subscriptions: [] })
  expect(db.getIntent(INTENT).status).toBe('pending')
  expect(db.quotaPlan(USER)).toBe('plan.free')
}

describe('BILL-11F atomic SumUp initial activation', () => {
  it('activates once from the intent and replays the same subscription', async () => {
    const db = database()
    await ready(db)
    expect(db.quotaPlan(USER)).toBe('plan.free')
    const activated = await db.activate(activationArgs({
      p_plan_id: undefined,
      p_subscription_id: undefined,
      p_user_id: undefined,
    }))
    expect(activated).toMatchObject({
      access_granted: true,
      assignment_plan_id: PAID,
      plan_id: PAID,
      proration: false,
      provider: 'sumup',
      refund: false,
      status: 'ACTIVE',
      user_id: USER,
    })
    expect(activated.subscription_id).not.toBe('client-sub')
    expect(db.quotaPlan(USER)).toBe(PAID)
    const replay = await db.activate(activationArgs())
    expect(replay.subscription_id).toBe(activated.subscription_id)
    expect(db.inspect().subscriptions).toHaveLength(1)
    expect(db.inspect().instruments).toHaveLength(1)
    expect(db.inspect().assignments).toHaveLength(1)
    expect(JSON.stringify(db.inspect())).not.toMatch(new RegExp(TOKEN))
    expect(JSON.stringify(db.inspect())).toMatch(FINGERPRINT)

    await expect(db.activate(activationArgs({ p_user_id: OTHER }))).rejects.toMatchObject({ code: 'CLIENT_AUTHORITY_REJECTED' })
    await expect(db.activate(activationArgs({ p_plan_id: OTHER_PLAN }))).rejects.toMatchObject({ code: 'CLIENT_AUTHORITY_REJECTED' })
    await expect(db.activate(activationArgs({ p_subscription_id: 'client-sub' }))).rejects.toMatchObject({ code: 'CLIENT_AUTHORITY_REJECTED' })
    await expect(db.activate(activationArgs({ p_instrument_fingerprint: OTHER_FINGERPRINT }))).rejects.toMatchObject({ code: 'instrument_conflict' })
    await expect(db.activate(activationArgs({ p_provider_checkout_ref: OTHER_CHECKOUT }))).rejects.toMatchObject({ code: 'provider_checkout_mismatch' })
    await expect(db.activate(activationArgs({ p_provider_subscription_ref: OTHER_TRANSACTION }))).rejects.toMatchObject({ code: 'duplicate_external_event' })
    await expect(db.activate(activationArgs({ p_provider_customer_ref: sumUpCustomerIdForUser(OTHER) }))).rejects.toMatchObject({ code: 'customer_mismatch' })
    await expect(db.activate(activationArgs({ p_provider_event_id: 'paid:other' }))).rejects.toMatchObject({ code: 'checkout_intent_consumed' })
    await expect(db.activate(activationArgs({ p_period_end: '2027-01-27T09:00:00.000Z' }))).rejects.toMatchObject({ code: 'duplicate_external_event' })
    expect(db.inspect().subscriptions).toHaveLength(1)
    expect(db.inspect().instruments[0].fingerprint).toBe(FINGERPRINT)
    expect(db.quotaPlan(USER)).toBe(PAID)
  })

  it('rejects a second user, plan, or instrument for the same provider facts', async () => {
    const db = database()
    await ready(db)
    const activated = await db.activate(activationArgs())
    await expect(db.bindCheckoutRef({
      checkoutId: INTENT,
      providerCheckoutRef: OTHER_CHECKOUT,
    })).rejects.toMatchObject({ code: 'checkout_intent_missing' })
    await ready(db, {
      checkoutId: 'chk_other_user',
      providerCheckoutRef: OTHER_CHECKOUT,
      userId: OTHER,
    })
    await expect(db.activate(activationArgs({
      p_checkout_id: 'chk_other_user',
      p_provider_checkout_ref: OTHER_CHECKOUT,
      p_provider_customer_ref: sumUpCustomerIdForUser(OTHER),
      p_provider_event_id: `paid:${OTHER_CHECKOUT}`,
      p_provider_subscription_ref: TRANSACTION_ID,
    }))).rejects.toMatchObject({ code: 'provider_subscription_conflict' })
    await expect(db.activate(activationArgs({
      p_checkout_id: 'chk_other_user',
      p_instrument_fingerprint: FINGERPRINT,
      p_provider_checkout_ref: OTHER_CHECKOUT,
      p_provider_customer_ref: sumUpCustomerIdForUser(OTHER),
      p_provider_event_id: `paid:${OTHER_CHECKOUT}`,
      p_provider_subscription_ref: OTHER_TRANSACTION,
    }))).rejects.toMatchObject({ code: 'instrument_conflict' })
    await ready(db, {
      checkoutId: 'chk_other_plan',
      planId: OTHER_PLAN,
      providerCheckoutRef: CHECKOUT_ID,
      userId: OTHER,
    }).catch((error) => {
      expect(error.code).toBe('provider_checkout_conflict')
    })
    expect(db.inspect().subscriptions).toEqual([{
      planId: PAID,
      subscriptionId: activated.subscription_id,
      userId: USER,
    }])
    expect(db.quotaPlan(OTHER)).toBe('plan.free')
    expect(db.getIntent('chk_other_user').status).toBe('pending')
  })

  it('rolls back every failed step and leaves a retry possible', async () => {
    const steps = [
      ['subscription', 'duplicate_open_subscription'],
      ['instrument', 'instrument_bind_failed'],
      ['assignment', 'assignment_sync_unconfirmed'],
      ['intent', 'checkout_intent_unconfirmed'],
    ]
    for (const [failAt, code] of steps) {
      const db = database()
      await ready(db)
      let caught = null
      try {
        await db.activate(activationArgs({ failAt }))
      } catch (error) {
        caught = error
      }
      expect(caught?.code).toBe(code)
      expect(caught?.code).not.toBe('23505')
      empty(db)
      const recovered = await db.activate(activationArgs())
      expect(recovered.access_granted).toBe(true)
      expect(recovered.user_id).toBe(USER)
      expect(db.quotaPlan(USER)).toBe(PAID)
      expect(db.inspect().instruments).toHaveLength(1)
    }
  })

  it('rejects terminal intents and keeps quota free', async () => {
    const cancelled = database()
    await ready(cancelled)
    await cancelled.cancelIntent(INTENT)
    await expect(cancelled.activate(activationArgs())).rejects.toMatchObject({ code: 'checkout_intent_cancelled' })
    expect(cancelled.quotaPlan(USER)).toBe('plan.free')

    let clock = NOW
    const expiring = database(() => clock)
    await ready(expiring)
    clock = new Date('2026-09-27T13:00:00.000Z')
    await expect(expiring.activate(activationArgs())).rejects.toMatchObject({ code: 'checkout_intent_expired' })
    expect(expiring.getIntent(INTENT).status).toBe('pending')
    expect(expiring.quotaPlan(USER)).toBe('plan.free')
  })

  it('verifies the retrieved setup before the single atomic RPC', async () => {
    const db = database()
    await ready(db)
    const rpcCalls = []
    const retrieveCalls = []
    const opened = await activateVerifiedSumUpSetup({
      amount: 11,
      callRpc: async (name, args) => {
        rpcCalls.push({ args, name })
        return db.activate(args)
      },
      checkoutId: CHECKOUT_ID,
      clientStatus: 'PAID',
      currency: 'EUR',
      instrumentToken: TOKEN,
      intents: { get: (id) => db.getIntent(id) },
      merchantCode: MERCHANT,
      now: () => NOW,
      periodEnd: '2099-01-01T00:00:00.000Z',
      planId: 'plan.free',
      providerCustomerRef: 'client-customer',
      subscriptionId: 'client-sub',
      transport: {
        async retrieveCheckout(id) {
          retrieveCalls.push(id)
          return paidSetup()
        },
      },
      userId: OTHER,
    })
    expect(opened).toMatchObject({
      accessGranted: true,
      assignmentPlanId: PAID,
      ok: true,
      planId: PAID,
      userId: USER,
    })
    expect(retrieveCalls).toEqual([CHECKOUT_ID])
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe(SUMUP_INITIAL_ACTIVATION_RPC)
    expect(Object.keys(rpcCalls[0].args).sort()).toEqual([
      'p_checkout_id',
      'p_instrument_fingerprint',
      'p_period_end',
      'p_period_start',
      'p_provider_checkout_ref',
      'p_provider_customer_ref',
      'p_provider_event_id',
      'p_provider_subscription_ref',
    ])
    expect(rpcCalls[0].args.p_period_end).toBe(PERIOD.end)
    expect(rpcCalls[0].args.p_instrument_fingerprint).toBe(FINGERPRINT)
    expect(JSON.stringify(rpcCalls)).not.toMatch(new RegExp(TOKEN))
    expect(JSON.stringify(opened)).not.toMatch(new RegExp(TOKEN))
    const replay = await activateVerifiedSumUpSetup({
      callRpc: async (name, args) => {
        rpcCalls.push({ args, name })
        return db.activate(args)
      },
      checkoutId: CHECKOUT_ID,
      intents: { get: (id) => db.getIntent(id) },
      merchantCode: MERCHANT,
      now: () => NOW,
      transport: {
        async retrieveCheckout() { return paidSetup() },
      },
    })
    expect(replay.subscriptionId).toBe(opened.subscriptionId)
    expect(db.inspect().subscriptions).toHaveLength(1)
    expect(db.inspect().instruments).toHaveLength(1)

    const blocked = [
      [paidSetup({ status: 'PENDING' }), 'PAYMENT_PENDING'],
      [paidSetup({ status: 'FAILED' }), 'PAYMENT_FAILED'],
      [paidSetup({ status: 'EXPIRED' }), 'PAYMENT_FAILED'],
      [paidSetup({ merchant_code: 'MOTHER1' }), 'MERCHANT_MISMATCH'],
      [paidSetup({ amount: 11 }), 'AMOUNT_MISMATCH'],
      [paidSetup({ currency: 'EUR' }), 'CURRENCY_MISMATCH'],
      [paidSetup({ checkout_reference: 'chk_missing' }), 'CHECKOUT_INTENT_MISSING'],
      [paidSetup({ customer_id: sumUpCustomerIdForUser(OTHER) }), 'CUSTOMER_MISMATCH'],
      [paidSetup({ payment_instrument: undefined }), 'UNVERIFIED_INSTRUMENT'],
    ]
    for (const [checkout, code] of blocked) {
      const before = rpcCalls.length
      const result = await activateVerifiedSumUpSetup({
        callRpc: async () => { throw new Error('must not activate') },
        checkoutId: CHECKOUT_ID,
        intents: { get: (id) => db.getIntent(id) },
        merchantCode: MERCHANT,
        now: () => NOW,
        transport: { async retrieveCheckout() { return checkout } },
      })
      expect(result).toMatchObject({ accessGranted: false, code, ok: false })
      expect(rpcCalls).toHaveLength(before)
    }
    expect(db.inspect().subscriptions).toHaveLength(1)

    const skipped = []
    const unavailable = await activateVerifiedSumUpSetup({
      checkoutId: CHECKOUT_ID,
      transport: { async retrieveCheckout(id) { skipped.push(id); return paidSetup() } },
    })
    expect(unavailable.code).toBe('durable_operation_unavailable')
    expect(skipped).toEqual([])
  })

  it('keeps a paid setup checkout off the non-atomic activation payload', async () => {
    const adapter = createSumUpCheckoutAdapter({
      intents: {
        async get() {
          return {
            checkoutId: INTENT,
            planId: PAID,
            provider: 'sumup',
            providerCheckoutRef: CHECKOUT_ID,
            status: 'pending',
          }
        },
      },
      merchantCode: MERCHANT,
      testOnly: true,
      transport: {
        async createCheckout() { throw new Error('not used') },
        async retrieveCheckout() { return paidSetup() },
      },
    })
    const verified = await adapter.verify({
      rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: CHECKOUT_ID }),
    })
    expect(verified).toMatchObject({ code: 'SUMUP_SETUP_REQUIRES_ATOMIC_ACTIVATION', ok: false })
    expect(verified.payload).toBeUndefined()
  })

  it('defines one service-role function and lets the server call only that RPC', async () => {
    const sql = readFileSync(join(root, 'supabase/migrations/20260927140000_billing_sumup_initial_activation.sql'), 'utf8')
    const signature = sql.slice(
      sql.indexOf('create or replace function billing.activate_verified_sumup_setup'),
      sql.indexOf('returns jsonb'),
    )
    const createAt = sql.indexOf('billing.create_subscription(')
    const bindAt = sql.indexOf('billing.bind_verified_sumup_instrument(')
    const syncAt = sql.indexOf('billing.sync_plan_assignment_from_subscription(')
    const consumeAt = sql.lastIndexOf("status = 'consumed'")
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).not.toMatch(/\bcommit\b/i)
    expect(sql).not.toMatch(/drop function|disable row level security|user_entitlements|card_number|payment_instrument/i)
    expect(sql).toMatch(/'proration', false/)
    expect(sql).toMatch(/'refund', false/)
    expect(signature).not.toMatch(/p_user_id|p_plan_id|p_subscription_id|token/)
    expect(sql).toMatch(/p_subscription_id => created\.subscription_id/)
    expect(sql).toMatch(/'vk' \|\| replace\(existing\.user_id::text, '-', ''\)/)
    expect(sql.indexOf("existing.status = 'consumed'")).toBeLessThan(createAt)
    expect(bindAt).toBeGreaterThan(createAt)
    expect(syncAt).toBeGreaterThan(bindAt)
    expect(consumeAt).toBeGreaterThan(syncAt)
    expect(sql).toMatch(/when unique_violation then\s+raise exception 'provider_subscription_conflict';/)
    expect(sql).toMatch(/grant execute on function billing\.activate_verified_sumup_setup\(text, text, text, text, text, timestamptz, timestamptz, text\) to service_role/)
    expect(sql).not.toMatch(/grant execute on function billing\.activate_verified_sumup_setup\(.*\) to (public|anon|authenticated)/)
    expect(sql).not.toMatch(/billing\.activate_verified_checkout\(/)
    expect(getPlanById(PAID).price_minor).toBe(400)

    const source = readFileSync(join(root, 'api/_shared/billing/sumupInitialActivation.js'), 'utf8')
    expect(source).not.toMatch(/activate_verified_checkout|bind_verified_sumup_instrument/)
    const widget = readFileSync(join(root, 'src/components/billing/SumUpSandboxWidget.jsx'), 'utf8')
    const sandbox = readFileSync(join(root, 'api/_shared/billing/sumupSandboxSetup.js'), 'utf8')
    const route = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')
    expect(`${widget}\n${sandbox}\n${route}`).not.toMatch(/activateVerifiedSumUpSetup|activate_verified_sumup_setup/)

    expect(mapBillingRpcError({ message: 'instrument_conflict' }).code).toBe('instrument_conflict')
    expect(mapBillingRpcError({ code: '23505', message: 'duplicate key value violates unique constraint' }).code)
      .toBe('duplicate_external_event')
    const calls = []
    const callRpc = createServerSubscriptionRpcCaller({
      client: {
        schema(name) {
          return {
            async rpc(fn, args) {
              calls.push({ args, fn, name })
              return {
                data: {
                  access_granted: true,
                  assignment_plan_id: PAID,
                  plan_id: PAID,
                  subscription_id: 'sub_1',
                  user_id: USER,
                },
                error: null,
              }
            },
          }
        },
      },
    })
    await callRpc(SUMUP_INITIAL_ACTIVATION_RPC, { p_checkout_id: INTENT })
    expect(calls).toEqual([{
      args: { p_checkout_id: INTENT },
      fn: 'activate_verified_sumup_setup',
      name: 'billing',
    }])
    await expect(callRpc('billing.activate_verified_checkout', {})).rejects.toMatchObject({
      code: 'durable_operation_unavailable',
    })
    await expect(callRpc('billing.bind_verified_sumup_instrument', {})).rejects.toMatchObject({
      code: 'durable_operation_unavailable',
    })
  })
})

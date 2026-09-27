import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createInMemoryCheckoutActivation } from './checkoutActivation.js'
import {
  beginCheckout,
  getCheckoutAdapter,
  setCheckoutAdapterForTests,
  setCheckoutPortsForTests,
  setCheckoutSaleReaderForTests,
} from './checkoutIntent.js'
import { createProviderRegistry } from './paymentProviderContract.js'
import { createProviderEventProcessor, createMemoryCheckoutIntents, createMemoryProviderBindings, createMemoryProviderInbox } from './providerEventProcessor.js'
import { ingestProviderWebhook } from './providerWebhookIngress.js'
import { createLocalSubscriptionLifecycle } from '../../../src/services/billing/subscriptionLifecycle.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PAID = 'plan.prelim.sek.month.04'
const DISABLED = 'plan.prelim.sek.month.07'
const START = '2026-09-01T00:00:00.000Z'
const END = '2026-10-01T00:00:00.000Z'
const NEXT = '2026-11-01T00:00:00.000Z'
const GRACE = '2026-10-08T00:00:00.000Z'

function plans() {
  return new Map([
    [PAID, { active: true, enabledForSale: true }],
    [DISABLED, { active: true, enabledForSale: false }],
    ['plan.free', { active: true, enabledForSale: false }],
  ])
}

function database(now = () => new Date('2026-09-27T00:00:00.000Z')) {
  return createInMemoryCheckoutActivation({ now, plans: plans() })
}

function activationInput(overrides = {}) {
  return {
    checkoutId: 'chk_1',
    periodEnd: END,
    periodStart: START,
    provider: 'fixture',
    providerCheckoutRef: 'cs_1',
    providerCustomerRef: 'cus_1',
    providerEventId: 'evt_1',
    providerSubscriptionRef: 'psub_1',
    ...overrides,
  }
}

async function readyIntent(db, overrides = {}) {
  const intent = await db.createIntent({
    clientUserId: OTHER,
    planId: PAID,
    provider: 'fixture',
    providerPriceRef: 'price_4',
    userId: USER,
    ...overrides,
  })
  await db.bindCheckoutRef({
    checkoutId: intent.checkoutId,
    provider: 'fixture',
    providerCheckoutRef: 'cs_1',
  })
  return intent
}

afterEach(() => {
  setCheckoutAdapterForTests(null)
  setCheckoutPortsForTests(null)
  setCheckoutSaleReaderForTests(null)
})

describe('BILL-9B durable checkout activation', () => {
  it('creates an intent for the authenticated user and validated plan without paid access', async () => {
    const db = database()
    const intent = await readyIntent(db)
    expect(intent.userId).toBe(USER)
    expect(intent.planId).toBe(PAID)
    expect(intent.accessGranted).toBe(false)
    expect(intent.subscriptionId).toBeNull()
    expect(db.quotaPlan(USER)).toBe('plan.free')
    expect(db.quotaReservations()).toBe(0)
    await expect(db.createIntent({ planId: DISABLED, provider: 'fixture', userId: USER })).rejects.toMatchObject({ code: 'invalid_checkout_intent' })
    await expect(db.createIntent({ planId: 'plan.free', provider: 'fixture', userId: USER })).rejects.toMatchObject({ code: 'invalid_checkout_intent' })
    const calls = []
    setCheckoutSaleReaderForTests((planId) => ({
      active: planId === PAID,
      enabledForSale: planId === PAID,
      known: planId === PAID,
    }))
    setCheckoutPortsForTests({
      async bindCheckoutRef() { calls.push('bind') },
      async createIntent() { calls.push('create') },
    })
    await expect(beginCheckout({
      body: { enabled_for_sale: true, plan_id: 'plan.free', user_id: OTHER },
      userId: USER,
    })).resolves.toMatchObject({ code: 'INVALID_PLAN' })
    expect(calls).toEqual([])
  })

  it('keeps checkout refs unique and rejects rebinding a different ref', async () => {
    const db = database()
    const first = await readyIntent(db)
    const second = await db.createIntent({ planId: PAID, provider: 'fixture', userId: OTHER })
    await expect(db.bindCheckoutRef({
      checkoutId: second.checkoutId,
      provider: 'fixture',
      providerCheckoutRef: 'cs_1',
    })).rejects.toMatchObject({ code: 'provider_checkout_conflict' })
    await expect(db.bindCheckoutRef({
      checkoutId: first.checkoutId,
      provider: 'fixture',
      providerCheckoutRef: 'cs_2',
    })).rejects.toMatchObject({ code: 'provider_checkout_conflict' })
    expect(db.getIntent(first.checkoutId).userId).toBe(USER)
    expect(db.getIntent(first.checkoutId).planId).toBe(PAID)
  })

  it('activates from the durable intent and persists provider refs', async () => {
    const db = database()
    const intent = await readyIntent(db)
    expect(db.quotaPlan(USER)).toBe('plan.free')
    const activated = await db.activate(activationInput({
      checkoutId: intent.checkoutId,
      planId: DISABLED,
      userId: OTHER,
    }))
    expect(activated).toMatchObject({
      accessGranted: true,
      assignmentPlanId: PAID,
      planId: PAID,
      provider: 'fixture',
      providerCustomerRef: 'cus_1',
      providerSubscriptionRef: 'psub_1',
      refund: false,
      proration: false,
      status: 'ACTIVE',
      userId: USER,
    })
    expect(db.quotaPlan(USER)).toBe(PAID)
    expect(db.quotaReservations()).toBe(0)
    const replay = await db.activate(activationInput({ checkoutId: intent.checkoutId }))
    expect(replay.subscriptionId).toBe(activated.subscriptionId)
    await expect(db.activate(activationInput({
      checkoutId: intent.checkoutId,
      providerSubscriptionRef: 'psub_other',
    }))).rejects.toMatchObject({ code: 'duplicate_external_event' })
    await expect(db.activate(activationInput({
      checkoutId: intent.checkoutId,
      providerEventId: 'evt_2',
    }))).rejects.toMatchObject({ code: 'checkout_intent_consumed' })
  })

  it('rejects mismatched provider, checkout ref, subscription, expiry, and cancellation', async () => {
    const mismatch = database()
    const first = await readyIntent(mismatch)
    await expect(mismatch.activate(activationInput({
      checkoutId: first.checkoutId,
      provider: 'other',
    }))).rejects.toMatchObject({ code: 'provider_mismatch' })
    await expect(mismatch.activate(activationInput({
      checkoutId: first.checkoutId,
      providerCheckoutRef: 'cs_wrong',
    }))).rejects.toMatchObject({ code: 'provider_checkout_mismatch' })

    const shared = database()
    const left = await readyIntent(shared)
    await shared.activate(activationInput({ checkoutId: left.checkoutId }))
    const right = await shared.createIntent({ planId: PAID, provider: 'fixture', userId: OTHER })
    await shared.bindCheckoutRef({
      checkoutId: right.checkoutId,
      provider: 'fixture',
      providerCheckoutRef: 'cs_2',
    })
    await expect(shared.activate(activationInput({
      checkoutId: right.checkoutId,
      providerCheckoutRef: 'cs_2',
      providerEventId: 'evt_2',
    }))).rejects.toMatchObject({ code: 'provider_subscription_conflict' })

    let clock = new Date('2026-09-27T00:00:00.000Z')
    const expiring = createInMemoryCheckoutActivation({ now: () => clock, plans: plans() })
    const old = await readyIntent(expiring)
    clock = new Date('2026-09-27T02:00:00.000Z')
    await expect(expiring.activate(activationInput({ checkoutId: old.checkoutId }))).rejects.toMatchObject({ code: 'checkout_intent_expired' })

    const cancelled = database()
    const pending = await readyIntent(cancelled)
    await cancelled.cancelIntent(pending.checkoutId)
    await expect(cancelled.activate(activationInput({ checkoutId: pending.checkoutId }))).rejects.toMatchObject({ code: 'checkout_intent_cancelled' })
  })

  it('does not report success when activation fails before commit', async () => {
    const db = database()
    const intent = await readyIntent(db)
    await expect(db.activate(activationInput({
      checkoutId: intent.checkoutId,
      failAt: 'assignment',
    }))).rejects.toMatchObject({ code: 'assignment_sync_unconfirmed' })
    expect(db.getIntent(intent.checkoutId).status).toBe('pending')
    expect(db.quotaPlan(USER)).toBe('plan.free')
    const recovered = await db.activate(activationInput({ checkoutId: intent.checkoutId }))
    expect(recovered.accessGranted).toBe(true)
    expect(recovered.userId).toBe(USER)
  })

  it('uses a test-only adapter without a checkout URL and leaves production unwired', async () => {
    expect(getCheckoutAdapter()).toBeNull()
    setCheckoutAdapterForTests({ prepare() { return { checkoutUrl: 'https://pay.example' } }, provider: 'fixture', testOnly: false })
    expect(getCheckoutAdapter()).toBeNull()
    const db = database()
    setCheckoutSaleReaderForTests(() => ({ active: true, enabledForSale: true, known: true }))
    setCheckoutAdapterForTests({
      async prepare() { return { providerCheckoutRef: 'cs_route' } },
      priceRef: 'price_4',
      provider: 'fixture',
      testOnly: true,
    })
    setCheckoutPortsForTests({
      bindCheckoutRef: (input) => db.bindCheckoutRef(input),
      createIntent: (input) => db.createIntent(input),
    })
    const pending = await beginCheckout({
      body: { plan_id: PAID, provider_subscription_ref: 'client_sub', user_id: OTHER },
      userId: USER,
    })
    expect(pending).toMatchObject({
      accessGranted: false,
      code: 'CHECKOUT_PENDING',
      ok: false,
      validated: true,
    })
    expect(pending.checkoutUrl).toBeUndefined()
    expect(db.getIntent(pending.checkoutId).userId).toBe(USER)
    expect(db.quotaPlan(USER)).toBe('plan.free')
  })

  it('rejects an unsigned webhook and activates only after verification', async () => {
    const db = database()
    const intent = await readyIntent(db)
    const calls = []
    const processor = createProviderEventProcessor({
      activation: { async syncFromSubscription() { return { plan_id: PAID } } },
      bindings: createMemoryProviderBindings(),
      durableActivate: async (event) => {
        calls.push(event)
        return db.activate({
          checkoutId: event.checkoutId,
          periodEnd: event.periodEnd,
          periodStart: event.periodStart,
          provider: event.provider,
          providerCheckoutRef: event.providerCheckoutRef,
          providerCustomerRef: event.providerCustomerRef,
          providerEventId: event.providerEventId,
          providerSubscriptionRef: event.providerSubscriptionRef,
        })
      },
      inbox: createMemoryProviderInbox(),
      intents: createMemoryCheckoutIntents(),
      renewals: { async applyTrustedRenewal() { throw new Error('not used') } },
      subscriptions: { async createSubscription() { throw new Error('not used') } },
    })
    const raw = JSON.stringify({ type: 'checkout.activated', user_id: OTHER })
    const unsigned = await ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      headers: {},
      rawBody: raw,
    })
    expect(unsigned.code).toBe('UNKNOWN_PROVIDER')
    expect(calls).toEqual([])
    const registry = createProviderRegistry()
    registry.register({
      provider: 'fixture',
      verify({ headers }) {
        if (headers['x-billing-signature'] !== 'good') return { ok: false, code: 'INVALID_SIGNATURE' }
        return {
          ok: true,
          payload: {
            checkoutId: intent.checkoutId,
            periodEnd: END,
            periodStart: START,
            provider: 'fixture',
            providerCheckoutRef: 'cs_1',
            providerCustomerRef: 'cus_1',
            providerEventId: 'evt_1',
            providerSubscriptionRef: 'psub_1',
            type: 'checkout.activated',
          },
        }
      },
    })
    const verified = await ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      headers: { 'x-billing-provider': 'fixture', 'x-billing-signature': 'good' },
      rawBody: '{}',
      registry,
    })
    expect(verified.ok).toBe(true)
    expect(verified.accessGranted).toBe(true)
    expect(calls[0].userId).toBeUndefined()
    expect(db.quotaPlan(USER)).toBe(PAID)
  })

  it('keeps renewal, failed renewal, and cancellation compatible', async () => {
    const db = database()
    const intent = await readyIntent(db)
    const activated = await db.activate(activationInput({ checkoutId: intent.checkoutId }))
    const local = createLocalSubscriptionLifecycle()
    const row = await local.subscriptions.createSubscription({
      current_period_end: activated.currentPeriodEnd,
      current_period_start: START,
      external_event_id: 'evt_open',
      plan_id: activated.planId,
      user_id: activated.userId,
    })
    const renewed = await local.renewals.applyTrustedRenewal({
      current_period_end: NEXT,
      external_event_id: 'evt_renew_ok',
      outcome: 'succeeded',
      subscription_id: row.subscription_id,
    })
    expect(renewed.status).toBe('ACTIVE')
    expect(renewed.current_period_end).toBe(NEXT)
    expect(renewed.plan_id).toBe(PAID)
    const failedRow = await local.subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      external_event_id: 'evt_open_fail',
      plan_id: activated.planId,
      user_id: OTHER,
    })
    const failed = await local.renewals.applyTrustedRenewal({
      current_period_end: END,
      external_event_id: 'evt_renew_fail',
      outcome: 'failed',
      past_due_grace_until: GRACE,
      subscription_id: failedRow.subscription_id,
    })
    expect(failed.status).toBe('PAST_DUE')
    expect(failed.current_period_end).toBe(END)
    const cancelled = await local.subscriptions.scheduleCancelAtPeriodEnd({
      external_event_id: 'evt_cancel',
      subscription_id: row.subscription_id,
    })
    expect(cancelled.status).toBe('ACTIVE')
    expect(cancelled.cancel_at_period_end).toBe(true)
    expect(cancelled.current_period_end).toBe(NEXT)
    expect(activated.proration).toBe(false)
    expect(activated.refund).toBe(false)
  })

  it('defines one transactional activation migration without client table access', () => {
    const sql = readFileSync(join(root, 'supabase/migrations/20260926170000_billing_checkout_activation.sql'), 'utf8')
    const subscriptions = readFileSync(join(root, 'supabase/migrations/20260921200000_billing_subscriptions.sql'), 'utf8')
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/revoke all on table billing\.checkout_intents from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/as restrictive/)
    expect(sql).toMatch(/using \(false\)/)
    expect(sql).not.toMatch(/grant select|grant insert|grant update|grant delete/i)
    expect(sql).not.toMatch(/pg_catalog\.coalesce/i)
    expect(sql).not.toMatch(/user_entitlements/)
    expect(sql).toMatch(/'proration', false/)
    expect(sql).toMatch(/'refund', false/)
    expect(sql).toMatch(/billing\.create_subscription\(/)
    expect(sql).toMatch(/provider = p_provider/)
    expect(sql).toMatch(/provider_customer_ref = p_provider_customer_ref/)
    expect(sql).toMatch(/provider_subscription_ref = p_provider_subscription_ref/)
    expect(sql).toMatch(/billing\.sync_plan_assignment_from_subscription/)
    expect(sql).toMatch(/status = 'consumed'/)
    expect(sql.indexOf('sync_plan_assignment_from_subscription')).toBeLessThan(sql.lastIndexOf("status = 'consumed'"))
    expect(sql).toMatch(/grant execute on function billing\.activate_verified_checkout/)
    expect(sql).not.toMatch(/grant execute on function billing\.activate_verified_checkout\(.*\) to (public|anon|authenticated)/)
    expect(subscriptions).toMatch(/subscriptions_provider_sub_uidx/)
    const ingress = readFileSync(join(root, 'api/_shared/billing/providerWebhookIngress.js'), 'utf8')
    expect(ingress).not.toMatch(/skipVerify|testOnly/)
    const activation = readFileSync(join(root, 'api/_shared/billing/checkoutActivation.js'), 'utf8')
    expect(activation).not.toMatch(/sk_live|whsec_|SUPABASE_SERVICE_ROLE|public\.user_entitlements|stripe\.com|sumup\.com/i)
    expect(activation).not.toMatch(/reserve_quota/)
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { beginCheckout, handleCheckoutRequest as checkoutHandler, setCheckoutAdapterForTests, setCheckoutPortsForTests, setCheckoutSaleReaderForTests } from './checkoutIntent.js'
import { handleWebhookRequest as webhookHandler } from './providerWebhookIngress.js'
import {
  createProviderRegistry,
  normalizeProviderEvent,
  setPaymentProviderRegistryForTests,
  setTrustedProviderApplyForTests,
} from './paymentProviderContract.js'
import {
  createMemoryCheckoutIntents,
  createMemoryProviderBindings,
  createMemoryProviderInbox,
  createProviderEventProcessor,
} from './providerEventProcessor.js'
import { ingestProviderWebhook } from './providerWebhookIngress.js'
import { setSupabaseAuthVerifierForTests } from '../verifySupabaseUser.js'
import { createLocalSubscriptionLifecycle } from '../../../src/services/billing/subscriptionLifecycle.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PAID = 'plan.prelim.sek.month.04'
const OTHER_PLAN = 'plan.prelim.sek.month.07'
const START = '2026-09-01T00:00:00.000Z'
const END = '2026-10-01T00:00:00.000Z'
const NEXT = '2026-11-01T00:00:00.000Z'
const GRACE = '2026-10-08T00:00:00.000Z'

function responseStub() {
  const response = {
    body: null,
    statusCode: 200,
    json(body) {
      response.body = body
      return response
    },
    setHeader() {},
    status(statusCode) {
      response.statusCode = statusCode
      return response
    },
  }
  return response
}

function saleFor(planId) {
  if (planId === PAID) return { active: true, enabledForSale: true, known: true }
  if (planId === OTHER_PLAN) return { active: true, enabledForSale: false, known: true }
  if (planId === 'plan.missing') return { active: false, enabledForSale: false, known: false }
  return { active: true, enabledForSale: false, known: true }
}

function checkoutRequest(body, token = 'valid-token') {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method: 'POST',
    url: '/api/billing/checkout',
  }
}

function harness() {
  const local = createLocalSubscriptionLifecycle()
  const intents = createMemoryCheckoutIntents()
  const processor = createProviderEventProcessor({
    activation: local.activation,
    bindings: createMemoryProviderBindings(),
    inbox: createMemoryProviderInbox(),
    intents,
    readSale: saleFor,
    renewals: local.renewals,
    subscriptions: local.subscriptions,
  })
  return { ...local, intents, processor }
}

function activatedEvent(overrides = {}) {
  return {
    checkoutId: 'chk_1',
    paymentStatus: 'paid',
    periodEnd: END,
    periodStart: START,
    provider: 'fixture',
    providerCustomerRef: 'cus_1',
    providerEventId: 'evt_checkout_1',
    providerPriceRef: 'price_4',
    providerSubscriptionRef: 'psub_1',
    type: 'checkout.activated',
    ...overrides,
  }
}

afterEach(() => {
  setSupabaseAuthVerifierForTests(null)
  setCheckoutSaleReaderForTests(null)
  setCheckoutAdapterForTests(null)
  setCheckoutPortsForTests(null)
  setPaymentProviderRegistryForTests(null)
  setTrustedProviderApplyForTests(null)
})

describe('BILL-9A checkout boundary', () => {
  it('rejects an unauthenticated checkout', async () => {
    const response = responseStub()
    await checkoutHandler(checkoutRequest({ plan_id: PAID }, ''), response)
    expect(response.statusCode).toBe(401)
    expect(response.body.ok).toBe(false)
    expect(response.body.accessGranted).toBeUndefined()
  })

  it('rejects a missing, disabled, or free plan and ignores client authority', async () => {
    setCheckoutSaleReaderForTests(saleFor)
    await expect(beginCheckout({
      body: { plan_id: 'plan.missing', user_id: OTHER },
      userId: USER,
    })).resolves.toMatchObject({ accessGranted: false, code: 'INVALID_PLAN', ok: false })
    await expect(beginCheckout({
      body: { plan_id: OTHER_PLAN, status: 'ACTIVE' },
      userId: USER,
    })).resolves.toMatchObject({ code: 'INVALID_PLAN' })
    await expect(beginCheckout({
      body: { enabled_for_sale: true, plan_id: 'plan.free', quota: { ai: 999 } },
      userId: USER,
    })).resolves.toMatchObject({ code: 'INVALID_PLAN' })
    const accepted = await beginCheckout({
      body: {
        current_period_end: NEXT,
        entitlements: { paid: true },
        plan_id: PAID,
        quota: { ai_text_requests: 9999 },
        status: 'ACTIVE',
        subscription_id: 'sub_client',
        user_id: OTHER,
      },
      userId: USER,
    })
    expect(accepted).toMatchObject({
      accessGranted: false,
      code: 'PROVIDER_NOT_CONFIGURED',
      ok: false,
      status: 503,
      validated: true,
    })
    expect(accepted.subscription).toBeUndefined()
    expect(accepted.checkoutUrl).toBeUndefined()
    expect(JSON.stringify(accepted)).not.toMatch(/22222222|sub_client|9999/)
  })

  it('fails closed through the route after sale validation', async () => {
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token' ? { user: { id: USER } } : { error: { message: 'invalid jwt' } }
    ))
    setCheckoutSaleReaderForTests(saleFor)
    const response = responseStub()
    await checkoutHandler(checkoutRequest({
      plan_id: PAID,
      user_id: OTHER,
      status: 'ACTIVE',
      current_period_end: NEXT,
      quota: { ai: 1 },
      entitlements: { paid: true },
    }), response)
    expect(response.statusCode).toBe(503)
    expect(response.body).toMatchObject({
      accessGranted: false,
      error: { code: 'PROVIDER_NOT_CONFIGURED' },
      ok: false,
      validated: true,
    })
    expect(JSON.stringify(response.body)).not.toMatch(/checkoutUrl|http:|https:/)
  })
})

describe('BILL-9A webhook boundary', () => {
  it('rejects unverified, unknown, and unsigned provider requests', async () => {
    const calls = []
    setTrustedProviderApplyForTests(async (event) => {
      calls.push(event)
      return { accessGranted: true }
    })
    const raw = JSON.stringify({
      plan_id: PAID,
      type: 'checkout.activated',
      user_id: OTHER,
    })
    const missing = await ingestProviderWebhook({ headers: {}, rawBody: raw })
    expect(missing).toMatchObject({ code: 'UNKNOWN_PROVIDER', ok: false })
    const unknown = await ingestProviderWebhook({
      headers: { 'x-billing-provider': 'stripe' },
      rawBody: raw,
    })
    expect(unknown).toMatchObject({ code: 'UNKNOWN_PROVIDER', ok: false })
    const registry = createProviderRegistry()
    registry.register({
      provider: 'fixture',
      verify({ headers }) {
        if (headers['x-billing-signature'] !== 'good') return { code: 'INVALID_SIGNATURE', ok: false }
        return { ok: true, payload: JSON.parse(raw) }
      },
    })
    const unsigned = await ingestProviderWebhook({
      headers: { 'x-billing-provider': 'fixture' },
      rawBody: raw,
      registry,
    })
    expect(unsigned).toMatchObject({ code: 'INVALID_SIGNATURE', ok: false })
    const authority = await ingestProviderWebhook({
      headers: { 'x-billing-provider': 'fixture', 'x-billing-signature': 'good' },
      rawBody: raw,
      registry,
    })
    expect(authority).toMatchObject({ code: 'CLIENT_AUTHORITY_REJECTED', ok: false })
    expect(calls).toEqual([])
  })

  it('does not let the public route apply a raw lifecycle payload', async () => {
    const response = responseStub()
    await webhookHandler({
      body: {
        plan_id: PAID,
        providerEventId: 'evt_raw',
        type: 'checkout.activated',
        user_id: USER,
      },
      headers: { 'x-billing-provider': 'fixture', 'x-billing-signature': 'good' },
      method: 'POST',
    }, response)
    expect(response.body.ok).toBe(false)
    expect(response.body.accessGranted).toBe(false)
    expect(response.body.error.code).toBe('UNKNOWN_PROVIDER')
  })

  it('rejects an unknown event type after a valid signature', async () => {
    const registry = createProviderRegistry()
    const calls = []
    registry.register({
      provider: 'fixture',
      verify() {
        return {
          ok: true,
          payload: {
            provider: 'fixture',
            providerEventId: 'evt_unknown',
            type: 'invoice.paid',
          },
        }
      },
    })
    const result = await ingestProviderWebhook({
      applyTrusted: async (event) => {
        calls.push(event)
        return { accessGranted: true }
      },
      headers: { 'x-billing-provider': 'fixture', 'x-billing-signature': 'good' },
      rawBody: '{}',
      registry,
    })
    expect(result).toMatchObject({ code: 'UNKNOWN_EVENT', ok: false })
    expect(calls).toEqual([])
    expect(normalizeProviderEvent({
      current_period_end: END,
      provider: 'fixture',
      providerEventId: 'evt_1',
      type: 'renewal.succeeded',
    }).code).toBe('CLIENT_AUTHORITY_REJECTED')
  })
})

describe('BILL-9A trusted provider events', () => {
  it('activates only the checkout intent user and plan, then replays safely', async () => {
    const { assignments, intents, processor, subscriptions } = harness()
    await intents.put({ checkoutId: 'chk_1', planId: PAID, userId: USER })
    const first = await processor.apply(activatedEvent())
    expect(first).toMatchObject({
      accessGranted: true,
      assignmentPlanId: PAID,
      planId: PAID,
      userId: USER,
    })
    const replay = await processor.apply(activatedEvent())
    expect(replay.subscriptionId).toBe(first.subscriptionId)
    const stored = await assignments.get(USER)
    expect(stored.plan_id).toBe(PAID)
    const row = await subscriptions.getSubscription(first.subscriptionId)
    expect(row.user_id).toBe(USER)
    expect(row.plan_id).toBe(PAID)
    await expect(processor.apply(activatedEvent({
      periodEnd: NEXT,
    }))).rejects.toMatchObject({ code: 'duplicate_external_event' })
    const other = harness()
    await other.intents.put({ checkoutId: 'chk_other', planId: OTHER_PLAN, userId: OTHER })
    await expect(other.processor.apply(activatedEvent({
      checkoutId: 'chk_other',
      providerEventId: 'evt_wrong_plan',
      providerSubscriptionRef: 'psub_other',
    }))).rejects.toMatchObject({ code: 'INVALID_PLAN' })
  })

  it('refuses to bind one provider subscription to a second user', async () => {
    const { intents, processor } = harness()
    await intents.put({ checkoutId: 'chk_1', planId: PAID, userId: USER })
    await intents.put({ checkoutId: 'chk_2', planId: PAID, userId: OTHER })
    await processor.apply(activatedEvent())
    await expect(processor.apply(activatedEvent({
      checkoutId: 'chk_2',
      providerEventId: 'evt_checkout_2',
    }))).rejects.toMatchObject({ code: 'provider_subscription_conflict' })
  })

  it('keeps a newer renewal success ahead of a stale failure and cancels without refund', async () => {
    const { intents, processor, subscriptions } = harness()
    await intents.put({ checkoutId: 'chk_1', planId: PAID, userId: USER })
    const opened = await processor.apply(activatedEvent())
    await processor.apply({
      paymentStatus: 'paid',
      periodEnd: NEXT,
      provider: 'fixture',
      providerEventId: 'evt_renew_ok',
      providerSubscriptionRef: 'psub_1',
      type: 'renewal.succeeded',
    })
    const stale = await processor.apply({
      graceUntil: GRACE,
      paymentStatus: 'failed',
      periodEnd: END,
      provider: 'fixture',
      providerEventId: 'evt_renew_stale',
      providerSubscriptionRef: 'psub_1',
      type: 'renewal.failed',
    })
    expect(stale.status).toBe('ACTIVE')
    expect(stale.currentPeriodEnd).toBe(NEXT)
    expect(stale.refund).toBe(false)
    expect(stale.proration).toBe(false)
    const cancelled = await processor.apply({
      provider: 'fixture',
      providerEventId: 'evt_cancel_1',
      providerSubscriptionRef: 'psub_1',
      type: 'subscription.cancelled',
    })
    expect(cancelled).toMatchObject({
      accessGranted: true,
      cancelAtPeriodEnd: true,
      periodUnchanged: true,
      proration: false,
      refund: false,
      status: 'ACTIVE',
    })
    expect(cancelled.currentPeriodEnd).toBe(NEXT)
    const replay = await processor.apply({
      provider: 'fixture',
      providerEventId: 'evt_cancel_1',
      providerSubscriptionRef: 'psub_1',
      type: 'subscription.cancelled',
    })
    expect(replay.currentPeriodEnd).toBe(cancelled.currentPeriodEnd)
    const row = await subscriptions.getSubscription(opened.subscriptionId)
    expect(row.plan_id).toBe(PAID)
    expect(row.cancel_at_period_end).toBe(true)
    expect(row.status).toBe('ACTIVE')
  })
})

describe('BILL-9A provider foundation safety', () => {
  it('keeps provider secrets and billing authority out of the client and new server files', () => {
    const serverFiles = [
      'api/_shared/billing/paymentProviderContract.js',
      'api/_shared/billing/checkoutIntent.js',
      'api/_shared/billing/providerWebhookIngress.js',
      'api/_shared/billing/providerEventProcessor.js',
      'api/billing/user/index.js',
      'vercel.json',
    ]
    for (const file of serverFiles) {
      const text = readFileSync(join(root, file), 'utf8')
      expect(text).not.toMatch(/sk_live|whsec_|SUPABASE_SERVICE_ROLE|public\.user_entitlements|stripe\.com|sumup\.com/i)
      expect(text).not.toMatch(/reserve_quota|refundPayment|prorate/)
    }
    const hits = []
    walk(join(root, 'src'), hits)
    expect(hits).toEqual([])
  })
})

function walk(dir, hits) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, hits)
      continue
    }
    if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue
    const text = readFileSync(full, 'utf8')
    if (/checkoutIntent|providerWebhookIngress|providerEventProcessor|paymentProviderContract/.test(text)) {
      hits.push(entry.name)
    }
  }
}

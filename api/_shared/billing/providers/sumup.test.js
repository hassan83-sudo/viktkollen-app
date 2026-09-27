import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createInMemoryCheckoutActivation } from '../checkoutActivation.js'
import { beginCheckout, getCheckoutAdapter, setCheckoutAdapterForTests, setCheckoutPortsForTests, setCheckoutSaleReaderForTests } from '../checkoutIntent.js'
import { createProviderRegistry, normalizeProviderEvent } from '../paymentProviderContract.js'
import { createMemoryCheckoutIntents, createMemoryProviderBindings, createMemoryProviderInbox, createProviderEventProcessor } from '../providerEventProcessor.js'
import { ingestProviderWebhook } from '../providerWebhookIngress.js'
import {
  createSumUpCheckoutAdapter,
  createSumUpHttpTransport,
  getConfiguredSumUpAdapter,
  isSumUpCheckoutNotification,
  minorUnitsFromSumUpAmount,
  readSumUpConfig,
  sumUpMajorFromMinor,
} from './sumup.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CHECKOUT_ID = '4f3a9c0e-6b1d-4a77-9e20-0c5d8a7b6e11'
const TRANSACTION_ID = '6b425463-3e1b-431d-83fa-1e51c2925e99'
const MERCHANT = 'MTEST01'
const PLANS = [
  ['plan.prelim.sek.month.04', 4],
  ['plan.prelim.sek.month.07', 7],
  ['plan.prelim.sek.month.09', 9],
  ['plan.prelim.sek.month.12', 12],
]

function database() {
  return createInMemoryCheckoutActivation({
    plans: new Map(PLANS.map(([id]) => [id, { active: true, enabledForSale: true }])),
  })
}

function paidCheckout(overrides = {}) {
  return {
    amount: 4,
    checkout_reference: 'chk_1',
    currency: 'SEK',
    customer_id: 'cus_bill10a',
    id: CHECKOUT_ID,
    merchant_code: MERCHANT,
    status: 'PAID',
    transactions: [{
      amount: 4,
      currency: 'SEK',
      id: TRANSACTION_ID,
      status: 'SUCCESSFUL',
      timestamp: '2026-09-27T09:00:00.000Z',
    }],
    ...overrides,
  }
}

function transportFor(checkout) {
  const calls = []
  return {
    calls,
    async createCheckout(body) {
      calls.push({ body, op: 'create' })
      return {
        amount: body.amount,
        checkout_reference: body.checkout_reference,
        currency: body.currency,
        hosted_checkout_url: `https://checkout.sumup.com/pay/${CHECKOUT_ID}`,
        id: CHECKOUT_ID,
        merchant_code: body.merchant_code,
        status: 'PENDING',
      }
    },
    async retrieveCheckout(id) {
      calls.push({ id, op: 'retrieve' })
      return { ...checkout, checkout_reference: checkout.checkout_reference, id }
    },
  }
}

function adapterFor(db, checkout = paidCheckout(), transport = transportFor(checkout)) {
  return {
    adapter: createSumUpCheckoutAdapter({
      intents: { async get(id) { return db.getIntent(id) } },
      merchantCode: MERCHANT,
      testOnly: true,
      transport,
    }),
    transport,
  }
}

afterEach(() => {
  setCheckoutAdapterForTests(null)
  setCheckoutPortsForTests(null)
  setCheckoutSaleReaderForTests(null)
})

describe('BILL-10A SumUp adapter', () => {
  it('keeps the adapter server-only and fails closed without credentials', () => {
    expect(readSumUpConfig({})).toBeNull()
    expect(getConfiguredSumUpAdapter({})).toBeNull()
    expect(getCheckoutAdapter()).toBeNull()
    const hits = []
    walk(join(root, 'src'), hits)
    expect(hits).toEqual([])
    const source = readFileSync(new URL('./sumup.js', import.meta.url), 'utf8')
    expect(source).not.toMatch(/VITE_|sk_live|whsec_|pan|cvv|card_number|user_entitlements|\/v0\.1\/refunds/i)
    expect(source).not.toMatch(/stripe/i)
  })

  it('derives SEK major units exactly for the low-price plans', () => {
    for (const [planId, major] of PLANS) {
      expect(sumUpMajorFromMinor(major * 100)).toBe(major)
      expect(minorUnitsFromSumUpAmount(major)).toBe(major * 100)
      expect(sumUpMajorFromMinor(major * 100)).not.toBe(major * 100)
      expect(planId.endsWith(String(major).padStart(2, '0'))).toBe(true)
    }
    expect(minorUnitsFromSumUpAmount(4.015)).toBeNull()
  })

  it('rejects client amount and currency and creates no access before payment', async () => {
    const db = database()
    const { adapter, transport } = adapterFor(db)
    setCheckoutSaleReaderForTests(() => ({ active: true, enabledForSale: true, known: true }))
    setCheckoutAdapterForTests(adapter)
    setCheckoutPortsForTests(ports(db))
    await expect(beginCheckout({
      body: { amount: 400, currency: 'SEK', plan_id: 'plan.prelim.sek.month.04', user_id: OTHER },
      userId: USER,
    })).resolves.toMatchObject({ code: 'INVALID_AMOUNT' })
    await expect(beginCheckout({
      body: { amount: 4, currency: 'USD', plan_id: 'plan.prelim.sek.month.04' },
      userId: USER,
    })).resolves.toMatchObject({ code: 'INVALID_CURRENCY' })
    await expect(beginCheckout({
      body: { plan_id: 'plan.free' },
      userId: USER,
    })).resolves.toMatchObject({ code: 'INVALID_PLAN' })
    expect(transport.calls).toEqual([])
    expect(db.quotaPlan(USER)).toBe('plan.free')
  })

  it('binds a SumUp checkout without granting access and cancels a failed create', async () => {
    const db = database()
    const { adapter, transport } = adapterFor(db)
    setCheckoutSaleReaderForTests((planId) => ({
      active: planId.startsWith('plan.prelim'),
      enabledForSale: planId.startsWith('plan.prelim'),
      known: planId.startsWith('plan.prelim'),
    }))
    setCheckoutAdapterForTests(adapter)
    setCheckoutPortsForTests(ports(db))
    const pending = await beginCheckout({
      body: { amount: 4, currency: 'sek', plan_id: 'plan.prelim.sek.month.04', user_id: OTHER },
      userId: USER,
    })
    expect(pending).toMatchObject({
      accessGranted: false,
      code: 'CHECKOUT_PENDING',
      hostedCheckoutUrl: `https://checkout.sumup.com/pay/${CHECKOUT_ID}`,
      validated: true,
    })
    expect(pending.hostedCheckoutUrl).not.toMatch(/api\.sumup\.com|Bearer|MTEST01/)
    expect(transport.calls[0].body).toMatchObject({ amount: 4, currency: 'SEK', merchant_code: MERCHANT })
    expect(transport.calls[0].body.amount).not.toBe(400)
    expect(transport.calls[0].body.customer_id).toBeUndefined()
    expect(db.getIntent(pending.checkoutId)).toMatchObject({
      planId: 'plan.prelim.sek.month.04',
      provider: 'sumup',
      providerCheckoutRef: CHECKOUT_ID,
      status: 'pending',
      userId: USER,
    })
    expect(db.quotaPlan(USER)).toBe('plan.free')

    const failing = createSumUpCheckoutAdapter({
      merchantCode: MERCHANT,
      testOnly: true,
      transport: {
        async createCheckout() { throw new Error('network') },
        async retrieveCheckout() { throw new Error('network') },
      },
    })
    setCheckoutAdapterForTests(failing)
    const failed = await beginCheckout({
      body: { plan_id: 'plan.prelim.sek.month.07' },
      userId: USER,
    })
    expect(failed).toMatchObject({ accessGranted: false, code: 'SUMUP_CHECKOUT_FAILED' })
    expect(db.quotaPlan(USER)).toBe('plan.free')
    expect([...PLANS.map(([id]) => id)].includes(db.getIntent(pending.checkoutId).planId)).toBe(true)
  })

  it('retrieves the checkout before activation and rejects unverified payments', async () => {
    const db = database()
    const store = new Map()
    const transport = transportFor(paidCheckout())
    const { adapter } = adapterFor(db, paidCheckout(), transport)
    setCheckoutSaleReaderForTests(() => ({ active: true, enabledForSale: true, known: true }))
    setCheckoutAdapterForTests(adapter)
    setCheckoutPortsForTests(ports(db))
    const pending = await beginCheckout({
      body: { plan_id: 'plan.prelim.sek.month.04' },
      userId: USER,
    })
    transport.calls.length = 0
    const checkout = paidCheckout({ checkout_reference: pending.checkoutId })
    transport.retrieveCheckout = async (id) => {
      transport.calls.push({ id, op: 'retrieve' })
      return store.get('checkout') || checkout
    }
    const registry = createProviderRegistry()
    registry.register(adapter)
    const processor = createProviderEventProcessor({
      activation: { async syncFromSubscription() { return { plan_id: 'plan.prelim.sek.month.04' } } },
      bindings: createMemoryProviderBindings(),
      durableActivate: (event) => db.activate({
        checkoutId: event.checkoutId,
        periodEnd: event.periodEnd,
        periodStart: event.periodStart,
        provider: event.provider,
        providerCheckoutRef: event.providerCheckoutRef,
        providerCustomerRef: event.providerCustomerRef,
        providerEventId: event.providerEventId,
        providerSubscriptionRef: event.providerSubscriptionRef,
      }),
      inbox: createMemoryProviderInbox(),
      intents: createMemoryCheckoutIntents(),
      renewals: { async applyTrustedRenewal() { throw new Error('not used') } },
      subscriptions: { async createSubscription() { throw new Error('not used') } },
    })
    const note = JSON.stringify({
      amount: 1,
      currency: 'USD',
      event_type: 'CHECKOUT_STATUS_CHANGED',
      id: CHECKOUT_ID,
      status: 'PAID',
      user_id: OTHER,
    })
    expect(isSumUpCheckoutNotification(note)).toBe(true)
    const unsigned = await ingestProviderWebhook({ rawBody: note })
    expect(unsigned.code).toBe('UNKNOWN_PROVIDER')
    expect(transport.calls).toEqual([])

    store.set('checkout', { ...checkout, status: 'PENDING' })
    const pendingPayment = await ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      rawBody: note,
      registry,
    })
    expect(pendingPayment.code).toBe('PAYMENT_PENDING')
    expect(db.getIntent(pending.checkoutId).status).toBe('pending')

    store.set('checkout', { ...checkout, status: 'FAILED' })
    await expect(ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      rawBody: note,
      registry,
    })).resolves.toMatchObject({ code: 'PAYMENT_FAILED' })

    store.set('checkout', { ...checkout, amount: 5 })
    await expect(ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      rawBody: note,
      registry,
    })).resolves.toMatchObject({ code: 'AMOUNT_MISMATCH' })

    store.set('checkout', { ...checkout, currency: 'EUR' })
    await expect(ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      rawBody: note,
      registry,
    })).resolves.toMatchObject({ code: 'CURRENCY_MISMATCH' })

    store.set('checkout', { ...checkout, checkout_reference: 'chk_other' })
    await expect(ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      rawBody: note,
      registry,
    })).resolves.toMatchObject({ code: 'CHECKOUT_INTENT_MISSING' })

    store.set('checkout', checkout)
    const verified = await ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      rawBody: note,
      registry,
    })
    expect(verified).toMatchObject({ accessGranted: true, ok: true })
    expect(db.quotaPlan(USER)).toBe('plan.prelim.sek.month.04')
    expect(db.getIntent(pending.checkoutId).status).toBe('consumed')
    const replay = await ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      rawBody: note,
      registry,
    })
    expect(replay.ok).toBe(true)
    store.set('checkout', {
      ...checkout,
      transactions: [{
        amount: 4,
        currency: 'SEK',
        id: '11111111-2222-4333-8444-555555555555',
        status: 'SUCCESSFUL',
        timestamp: '2026-09-27T09:00:00.000Z',
      }],
    })
    const conflict = await ingestProviderWebhook({
      applyTrusted: (event) => processor.apply(event),
      rawBody: note,
      registry,
    })
    expect(conflict.code).toBe('duplicate_external_event')
    expect(conflict.code).not.toBe('23505')
  })

  it('builds the live request shape without calling SumUp and drops card data', async () => {
    const seen = []
    const transport = createSumUpHttpTransport({
      apiKey: 'test-only-key',
      async fetchImpl(url, options) {
        seen.push({ authorization: options.headers.Authorization, body: JSON.parse(options.body), method: options.method, url })
        return {
          async json() {
            return { amount: 4, checkout_reference: 'chk_1', currency: 'SEK', id: CHECKOUT_ID, merchant_code: MERCHANT, status: 'PENDING' }
          },
          ok: true,
        }
      },
    })
    await transport.createCheckout({ amount: 4, checkout_reference: 'chk_1', currency: 'SEK', merchant_code: MERCHANT })
    expect(seen[0].url).toBe('https://api.sumup.com/v0.1/checkouts')
    expect(seen[0].method).toBe('POST')
    expect(seen[0].authorization).toBe('Bearer test-only-key')
    expect(seen[0].body.amount).toBe(4)
    const db = database()
    const checkout = {
      ...paidCheckout({ checkout_reference: 'chk_1' }),
      card: { number: '4111111111111111', cvv: '123' },
      payment_instrument: { token: '6878cb7f-6515-47bf-bdd9-1408d270fdce' },
    }
    const { adapter } = adapterFor(db, checkout)
    await db.createIntent({ planId: 'plan.prelim.sek.month.04', provider: 'sumup', userId: USER })
    await db.bindCheckoutRef({ checkoutId: 'chk_1', provider: 'sumup', providerCheckoutRef: CHECKOUT_ID })
    const verified = await adapter.verify({
      rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: CHECKOUT_ID }),
    })
    expect(verified.ok).toBe(true)
    expect(verified.payload.userId).toBeUndefined()
    expect(verified.payload.planId).toBeUndefined()
    expect(JSON.stringify(verified.payload)).not.toMatch(/4111|cvv|payment_instrument|6878cb7f/)
    expect(normalizeProviderEvent(verified.payload).ok).toBe(true)
    expect(verified.payload.providerCustomerRef).toBe('cus_bill10a')
    expect(verified.payload.providerSubscriptionRef).toBe(TRANSACTION_ID)
  })

  it('maps recurring customer, list, and process calls without card data or a live request', async () => {
    const seen = []
    const transport = createSumUpHttpTransport({
      apiKey: 'test-only-key',
      async fetchImpl(url, options) {
        seen.push({ body: options.body ? JSON.parse(options.body) : null, method: options.method, url })
        return {
          async json() {
            return [{ id: CHECKOUT_ID, token: '6878cb7f-6515-47bf-bdd9-1408d270fdce' }]
          },
          ok: options.method !== 'CONFLICT',
          status: 200,
        }
      },
    })
    await transport.createCustomer({ customer_id: 'vk11111111111141118111111111111111' })
    await transport.listCheckouts('rn-ref')
    await transport.listPaymentInstruments('vk11111111111141118111111111111111')
    await transport.processCheckout(CHECKOUT_ID, {
      customer_id: 'vk11111111111141118111111111111111',
      payment_type: 'card',
      token: '6878cb7f-6515-47bf-bdd9-1408d270fdce',
    })
    expect(seen.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://api.sumup.com/v0.1/customers',
      'GET https://api.sumup.com/v0.1/checkouts?checkout_reference=rn-ref',
      'GET https://api.sumup.com/v0.1/customers/vk11111111111141118111111111111111/payment-instruments',
      `PUT https://api.sumup.com/v0.1/checkouts/${CHECKOUT_ID}`,
    ])
    expect(seen[0].body).toEqual({ customer_id: 'vk11111111111141118111111111111111' })
    expect(seen[3].body).toEqual({
      customer_id: 'vk11111111111141118111111111111111',
      payment_type: 'card',
      token: '6878cb7f-6515-47bf-bdd9-1408d270fdce',
    })
    expect(JSON.stringify(seen[3].body)).not.toMatch(/4111111111111111|"cvv"|card_number/)
    const denied = createSumUpHttpTransport({
      apiKey: 'test-only-key',
      async fetchImpl() {
        return { ok: false, status: 409, async json() { return { message: 'hidden' } } }
      },
    })
    await expect(denied.createCheckout({ amount: 4 })).rejects.toMatchObject({ code: 'SUMUP_REFERENCE_EXISTS' })
  })
})

function ports(db) {
  return {
    bindCheckoutRef: (input) => db.bindCheckoutRef(input),
    cancelIntent: (checkoutId) => db.cancelIntent(checkoutId),
    createIntent: (input) => db.createIntent(input),
  }
}

function walk(dir, hits) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, hits)
      continue
    }
    if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue
    const text = readFileSync(full, 'utf8')
    if (/providers\/sumup|SUMUP_API_KEY|SUMUP_MERCHANT_CODE/.test(text)) hits.push(entry.name)
  }
}

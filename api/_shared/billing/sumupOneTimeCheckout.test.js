import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryCheckoutActivation } from './checkoutActivation.js'
import { beginCheckout, setCheckoutAdapterForTests, setCheckoutSaleReaderForTests, setOneTimeCheckoutPortsForTests } from './checkoutIntent.js'
import { createProviderRegistry } from './paymentProviderContract.js'
import { createSumUpCheckoutAdapter } from './providers/sumup.js'
import { handleWebhookRequest } from './providerWebhookIngress.js'
import {
  activateVerifiedOneTimeCheckout,
  createOneTimeIntentReader,
  hostedCheckoutUrls,
  ONE_TIME_ACTIVATION_RPC,
  ONE_TIME_READ_RPC,
  oneTimeCheckoutStatus,
} from './sumupOneTimeCheckout.js'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const SUMUP_ID = '4f3a9c0e-6b1d-4a77-9e20-0c5d8a7b6e11'
const TX_ID = '6b425463-3e1b-431d-83fa-1e51c2925e99'
const MERCHANT = 'MTEST01'
const PLAN = 'plan.prelim.sek.month.04'
const HOSTED = 'https://checkout.sumup.com/pay/abc123'
const DAY = 24 * 60 * 60 * 1000

function database() {
  return createInMemoryCheckoutActivation({
    plans: new Map([[PLAN, { active: true, enabledForSale: true }], ['plan.prelim.sek.month.07', { active: true, enabledForSale: true }]]),
  })
}

async function boundIntent(db, userId = USER) {
  const intent = await db.createIntent({ planId: PLAN, provider: 'sumup', userId })
  await db.bindCheckoutRef({ checkoutId: intent.checkoutId, provider: 'sumup', providerCheckoutRef: SUMUP_ID })
  return intent.checkoutId
}

function sumUpCheckout(reference, overrides = {}) {
  return {
    amount: 4,
    checkout_reference: reference,
    currency: 'SEK',
    id: SUMUP_ID,
    merchant_code: MERCHANT,
    status: 'PAID',
    transactions: [{ amount: 4, currency: 'SEK', id: TX_ID, status: 'SUCCESSFUL', timestamp: new Date().toISOString() }],
    ...overrides,
  }
}

function rpcFor(db) {
  const activations = []
  async function callRpc(name, args) {
    if (name === ONE_TIME_READ_RPC) {
      const intent = db.getIntent(args.p_checkout_id)
      return intent && {
        checkout_id: intent.checkoutId,
        expires_at: intent.expiresAt,
        plan_id: intent.planId,
        provider: intent.provider,
        provider_checkout_ref: intent.providerCheckoutRef,
        status: intent.status,
        user_id: intent.userId,
      }
    }
    if (name === ONE_TIME_ACTIVATION_RPC) {
      activations.push(args)
      const start = new Date(args.p_paid_at)
      const result = await db.activate({
        checkoutId: args.p_checkout_id,
        periodEnd: new Date(start.getTime() + 30 * DAY).toISOString(),
        periodStart: start.toISOString(),
        provider: args.p_provider,
        providerCheckoutRef: args.p_provider_checkout_ref,
        providerCustomerRef: args.p_provider_customer_ref,
        providerEventId: args.p_provider_event_id,
        providerSubscriptionRef: args.p_provider_subscription_ref,
      })
      return { access_granted: true, current_period_end: result.currentPeriodEnd, plan_id: result.planId, user_id: result.userId }
    }
    throw new Error(`unexpected ${name}`)
  }
  return { activations, callRpc }
}

function transportWith(state) {
  const calls = []
  return {
    calls,
    async createCheckout() {
      throw new Error('not used')
    },
    async retrieveCheckout(id) {
      calls.push(id)
      return state.checkout
    },
  }
}

function verifyArgs(db, transport, callRpc, extra = {}) {
  return {
    callRpc,
    merchantCode: MERCHANT,
    providerCheckoutRef: SUMUP_ID,
    readIntent: createOneTimeIntentReader(callRpc),
    transport,
    ...extra,
  }
}

function response() {
  return {
    body: null,
    code: 0,
    setHeader() {},
    status(code) { this.code = code; return this },
    json(body) { this.body = body; return this },
  }
}

beforeEach(() => {
  vi.stubEnv('BILLING_PUBLIC_BASE_URL', 'https://viktkollen-preview.example')
  vi.stubEnv('SUPABASE_URL', 'https://armtslzspuebmlysnooq.supabase.co')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://armtslzspuebmlysnooq.supabase.co')
})

afterEach(() => {
  setCheckoutAdapterForTests(null)
  setOneTimeCheckoutPortsForTests(null)
  setCheckoutSaleReaderForTests(null)
  vi.unstubAllEnvs()
})

describe('SumUp Hosted Checkout, engångsköp', () => {
  it('ger ingen tillgång för en obekräftad betalning, varken via webhook eller återkomst', async () => {
    const db = database()
    const reference = await boundIntent(db)
    const state = { checkout: sumUpCheckout(reference, { status: 'PENDING', transactions: [] }) }
    const transport = transportWith(state)
    const { activations, callRpc } = rpcFor(db)

    const viaReturn = await oneTimeCheckoutStatus({ checkoutId: reference, userId: USER, ...verifyArgs(db, transport, callRpc) })
    expect(viaReturn).toMatchObject({ accessGranted: false, state: 'pending' })

    const registry = createProviderRegistry()
    registry.register(createSumUpCheckoutAdapter({ merchantCode: MERCHANT, testOnly: true, transport }))
    const res = response()
    await handleWebhookRequest({ body: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: SUMUP_ID }), headers: {}, method: 'POST' }, res, { callRpc, registry })
    expect(res.code).toBe(202)
    expect(res.body).toMatchObject({ accessGranted: false, ok: false })

    expect(activations).toEqual([])
    expect(db.quotaPlan(USER)).toBe('plan.free')
    expect(db.getIntent(reference).status).toBe('pending')
  })

  it('webhook och återkomst kör samma aktivering, och upprepade anrop ger exakt en period på 30 dagar', async () => {
    const db = database()
    const reference = await boundIntent(db)
    const state = { checkout: sumUpCheckout(reference) }
    const transport = transportWith(state)
    const { activations, callRpc } = rpcFor(db)
    const registry = createProviderRegistry()
    registry.register(createSumUpCheckoutAdapter({ merchantCode: MERCHANT, testOnly: true, transport }))

    const results = await Promise.all([
      oneTimeCheckoutStatus({ checkoutId: reference, userId: USER, ...verifyArgs(db, transport, callRpc) }),
      (async () => {
        const res = response()
        await handleWebhookRequest({ body: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: SUMUP_ID }), headers: {}, method: 'POST' }, res, { callRpc, registry })
        return res
      })(),
      oneTimeCheckoutStatus({ checkoutId: reference, userId: USER, ...verifyArgs(db, transport, callRpc) }),
    ])
    expect(results[0]).toMatchObject({ accessGranted: true, state: 'paid' })
    expect(results[1].code).toBe(200)
    expect(results[1].body).toMatchObject({ accessGranted: true, ok: true })
    expect(results[2]).toMatchObject({ accessGranted: true, state: 'paid' })

    // Same verified arguments from both entry points.
    expect(new Set(activations.map((args) => JSON.stringify(args))).size).toBe(1)
    expect(activations[0]).toMatchObject({
      p_checkout_id: reference,
      p_provider: 'sumup',
      p_provider_checkout_ref: SUMUP_ID,
      p_provider_customer_ref: `vk${USER.replace(/-/g, '')}`,
      p_provider_event_id: `paid:${SUMUP_ID}`,
      p_provider_subscription_ref: TX_ID,
    })
    expect(Object.keys(activations[0])).not.toContain('p_period_end')
    expect(db.getIntent(reference).status).toBe('consumed')
    expect(db.quotaPlan(USER)).toBe(PLAN)
    expect(db.subscriptionCount(USER)).toBe(1)
    const periodEnd = new Date(results[0].currentPeriodEnd).getTime()
    expect(periodEnd - new Date(state.checkout.transactions[0].timestamp).getTime()).toBe(30 * DAY)

    const again = await oneTimeCheckoutStatus({ checkoutId: reference, userId: USER, ...verifyArgs(db, transport, callRpc) })
    expect(again).toMatchObject({ accessGranted: true, state: 'paid' })
    expect(db.subscriptionCount(USER)).toBe(1)
  })

  it('avvisar fel belopp, valuta, mottagarkonto, kund, köp och dubbla transaktioner utan att aktivera', async () => {
    const cases = [
      ['AMOUNT_MISMATCH', { amount: 5 }],
      ['CURRENCY_MISMATCH', { currency: 'EUR' }],
      ['MERCHANT_MISMATCH', { merchant_code: 'MOTHER1' }],
      ['CUSTOMER_MISMATCH', { customer_id: `vk${OTHER.replace(/-/g, '')}` }],
      ['CHECKOUT_INTENT_MISSING', { checkout_reference: 'chk_unknown' }],
      ['WRONG_CHECKOUT_REF', { id: '99999999-9999-4999-8999-999999999999' }],
      ['PURPOSE_MISMATCH', { purpose: 'SETUP_RECURRING_PAYMENT' }],
      ['PAYMENT_BINDING_UNAVAILABLE', { transactions: [
        { amount: 4, currency: 'SEK', id: TX_ID, status: 'SUCCESSFUL', timestamp: new Date().toISOString() },
        { amount: 4, currency: 'SEK', id: '11111111-2222-4333-8444-555555555555', status: 'SUCCESSFUL', timestamp: new Date().toISOString() },
      ] }],
      ['AMOUNT_MISMATCH', { transactions: [{ amount: 1, currency: 'SEK', id: TX_ID, status: 'SUCCESSFUL', timestamp: new Date().toISOString() }] }],
      ['PAYMENT_FAILED', { status: 'FAILED' }],
      ['PAYMENT_EXPIRED', { status: 'EXPIRED' }],
    ]
    for (const [code, overrides] of cases) {
      const db = database()
      const reference = await boundIntent(db)
      const transport = transportWith({ checkout: sumUpCheckout(reference, overrides) })
      const { activations, callRpc } = rpcFor(db)
      const result = await activateVerifiedOneTimeCheckout(verifyArgs(db, transport, callRpc))
      expect(result, code).toMatchObject({ accessGranted: false, code })
      expect(activations, code).toEqual([])
      expect(db.quotaPlan(USER), code).toBe('plan.free')
    }
  })

  it('låter inte en annan användare se eller aktivera köpet via återkomsten', async () => {
    const db = database()
    const reference = await boundIntent(db)
    const transport = transportWith({ checkout: sumUpCheckout(reference) })
    const { activations, callRpc } = rpcFor(db)
    const result = await oneTimeCheckoutStatus({ checkoutId: reference, userId: OTHER, ...verifyArgs(db, transport, callRpc) })
    expect(result).toMatchObject({ accessGranted: false, code: 'NOT_FOUND' })
    expect(transport.calls).toEqual([])
    expect(activations).toEqual([])
  })

  it('ger ingen tillgång om databasen inte kan aktivera en betald checkout', async () => {
    const db = database()
    const reference = await boundIntent(db)
    const transport = transportWith({ checkout: sumUpCheckout(reference) })
    const callRpc = async (name, args) => {
      if (name === ONE_TIME_READ_RPC) return (await rpcFor(db).callRpc(name, args))
      const error = new Error('checkout_intent_expired')
      error.code = 'checkout_intent_expired'
      throw error
    }
    const result = await activateVerifiedOneTimeCheckout(verifyArgs(db, transport, callRpc))
    expect(result).toMatchObject({ accessGranted: false, code: 'checkout_intent_expired', state: 'review' })
  })

  it('visar ett obetalt köp som avbrutet när det har gått ut', async () => {
    const db = database()
    const reference = await boundIntent(db)
    const transport = transportWith({ checkout: sumUpCheckout(reference, { status: 'PENDING', transactions: [] }) })
    const { callRpc } = rpcFor(db)
    const readIntent = async (id) => ({ ...(await createOneTimeIntentReader(callRpc)(id)), expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() })
    const result = await oneTimeCheckoutStatus({ checkoutId: reference, userId: USER, ...verifyArgs(db, transport, callRpc), readIntent })
    expect(result).toMatchObject({ accessGranted: false, state: 'cancelled' })
  })
})

describe('start av engångsköp', () => {
  function setup({ open, createCheckout, merchant } = {}) {
    const calls = { bind: [], cancel: [], create: [], list: 0, merchant: 0 }
    setCheckoutSaleReaderForTests(() => ({ active: true, enabledForSale: true, known: true }))
    setCheckoutAdapterForTests(createSumUpCheckoutAdapter({
      merchantCode: MERCHANT,
      testOnly: true,
      transport: {
        async retrieveMerchant(code) {
          calls.merchant += 1
          if (merchant instanceof Error) throw merchant
          return merchant || { merchant_code: code, sandbox: true }
        },
        async createCheckout(body) {
          calls.create.push(body)
          if (createCheckout) return createCheckout(body)
          return { amount: body.amount, checkout_reference: body.checkout_reference, currency: 'SEK', hosted_checkout_url: HOSTED, id: SUMUP_ID, merchant_code: MERCHANT, status: 'PENDING' }
        },
        async listCheckouts(reference) {
          calls.list += 1
          return [{ id: SUMUP_ID, checkout_reference: reference }]
        },
        async retrieveCheckout() {
          return { amount: 4, checkout_reference: 'chk_new', currency: 'SEK', hosted_checkout_url: HOSTED, id: SUMUP_ID, merchant_code: MERCHANT, status: 'PENDING' }
        },
      },
    }))
    setOneTimeCheckoutPortsForTests({
      async bind(input) { calls.bind.push(input) },
      async cancel(id) { calls.cancel.push(id) },
      open: open || (async () => ({ checkoutId: 'chk_new', expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), hostedUrl: '', planId: PLAN, providerCheckoutRef: '', reused: false })),
    })
    return calls
  }

  it('återanvänder en öppen checkout för samma plan utan att skapa en ny hos SumUp', async () => {
    const calls = setup({
      open: async () => ({ checkoutId: 'chk_open', expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(), hostedUrl: HOSTED, planId: PLAN, providerCheckoutRef: SUMUP_ID, reused: true }),
    })
    const result = await beginCheckout({ body: { plan_id: PLAN }, userId: USER })
    expect(result).toMatchObject({ accessGranted: false, checkoutId: 'chk_open', code: 'CHECKOUT_PENDING', hostedCheckoutUrl: HOSTED })
    expect(calls.create).toEqual([])
    expect(calls.bind).toEqual([])
  })

  it('nekar köp vid aktiv period eller när en annan betalning pågår', async () => {
    for (const [dbCode, code] of [['active_period_exists', 'ACTIVE_PERIOD_EXISTS'], ['checkout_in_progress', 'CHECKOUT_IN_PROGRESS']]) {
      const calls = setup({ open: async () => { const error = new Error(dbCode); error.code = dbCode; throw error } })
      const result = await beginCheckout({ body: { plan_id: PLAN }, userId: USER })
      expect(result).toMatchObject({ accessGranted: false, code, status: 409 })
      expect(calls.create).toEqual([])
    }
  })

  it('skickar webhook- och återkomstadress från serverns konfiguration och stänger köpet utan konfiguration', async () => {
    let calls = setup()
    const ok = await beginCheckout({ body: { plan_id: PLAN, redirect_url: 'https://evil.example' }, userId: USER })
    expect(ok).toMatchObject({ code: 'CHECKOUT_PENDING', hostedCheckoutUrl: HOSTED })
    expect(calls.create[0]).toMatchObject({
      redirect_url: 'https://viktkollen-preview.example/?vk_checkout=chk_new#installningar',
      return_url: 'https://viktkollen-preview.example/api/billing/webhook',
    })
    expect(calls.bind).toEqual([{ checkoutId: 'chk_new', hostedUrl: HOSTED, providerCheckoutRef: SUMUP_ID }])

    vi.stubEnv('BILLING_PUBLIC_BASE_URL', '')
    calls = setup()
    const closed = await beginCheckout({ body: { plan_id: PLAN }, userId: USER })
    expect(closed).toMatchObject({ accessGranted: false, code: 'PROVIDER_NOT_CONFIGURED' })
    expect(calls.create).toEqual([])
    expect(calls.cancel).toEqual(['chk_new'])
  })

  it('hämtar den redan skapade checkouten när SumUp svarar att referensen finns', async () => {
    const calls = setup({
      createCheckout: async () => { const error = new Error('exists'); error.code = 'SUMUP_REFERENCE_EXISTS'; throw error },
    })
    const result = await beginCheckout({ body: { plan_id: PLAN }, userId: USER })
    expect(result).toMatchObject({ code: 'CHECKOUT_PENDING', hostedCheckoutUrl: HOSTED })
    expect(calls.list).toBe(1)
    expect(calls.bind).toHaveLength(1)
  })

  it('översätter köpnyckeln från planlistan på servern', async () => {
    let opened = ''
    setup({ open: async ({ planId }) => { opened = planId; return { checkoutId: 'chk_new', expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), hostedUrl: '', planId, providerCheckoutRef: '', reused: false } } })
    await expect(beginCheckout({ body: { offer_key: 'sek-400' }, userId: USER })).resolves.toMatchObject({ code: 'CHECKOUT_PENDING' })
    expect(opened).toBe(PLAN)
    for (const offer of ['sek-401', 'sek-0', 'eur-400', 'plan.prelim.sek.month.04x']) {
      await expect(beginCheckout({ body: { offer_key: offer }, userId: USER }), offer).resolves.toMatchObject({ code: 'INVALID_PLAN' })
    }
  })

  it('godtar bara en https-ursprungsadress som bas', () => {
    expect(hostedCheckoutUrls('chk_1', { BILLING_PUBLIC_BASE_URL: 'https://app.example' })).toMatchObject({ returnUrl: 'https://app.example/api/billing/webhook' })
    for (const value of [
      'http://app.example',
      'https://app.example/sub',
      'https://app.example?x=1',
      'https://u:p@app.example',
      'https://viktkollen-app.vercel.app',
      'https://viktkollen-app-appsonthego-s-projects.vercel.app',
      'https://viktkollen-app-git-main-appsonthego-s-projects.vercel.app',
      '',
      'nope',
    ]) {
      expect(hostedCheckoutUrls('chk_1', { BILLING_PUBLIC_BASE_URL: value }), value).toBeNull()
    }
  })

  it('skapar ingen checkout mot Production eller en handlare som inte är sandbox', async () => {
    const production = setup()
    const blocked = await beginCheckout({
      body: { plan_id: PLAN },
      env: {
        BILLING_PUBLIC_BASE_URL: 'https://viktkollen-preview.example',
        SUPABASE_URL: 'https://bxmdlckrlwzdtcxnsqqr.supabase.co',
        VITE_SUPABASE_URL: 'https://armtslzspuebmlysnooq.supabase.co',
      },
      userId: USER,
    })
    expect(blocked).toMatchObject({ accessGranted: false, code: 'STAGING_IDENTITY_REQUIRED', status: 503 })
    expect(production.create).toEqual([])
    expect(production.merchant).toBe(0)

    const live = setup({ merchant: { merchant_code: MERCHANT, sandbox: false } })
    const refused = await beginCheckout({ body: { plan_id: PLAN }, userId: USER })
    expect(refused).toMatchObject({ accessGranted: false, code: 'SANDBOX_IDENTITY_REQUIRED', status: 403 })
    expect(live.create).toEqual([])
    expect(live.cancel).toEqual([])
  })
})

describe('rutt för kundens återkomst', () => {
  it('når statuskontrollen via den publika sökvägen och den interna omskrivningen', async () => {
    const { resolveUserBillingPost } = await import('../../billing/user/index.js')
    expect(resolveUserBillingPost({ url: '/api/billing/checkout/status' })).toBe('checkout_status')
    expect(resolveUserBillingPost({ query: { __vk_route: 'checkout_status' }, url: '/api/billing/user?__vk_route=checkout_status' })).toBe('checkout_status')
    expect(resolveUserBillingPost({ url: '/api/billing/checkout' })).toBe('checkout')
  })
})

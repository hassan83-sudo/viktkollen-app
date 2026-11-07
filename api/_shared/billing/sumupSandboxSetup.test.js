import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createInMemoryCheckoutActivation } from './checkoutActivation.js'
import { createSumUpHttpTransport } from './providers/sumup.js'
import { activateVerifiedSumUpSetup } from './sumupInitialActivation.js'
import {
  createServerCheckoutIntentPorts,
  prepareSumUpSandboxSetup,
  SANDBOX_SETUP_PLAN_ID,
} from './sumupSandboxSetup.js'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { sumUpWidgetMountConfig } from '../../../src/services/billing/sumupWidgetMount.js'
import {
  LIVE_CHECKOUT_ENV,
  PRODUCTION_SUPABASE_REF,
  SUMUP_CONFIRMED_LIVE_MERCHANT_CODE,
} from './sumupOneTimeCheckout.js'

const USER = '11111111-1111-4111-8111-111111111111'
const CHECKOUT_ID = '7164c99b-13cb-42a1-8ba1-3c2c46a29de7'
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function checkoutBody(reference, amount = 12) {
  return {
    amount,
    checkout_reference: reference,
    currency: 'SEK',
    customer_id: 'vk11111111111141118111111111111111',
    description: 'Viktkollen',
    merchant_code: 'MTEST01',
    purpose: 'SETUP_RECURRING_PAYMENT',
  }
}

function checkoutRow(amount = 12, status = 'PENDING') {
  return {
    amount,
    checkout_reference: 'chk_placeholder',
    currency: 'SEK',
    customer_id: 'vk11111111111141118111111111111111',
    id: CHECKOUT_ID,
    merchant_code: 'MTEST01',
    purpose: 'SETUP_RECURRING_PAYMENT',
    status,
  }
}

function memoryPorts() {
  const db = createInMemoryCheckoutActivation({
    plans: new Map([[SANDBOX_SETUP_PLAN_ID, { active: true, enabledForSale: true }]]),
  })
  const created = []
  return {
    created,
    db,
    async bindCheckoutRef(input) {
      return db.bindCheckoutRef(input)
    },
    async cancelIntent(checkoutId) {
      return db.cancelIntent(checkoutId)
    },
    async createIntent(input) {
      const row = await db.createIntent(input)
      created.push(row.checkoutId)
      return row
    },
  }
}

function transportFor({ amount = 12, merchant = {}, sandbox = true, status = 'PENDING' } = {}) {
  const calls = []
  let merchantCode = 'MTEST01'
  let reference = ''
  return {
    calls,
    async createCheckout(body) {
      calls.push(['createCheckout', body])
      merchantCode = body.merchant_code
      reference = body.checkout_reference
      return { ...checkoutRow(amount, status), checkout_reference: reference, merchant_code: merchantCode }
    },
    async createCustomer(body) {
      calls.push(['createCustomer', body])
      return { customer_id: body.customer_id }
    },
    async listCheckouts() {
      return []
    },
    async retrieveCheckout(id) {
      calls.push(['retrieveCheckout', id])
      return { ...checkoutRow(amount, status), checkout_reference: reference, id, merchant_code: merchantCode }
    },
    async retrieveMerchant(code) {
      calls.push(['retrieveMerchant', code])
      return { merchant_code: code, sandbox, ...merchant }
    },
  }
}

function liveEnv() {
  const project = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`
  return {
    [LIVE_CHECKOUT_ENV]: 'true',
    SUMUP_API_KEY: 'test-only-key',
    SUMUP_MERCHANT_CODE: SUMUP_CONFIRMED_LIVE_MERCHANT_CODE,
    SUPABASE_URL: project,
    VITE_SUPABASE_URL: project,
  }
}

describe('SumUp sandbox 12 SEK setup', () => {
  const env = { SUMUP_API_KEY: 'test-only-key', SUMUP_MERCHANT_CODE: 'MTEST01' }

  it('serializes exactly 12 SEK from the catalog and ignores a client amount', async () => {
    const transport = transportFor()
    const ports = memoryPorts()
    const result = await prepareSumUpSandboxSetup({
      clientAmount: 11,
      clientCurrency: 'EUR',
      env,
      ports,
      transport,
      userId: USER,
    })
    const reference = ports.created[0]
    expect(result).toMatchObject({
      accessGranted: false,
      amount: 12,
      checkoutId: CHECKOUT_ID,
      currency: 'SEK',
      ok: true,
      purpose: 'SETUP_RECURRING_PAYMENT',
    })
    expect(transport.calls[0][0]).toBe('retrieveMerchant')
    expect(transport.calls.map((call) => call[0])).toEqual([
      'retrieveMerchant',
      'createCustomer',
      'createCheckout',
      'retrieveCheckout',
    ])
    const body = transport.calls[2][1]
    expect(body).toEqual(checkoutBody(reference))
    expect(body.checkout_reference.startsWith('chk_')).toBe(true)
    expect(body.checkout_reference.startsWith('sb')).toBe(false)
    expect(SANDBOX_SETUP_PLAN_ID).toBe('plan.prelim.sek.month.12')
    expect(getPlanById('plan.prelim.sek.month.04').price_minor).toBe(400)
    expect(getPlanById('plan.prelim.sek.month.09').price_minor).toBe(900)
    expect(getPlanById('plan.prelim.sek.month.12').price_minor).toBe(1200)
    expect(JSON.stringify(body)).toContain('"amount":12')
    expect(JSON.stringify(body)).not.toContain('"amount":400')
    expect(JSON.stringify(body)).not.toContain('"amount":0.04')
    expect(body.hosted_checkout).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('test-only-key')
  })

  it('binds the pending intent the setup webhook looks up', async () => {
    const transport = transportFor()
    const ports = memoryPorts()
    const rpcCalls = []
    const result = await prepareSumUpSandboxSetup({ env, ports, transport, userId: USER })
    const intent = ports.db.getIntent(ports.created[0])
    expect(result.ok).toBe(true)
    expect(transport.calls[2][1].checkout_reference).toBe(intent.checkoutId)
    expect(intent).toMatchObject({
      planId: SANDBOX_SETUP_PLAN_ID,
      provider: 'sumup',
      providerCheckoutRef: CHECKOUT_ID,
      status: 'pending',
      userId: USER,
    })
    const lookup = await activateVerifiedSumUpSetup({
      callRpc: async (...args) => {
        rpcCalls.push(args)
        return null
      },
      checkoutId: CHECKOUT_ID,
      intents: { get: (id) => ports.db.getIntent(id) },
      merchantCode: 'MTEST01',
      transport,
    })
    expect(lookup).toMatchObject({ accessGranted: false, code: 'PAYMENT_PENDING', ok: false })
    expect(rpcCalls).toEqual([])
    expect(intent.status).toBe('pending')
  })

  it('keeps a paid setup bound so a later webhook can activate it', async () => {
    const transport = transportFor({ status: 'PAID' })
    const ports = memoryPorts()
    const result = await prepareSumUpSandboxSetup({ env, ports, transport, userId: USER })
    expect(result).toMatchObject({ accessGranted: false, code: 'ALREADY_COMPLETED', ok: false })
    expect(result.checkoutId).toBeUndefined()
    expect(ports.db.getIntent(ports.created[0])).toMatchObject({
      provider: 'sumup',
      providerCheckoutRef: CHECKOUT_ID,
      status: 'pending',
      userId: USER,
    })
  })

  it('does not create a checkout unless the merchant is a sandbox', async () => {
    const transport = transportFor({ sandbox: false })
    const ports = memoryPorts()
    const result = await prepareSumUpSandboxSetup({ env, ports, transport, userId: USER })
    expect(result).toMatchObject({ accessGranted: false, code: 'SANDBOX_IDENTITY_REQUIRED', ok: false })
    expect(transport.calls.map((call) => call[0])).toEqual(['retrieveMerchant'])
    expect(ports.created).toEqual([])
  })

  it('does not call SumUp when credentials are absent', async () => {
    const transport = transportFor()
    const result = await prepareSumUpSandboxSetup({ env: {}, transport, userId: USER })
    expect(result.code).toBe('SANDBOX_NOT_CONFIGURED')
    expect(transport.calls).toEqual([])
  })

  it('does not call SumUp when the checkout intent store is unavailable', async () => {
    const transport = transportFor()
    const result = await prepareSumUpSandboxSetup({ env, transport, userId: USER })
    expect(result).toMatchObject({ accessGranted: false, code: 'DURABLE_UNAVAILABLE', ok: false })
    expect(transport.calls).toEqual([])
  })

  it('rejects a provider amount that is not 12 SEK and cancels the intent', async () => {
    const transport = transportFor({ amount: 400 })
    const ports = memoryPorts()
    const rpcCalls = []
    const result = await prepareSumUpSandboxSetup({ env, ports, transport, userId: USER })
    const intent = ports.db.getIntent(ports.created[0])
    expect(result).toMatchObject({ accessGranted: false, code: 'SUMUP_CHECKOUT_FAILED', ok: false })
    expect(result.checkoutId).toBeUndefined()
    expect(intent).toMatchObject({ providerCheckoutRef: '', status: 'cancelled' })
    const lookup = await activateVerifiedSumUpSetup({
      callRpc: async (...args) => {
        rpcCalls.push(args)
        return null
      },
      checkoutId: CHECKOUT_ID,
      intents: { get: (id) => ports.db.getIntent(id) },
      merchantCode: 'MTEST01',
      transport: {
        async retrieveCheckout() {
          return { ...checkoutRow(400), checkout_reference: intent.checkoutId, id: CHECKOUT_ID, status: 'PAID' }
        },
      },
    })
    expect(lookup.code).toBe('CHECKOUT_INTENT_CANCELLED')
    expect(rpcCalls).toEqual([])
  })

  it('cancels the intent when SumUp checkout creation fails', async () => {
    const transport = transportFor()
    const ports = memoryPorts()
    transport.createCheckout = async () => {
      const error = new Error('down')
      error.code = 'SUMUP_UNAVAILABLE'
      throw error
    }
    const result = await prepareSumUpSandboxSetup({ env, ports, transport, userId: USER })
    expect(result).toMatchObject({ accessGranted: false, code: 'SUMUP_CHECKOUT_FAILED', ok: false })
    expect(ports.db.getIntent(ports.created[0])).toMatchObject({
      providerCheckoutRef: '',
      status: 'cancelled',
    })
  })

  it('cancels the intent when provider binding fails', async () => {
    const transport = transportFor()
    const ports = memoryPorts()
    ports.bindCheckoutRef = async () => {
      throw new Error('bind failed')
    }
    const result = await prepareSumUpSandboxSetup({ env, ports, transport, userId: USER })
    expect(result).toMatchObject({ accessGranted: false, code: 'SUMUP_CHECKOUT_FAILED', ok: false })
    expect(ports.db.getIntent(ports.created[0])).toMatchObject({
      providerCheckoutRef: '',
      status: 'cancelled',
    })
  })

  it('mounts the Payment Widget with the checkout id only', () => {
    const config = sumUpWidgetMountConfig({ checkoutId: CHECKOUT_ID })
    expect(config).toEqual({
      checkoutId: CHECKOUT_ID,
      id: 'sumup-card',
      locale: 'sv-SE',
    })
    expect(sumUpWidgetMountConfig({ checkoutId: 'not-a-checkout' })).toBeNull()
    const widget = readFileSync(join(root, 'src/components/billing/SumUpSandboxWidget.jsx'), 'utf8')
    const mount = readFileSync(join(root, 'src/services/billing/sumupWidgetMount.js'), 'utf8')
    expect(`${widget}\n${mount}`).not.toMatch(/SUMUP_API_KEY|SUMUP_MERCHANT_CODE|card_number|cvv|pan\b/i)
    expect(mount).toContain('https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js')
    expect(widget).toContain('SUMUP_PAYMENT_WIDGET_SCRIPT')
  })

  it('opens a live setup only for a server-verified billing admin', async () => {
    const transport = transportFor({
      merchant: { default_currency: 'SEK' },
      sandbox: false,
    })
    const ports = memoryPorts()
    const result = await prepareSumUpSandboxSetup({
      billingAdmin: true,
      clientAmount: 4,
      env: liveEnv(),
      isBillingAdmin: async () => true,
      ports,
      transport,
      userId: USER,
    })
    const body = transport.calls.find((call) => call[0] === 'createCheckout')[1]
    expect(result).toMatchObject({
      accessGranted: false,
      amount: 12,
      checkoutId: CHECKOUT_ID,
      currency: 'SEK',
      ok: true,
      purpose: 'SETUP_RECURRING_PAYMENT',
    })
    expect(body).toMatchObject({
      amount: 12,
      currency: 'SEK',
      merchant_code: SUMUP_CONFIRMED_LIVE_MERCHANT_CODE,
      purpose: 'SETUP_RECURRING_PAYMENT',
    })
    expect(body.hosted_checkout).toBeUndefined()
    expect(body.token).toBeUndefined()
    expect(JSON.stringify(body)).not.toMatch(/card_number|cvv|pan\b/i)
    const webhook = readFileSync(join(root, 'api/_shared/billing/providerWebhookIngress.js'), 'utf8')
    const activation = readFileSync(join(root, 'api/_shared/billing/sumupInitialActivation.js'), 'utf8')
    expect(webhook).toContain('activateVerifiedSumUpSetup')
    expect(activation).toContain('p_instrument_fingerprint: fingerprint')
    expect(activation).not.toMatch(/p_payment_instrument_token|p_card_token/)
  })

  it('refuses live setup without the env flag, production merchant, or server admin', async () => {
    const admin = async () => true
    const flaggedOff = { ...liveEnv(), [LIVE_CHECKOUT_ENV]: 'false' }
    const withoutFlag = await prepareSumUpSandboxSetup({
      billingAdmin: true,
      env: flaggedOff,
      isBillingAdmin: admin,
      ports: memoryPorts(),
      transport: transportFor({ merchant: { default_currency: 'SEK' }, sandbox: false }),
      userId: USER,
    })
    expect(withoutFlag).toMatchObject({ code: 'SANDBOX_IDENTITY_REQUIRED', ok: false })
    expect(withoutFlag.checkoutId).toBeUndefined()

    const clientAdmin = await prepareSumUpSandboxSetup({
      billingAdmin: true,
      env: liveEnv(),
      ports: memoryPorts(),
      transport: transportFor({ merchant: { default_currency: 'SEK' }, sandbox: false }),
      userId: USER,
    })
    expect(clientAdmin).toMatchObject({ code: 'LIVE_ADMIN_REQUIRED', ok: false })

    const denied = await prepareSumUpSandboxSetup({
      env: liveEnv(),
      isBillingAdmin: async () => false,
      ports: memoryPorts(),
      transport: transportFor({ merchant: { default_currency: 'SEK' }, sandbox: false }),
      userId: USER,
    })
    expect(denied).toMatchObject({ code: 'LIVE_ADMIN_REQUIRED', ok: false })
    const route = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')
    expect(route).toContain('isBillingAdmin: lookupBillingAdmin')
    expect(route).toContain('void request.body?.billing_admin')
    expect(route).not.toMatch(/sumupRecurring|processDueRenewals/)
  })

  it('accepts the confirmed live merchant only when the account does not contradict it', async () => {
    const transport = transportFor({ merchant: { default_currency: 'SEK', sandbox: undefined }, sandbox: true })
    transport.retrieveMerchant = async (code) => {
      transport.calls.push(['retrieveMerchant', code])
      return { default_currency: 'SEK', merchant_code: code }
    }
    transport.retrieveCurrentMerchant = async () => {
      transport.calls.push(['retrieveCurrentMerchant'])
      return { merchant_code: 'MOTHER1', sandbox: true }
    }
    const refused = await prepareSumUpSandboxSetup({
      env: liveEnv(),
      isBillingAdmin: async () => true,
      ports: memoryPorts(),
      transport,
      userId: USER,
    })
    expect(refused).toMatchObject({ code: 'LIVE_IDENTITY_REQUIRED', ok: false })
    expect(transport.calls.map((call) => call[0])).toEqual(['retrieveMerchant', 'retrieveCurrentMerchant'])

    const accepted = transportFor({ sandbox: true })
    accepted.retrieveMerchant = async (code) => ({ default_currency: 'SEK', merchant_code: code })
    accepted.retrieveCurrentMerchant = async () => ({
      default_currency: 'SEK',
      merchant_code: SUMUP_CONFIRMED_LIVE_MERCHANT_CODE,
    })
    const ports = memoryPorts()
    const result = await prepareSumUpSandboxSetup({
      env: liveEnv(),
      isBillingAdmin: async () => true,
      ports,
      transport: accepted,
      userId: USER,
    })
    expect(result).toMatchObject({ amount: 12, ok: true, purpose: 'SETUP_RECURRING_PAYMENT' })
    expect(ports.created).toHaveLength(1)
  })
})

describe('merchant identity transport', () => {
  it('reads the merchant before any payment call', async () => {
    const seen = []
    const transport = createSumUpHttpTransport({
      apiKey: 'test-only-key',
      async fetchImpl(url, options) {
        seen.push({ method: options.method, url })
        return {
          ok: true,
          async json() {
            return { merchant_code: 'MTEST01', sandbox: true }
          },
        }
      },
    })
    const merchant = await transport.retrieveMerchant('MTEST01')
    expect(merchant.sandbox).toBe(true)
    expect(seen).toEqual([{ method: 'GET', url: 'https://api.sumup.com/v1/merchants/MTEST01' }])
    expect(JSON.stringify(seen)).not.toContain('test-only-key')
  })
})

describe('durable checkout intent ports', () => {
  it('does not create a SumUp checkout when the intent cannot be stored', async () => {
    const transport = transportFor()
    const ports = memoryPorts()
    ports.createIntent = async () => {
      throw new Error('invalid_checkout_intent')
    }
    const result = await prepareSumUpSandboxSetup({
      env: { SUMUP_API_KEY: 'test-only-key', SUMUP_MERCHANT_CODE: 'MTEST01' },
      ports,
      transport,
      userId: USER,
    })
    expect(result).toMatchObject({ accessGranted: false, code: 'SUMUP_CHECKOUT_FAILED', ok: false })
    expect(transport.calls.map((call) => call[0])).toEqual(['retrieveMerchant'])
    expect(ports.created).toEqual([])
  })

  it('calls the existing billing intent functions and hides provider errors', async () => {
    const calls = []
    const intentId = 'chk_11111111111141118111111111111111'
    const client = {
      schema(name) {
        return {
          async rpc(fn, args) {
            calls.push({ args, fn, schema: name })
            if (fn === 'create_checkout_intent') {
              return {
                data: {
                  checkout_id: intentId,
                  plan_id: args.p_plan_id,
                  provider: args.p_provider,
                  status: 'pending',
                  user_id: args.p_user_id,
                },
                error: null,
              }
            }
            if (fn === 'bind_provider_checkout_ref') {
              return {
                data: {
                  checkout_id: args.p_checkout_id,
                  provider: args.p_provider,
                  provider_checkout_ref: args.p_provider_checkout_ref,
                  status: 'pending',
                },
                error: null,
              }
            }
            return { data: { checkout_id: args.p_checkout_id, status: 'cancelled' }, error: null }
          },
        }
      },
    }
    const ports = createServerCheckoutIntentPorts({ client })
    const created = await ports.createIntent({
      planId: SANDBOX_SETUP_PLAN_ID,
      provider: 'sumup',
      userId: USER,
    })
    await ports.bindCheckoutRef({
      checkoutId: created.checkoutId,
      provider: 'sumup',
      providerCheckoutRef: CHECKOUT_ID,
    })
    await ports.cancelIntent(created.checkoutId)
    expect(created).toMatchObject({
      checkoutId: intentId,
      planId: SANDBOX_SETUP_PLAN_ID,
      status: 'pending',
      userId: USER,
    })
    expect(calls.map((call) => [call.schema, call.fn])).toEqual([
      ['billing', 'create_checkout_intent'],
      ['billing', 'bind_provider_checkout_ref'],
      ['billing', 'cancel_checkout_intent'],
    ])
    expect(calls[0].args.p_plan_id).toBe(SANDBOX_SETUP_PLAN_ID)
    expect(calls[0].args.p_provider).toBe('sumup')
    expect(calls[0].args.p_provider_price_ref).toBe('')
    expect(calls[0].args.p_user_id).toBe(USER)
    expect(new Date(calls[0].args.p_expires_at).getTime()).toBeGreaterThan(Date.now())
    expect(calls[1].args).toEqual({
      p_checkout_id: intentId,
      p_provider: 'sumup',
      p_provider_checkout_ref: CHECKOUT_ID,
    })
    expect(calls[2].args).toEqual({ p_checkout_id: intentId })
    expect(createServerCheckoutIntentPorts({ client: null })).toBeNull()
    const leaking = createServerCheckoutIntentPorts({
      client: {
        schema() {
          return {
            async rpc() {
              return { data: null, error: { message: 'secret-merchant-detail' } }
            },
          }
        },
      },
    })
    await expect(leaking.createIntent({
      planId: SANDBOX_SETUP_PLAN_ID,
      provider: 'sumup',
      userId: USER,
    })).rejects.toMatchObject({
      code: 'checkout_intent_failed',
      message: 'checkout_intent_failed',
    })
    const route = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')
    expect(route).toContain('createServerCheckoutIntentPorts()')
  })
})

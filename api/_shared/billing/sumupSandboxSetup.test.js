import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSumUpHttpTransport } from './providers/sumup.js'
import { prepareSumUpSandboxSetup } from './sumupSandboxSetup.js'
import { sumUpWidgetMountConfig } from '../../../src/services/billing/sumupWidgetMount.js'

const USER = '11111111-1111-4111-8111-111111111111'
const CHECKOUT_ID = '7164c99b-13cb-42a1-8ba1-3c2c46a29de7'
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function checkoutBody(amount = 4) {
  return {
    amount,
    checkout_reference: expect.any(String),
    currency: 'SEK',
    customer_id: 'vk11111111111141118111111111111111',
    description: 'Viktkollen',
    merchant_code: 'MTEST01',
    purpose: 'SETUP_RECURRING_PAYMENT',
  }
}

function checkoutRow(amount = 4) {
  return {
    amount,
    checkout_reference: 'sb-placeholder',
    currency: 'SEK',
    customer_id: 'vk11111111111141118111111111111111',
    id: CHECKOUT_ID,
    merchant_code: 'MTEST01',
    purpose: 'SETUP_RECURRING_PAYMENT',
    status: 'PENDING',
  }
}

function transportFor({ amount = 4, sandbox = true } = {}) {
  const calls = []
  let reference = ''
  return {
    calls,
    async createCheckout(body) {
      calls.push(['createCheckout', body])
      reference = body.checkout_reference
      return { ...checkoutRow(amount), checkout_reference: reference }
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
      return { ...checkoutRow(amount), checkout_reference: reference, id }
    },
    async retrieveMerchant(code) {
      calls.push(['retrieveMerchant', code])
      return { merchant_code: code, sandbox }
    },
  }
}

describe('SumUp sandbox 4 SEK setup', () => {
  const env = { SUMUP_API_KEY: 'test-only-key', SUMUP_MERCHANT_CODE: 'MTEST01' }

  it('serializes exactly 4 SEK from the catalog and ignores a client amount', async () => {
    const transport = transportFor()
    const result = await prepareSumUpSandboxSetup({
      clientAmount: 11,
      clientCurrency: 'EUR',
      env,
      transport,
      userId: USER,
    })
    expect(result).toMatchObject({
      accessGranted: false,
      amount: 4,
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
    expect(body).toEqual(checkoutBody())
    expect(JSON.stringify(body)).toContain('"amount":4')
    expect(JSON.stringify(body)).not.toContain('"amount":400')
    expect(JSON.stringify(body)).not.toContain('"amount":0.04')
    expect(body.hosted_checkout).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('test-only-key')
  })

  it('does not create a checkout unless the merchant is a sandbox', async () => {
    const transport = transportFor({ sandbox: false })
    const result = await prepareSumUpSandboxSetup({ env, transport, userId: USER })
    expect(result).toMatchObject({ accessGranted: false, code: 'SANDBOX_IDENTITY_REQUIRED', ok: false })
    expect(transport.calls.map((call) => call[0])).toEqual(['retrieveMerchant'])
  })

  it('does not call SumUp when credentials are absent', async () => {
    const transport = transportFor()
    const result = await prepareSumUpSandboxSetup({ env: {}, transport, userId: USER })
    expect(result.code).toBe('SANDBOX_NOT_CONFIGURED')
    expect(transport.calls).toEqual([])
  })

  it('rejects a provider amount that is not 4 SEK', async () => {
    const transport = transportFor({ amount: 400 })
    const result = await prepareSumUpSandboxSetup({ env, transport, userId: USER })
    expect(result).toMatchObject({ accessGranted: false, ok: false })
    expect(result.checkoutId).toBeUndefined()
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

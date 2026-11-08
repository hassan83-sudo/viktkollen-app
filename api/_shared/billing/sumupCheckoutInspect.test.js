import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { setBillingAdminServiceForTests } from './admin.js'
import { createBillingAdminService } from '../../../src/services/billing/adminService.js'
import { handleSumUpCheckoutInspect, inspectSumUpCheckout } from './sumupCheckoutInspect.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../supabaseServer.js'
import { setSupabaseAuthVerifierForTests } from '../verifySupabaseUser.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const ADMIN = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const INTENT = 'chk_3552adcebd09484eb0ff05629af65586'
const SUMUP_ID = '113c2e77-0c63-4ad6-9624-06dc28c2a3c3'
const TX = '50d13954-b8c7-4784-a7bf-4a5d27f435b6'
const TOKEN = '6878cb7f-6515-47bf-bdd9-1408d270fdce'
const ENV = { SUMUP_API_KEY: 'test-key', SUMUP_MERCHANT_CODE: 'MTEST01' }

function response() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) { this.body = body; return this },
    setHeader(name, value) { this.headers[name] = value; return this },
    status(code) { this.statusCode = code; return this },
  }
}

function request({ body, method = 'GET', query = {}, token = 'admin-token' } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query,
    url: '/api/billing/sumup-checkout-inspect',
  }
}

function paidCheckout({
  purpose = 'SETUP_RECURRING_PAYMENT',
  status = 'PAID',
  token = TOKEN,
  transactions = [{ id: TX, status: 'SUCCESSFUL' }],
} = {}) {
  return {
    amount: 12,
    checkout_reference: INTENT,
    currency: 'SEK',
    customer_id: 'vk11111111111141118111111111111111',
    id: SUMUP_ID,
    merchant_code: 'MTEST01',
    payment_instrument: token == null ? undefined : { token },
    purpose,
    status,
    transactions,
  }
}

afterEach(() => {
  setBillingAdminServiceForTests(null)
  setSupabaseAuthVerifierForTests(null)
  clearSupabaseAdminClientForTests()
})

describe('inspectSumUpCheckout', () => {
  it('reports exactly one successful transaction and a usable token without returning secrets', async () => {
    const calls = []
    const result = await inspectSumUpCheckout({
      checkoutId: INTENT,
      env: ENV,
      intents: {
        async get(id) {
          expect(id).toBe(INTENT)
          return {
            checkoutId: INTENT,
            expiresAt: '2026-11-08T03:26:06.220Z',
            planId: 'plan.prelim.sek.month.12',
            provider: 'sumup',
            providerCheckoutRef: SUMUP_ID,
            status: 'pending',
            userId: ADMIN,
          }
        },
      },
      now: () => new Date('2026-11-08T07:00:00.000Z'),
      transport: {
        async retrieveCheckout(id) {
          calls.push(id)
          return paidCheckout()
        },
      },
    })
    expect(calls).toEqual([SUMUP_ID])
    expect(result).toMatchObject({
      accessGranted: false,
      checkoutStatus: 'PAID',
      exactlyOneSuccessfulTransaction: true,
      intentExpired: true,
      intentStatus: 'pending',
      ok: true,
      paymentInstrumentTokenPresent: true,
      paymentInstrumentTokenShapeOk: true,
      purposeSetupRecurring: true,
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(JSON.stringify(result)).not.toContain('test-key')
    expect(result).not.toHaveProperty('token')
    expect(result).not.toHaveProperty('payment_instrument')
  })

  it('rejects a missing or malformed payment instrument token', async () => {
    const missing = await inspectSumUpCheckout({
      checkoutId: SUMUP_ID,
      env: ENV,
      transport: {
        async retrieveCheckout() {
          return paidCheckout({ token: null })
        },
      },
    })
    expect(missing).toMatchObject({
      exactlyOneSuccessfulTransaction: true,
      ok: true,
      paymentInstrumentTokenPresent: false,
      paymentInstrumentTokenShapeOk: false,
    })

    const short = await inspectSumUpCheckout({
      checkoutId: SUMUP_ID,
      env: ENV,
      transport: {
        async retrieveCheckout() {
          return paidCheckout({ token: 'short' })
        },
      },
    })
    expect(short).toMatchObject({
      paymentInstrumentTokenPresent: true,
      paymentInstrumentTokenShapeOk: false,
    })
  })

  it('requires exactly one SUCCESSFUL transaction', async () => {
    const none = await inspectSumUpCheckout({
      checkoutId: SUMUP_ID,
      env: ENV,
      transport: {
        async retrieveCheckout() {
          return paidCheckout({ transactions: [] })
        },
      },
    })
    expect(none.exactlyOneSuccessfulTransaction).toBe(false)

    const many = await inspectSumUpCheckout({
      checkoutId: SUMUP_ID,
      env: ENV,
      transport: {
        async retrieveCheckout() {
          return paidCheckout({
            transactions: [
              { id: TX, status: 'SUCCESSFUL' },
              { id: '7164c99b-13cb-42a1-8ba1-3c2c46a29de8', status: 'SUCCESSFUL' },
            ],
          })
        },
      },
    })
    expect(many.exactlyOneSuccessfulTransaction).toBe(false)
  })
})

describe('handleSumUpCheckoutInspect', () => {
  it('is limited to billing_admin and never activates', async () => {
    const service = createBillingAdminService()
    await service.bootstrapGrantForTests(ADMIN)
    setBillingAdminServiceForTests(service)
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'admin-token') return { user: { id: ADMIN } }
      if (token === 'user-token') return { user: { id: OTHER } }
      return { error: { message: 'invalid jwt' } }
    })
    setSupabaseAdminClientForTests({})

    const denied = response()
    await handleSumUpCheckoutInspect(request({ query: { checkout_id: INTENT }, token: 'user-token' }), denied, {
      env: ENV,
      inspect: async () => {
        throw new Error('inspect must not run for non-admin')
      },
    })
    expect(denied.statusCode).toBe(403)
    expect(denied.body.ok).toBe(false)

    const allowed = response()
    await handleSumUpCheckoutInspect(request({ query: { checkout_id: INTENT } }), allowed, {
      env: ENV,
      inspect: async () => ({
        accessGranted: false,
        checkoutStatus: 'PAID',
        exactlyOneSuccessfulTransaction: true,
        intentExpired: true,
        intentStatus: 'pending',
        ok: true,
        paymentInstrumentTokenPresent: true,
        paymentInstrumentTokenShapeOk: true,
        purposeSetupRecurring: true,
        status: 200,
      }),
    })
    expect(allowed.statusCode).toBe(200)
    expect(allowed.body).toMatchObject({
      accessGranted: false,
      checkoutStatus: 'PAID',
      exactlyOneSuccessfulTransaction: true,
      ok: true,
      paymentInstrumentTokenPresent: true,
      purposeSetupRecurring: true,
    })
    expect(JSON.stringify(allowed.body)).not.toMatch(/apiKey|card_number|SUMUP_API_KEY/i)
    expect(JSON.stringify(allowed.body)).not.toContain(TOKEN)

    const route = readFileSync(join(root, 'api/billing/admin/index.js'), 'utf8')
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8')
    expect(route).toContain('sumup_checkout_inspect')
    expect(route).toContain('handleSumUpCheckoutInspect')
    expect(vercel).toContain('/api/billing/sumup-checkout-inspect')
    expect(vercel).toContain('/api/billing/admin?__vk_route=sumup_checkout_inspect')
    expect(existsOnlyRewrite(vercel)).toBe(true)
  })
})

function existsOnlyRewrite(vercel) {
  const source = JSON.parse(vercel)
  const matches = source.rewrites.filter((row) => row.source.includes('sumup-checkout-inspect'))
  return matches.length === 2 && matches.every((row) => row.destination.includes('/api/billing/admin'))
}

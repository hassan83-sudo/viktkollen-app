import assert from 'node:assert/strict'
import test from 'node:test'
import { verifySumUpSandboxSetup } from '../api/_shared/billing/sumupSandboxSetup.js'

const userId = '12345678-1234-1234-1234-123456789abc'
const checkoutId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const merchantCode = 'SANDBOXMERCHANT'
const intent = {
  checkoutId: 'intent-123',
  userId,
  planId: 'plan.prelim.sek.month.04',
  provider: 'sumup',
  providerCheckoutRef: checkoutId,
  status: 'pending',
}
const checkout = {
  id: checkoutId,
  checkout_reference: intent.checkoutId,
  merchant_code: merchantCode,
  customer_id: 'vk12345678123412341234123456789abc',
  purpose: 'SETUP_RECURRING_PAYMENT',
  currency: 'SEK',
  amount: 4,
  status: 'PAID',
  payment_instrument: { token: 'sandbox-token-123' },
  transactions: [{ id: '11111111-2222-3333-4444-555555555555', status: 'SUCCESSFUL', currency: 'SEK', amount: 4 }],
}
function harness(overrides = {}) {
  let lookups = 0
  const ports = {
    async getOwnedIntentByProviderRef() { lookups++; return overrides.intent === undefined ? intent : overrides.intent },
  }
  const transport = {
    async retrieveMerchant() { return overrides.merchant || { sandbox: true, merchant_code: merchantCode } },
    async retrieveCheckout() { return overrides.checkout || checkout },
  }
  return {
    args: {
      checkoutId, userId, ports, transport,
      env: { SUMUP_API_KEY: 'sandbox-api-key', SUMUP_MERCHANT_CODE: merchantCode },
    },
    getLookups: () => lookups,
  }
}
test('sandbox verification rejects invalid checkout IDs before any database lookup', async () => {
  const h = harness()
  const result = await verifySumUpSandboxSetup({ ...h.args, checkoutId: 'not-a-uuid' })
  assert.equal(result.accessGranted, false)
  assert.equal(result.ok, false)
  assert.equal(h.getLookups(), 0)
})
test('sandbox verification rejects an intent belonging to another user', async () => {
  const h = harness({ intent: { ...intent, userId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'CHECKOUT_NOT_FOUND')
  assert.equal(result.accessGranted, false)
})
test('sandbox verification never grants access for a paid checkout', async () => {
  const h = harness()
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.accessGranted, false)
  assert.equal(result.ok, false)
})
test('sandbox verification rejects a production merchant', async () => {
  const h = harness({ merchant: { sandbox: false, merchant_code: merchantCode } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'SANDBOX_IDENTITY_REQUIRED')
})
test('sandbox verification rejects an incorrect amount', async () => {
  const h = harness({ checkout: { ...checkout, amount: 5 } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'CHECKOUT_MISMATCH')
})
test('sandbox verification does not activate pending payments', async () => {
  const h = harness({ checkout: { ...checkout, status: 'PENDING' } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.paymentStatus, 'pending')
  assert.equal(result.accessGranted, false)
})

test('sandbox verification refuses missing recurring instrument', async () => {
  const h = harness({ checkout: { ...checkout, payment_instrument: null } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'RECURRING_INSTRUMENT_MISSING')
  assert.equal(result.accessGranted, false)
})
test('sandbox verification rejects checkout bound to a different intent', async () => {
  const h = harness({ checkout: { ...checkout, checkout_reference: 'other-intent' } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'CHECKOUT_MISMATCH')
})
test('sandbox verification refuses already-consumed intents', async () => {
  const h = harness({ intent: { ...intent, status: 'consumed' } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'CHECKOUT_NOT_FOUND')
  assert.equal(result.accessGranted, false)
})
test('sandbox verification fails closed when SumUp cannot be reached', async () => {
  const h = harness()
  h.args.transport.retrieveCheckout = async () => { throw new Error('network unavailable') }
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'SUMUP_UNAVAILABLE')
  assert.equal(result.step, 'checkout-unreachable')
  assert.equal(result.accessGranted, false)
})

test('sandbox verification refuses PAID checkout without successful transaction', async () => {
  const h = harness({ checkout: { ...checkout, transactions: [] } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'PAYMENT_TRANSACTION_UNVERIFIED')
  assert.equal(result.accessGranted, false)
})
test('sandbox verification refuses mismatched successful transaction amount', async () => {
  const h = harness({ checkout: { ...checkout, transactions: [{ ...checkout.transactions[0], amount: 5 }] } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'PAYMENT_TRANSACTION_UNVERIFIED')
  assert.equal(result.accessGranted, false)
})
test('sandbox verification refuses multiple successful transactions', async () => {
  const h = harness({ checkout: { ...checkout, transactions: [checkout.transactions[0], { ...checkout.transactions[0], id: '99999999-8888-7777-6666-555555555555' }] } })
  const result = await verifySumUpSandboxSetup(h.args)
  assert.equal(result.code, 'PAYMENT_TRANSACTION_UNVERIFIED')
  assert.equal(result.accessGranted, false)
})

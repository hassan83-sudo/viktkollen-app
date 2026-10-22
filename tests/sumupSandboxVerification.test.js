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

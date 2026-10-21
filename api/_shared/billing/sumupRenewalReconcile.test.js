import { describe, expect, it } from 'vitest'
import { verifySumUpRenewalCheckout } from './sumupRenewalReconcile.js'

const base = {
  checkout: {
    checkout_reference: 'rn123',
    customer_id: 'vk123',
    merchant_code: 'MERCHANT',
    currency: 'SEK',
    amount: 19,
    status: 'PAID',
  },
  checkoutReference: 'rn123',
  customerId: 'vk123',
  merchantCode: 'MERCHANT',
  amountMinor: 1900,
}

describe('SumUp renewal reconciliation', () => {
  it('recognizes verified paid checkouts', () => {
    expect(verifySumUpRenewalCheckout(base)).toEqual({ verified: true, outcome: 'paid' })
  })
  it('does not accept a mismatched reference or customer', () => {
    expect(verifySumUpRenewalCheckout({ ...base, checkoutReference: 'wrong' }).verified).toBe(false)
    expect(verifySumUpRenewalCheckout({ ...base, customerId: 'other' }).verified).toBe(false)
  })
  it('rejects amount and currency mismatches', () => {
    expect(verifySumUpRenewalCheckout({ ...base, amountMinor: 2000 }).verified).toBe(false)
    expect(verifySumUpRenewalCheckout({ ...base, checkout: { ...base.checkout, currency: 'EUR' } }).verified).toBe(false)
  })
  it('preserves failed and pending outcomes', () => {
    expect(verifySumUpRenewalCheckout({ ...base, checkout: { ...base.checkout, status: 'FAILED' } }).outcome).toBe('failed')
    expect(verifySumUpRenewalCheckout({ ...base, checkout: { ...base.checkout, status: 'PENDING' } }).outcome).toBe('pending')
  })
})

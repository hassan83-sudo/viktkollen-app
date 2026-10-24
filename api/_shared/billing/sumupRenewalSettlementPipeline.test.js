import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalSettlementPipeline } from './sumupRenewalSettlementPipeline.js'

const checkoutId = '123e4567-e89b-12d3-a456-426614174001'
const args = {
  providerCheckoutId: checkoutId,
  checkoutReference: 'rn123', subscriptionId: 'sub-1',
  periodEnd: '2026-10-01T00:00:00Z',
  nextPeriodEnd: '2026-11-01T00:00:00Z',
}
const checkout = {
  id: checkoutId, checkout_reference: args.checkoutReference,
  customer_id: 'vk123', merchant_code: 'MERCHANT',
  amount: 19, currency: 'SEK', status: 'PAID',
  transactions: [{
    id: '123e4567-e89b-12d3-a456-426614174000',
    status: 'SUCCESSFUL', amount: 19, currency: 'SEK',
  }],
}
const record = {
  subscription_id: args.subscriptionId, period_end: args.periodEnd,
  checkout_reference: args.checkoutReference, provider_checkout_ref: checkoutId,
  next_period_end: args.nextPeriodEnd,
  provider: 'sumup', status: 'ACTIVE', customer_id: 'vk123',
  amount_minor: 1900, currency: 'SEK',
}
describe('SumUp settlement pipeline', () => {
  it('requires a restricted reader and writer', () => {
    expect(() => createSumUpRenewalSettlementPipeline()).toThrow('SUMUP_SQL_READER_UNAVAILABLE')
    expect(() => createSumUpRenewalSettlementPipeline({
      executeReadOnly: vi.fn().mockResolvedValue([record]),
      transport: { retrieveCheckout: vi.fn().mockResolvedValue(checkout) },
      merchantCode: 'MERCHANT',
    })).toThrow('SUMUP_SETTLEMENT_NOT_CONFIGURED')
  })
  it('reads trusted SQL facts, verifies SumUp, then commits', async () => {
    const executeReadOnly = vi.fn().mockResolvedValue([record])
    const retrieveCheckout = vi.fn().mockResolvedValue(checkout)
    const commit = vi.fn().mockResolvedValue({ committed: true, alreadyCommitted: false })
    const pipeline = createSumUpRenewalSettlementPipeline({
      executeReadOnly, transport: { retrieveCheckout },
      restrictedWriter: { commit }, merchantCode: 'MERCHANT',
    })
    await expect(pipeline.reconcile({ ...args, customerId: 'forged', amountMinor: 1 }))
      .resolves.toEqual({ committed: true, outcome: 'paid', alreadyCommitted: false })
    expect(executeReadOnly).toHaveBeenCalledTimes(1)
    expect(retrieveCheckout).toHaveBeenCalledWith(checkoutId)
    expect(commit).toHaveBeenCalledWith({
      checkoutReference: args.checkoutReference, subscriptionId: args.subscriptionId,
      periodEnd: args.periodEnd, providerCheckoutRef: checkoutId,
      nextPeriodEnd: args.nextPeriodEnd,
    })
  })
  it('never commits an unverified checkout', async () => {
    const commit = vi.fn()
    const pipeline = createSumUpRenewalSettlementPipeline({
      executeReadOnly: vi.fn().mockResolvedValue([record]),
      transport: { retrieveCheckout: vi.fn().mockResolvedValue({ ...checkout, status: 'PENDING' }) },
      restrictedWriter: { commit }, merchantCode: 'MERCHANT',
    })
    await expect(pipeline.reconcile(args)).rejects.toThrow('SUMUP_PAYMENT_NOT_VERIFIED')
    expect(commit).not.toHaveBeenCalled()
  })
})

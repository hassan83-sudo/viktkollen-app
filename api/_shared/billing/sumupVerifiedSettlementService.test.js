import { describe, expect, it, vi } from 'vitest'
import { createSumUpVerifiedSettlementService } from './sumupVerifiedSettlementService.js'

const checkout = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  checkout_reference: 'rn123',
  customer_id: 'vk123',
  merchant_code: 'MERCHANT',
  currency: 'SEK',
  amount: 19,
  status: 'PAID',
  transactions: [{
    id: '123e4567-e89b-12d3-a456-426614174000',
    status: 'SUCCESSFUL',
    currency: 'SEK',
    amount: 19,
  }],
}
const args = {
  checkoutReference: 'rn123',
  subscriptionId: 'sub-1',
  periodEnd: '2026-10-01T00:00:00Z',
  providerCheckoutRef: checkout.id,
  nextPeriodEnd: '2026-11-01T00:00:00Z',
  customerId: 'vk123',
  amountMinor: 1900,
}
function make(overrides = {}) {
  const retrieveCheckout = vi.fn().mockResolvedValue({ ...checkout, ...overrides })
  const commit = vi.fn().mockResolvedValue({ committed: true, alreadyCommitted: false })
  return {
    retrieveCheckout, commit,
    service: createSumUpVerifiedSettlementService({
      transport: { retrieveCheckout }, restrictedWriter: { commit }, merchantCode: 'MERCHANT',
    }),
  }
}
describe('SumUp verified settlement service', () => {
  it('requires restricted writer and transport', () => {
    expect(() => createSumUpVerifiedSettlementService()).toThrow('SUMUP_SETTLEMENT_NOT_CONFIGURED')
  })
  it('retrieves SumUp and commits only verified paid transactions', async () => {
    const { service, retrieveCheckout, commit } = make()
    await expect(service.verifyAndCommit(args)).resolves.toEqual({ committed: true, alreadyCommitted: false })
    expect(retrieveCheckout).toHaveBeenCalledWith(checkout.id)
    expect(commit).toHaveBeenCalledTimes(1)
  })
  it.each([
    { status: 'PENDING' },
    { amount: 29 },
    { customer_id: 'other' },
    { merchant_code: 'other' },
    { transactions: [] },
  ])('never writes for invalid or unpaid checkouts: %j', async (override) => {
    const { service, commit } = make(override)
    await expect(service.verifyAndCommit(args)).rejects.toThrow('SUMUP_PAYMENT_NOT_VERIFIED')
    expect(commit).not.toHaveBeenCalled()
  })
  it('does not write if SumUp is unavailable', async () => {
    const { service, retrieveCheckout, commit } = make()
    retrieveCheckout.mockRejectedValue(new Error('timeout'))
    await expect(service.verifyAndCommit(args)).rejects.toThrow('timeout')
    expect(commit).not.toHaveBeenCalled()
  })
})

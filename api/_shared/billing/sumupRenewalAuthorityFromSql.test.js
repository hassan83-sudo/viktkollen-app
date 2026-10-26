import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalAuthorityFromSql } from './sumupRenewalAuthorityFromSql.js'

const request = {
  subscriptionId: 'sub-1', periodEnd: '2026-10-01T00:00:00Z',
  checkoutReference: 'rn123', providerCheckoutRef: 'checkout-1',
  nextPeriodEnd: '2026-11-01T00:00:00Z',
}
const row = {
  subscription_id: request.subscriptionId, period_end: request.periodEnd,
  checkout_reference: request.checkoutReference,
  provider_checkout_ref: request.providerCheckoutRef,
  next_period_end: request.nextPeriodEnd,
  provider: 'sumup', status: 'ACTIVE',
  customer_id: 'vk123', amount_minor: 1900, currency: 'SEK',
}
describe('SumUp renewal SQL authority integration', () => {
  it('fails closed without a restricted SQL executor', () => {
    expect(() => createSumUpRenewalAuthorityFromSql()).toThrow('SUMUP_SQL_READER_UNAVAILABLE')
  })
  it('verifies trusted facts through the entire read chain', async () => {
    const executeReadOnly = vi.fn().mockResolvedValue([row])
    const authority = createSumUpRenewalAuthorityFromSql({ executeReadOnly })
    await expect(authority.getExpectedRenewal(request)).resolves.toMatchObject({
      ...request, customerId: 'vk123', amountMinor: 1900,
    })
    expect(executeReadOnly).toHaveBeenCalledWith({
      subscriptionId: request.subscriptionId, periodEnd: request.periodEnd,
    })
  })
  it('uses database amount and rejects a forged checkout binding', async () => {
    const authority = createSumUpRenewalAuthorityFromSql({
      executeReadOnly: vi.fn().mockResolvedValue([{ ...row, amount_minor: 1 }]),
    })
    await expect(authority.getExpectedRenewal(request)).resolves.toMatchObject({ amountMinor: 1 })
    await expect(authority.getExpectedRenewal({ ...request, providerCheckoutRef: 'forged' }))
      .rejects.toThrow('SUMUP_RENEWAL_AUTHORITY_MISMATCH')
  })
})

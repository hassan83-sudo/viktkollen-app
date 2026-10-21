import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalAuthority } from './sumupRenewalAuthority.js'

const request = {
  checkoutReference: 'rn123', subscriptionId: 'sub-1',
  periodEnd: '2026-10-01T00:00:00Z',
  providerCheckoutRef: 'checkout-1',
  nextPeriodEnd: '2026-11-01T00:00:00Z',
}
const record = {
  ...request, provider: 'sumup', status: 'ACTIVE',
  customerId: 'vk123', amountMinor: 1900, currency: 'SEK',
}
describe('SumUp renewal authority', () => {
  it('requires a trusted record loader', () => {
    expect(() => createSumUpRenewalAuthority()).toThrow('SUMUP_RENEWAL_AUTHORITY_UNAVAILABLE')
  })
  it('returns expected facts from the trusted record', async () => {
    const loadRenewalRecord = vi.fn().mockResolvedValue(record)
    const authority = createSumUpRenewalAuthority({ loadRenewalRecord })
    await expect(authority.getExpectedRenewal(request)).resolves.toMatchObject({
      customerId: 'vk123', amountMinor: 1900,
    })
    expect(loadRenewalRecord).toHaveBeenCalledWith({
      subscriptionId: request.subscriptionId, periodEnd: request.periodEnd,
    })
  })
  it('accepts equivalent database timestamps for both period boundaries', async () => {
    const authority = createSumUpRenewalAuthority({
      loadRenewalRecord: vi.fn().mockResolvedValue({
        ...record, periodEnd: '2026-10-01T00:00:00.000Z',
        nextPeriodEnd: '2026-11-01T00:00:00.000Z',
      }),
    })
    await expect(authority.getExpectedRenewal(request)).resolves.toMatchObject({
      customerId: 'vk123', amountMinor: 1900,
    })
  })
  it.each([
    { provider: 'other' }, { status: 'CANCELED' },
    { amountMinor: 0 }, { customerId: '' },
    { currency: 'USD' }, { checkoutReference: 'different' },
    { providerCheckoutRef: 'different' },
    { periodEnd: 'invalid' }, { nextPeriodEnd: 'invalid' },
    { nextPeriodEnd: '2027-01-01T00:00:00Z' },
  ])('rejects untrusted renewal facts: %j', async override => {
    const authority = createSumUpRenewalAuthority({
      loadRenewalRecord: vi.fn().mockResolvedValue({ ...record, ...override }),
    })
    await expect(authority.getExpectedRenewal(request))
      .rejects.toThrow('SUMUP_RENEWAL_AUTHORITY_MISMATCH')
  })
})

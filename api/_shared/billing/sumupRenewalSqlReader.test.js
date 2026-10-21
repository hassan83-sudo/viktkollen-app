import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalSqlReader } from './sumupRenewalSqlReader.js'

const request = { subscriptionId: 'sub-1', periodEnd: '2026-10-01T00:00:00Z' }
describe('SumUp renewal SQL reader', () => {
  it('requires an injected server-side read-only executor', () => {
    expect(() => createSumUpRenewalSqlReader()).toThrow('SUMUP_SQL_READER_UNAVAILABLE')
  })
  it('maps SQL snake_case columns into trusted authority fields', async () => {
    const executeReadOnly = vi.fn().mockResolvedValue([{
      subscription_id: 'sub-1', period_end: request.periodEnd,
      provider: 'sumup', status: 'ACTIVE',
      checkout_reference: 'rn123', provider_checkout_ref: 'checkout-1',
      next_period_end: '2026-11-01T00:00:00Z',
      customer_id: 'vk123', amount_minor: 1900, currency: 'SEK',
    }])
    const query = createSumUpRenewalSqlReader({ executeReadOnly })
    await expect(query(request)).resolves.toEqual([{
      subscriptionId: 'sub-1', periodEnd: request.periodEnd,
      provider: 'sumup', status: 'ACTIVE',
      checkoutReference: 'rn123', providerCheckoutRef: 'checkout-1',
      nextPeriodEnd: '2026-11-01T00:00:00Z',
      customerId: 'vk123', amountMinor: 1900, currency: 'SEK',
    }])
    expect(executeReadOnly).toHaveBeenCalledWith(request)
  })
  it('fails closed on a malformed query response', async () => {
    const query = createSumUpRenewalSqlReader({
      executeReadOnly: vi.fn().mockResolvedValue(null),
    })
    await expect(query(request)).rejects.toThrow('INVALID_SUMUP_SQL_READER_RESULT')
  })
})

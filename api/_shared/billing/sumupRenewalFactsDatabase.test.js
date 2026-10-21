import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalFactsDatabase } from './sumupRenewalFactsDatabase.js'

const record = {
  subscriptionId: 'sub-1',
  periodEnd: '2026-10-01T00:00:00Z',
  provider: 'sumup', status: 'ACTIVE',
  checkoutReference: 'rn123',
  providerCheckoutRef: 'checkout-1',
  nextPeriodEnd: '2026-11-01T00:00:00Z',
  customerId: 'vk123', amountMinor: 1900, currency: 'SEK',
}
const request = { subscriptionId: record.subscriptionId, periodEnd: record.periodEnd }
describe('SumUp renewal facts database', () => {
  it('requires an explicit trusted query', () => {
    expect(() => createSumUpRenewalFactsDatabase()).toThrow('SUMUP_RENEWAL_FACTS_QUERY_UNAVAILABLE')
  })
  it('returns a single verified record', async () => {
    const query = vi.fn().mockResolvedValue([record])
    await expect(createSumUpRenewalFactsDatabase({ query }).readRenewalFacts(request))
      .resolves.toEqual(record)
    expect(query).toHaveBeenCalledWith(request)
  })
  it.each([[], [record, record], null])('rejects missing or duplicated records', async rows => {
    const db = createSumUpRenewalFactsDatabase({ query: vi.fn().mockResolvedValue(rows) })
    await expect(db.readRenewalFacts(request)).rejects.toThrow('SUMUP_RENEWAL_FACTS_NOT_UNIQUE')
  })
  it.each([{ amountMinor: 0 }, { currency: 'USD' }, { status: 'CANCELED' },
    { subscriptionId: 'other' }, { customerId: '' }])('rejects invalid records', async override => {
    const db = createSumUpRenewalFactsDatabase({
      query: vi.fn().mockResolvedValue([{ ...record, ...override }]),
    })
    await expect(db.readRenewalFacts(request)).rejects.toThrow('SUMUP_RENEWAL_FACTS_INVALID')
  })
})

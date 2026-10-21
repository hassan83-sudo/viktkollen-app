import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalRecordLoader } from './sumupRenewalRecordLoader.js'

const query = { subscriptionId: 'sub-1', periodEnd: '2026-10-01T00:00:00Z' }
describe('SumUp renewal record loader', () => {
  it('requires a server-side reader', () => {
    expect(() => createSumUpRenewalRecordLoader()).toThrow('SUMUP_RENEWAL_RECORD_READER_UNAVAILABLE')
  })
  it('reads only by subscription and period', async () => {
    const readRenewalFacts = vi.fn().mockResolvedValue({ ...query, amountMinor: 1900 })
    const load = createSumUpRenewalRecordLoader({ database: { readRenewalFacts } })
    await expect(load({ ...query, amountMinor: 1, customerId: 'forged' }))
      .resolves.toMatchObject({ amountMinor: 1900 })
    expect(readRenewalFacts).toHaveBeenCalledWith(query)
  })
  it('fails closed on a missing record', async () => {
    const load = createSumUpRenewalRecordLoader({
      database: { readRenewalFacts: vi.fn().mockResolvedValue(null) },
    })
    await expect(load(query)).rejects.toThrow('SUMUP_RENEWAL_RECORD_NOT_FOUND')
  })
  it('fails closed on mismatched records', async () => {
    const load = createSumUpRenewalRecordLoader({
      database: { readRenewalFacts: vi.fn().mockResolvedValue({ ...query, subscriptionId: 'other' }) },
    })
    await expect(load(query)).rejects.toThrow('SUMUP_RENEWAL_RECORD_NOT_FOUND')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalSqlWriter } from './sumupRenewalSqlWriter.js'

const input = {
  checkoutReference: 'rn123',
  subscriptionId: 'sub-1',
  periodEnd: '2026-10-01T00:00:00Z',
  providerCheckoutRef: 'checkout-123',
  nextPeriodEnd: '2026-11-01T00:00:00Z',
}

describe('SumUp renewal SQL writer', () => {
  it('requires a restricted execution capability', () => {
    expect(() => createSumUpRenewalSqlWriter()).toThrow('SUMUP_RENEWAL_SQL_WRITER_UNAVAILABLE')
  })

  it('uses a parameterized commit RPC and maps the result', async () => {
    const executeRestricted = vi.fn().mockResolvedValue({
      rows: [{ result: { committed: true, already_committed: false } }],
    })
    const writer = createSumUpRenewalSqlWriter({ executeRestricted })
    await expect(writer.commit(input)).resolves.toEqual({ committed: true, alreadyCommitted: false })
    expect(executeRestricted).toHaveBeenCalledWith({
      text: 'select billing.commit_verified_sumup_renewal($1, $2, $3::timestamptz, $4, $5::timestamptz) as result',
      values: [input.checkoutReference, input.subscriptionId, input.periodEnd, input.providerCheckoutRef, input.nextPeriodEnd],
    })
  })

  it.each([
    { periodEnd: 'bad' },
    { nextPeriodEnd: 'bad' },
    { nextPeriodEnd: '2026-09-01T00:00:00Z' },
    { providerCheckoutRef: '' },
  ])('rejects invalid settlement input before SQL: %j', async override => {
    const executeRestricted = vi.fn()
    const writer = createSumUpRenewalSqlWriter({ executeRestricted })
    await expect(writer.commit({ ...input, ...override })).rejects.toThrow('INVALID_RENEWAL_SETTLEMENT')
    expect(executeRestricted).not.toHaveBeenCalled()
  })

  it('fails closed on an unexpected database response', async () => {
    const writer = createSumUpRenewalSqlWriter({
      executeRestricted: vi.fn().mockResolvedValue({ rows: [{ result: {} }] }),
    })
    await expect(writer.commit(input)).rejects.toThrow('SUMUP_RENEWAL_SQL_WRITER_INVALID_RESPONSE')
  })
})

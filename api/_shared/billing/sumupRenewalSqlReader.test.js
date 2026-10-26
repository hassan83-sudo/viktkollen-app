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
      subscriptionId: 'sub-1', periodEnd: '2026-10-01T00:00:00.000Z',
      provider: 'sumup', status: 'ACTIVE',
      checkoutReference: 'rn123', providerCheckoutRef: 'checkout-1',
      nextPeriodEnd: '2026-11-01T00:00:00.000Z',
      customerId: 'vk123', amountMinor: 1900, currency: 'SEK',
    }])
    expect(executeReadOnly).toHaveBeenCalledWith(request)
  })
  it('normalizes PostgreSQL bigint and timezone timestamps', async () => {
    const query = createSumUpRenewalSqlReader({
      executeReadOnly: vi.fn().mockResolvedValue([{
        subscription_id: 'sub-1',
        period_end: new Date('2026-10-01T00:00:00Z'),
        next_period_end: '2026-11-01 01:00:00+01:00',
        provider: 'sumup', status: 'ACTIVE',
        checkout_reference: 'rn123', provider_checkout_ref: 'checkout-1',
        customer_id: 'vk123', amount_minor: '1900', currency: 'SEK',
      }]),
    })
    const [row] = await query(request)
    expect(row.periodEnd).toBe('2026-10-01T00:00:00.000Z')
    expect(row.nextPeriodEnd).toBe('2026-11-01T00:00:00.000Z')
    expect(row.amountMinor).toBe(1900)
  })
  it.each(['9007199254740992', '-1', '19.5', 'abc', null])(
    'rejects unsafe SQL amount %s', async amount => {
      const query = createSumUpRenewalSqlReader({
        executeReadOnly: vi.fn().mockResolvedValue([{
          subscription_id: 'sub-1', period_end: request.periodEnd,
          amount_minor: amount,
        }]),
      })
      const [row] = await query(request)
      expect(Number.isSafeInteger(row.amountMinor)).toBe(false)
    },
  )
  it('fails closed on a malformed query response', async () => {
    const query = createSumUpRenewalSqlReader({
      executeReadOnly: vi.fn().mockResolvedValue(null),
    })
    await expect(query(request)).rejects.toThrow('INVALID_SUMUP_SQL_READER_RESULT')
  })
})

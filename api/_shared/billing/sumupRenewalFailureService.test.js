import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalFailureService, SUMUP_RENEWAL_FAILURE_SQL } from './sumupRenewalFailureService.js'

const input = { checkoutReference: 'renewal1', subscriptionId: 'sub1', periodEnd: '2026-10-01T00:00:00.000Z',
  providerCheckoutId: 'checkout1', nextPeriodEnd: '2026-11-01T00:00:00.000Z' }
function setup(overrides = {}) {
  const checkout = { id: 'checkout1', checkout_reference: 'renewal1', status: 'FAILED', customer_id: 'customer1',
    merchant_code: 'MERCHANT1', amount: 19, currency: 'SEK', ...overrides }
  const transport = { retrieveCheckout: vi.fn(async () => checkout) }
  const renewalAuthority = { getExpectedRenewal: vi.fn(async () => ({ customerId: 'customer1', amountMinor: 1900 })) }
  const executor = { execute: vi.fn(async () => ({ rows: [{ result: { recorded: true, already_recorded: false } }] })) }
  return { checkout, transport, renewalAuthority, executor,
    service: createSumUpRenewalFailureService({ transport, renewalAuthority, executor, merchantCode: 'MERCHANT1' }) }
}

describe('verified SumUp renewal failure boundary', () => {
  it.each(['FAILED', 'EXPIRED'])('records only a re-fetched matching %s checkout', async status => {
    const f = setup({ status })
    expect(await f.service.recordFailed(input)).toEqual({ recorded: true, alreadyRecorded: false })
    expect(f.transport.retrieveCheckout).toHaveBeenCalledWith('checkout1')
    expect(f.executor.execute).toHaveBeenCalledWith({ text: SUMUP_RENEWAL_FAILURE_SQL,
      values: ['renewal1', 'sub1', input.periodEnd, 'checkout1'] })
  })
  it.each([
    { status: 'PAID' }, { status: 'PENDING' }, { status: 'UNKNOWN' },
    { id: 'wrong' }, { customer_id: 'wrong' }, { checkout_reference: 'wrong' },
    { amount: 20 }, { currency: 'EUR' }, { merchant_code: 'OTHER' },
    { transactions: [{ status: 'SUCCESSFUL' }] },
  ])('refuses unverified or contradictory checkout %j', async checkout => {
    const f = setup(checkout)
    await expect(f.service.recordFailed(input)).rejects.toThrow('SUMUP_RENEWAL_FAILURE_NOT_VERIFIED')
    expect(f.executor.execute).not.toHaveBeenCalled()
  })
  it('does not record when authoritative facts or provider are unavailable', async () => {
    const f = setup()
    f.renewalAuthority.getExpectedRenewal.mockRejectedValueOnce(new Error('unavailable'))
    await expect(f.service.recordFailed(input)).rejects.toThrow()
    expect(f.transport.retrieveCheckout).not.toHaveBeenCalled()
    f.transport.retrieveCheckout.mockRejectedValueOnce(new Error('timeout'))
    await expect(f.service.recordFailed(input)).rejects.toThrow()
    expect(f.executor.execute).not.toHaveBeenCalled()
  })
  it('rejects an unconfirmed database result', async () => {
    const f = setup()
    f.executor.execute.mockResolvedValue({ rows: [{ result: { recorded: false, already_recorded: false } }] })
    await expect(f.service.recordFailed(input)).rejects.toThrow('SUMUP_RENEWAL_FAILURE_NOT_RECORDED')
  })
})

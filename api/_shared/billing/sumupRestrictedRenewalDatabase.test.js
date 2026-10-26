import { describe, expect, it, vi } from 'vitest'
import { createSumUpRestrictedRenewalDatabase } from './sumupRestrictedRenewalDatabase.js'

describe('restricted renewal database composition', () => {
  it('requires an executor', () => {
    expect(() => createSumUpRestrictedRenewalDatabase()).toThrow('SUMUP_RENEWAL_DATABASE_EXECUTOR_UNAVAILABLE')
  })

  it('connects read authority and write adapter through the restricted executor', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        subscription_id: 'sub-1',
        period_end: '2026-10-01T00:00:00.000Z',
        provider: 'sumup',
        status: 'ACTIVE',
        checkout_reference: 'rn1',
        provider_checkout_ref: 'checkout1',
        next_period_end: '2026-11-01T00:00:00.000Z',
        customer_id: 'customer1',
        amount_minor: '1900',
        currency: 'SEK',
      }] })
      .mockResolvedValueOnce({ rows: [{ result: { committed: true, already_committed: false } }] })
    const { renewalAuthority, restrictedWriter } = createSumUpRestrictedRenewalDatabase({
      executor: { execute },
    })
    const expected = await renewalAuthority.getExpectedRenewal({
      checkoutReference: 'rn1',
      subscriptionId: 'sub-1',
      periodEnd: '2026-10-01T00:00:00.000Z',
      providerCheckoutRef: 'checkout1',
      nextPeriodEnd: '2026-11-01T00:00:00.000Z',
    })
    expect(expected).toMatchObject({ customerId: 'customer1', amountMinor: 1900, currency: 'SEK' })
    expect(execute.mock.calls[0][0].text).toContain('read_sumup_renewal_facts_draft')
    await expect(restrictedWriter.commit({
      checkoutReference: 'rn1', subscriptionId: 'sub-1',
      periodEnd: '2026-10-01T00:00:00.000Z', providerCheckoutRef: 'checkout1',
      nextPeriodEnd: '2026-11-01T00:00:00.000Z',
    })).resolves.toEqual({ committed: true, alreadyCommitted: false })
    expect(execute.mock.calls[1][0].text).toContain('commit_verified_sumup_renewal')
  })
})

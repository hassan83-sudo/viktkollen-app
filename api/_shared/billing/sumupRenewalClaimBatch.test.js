import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalClaimBatch } from './sumupRenewalClaimBatch.js'

const due = {
  subscription_id: 'sub-1',
  provider: 'sumup',
  status: 'ACTIVE',
  current_period_end: '2026-10-01T00:00:00.000Z',
}

describe('SumUp claim batch', () => {
  it('claims each due period once', async () => {
    const claim = vi.fn().mockResolvedValue({ claimed: true, status: 'processing' })
    const result = await createSumUpRenewalClaimBatch({ claimPort: { claim } }).claimDue({
      subscriptions: [due, { ...due }],
      now: '2026-10-21T00:00:00.000Z',
    })
    expect(claim).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ considered: 1, results: [{ claimed: true, status: 'processing' }] })
  })

  it('fails closed for a denied claim', async () => {
    const claim = vi.fn().mockResolvedValue({ claimed: false, status: 'processing' })
    const result = await createSumUpRenewalClaimBatch({ claimPort: { claim } }).claimDue({
      subscriptions: [due],
      now: '2026-10-21T00:00:00.000Z',
    })
    expect(result.results[0].claimed).toBe(false)
  })

  it('does not authorize charging after a database failure', async () => {
    const claim = vi.fn().mockRejectedValue(new Error('db offline'))
    const result = await createSumUpRenewalClaimBatch({ claimPort: { claim } }).claimDue({
      subscriptions: [due],
      now: '2026-10-21T00:00:00.000Z',
    })
    expect(result.results).toEqual([{ subscriptionId: 'sub-1', claimed: false, status: 'claim_error' }])
  })
})

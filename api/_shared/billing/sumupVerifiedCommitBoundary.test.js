import { describe, expect, it, vi } from 'vitest'
import { createVerifiedSumUpRenewalCommitBoundary } from './sumupVerifiedCommitBoundary.js'

const args = {
  checkoutReference: 'rn123',
  subscriptionId: 'sub-123',
  periodEnd: '2026-10-01T00:00:00Z',
  providerCheckoutRef: 'checkout-123',
  nextPeriodEnd: '2026-11-01T00:00:00Z',
}

describe('SumUp verified settlement boundary', () => {
  it('is disabled without a privileged settlement service', () => {
    expect(() => createVerifiedSumUpRenewalCommitBoundary()).toThrow('SUMUP_VERIFIED_SETTLEMENT_UNAVAILABLE')
    expect(() => createVerifiedSumUpRenewalCommitBoundary({
      settlementService: { verifyAndCommit: vi.fn() },
    })).toThrow('SUMUP_VERIFIED_SETTLEMENT_UNAVAILABLE')
  })
  it('rejects invalid settlement requests without calling the service', async () => {
    const verifyAndCommit = vi.fn()
    const boundary = createVerifiedSumUpRenewalCommitBoundary({
      settlementService: { kind: 'sumup-verified-settlement-v1', verifyAndCommit },
    })
    await expect(boundary.commitVerified({})).rejects.toThrow('INVALID_RENEWAL_SETTLEMENT')
    expect(verifyAndCommit).not.toHaveBeenCalled()
  })
  it('rejects malformed settlement responses', async () => {
    const boundary = createVerifiedSumUpRenewalCommitBoundary({
      settlementService: { kind: 'sumup-verified-settlement-v1', verifyAndCommit: vi.fn().mockResolvedValue({}) },
    })
    await expect(boundary.commitVerified(args)).rejects.toThrow('SUMUP_VERIFIED_SETTLEMENT_INVALID_RESPONSE')
  })
})

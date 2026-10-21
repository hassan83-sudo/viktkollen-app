import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalFinalizer } from './sumupRenewalFinalizer.js'

const args = {
  providerCheckoutId: '123e4567-e89b-12d3-a456-426614174001',
  checkoutReference: 'rn123',
  subscriptionId: 'sub-1',
  periodEnd: '2026-10-01T00:00:00Z',
  nextPeriodEnd: '2026-11-01T00:00:00Z',
}
describe('SumUp renewal finalizer', () => {
  it('requires the verified settlement port', () => {
    expect(() => createSumUpRenewalFinalizer()).toThrow('SUMUP_RENEWAL_FINALIZER_UNAVAILABLE')
  })
  it('delegates to the privileged verifier without trusting caller-supplied price', async () => {
    const commitVerified = vi.fn().mockResolvedValue({ committed: true, alreadyCommitted: false })
    const finalizer = createSumUpRenewalFinalizer({ verifiedCommitPort: { commitVerified } })
    await expect(finalizer.reconcile({ ...args, amountMinor: 1, customerId: 'attacker' }))
      .resolves.toEqual({ committed: true, outcome: 'paid', alreadyCommitted: false })
    expect(commitVerified).toHaveBeenCalledExactlyOnceWith({
      checkoutReference: args.checkoutReference,
      subscriptionId: args.subscriptionId,
      periodEnd: args.periodEnd,
      providerCheckoutRef: args.providerCheckoutId,
      nextPeriodEnd: args.nextPeriodEnd,
    })
  })
  it('fails closed on a rejected payment', async () => {
    const commitVerified = vi.fn().mockRejectedValue(new Error('SUMUP_PAYMENT_NOT_VERIFIED'))
    const finalizer = createSumUpRenewalFinalizer({ verifiedCommitPort: { commitVerified } })
    await expect(finalizer.reconcile(args)).rejects.toThrow('SUMUP_PAYMENT_NOT_VERIFIED')
  })
  it('fails closed on an invalid settlement result', async () => {
    const finalizer = createSumUpRenewalFinalizer({
      verifiedCommitPort: { commitVerified: vi.fn().mockResolvedValue(null) },
    })
    await expect(finalizer.reconcile(args)).rejects.toThrow('SUMUP_RENEWAL_COMMIT_FAILED')
  })
})

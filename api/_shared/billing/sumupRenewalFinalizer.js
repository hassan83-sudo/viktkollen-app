/**
 * Reconcile only. Never creates or processes a SumUp checkout.
 * Ambiguous outcomes stay pending; they must not trigger another charge.
 */
export function createSumUpRenewalFinalizer({ transport, verifiedCommitPort } = {}) {
  if (typeof transport?.retrieveCheckout !== 'function' || typeof verifiedCommitPort?.commitVerified !== 'function') {
    throw new Error('SUMUP_RENEWAL_FINALIZER_UNAVAILABLE')
  }
  return {
    async reconcile({ providerCheckoutId, checkoutReference, subscriptionId, periodEnd,
      nextPeriodEnd, customerId, merchantCode, amountMinor } = {}) {
      if (!providerCheckoutId || !checkoutReference || !subscriptionId || !periodEnd || !nextPeriodEnd) {
        throw new Error('INVALID_RENEWAL_RECONCILIATION')
      }
      // Only the privileged settlement service may verify payment facts.
      // It loads the expected customer and price from trusted subscription data.
      const data = await verifiedCommitPort.commitVerified({
        checkoutReference, subscriptionId, periodEnd,
        providerCheckoutRef: providerCheckoutId, nextPeriodEnd,
      })
      if (!data || typeof data.committed !== 'boolean' ||
          typeof data.alreadyCommitted !== 'boolean') {
        throw new Error('SUMUP_RENEWAL_COMMIT_FAILED')
      }
      return { committed: data.committed, outcome: 'paid', alreadyCommitted: data.alreadyCommitted }
    },
  }
}

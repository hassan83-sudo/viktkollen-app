import { verifySumUpRenewalCheckout } from './sumupRenewalReconcile.js'

/**
 * Reconcile only. Never creates or processes a SumUp checkout.
 * Ambiguous outcomes stay pending; they must not trigger another charge.
 */
export function createSumUpRenewalFinalizer({ transport, client } = {}) {
  if (typeof transport?.retrieveCheckout !== 'function' || typeof client?.schema !== 'function') {
    throw new Error('SUMUP_RENEWAL_FINALIZER_UNAVAILABLE')
  }
  return {
    async reconcile({ providerCheckoutId, checkoutReference, subscriptionId, periodEnd,
      nextPeriodEnd, customerId, merchantCode, amountMinor } = {}) {
      if (!providerCheckoutId || !subscriptionId || !periodEnd || !nextPeriodEnd) {
        throw new Error('INVALID_RENEWAL_RECONCILIATION')
      }
      let checkout
      try {
        checkout = await transport.retrieveCheckout(providerCheckoutId)
      } catch {
        return { committed: false, outcome: 'pending' }
      }
      if (checkout?.id !== providerCheckoutId) return { committed: false, outcome: 'mismatch' }
      const verified = verifySumUpRenewalCheckout({
        checkout, checkoutReference, customerId, merchantCode, amountMinor,
      })
      if (!verified.verified || verified.outcome !== 'paid') {
        return { committed: false, outcome: verified.outcome }
      }
      const { data, error } = await client.schema('billing').rpc('commit_verified_sumup_renewal', {
        p_checkout_reference: checkoutReference,
        p_subscription_id: subscriptionId,
        p_period_end: periodEnd,
        p_provider_checkout_ref: providerCheckoutId,
        p_next_period_end: nextPeriodEnd,
      })
      if (error || !data || typeof data.committed !== 'boolean' ||
          typeof data.already_committed !== 'boolean') {
        throw new Error('SUMUP_RENEWAL_COMMIT_FAILED')
      }
      return { committed: data.committed, outcome: 'paid', alreadyCommitted: data.already_committed }
    },
  }
}

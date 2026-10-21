import { verifySumUpRenewalCheckout } from './sumupRenewalReconcile.js'

/**
 * Server-only verifier. No checkout creation or charging.
 * The database writer must be an independently restricted capability,
 * NOT a general Supabase service_role client.
 */
export function createSumUpVerifiedSettlementService({
  transport, restrictedWriter, merchantCode,
} = {}) {
  if (typeof transport?.retrieveCheckout !== 'function' ||
      typeof restrictedWriter?.commit !== 'function' ||
      typeof merchantCode !== 'string' || !merchantCode) {
    throw new Error('SUMUP_SETTLEMENT_NOT_CONFIGURED')
  }
  return {
    kind: 'sumup-verified-settlement-v1',
    async verifyAndCommit({ checkoutReference, subscriptionId, periodEnd,
      providerCheckoutRef, nextPeriodEnd, customerId, amountMinor } = {}) {
      if (!checkoutReference || !subscriptionId || !periodEnd || !providerCheckoutRef ||
          !nextPeriodEnd || !customerId || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new Error('INVALID_SETTLEMENT_INPUT')
      }
      // Re-fetch directly from SumUp, never accept caller-supplied checkout status.
      const checkout = await transport.retrieveCheckout(providerCheckoutRef)
      if (checkout?.id !== providerCheckoutRef) throw new Error('SUMUP_CHECKOUT_MISMATCH')
      const verified = verifySumUpRenewalCheckout({
        checkout, checkoutReference, customerId, merchantCode, amountMinor,
      })
      if (!verified.verified || verified.outcome !== 'paid') {
        throw new Error('SUMUP_PAYMENT_NOT_VERIFIED')
      }
      const result = await restrictedWriter.commit({
        checkoutReference, subscriptionId, periodEnd,
        providerCheckoutRef, nextPeriodEnd,
      })
      if (!result || typeof result.committed !== 'boolean' ||
          typeof result.alreadyCommitted !== 'boolean') {
        throw new Error('SUMUP_SETTLEMENT_WRITE_FAILED')
      }
      return result
    },
  }
}

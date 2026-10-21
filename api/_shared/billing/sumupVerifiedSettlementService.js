import { verifySumUpRenewalCheckout } from './sumupRenewalReconcile.js'

/**
 * Server-only verifier. No checkout creation or charging.
 * The database writer must be an independently restricted capability,
 * NOT a general Supabase service_role client.
 */
export function createSumUpVerifiedSettlementService({
  transport, restrictedWriter, renewalAuthority, merchantCode,
} = {}) {
  if (typeof transport?.retrieveCheckout !== 'function' ||
      typeof restrictedWriter?.commit !== 'function' ||
      typeof renewalAuthority?.getExpectedRenewal !== 'function' ||
      typeof merchantCode !== 'string' || !merchantCode) {
    throw new Error('SUMUP_SETTLEMENT_NOT_CONFIGURED')
  }
  return {
    kind: 'sumup-verified-settlement-v1',
    async verifyAndCommit({ checkoutReference, subscriptionId, periodEnd,
      providerCheckoutRef, nextPeriodEnd } = {}) {
      if (!checkoutReference || !subscriptionId || !periodEnd || !providerCheckoutRef ||
          !nextPeriodEnd) {
        throw new Error('INVALID_SETTLEMENT_INPUT')
      }
      const expected = await renewalAuthority.getExpectedRenewal({
        checkoutReference, subscriptionId, periodEnd, providerCheckoutRef, nextPeriodEnd,
      })
      if (!expected || expected.checkoutReference !== checkoutReference ||
          expected.subscriptionId !== subscriptionId || expected.periodEnd !== periodEnd ||
          expected.providerCheckoutRef !== providerCheckoutRef ||
          expected.nextPeriodEnd !== nextPeriodEnd ||
          typeof expected.customerId !== 'string' || !expected.customerId ||
          !Number.isSafeInteger(expected.amountMinor) || expected.amountMinor <= 0) {
        throw new Error('SUMUP_RENEWAL_AUTHORITY_MISMATCH')
      }
      // Re-fetch directly from SumUp, never accept caller-supplied checkout status.
      const checkout = await transport.retrieveCheckout(providerCheckoutRef)
      if (checkout?.id !== providerCheckoutRef) throw new Error('SUMUP_CHECKOUT_MISMATCH')
      const verified = verifySumUpRenewalCheckout({
        checkout, checkoutReference, customerId: expected.customerId,
        merchantCode, amountMinor: expected.amountMinor,
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

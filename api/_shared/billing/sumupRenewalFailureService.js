import { verifySumUpRenewalCheckout } from './sumupRenewalReconcile.js'

export const SUMUP_RENEWAL_FAILURE_SQL = 'select billing.record_verified_sumup_renewal_failure_draft($1, $2, $3::timestamptz, $4) as result'

/** A provider notification or caller-supplied failure is never sufficient.
 * Re-fetch the bound checkout and compare with trusted, immutable billing facts.
 */
export function createSumUpRenewalFailureService({ transport, renewalAuthority, executor, merchantCode } = {}) {
  if (typeof transport?.retrieveCheckout !== 'function' ||
      typeof renewalAuthority?.getExpectedRenewal !== 'function' ||
      typeof executor?.execute !== 'function' || !merchantCode) {
    throw new Error('SUMUP_RENEWAL_FAILURE_UNAVAILABLE')
  }
  return {
    async recordFailed({ checkoutReference, subscriptionId, periodEnd, providerCheckoutId, nextPeriodEnd } = {}) {
      const expected = await renewalAuthority.getExpectedRenewal({
        checkoutReference, subscriptionId, periodEnd, providerCheckoutRef: providerCheckoutId, nextPeriodEnd,
      })
      const checkout = await transport.retrieveCheckout(providerCheckoutId)
      const verification = verifySumUpRenewalCheckout({
        checkout, checkoutReference, customerId: expected.customerId, amountMinor: expected.amountMinor, merchantCode,
      })
      if (checkout?.id !== providerCheckoutId || !verification.verified || verification.outcome !== 'failed' ||
          (Array.isArray(checkout.transactions) && checkout.transactions.some(tx => tx?.status === 'SUCCESSFUL'))) {
        throw new Error('SUMUP_RENEWAL_FAILURE_NOT_VERIFIED')
      }
      const response = await executor.execute({ text: SUMUP_RENEWAL_FAILURE_SQL,
        values: [checkoutReference, subscriptionId, periodEnd, providerCheckoutId] })
      const result = response.rows?.[0]?.result
      if (typeof result?.recorded !== 'boolean' || typeof result?.already_recorded !== 'boolean' ||
          !(result.recorded || result.already_recorded)) throw new Error('SUMUP_RENEWAL_FAILURE_NOT_RECORDED')
      return { recorded: result.recorded, alreadyRecorded: result.already_recorded }
    },
  }
}

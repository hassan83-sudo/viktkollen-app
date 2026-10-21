/**
 * Privileged renewal settlement boundary.
 * A generic Supabase service-role client MUST NOT be accepted here.
 * Disabled by default until an independently audited settlement service
 * implements the verified commit capability.
 */
export function createVerifiedSumUpRenewalCommitBoundary({ settlementService } = {}) {
  if (!settlementService || settlementService.kind !== 'sumup-verified-settlement-v1' ||
      typeof settlementService.verifyAndCommit !== 'function') {
    throw new Error('SUMUP_VERIFIED_SETTLEMENT_UNAVAILABLE')
  }
  return {
    async commitVerified({ checkoutReference, subscriptionId, periodEnd,
      providerCheckoutRef, nextPeriodEnd, customerId, amountMinor } = {}) {
      if (!checkoutReference || !subscriptionId || !periodEnd ||
          !providerCheckoutRef || !nextPeriodEnd || !customerId ||\n          !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new Error('INVALID_RENEWAL_SETTLEMENT')
      }
      const result = await settlementService.verifyAndCommit({
        checkoutReference, subscriptionId, periodEnd, providerCheckoutRef, nextPeriodEnd,\n        customerId, amountMinor,
      })
      if (!result || typeof result.committed !== 'boolean' ||
          typeof result.alreadyCommitted !== 'boolean') {
        throw new Error('SUMUP_VERIFIED_SETTLEMENT_INVALID_RESPONSE')
      }
      return result
    },
  }
}

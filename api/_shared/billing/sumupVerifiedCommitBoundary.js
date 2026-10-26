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
      providerCheckoutRef, nextPeriodEnd } = {}) {
      if (!checkoutReference || !subscriptionId || !periodEnd ||
          !providerCheckoutRef || !nextPeriodEnd) {
        throw new Error('INVALID_RENEWAL_SETTLEMENT')
      }
      const result = await settlementService.verifyAndCommit({
        checkoutReference, subscriptionId, periodEnd, providerCheckoutRef, nextPeriodEnd,
      })
      if (!result || typeof result.committed !== 'boolean' ||
          typeof result.alreadyCommitted !== 'boolean') {
        throw new Error('SUMUP_VERIFIED_SETTLEMENT_INVALID_RESPONSE')
      }
      return result
    },
  }
}

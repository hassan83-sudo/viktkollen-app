/**
 * Read-only adapter for a server-side subscription authority.
 * The caller must supply a trusted, access-controlled database query.
 * Never construct expected customer or amount from request parameters.
 */
export function createSumUpRenewalAuthority({ loadRenewalRecord } = {}) {
  if (typeof loadRenewalRecord !== 'function') {
    throw new Error('SUMUP_RENEWAL_AUTHORITY_UNAVAILABLE')
  }
  return {
    async getExpectedRenewal({ checkoutReference, subscriptionId, periodEnd,
      providerCheckoutRef, nextPeriodEnd } = {}) {
      if (!checkoutReference || !subscriptionId || !periodEnd ||
          !providerCheckoutRef || !nextPeriodEnd) {
        throw new Error('INVALID_RENEWAL_AUTHORITY_REQUEST')
      }
      const record = await loadRenewalRecord({ subscriptionId, periodEnd })
      if (!record || record.provider !== 'sumup' ||
          !['ACTIVE', 'PAST_DUE'].includes(record.status) ||
          record.checkoutReference !== checkoutReference ||
          record.providerCheckoutRef !== providerCheckoutRef ||
          record.subscriptionId !== subscriptionId ||
          !Number.isFinite(Date.parse(record.periodEnd)) || Date.parse(record.periodEnd) !== Date.parse(periodEnd) ||
          !Number.isFinite(Date.parse(nextPeriodEnd)) || !Number.isFinite(Date.parse(record.nextPeriodEnd)) || Date.parse(record.nextPeriodEnd) !== Date.parse(nextPeriodEnd) ||
          typeof record.customerId !== 'string' || !record.customerId ||
          !Number.isSafeInteger(record.amountMinor) || record.amountMinor <= 0 ||
          record.currency !== 'SEK') {
        throw new Error('SUMUP_RENEWAL_AUTHORITY_MISMATCH')
      }
      return {
        checkoutReference, subscriptionId, periodEnd,
        providerCheckoutRef, nextPeriodEnd,
        customerId: record.customerId, amountMinor: record.amountMinor,
      }
    },
  }
}

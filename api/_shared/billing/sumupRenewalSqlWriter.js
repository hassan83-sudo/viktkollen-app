/**
 * Server-only adapter for a separately provisioned, least-privilege PostgreSQL
 * connection. Do not pass the Supabase service-role connection string.
 *
 * The database login must have EXECUTE only on the reviewed commit RPC and
 * no direct table writes. Its credentials are provisioned outside this module.
 */
export function createSumUpRenewalSqlWriter({ executeRestricted } = {}) {
  if (typeof executeRestricted !== 'function') {
    throw new Error('SUMUP_RENEWAL_SQL_WRITER_UNAVAILABLE')
  }

  return {
    async commit({ checkoutReference, subscriptionId, periodEnd,
      providerCheckoutRef, nextPeriodEnd } = {}) {
      if (![checkoutReference, subscriptionId, periodEnd, providerCheckoutRef, nextPeriodEnd]
        .every(value => typeof value === 'string' && value.length > 0) ||
        !Number.isFinite(Date.parse(periodEnd)) ||
        !Number.isFinite(Date.parse(nextPeriodEnd)) ||
        Date.parse(nextPeriodEnd) <= Date.parse(periodEnd)) {
        throw new Error('INVALID_RENEWAL_SETTLEMENT')
      }

      const result = await executeRestricted({
        text: 'select billing.commit_verified_sumup_renewal($1, $2, $3::timestamptz, $4, $5::timestamptz) as result',
        values: [checkoutReference, subscriptionId, periodEnd, providerCheckoutRef, nextPeriodEnd],
      })
      const rows = Array.isArray(result) ? result : result?.rows
      const value = rows?.[0]?.result
      if (!value || typeof value.committed !== 'boolean' ||
          typeof value.already_committed !== 'boolean') {
        throw new Error('SUMUP_RENEWAL_SQL_WRITER_INVALID_RESPONSE')
      }
      return { committed: value.committed, alreadyCommitted: value.already_committed }
    },
  }
}

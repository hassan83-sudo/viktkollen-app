/**
 * Read-only database port. Its caller must supply a privileged server-only
 * SQL query; no Supabase browser credentials or public API routes.
 * Values returned by the query are authoritative only if they are sourced
 * from the subscription, verified instrument, and renewal attempt tables.
 */
export function createSumUpRenewalFactsDatabase({ query } = {}) {
  if (typeof query !== 'function') {
    throw new Error('SUMUP_RENEWAL_FACTS_QUERY_UNAVAILABLE')
  }
  return {
    async readRenewalFacts({ subscriptionId, periodEnd } = {}) {
      if (typeof subscriptionId !== 'string' || !subscriptionId ||
          typeof periodEnd !== 'string' || !Number.isFinite(Date.parse(periodEnd))) {
        throw new Error('INVALID_RENEWAL_FACTS_QUERY')
      }
      const rows = await query({ subscriptionId, periodEnd })
      if (!Array.isArray(rows) || rows.length !== 1) {
        throw new Error('SUMUP_RENEWAL_FACTS_NOT_UNIQUE')
      }
      const row = rows[0]
      if (!row || row.subscriptionId !== subscriptionId || row.periodEnd !== periodEnd ||
          row.provider !== 'sumup' || !['ACTIVE', 'PAST_DUE'].includes(row.status) ||
          !row.checkoutReference || !row.providerCheckoutRef ||
          !row.nextPeriodEnd || !row.customerId ||
          row.currency !== 'SEK' ||
          !Number.isSafeInteger(row.amountMinor) || row.amountMinor <= 0) {
        throw new Error('SUMUP_RENEWAL_FACTS_INVALID')
      }
      return row
    },
  }
}

/**
 * Maps trusted server-side SQL rows into the renewal authority's canonical
 * field names. Does not connect to a database or permit settlement writes.
 * The query must use a privileged, read-only server-side connection.
 */
export function createSumUpRenewalSqlReader({ executeReadOnly } = {}) {
  if (typeof executeReadOnly !== 'function') {
    throw new Error('SUMUP_SQL_READER_UNAVAILABLE')
  }
  return async function query({ subscriptionId, periodEnd } = {}) {
    if (typeof subscriptionId !== 'string' || !subscriptionId ||
        typeof periodEnd !== 'string' || !Number.isFinite(Date.parse(periodEnd))) {
      throw new Error('INVALID_SUMUP_SQL_READER_INPUT')
    }
    const rows = await executeReadOnly({ subscriptionId, periodEnd })
    if (!Array.isArray(rows)) throw new Error('INVALID_SUMUP_SQL_READER_RESULT')
    return rows.map(row => ({
      subscriptionId: row.subscription_id,
      periodEnd: row.period_end,
      provider: row.provider,
      status: row.status,
      checkoutReference: row.checkout_reference,
      providerCheckoutRef: row.provider_checkout_ref,
      nextPeriodEnd: row.next_period_end,
      customerId: row.customer_id,
      amountMinor: row.amount_minor,
      currency: row.currency,
    }))
  }
}

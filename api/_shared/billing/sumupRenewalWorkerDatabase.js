/** All SQL is fixed and parameterized; requires a separately granted worker role. */
export const RENEWAL_WORKER_SQL = Object.freeze({
  list: 'select * from billing.list_sumup_renewal_work_draft($1)',
  claim: 'select billing.claim_sumup_renewal_attempt($1, $2, $3::timestamptz) as result',
  bind: 'select billing.bind_sumup_renewal_checkout_draft($1, $2, $3, $4::timestamptz, $5::timestamptz) as result',
})
export function createSumUpRenewalWorkerDatabase({ executor } = {}) {
  if (typeof executor?.execute !== 'function') throw new Error('SUMUP_RENEWAL_DATABASE_UNAVAILABLE')
  return {
    async listDue({ limit }) {
      const result = await executor.execute({ text: RENEWAL_WORKER_SQL.list, values: [limit] })
      return result.rows.map(row => ({
        subscriptionId: row.subscription_id,
        periodEnd: new Date(row.period_end).toISOString(),
        customerId: row.customer_id,
        amountMinor: Number(row.amount_minor),
        currency: row.currency,
        fingerprint: row.instrument_fingerprint,
      }))
    },
    async claim({ checkoutReference, subscriptionId, periodEnd }) {
      const response = await executor.execute({ text: RENEWAL_WORKER_SQL.claim, values: [checkoutReference, subscriptionId, periodEnd] })
      const data = response.rows?.[0]?.result
      if (data?.checkout_reference !== checkoutReference || typeof data?.claimed !== 'boolean' ||
          !['processing', 'reserved', 'created', 'succeeded', 'failed'].includes(data.status)) throw new Error('INVALID_RENEWAL_CLAIM')
      return data
    },
    async bind({ checkoutReference, providerCheckoutRef, subscriptionId, periodEnd, nextPeriodEnd }) {
      const response = await executor.execute({ text: RENEWAL_WORKER_SQL.bind,
        values: [checkoutReference, providerCheckoutRef, subscriptionId, periodEnd, nextPeriodEnd] })
      const data = response.rows?.[0]?.result
      if (data?.bound !== true || !data.customer_id || data.currency !== 'SEK' ||
          !Number.isSafeInteger(data.amount_minor) || data.amount_minor <= 0 || !data.plan_id ||
          !Number.isSafeInteger(data.plan_version) || data.plan_version < 1) throw new Error('INVALID_RENEWAL_BINDING')
      return { bound: true, customerId: data.customer_id, amountMinor: data.amount_minor,
        currency: data.currency, planId: data.plan_id, planVersion: data.plan_version }
    },
  }
}

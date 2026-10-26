import { verifySumUpRenewalCheckout } from './sumupRenewalReconcile.js'

export const SUMUP_RECOVERY_SQL = Object.freeze({
  list: 'select * from billing.list_sumup_renewal_recovery_draft($1)',
  record: 'select billing.record_sumup_renewal_observation_draft($1, $2, $3, $4, $5) as result',
})

export function createSumUpRenewalRecoveryDatabase({ executor } = {}) {
  if (typeof executor?.execute !== 'function') throw new Error('SUMUP_RECOVERY_DATABASE_UNAVAILABLE')
  return {
    async list({ limit }) {
      const response = await executor.execute({ text: SUMUP_RECOVERY_SQL.list, values: [limit] })
      return response.rows.map(row => ({
        subscriptionId: row.subscription_id, periodEnd: new Date(row.period_end).toISOString(),
        checkoutReference: row.checkout_reference, providerCheckoutId: row.provider_checkout_ref,
        nextPeriodEnd: row.next_period_end ? new Date(row.next_period_end).toISOString() : null,
        customerId: row.customer_id, amountMinor: Number(row.amount_minor), currency: row.currency,
      }))
    },
    async record(row, { outcome, transactionId = null, forceReview = false }) {
      const response = await executor.execute({ text: SUMUP_RECOVERY_SQL.record,
        values: [row.checkoutReference, row.providerCheckoutId, outcome, transactionId, forceReview] })
      const value = response.rows?.[0]?.result
      if (!['settled','ready_to_settle','pending','review_required'].includes(value?.state)) {
        throw new Error('SUMUP_RECOVERY_NOT_RECORDED')
      }
      return value
    },
  }
}

/** Reconcile original attempts only. No checkout creation, payment PUT, refund,
 * lease expiry or automatic re-claim exists in this worker.
 */
export function createSumUpRenewalRecovery({ store, transport, finalizer, merchantCode } = {}) {
  if (typeof store?.list !== 'function' || typeof store?.record !== 'function' ||
      typeof transport?.retrieveCheckout !== 'function' || typeof finalizer?.reconcile !== 'function' ||
      typeof finalizer?.recordFailed !== 'function' || !merchantCode) throw new Error('SUMUP_RECOVERY_UNAVAILABLE')
  return {
    async run({ limit = 20 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('INVALID_RECOVERY_LIMIT')
      const rows = await store.list({ limit })
      if (!Array.isArray(rows) || rows.length > limit) throw new Error('INVALID_RECOVERY_WORK')
      const results = []
      for (const row of rows) {
        try { results.push(await reconcile(row)) } catch {
          // Persist the unresolved attempt without overwriting verified paid facts.
          let recorded = false
          try { await store.record(row, { outcome: 'unknown', forceReview: true }); recorded = true } catch { /* Claim remains durable. */ }
          results.push({ subscriptionId: row.subscriptionId, outcome: recorded ? 'review_required' : 'reconciliation_required' })
        }
      }
      return { considered: rows.length, results }
    },
  }
  async function reconcile(row) {
    if (!row.providerCheckoutId || !row.customerId || !row.nextPeriodEnd ||
        !Number.isSafeInteger(row.amountMinor) || row.amountMinor <= 0 || row.currency !== 'SEK') {
      await store.record(row, { outcome: 'unknown', forceReview: true })
      return { subscriptionId: row.subscriptionId, outcome: 'review_required' }
    }
    const checkout = await transport.retrieveCheckout(row.providerCheckoutId)
    const verified = verifySumUpRenewalCheckout({ checkout, checkoutReference: row.checkoutReference,
      customerId: row.customerId, merchantCode, amountMinor: row.amountMinor })
    if (checkout?.id !== row.providerCheckoutId || !verified.verified ||
        !['PAID','FAILED','EXPIRED','PENDING'].includes(checkout.status) ||
        verified.outcome !== 'paid' && checkout.transactions?.some(tx => tx?.status === 'SUCCESSFUL')) {
      throw new Error('SUMUP_RECOVERY_NOT_VERIFIED')
    }
    const observation = { outcome: verified.outcome,
      transactionId: verified.outcome === 'paid' ? checkout.transactions.find(tx => tx.status === 'SUCCESSFUL').id.toLowerCase() : null }
    const result = await store.record(row, observation)
    if (result.state !== 'ready_to_settle') return { subscriptionId: row.subscriptionId, outcome: result.state }
    // Current eligibility is rechecked by the original settlement functions.
    if (verified.outcome === 'paid') {
      const committed = await finalizer.reconcile(row)
      if (!committed?.committed && !committed?.alreadyCommitted) throw new Error('SUMUP_RECOVERY_NOT_SETTLED')
    } else if (verified.outcome === 'failed') {
      const recorded = await finalizer.recordFailed(row)
      if (!recorded?.recorded && !recorded?.alreadyRecorded) throw new Error('SUMUP_RECOVERY_NOT_SETTLED')
    } else throw new Error('SUMUP_RECOVERY_PENDING')
    await store.record(row, observation)
    return { subscriptionId: row.subscriptionId, outcome: verified.outcome }
  }
}

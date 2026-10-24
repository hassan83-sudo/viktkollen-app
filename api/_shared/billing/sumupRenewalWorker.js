import { instrumentFingerprint, renewalReference } from './sumupRecurring.js'
import { sumUpMonthPeriod, sumUpMajorFromMinor } from './providers/sumup.js'
import { verifySumUpRenewalCheckout } from './sumupRenewalReconcile.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Durable, at-most-once charging. Only the process that inserted the claim
 * may send a payment PUT. All later runs reconcile without charging, including
 * crashes before PUT. Tokens never leave this function or enter the database.
 * An uncertain/crashed attempt requires reconciliation, never an automatic retry.
 */
export function createSumUpRenewalWorker({ store, transport, finalizer, merchantCode } = {}) {
  if (!['listDue', 'claim', 'bind'].every(key => typeof store?.[key] === 'function') ||
      !['listCheckouts', 'createCheckout', 'retrieveCheckout', 'listPaymentInstruments', 'processCheckout']
        .every(key => typeof transport?.[key] === 'function') ||
      typeof finalizer?.reconcile !== 'function' || !merchantCode) {
    throw new Error('SUMUP_RENEWAL_WORKER_UNAVAILABLE')
  }
  return {
    async run({ limit = 20 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('INVALID_RENEWAL_LIMIT')
      const rows = await store.listDue({ limit })
      if (!Array.isArray(rows) || rows.length > limit) throw new Error('INVALID_RENEWAL_WORK')
      const results = []
      for (const row of rows) {
        try { results.push(await renew(row)) } catch {
          // Do not leak provider payloads, tokens or database errors.
          results.push({ subscriptionId: row.subscriptionId, outcome: 'reconciliation_required' })
        }
      }
      return { considered: rows.length, results }
    },
  }

  async function renew(row) {
    const { subscriptionId, periodEnd, customerId, amountMinor, fingerprint } = row
    const amount = sumUpMajorFromMinor(amountMinor)
    if (!subscriptionId || !Number.isFinite(Date.parse(periodEnd)) || !customerId ||
        row.currency !== 'SEK' || !amount || !/^[0-9a-f]{64}$/.test(fingerprint || '')) {
      throw new Error('INVALID_RENEWAL_WORK')
    }
    const checkoutReference = renewalReference(subscriptionId, periodEnd)
    const nextPeriodEnd = sumUpMonthPeriod(periodEnd).end
    const context = { subscriptionId, periodEnd, checkoutReference, nextPeriodEnd }
    const claim = await store.claim(context)
    if (typeof claim?.claimed !== 'boolean') throw new Error('INVALID_RENEWAL_CLAIM')
    if (claim.status === 'succeeded') return { subscriptionId, outcome: 'already_committed' }
    if (claim.status === 'failed') return { subscriptionId, outcome: 'failed' }

    // A read failure must never be interpreted as an empty provider result.
    const listed = await transport.listCheckouts(checkoutReference)
    if (!Array.isArray(listed) || listed.length > 1) throw new Error('AMBIGUOUS_RENEWAL_CHECKOUT')
    let checkout = listed[0]
    const existed = Boolean(checkout)
    if (!checkout) {
      if (!claim.claimed) return { subscriptionId, outcome: 'reconciliation_required' }
      // No retry after a timeout: the next invocation only looks up this reference.
      checkout = await transport.createCheckout({
        amount, currency: 'SEK', customer_id: customerId,
        checkout_reference: checkoutReference, merchant_code: merchantCode,
        description: 'Viktkollen', purpose: 'CHECKOUT',
      })
    }
    if (!UUID.test(checkout?.id || '')) throw new Error('INVALID_RENEWAL_CHECKOUT')
    const providerCheckoutId = checkout.id
    checkout = await transport.retrieveCheckout(providerCheckoutId)
    let verification = verify(checkout)
    if (!verification.verified) throw new Error('RENEWAL_CHECKOUT_MISMATCH')
    const bound = await store.bind({ ...context, providerCheckoutRef: providerCheckoutId })
    if (bound?.bound !== true) throw new Error('RENEWAL_NOT_BOUND')
    if (verification.outcome === 'paid') return settle()
    if (verification.outcome === 'failed') return { subscriptionId, outcome: 'failed_review_required' }
    // Even a newly claimed row must not process a pre-existing checkout.
    if (!claim.claimed || existed) return { subscriptionId, outcome: 'reconciliation_required' }
    if (checkout.status !== 'PENDING' || checkout.purpose !== 'CHECKOUT') throw new Error('INVALID_RENEWAL_STATUS')
    const instruments = await transport.listPaymentInstruments(customerId)
    if (!Array.isArray(instruments)) throw new Error('INVALID_RENEWAL_INSTRUMENTS')
    const matches = instruments.filter(item => instrumentFingerprint(item?.token) === fingerprint)
    if (matches.length !== 1) throw new Error('RENEWAL_INSTRUMENT_MISMATCH')
    // Revalidate eligibility under the database lock immediately before sending.
    const rechecked = await store.bind({ ...context, providerCheckoutRef: providerCheckoutId })
    if (rechecked?.bound !== true) throw new Error('RENEWAL_NOT_BOUND')
    await transport.processCheckout(providerCheckoutId, {
      payment_type: 'card', customer_id: customerId, token: matches[0].token,
    })
    checkout = await transport.retrieveCheckout(providerCheckoutId)
    verification = verify(checkout)
    if (!verification.verified) throw new Error('RENEWAL_CHECKOUT_MISMATCH')
    if (verification.outcome === 'paid') return settle()
    return { subscriptionId, outcome: verification.outcome === 'failed' ? 'failed_review_required' : 'reconciliation_required' }

    function verify(value) {
      if (value?.id !== providerCheckoutId) return { verified: false }
      return verifySumUpRenewalCheckout({ checkout: value, checkoutReference, customerId, merchantCode, amountMinor })
    }
    async function settle() {
      const result = await finalizer.reconcile({ ...context, providerCheckoutId })
      if (!result?.committed && !result?.alreadyCommitted) throw new Error('RENEWAL_NOT_COMMITTED')
      return { subscriptionId, outcome: result.alreadyCommitted ? 'already_committed' : 'paid' }
    }
  }
}

import { renewalReference } from './sumupRecurring.js'
import { selectDueRenewalCandidates } from './sumupRenewalCandidates.js'

/**
 * Claims renewal candidates without charging cards.
 * Database claims are exclusive and must be reconciled before any retry.
 */
export function createSumUpRenewalClaimBatch({ claimPort } = {}) {
  if (!claimPort || typeof claimPort.claim !== 'function') {
    throw new Error('SUMUP_DURABLE_RENEWAL_UNAVAILABLE')
  }
  return {
    async claimDue({ subscriptions, now = new Date(), limit = 20 } = {}) {
      const candidates = selectDueRenewalCandidates(subscriptions, { now, limit })
      const results = []
      for (const candidate of candidates) {
        const checkoutReference = renewalReference(candidate.subscriptionId, candidate.periodEnd)
        try {
          const result = await claimPort.claim({ checkoutReference, ...candidate })
          results.push({
            subscriptionId: candidate.subscriptionId,
            claimed: result.claimed === true,
            status: result.status,
          })
        } catch {
          results.push({
            subscriptionId: candidate.subscriptionId,
            claimed: false,
            status: 'claim_error',
          })
        }
      }
      return { considered: candidates.length, results }
    },
  }
}

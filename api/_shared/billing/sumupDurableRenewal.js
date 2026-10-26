/**
 * Server-only gate for SumUp renewal execution.
 * Never call SumUp when a durable reservation/reconciliation backend is absent.
 * This module intentionally does not implement charging.
 */
export function assertDurableSumUpRenewalPorts(ports) {
  const required = [
    'claimDueRenewals',
    'getVerifiedInstrument',
    'reserveAttempt',
    'markAttemptProcessing',
    'reconcileAttempt',
    'commitPaidRenewal',
    'recordFailedRenewal',
  ]
  if (!ports || required.some((name) => typeof ports[name] !== 'function')) {
    const error = new Error('SUMUP_DURABLE_RENEWAL_UNAVAILABLE')
    error.code = 'SUMUP_DURABLE_RENEWAL_UNAVAILABLE'
    throw error
  }
  return ports
}

/**
 * An explicit no-charge preflight for scheduler wiring.
 * A future worker must implement transaction-safe claims and reconciliation
 * before it is permitted to invoke processCheckout.
 */
export function createDurableSumUpRenewalPreflight({ ports } = {}) {
  return {
    check() {
      assertDurableSumUpRenewalPorts(ports)
      return { ready: true, chargesAttempted: 0 }
    },
  }
}

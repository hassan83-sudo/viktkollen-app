import { describe, expect, it, vi } from 'vitest'
import { assertDurableSumUpRenewalPorts, createDurableSumUpRenewalPreflight } from './sumupDurableRenewal.js'

describe('SumUp renewal preflight', () => {
  it('rejects missing durable ports', () => {
    expect(() => createDurableSumUpRenewalPreflight().check()).toThrow('SUMUP_DURABLE_RENEWAL_UNAVAILABLE')
  })
  it('does not perform charges or mutate the database on successful preflight', () => {
    const names = ['claimDueRenewals', 'getVerifiedInstrument', 'reserveAttempt', 'markAttemptProcessing', 'reconcileAttempt', 'commitPaidRenewal', 'recordFailedRenewal']
    const ports = Object.fromEntries(names.map((name) => [name, vi.fn()]))
    expect(createDurableSumUpRenewalPreflight({ ports }).check()).toEqual({ ready: true, chargesAttempted: 0 })
    for (const port of Object.values(ports)) expect(port).not.toHaveBeenCalled()
  })
  it('rejects partial durable ports', () => {
    expect(() => assertDurableSumUpRenewalPorts({ reserveAttempt() {} })).toThrow('SUMUP_DURABLE_RENEWAL_UNAVAILABLE')
  })
})

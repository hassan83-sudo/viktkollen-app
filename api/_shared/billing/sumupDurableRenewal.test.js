import { describe, expect, it } from 'vitest'
import { assertDurableSumUpRenewalPorts, createDurableSumUpRenewalPreflight } from './sumupDurableRenewal.js'

describe('SumUp renewal preflight', () => {
  it('rejects missing durable ports', () => {
    expect(() => createDurableSumUpRenewalPreflight().check()).toThrow('SUMUP_DURABLE_RENEWAL_UNAVAILABLE')
  })
  it('rejects partial durable ports', () => {
    expect(() => assertDurableSumUpRenewalPorts({ reserveAttempt() {} })).toThrow('SUMUP_DURABLE_RENEWAL_UNAVAILABLE')
  })
})

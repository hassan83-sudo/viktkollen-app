import { describe, expect, it, vi } from 'vitest'
import { createSumUpRestrictedRenewalSettlementPipeline } from './sumupRestrictedRenewalSettlementPipeline.js'

describe('restricted SumUp settlement pipeline composition', () => {
  it('fails closed if restricted executor is absent', () => {
    expect(() => createSumUpRestrictedRenewalSettlementPipeline({
      transport: { retrieveCheckout: vi.fn() }, merchantCode: 'merchant',
    })).toThrow('SUMUP_RENEWAL_DATABASE_EXECUTOR_UNAVAILABLE')
  })

  it('composes the restricted database with the verified settlement pipeline without charging on setup', () => {
    const executor = { execute: vi.fn() }
    const transport = { retrieveCheckout: vi.fn() }
    const pipeline = createSumUpRestrictedRenewalSettlementPipeline({
      executor, transport, merchantCode: 'merchant',
    })
    expect(typeof pipeline).toBe('object')
    expect(typeof pipeline.finalize).toBe('function')
    expect(executor.execute).not.toHaveBeenCalled()
    expect(transport.retrieveCheckout).not.toHaveBeenCalled()
  })
})

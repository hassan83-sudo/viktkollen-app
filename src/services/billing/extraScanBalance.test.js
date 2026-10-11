import { describe, expect, it } from 'vitest'
import { chooseScanQuotaSource, extraScanBalance } from './extraScanBalance.js'

describe('extra scan accounting rules', () => {
  it('ignores pending and unverified grants', () => {
    expect(extraScanBalance({ feature: 'food.scan', grants: [
      { feature: 'food.scan', paymentId: 'p1', quantity: 2, status: 'PENDING' },
    ] }).remaining).toBe(0)
  })
  it('does not double-credit repeated payment notifications', () => {
    const grant = { feature: 'food.scan', paymentId: 'p1', quantity: 2, status: 'VERIFIED_PAID' }
    expect(extraScanBalance({ feature: 'food.scan', grants: [grant, grant] }).remaining).toBe(2)
  })
  it('deduplicates committed consumption and ignores rolled-back scans', () => {
    const grants = [{ feature: 'body.scan', paymentId: 'p1', quantity: 2, status: 'VERIFIED_PAID' }]
    const spend = { feature: 'body.scan', reservationId: 'r1', quantity: 1, status: 'COMMITTED' }
    expect(extraScanBalance({ feature: 'body.scan', grants, spends: [
      spend, spend, { feature: 'body.scan', reservationId: 'r2', quantity: 1, status: 'ROLLED_BACK' },
    ] }).remaining).toBe(1)
  })
  it('rejects overspending', () => {
    expect(extraScanBalance({ feature: 'food.scan', spends: [
      { feature: 'food.scan', reservationId: 'r1', quantity: 1, status: 'COMMITTED' },
    ] }).code).toBe('INCONSISTENT_BALANCE')
  })
  it('consumes monthly quota before purchased scans', () => {
    expect(chooseScanQuotaSource({ monthlyRemaining: 2, purchasedRemaining: 3, quantity: 3 }))
      .toEqual({ ok: true, monthly: 2, purchased: 1 })
    expect(chooseScanQuotaSource({ monthlyRemaining: 0, purchasedRemaining: 1 }))
      .toEqual({ ok: true, monthly: 0, purchased: 1 })
    expect(chooseScanQuotaSource({ monthlyRemaining: 0, purchasedRemaining: 0 }).code)
      .toBe('QUOTA_EXCEEDED')
  })
})

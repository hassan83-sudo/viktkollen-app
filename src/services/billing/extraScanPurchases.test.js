import { describe, expect, it } from 'vitest'
import {
  EXTRA_SCAN_PRODUCTS,
  EXTRA_SCAN_PURCHASES_ENABLED,
  extraScanPurchaseAvailability,
  validateExtraScanSelection,
} from './extraScanPurchases.js'

describe('extra scanning purchase foundation', () => {
  it('supports only the three selected scan types', () => {
    expect(Object.keys(EXTRA_SCAN_PRODUCTS)).toEqual(['food.scan', 'body.scan', 'ai.eye.analysis'])
    expect(validateExtraScanSelection({ feature: 'ai.text.request', quantity: 1 }).ok).toBe(false)
  })

  it('supports buying a single scan', () => {
    expect(validateExtraScanSelection({ feature: 'food.scan', quantity: 1 })).toEqual({
      ok: true, feature: 'food.scan', quantity: 1, unit: 'requests',
    })
  })

  it('rejects invalid or unsafe quantities', () => {
    for (const quantity of [0, -1, 1.5, 101, NaN, '1', Infinity]) {
      expect(validateExtraScanSelection({ feature: 'body.scan', quantity }).ok).toBe(false)
    }
  })

  it('cannot activate checkout before payment and pricing approval', () => {
    expect(EXTRA_SCAN_PURCHASES_ENABLED).toBe(false)
    expect(extraScanPurchaseAvailability()).toEqual({
      enabled: false, reason: 'PRICES_AND_PAYMENT_NOT_VERIFIED',
    })
  })
})

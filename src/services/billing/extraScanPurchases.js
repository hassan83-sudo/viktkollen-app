/**
 * Extra scanning purchases — preparation only.
 * NO prices are approved, NO checkout is enabled, and this module never grants quota.
 * The final server flow must verify SumUp payment before a durable, idempotent grant.
 */
export const EXTRA_SCAN_PRODUCTS = Object.freeze({
  'food.scan': Object.freeze({ feature: 'food.scan', unit: 'requests', label: 'Matscanning' }),
  'body.scan': Object.freeze({ feature: 'body.scan', unit: 'requests', label: 'Kroppsscanning' }),
  'ai.eye.analysis': Object.freeze({ feature: 'ai.eye.analysis', unit: 'requests', label: 'AI-Ögat' }),
})

export const EXTRA_SCAN_PURCHASES_ENABLED = false

export function validateExtraScanSelection({ feature, quantity } = {}) {
  if (!Object.hasOwn(EXTRA_SCAN_PRODUCTS, feature)) {
    return { ok: false, code: 'UNKNOWN_FEATURE' }
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    return { ok: false, code: 'INVALID_QUANTITY' }
  }
  return { ok: true, feature, quantity, unit: EXTRA_SCAN_PRODUCTS[feature].unit }
}

export function extraScanPurchaseAvailability() {
  return {
    enabled: EXTRA_SCAN_PURCHASES_ENABLED,
    reason: 'PRICES_AND_PAYMENT_NOT_VERIFIED',
  }
}

/**
 * Pure extra-scan balance rules, for use by a future transactional SQL backend.
 * Never use this in-memory calculation as billing authority.
 * Purchases must be verified and granted by the server before they appear here.
 */
import { EXTRA_SCAN_PRODUCTS } from './extraScanPurchases.js'

export function extraScanBalance({ grants = [], spends = [], feature } = {}) {
  if (!Object.hasOwn(EXTRA_SCAN_PRODUCTS, feature)) return { ok: false, code: 'UNKNOWN_FEATURE' }
  let granted = 0
  let spent = 0
  const seenPayments = new Set()
  const seenSpends = new Set()
  for (const row of grants) {
    if (row?.feature !== feature || row?.status !== 'VERIFIED_PAID') continue
    if (typeof row.paymentId !== 'string' || !row.paymentId || seenPayments.has(row.paymentId)) continue
    if (!Number.isSafeInteger(row.quantity) || row.quantity < 1) return { ok: false, code: 'INVALID_GRANT' }
    seenPayments.add(row.paymentId)
    granted += row.quantity
  }
  for (const row of spends) {
    if (row?.feature !== feature || row?.status !== 'COMMITTED') continue
    if (typeof row.reservationId !== 'string' || !row.reservationId || seenSpends.has(row.reservationId)) continue
    if (!Number.isSafeInteger(row.quantity) || row.quantity < 1) return { ok: false, code: 'INVALID_SPEND' }
    seenSpends.add(row.reservationId)
    spent += row.quantity
  }
  if (!Number.isSafeInteger(granted) || !Number.isSafeInteger(spent) || spent > granted) {
    return { ok: false, code: 'INCONSISTENT_BALANCE' }
  }
  return { ok: true, granted, spent, remaining: granted - spent }
}

/** Monthly allowance is always consumed before verified purchased units. */
export function chooseScanQuotaSource({ monthlyRemaining, purchasedRemaining, quantity = 1 } = {}) {
  if (![monthlyRemaining, purchasedRemaining, quantity].every(Number.isSafeInteger) ||
      monthlyRemaining < 0 || purchasedRemaining < 0 || quantity < 1) {
    return { ok: false, code: 'INVALID_QUANTITY' }
  }
  if (monthlyRemaining + purchasedRemaining < quantity) return { ok: false, code: 'QUOTA_EXCEEDED' }
  const monthly = Math.min(monthlyRemaining, quantity)
  return { ok: true, monthly, purchased: quantity - monthly }
}

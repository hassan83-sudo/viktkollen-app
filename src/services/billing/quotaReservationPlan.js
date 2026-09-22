import { QUOTA_STATUS } from './catalog.js'

/**
 * BILL-5A quota boundary only. Never reserve, commit, or rollback.
 *
 * Future BILL-5B live lifecycle (not implemented):
 *   evaluateBillingOperation
 *   → reserve quota (BILL-2)
 *   → provider call
 *   → commit actual quantity
 *   or rollback if the provider call fails (BILL-2 reservation semantics).
 *
 * Cost hard-stop must already have denied before this plan is used, so a
 * denied cost-safety decision never consumes quota.
 */
export const QUOTA_PLAN_ACTION = Object.freeze({
  NONE: 'NONE',
  RESERVE_ON_EXECUTE: 'RESERVE_ON_EXECUTE',
})

const DENY_STATUSES = new Set([
  QUOTA_STATUS.DENIED_DISABLED,
  QUOTA_STATUS.DENIED_INVALID_QUANTITY,
  QUOTA_STATUS.DENIED_NO_USER,
  QUOTA_STATUS.DENIED_QUOTA_EXCEEDED,
  QUOTA_STATUS.DENIED_UNIT_MISMATCH,
  QUOTA_STATUS.DENIED_UNKNOWN_FEATURE,
  QUOTA_STATUS.DENIED_UNKNOWN_PLAN,
])

export function planQuotaEligibility({
  entitlementUnlimited = false,
  inspectResult = null,
  metered = true,
  quantity = 1,
} = {}) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return Object.freeze({
      action: QUOTA_PLAN_ACTION.NONE,
      consume: false,
      eligible: false,
      quantity: null,
      status: QUOTA_STATUS.DENIED_INVALID_QUANTITY,
    })
  }

  if (!metered || entitlementUnlimited) {
    return Object.freeze({
      action: QUOTA_PLAN_ACTION.NONE,
      consume: false,
      eligible: true,
      quantity,
      status: entitlementUnlimited ? QUOTA_STATUS.UNLIMITED : QUOTA_STATUS.ALLOWED_UNMETERED,
    })
  }

  if (!inspectResult || typeof inspectResult !== 'object') {
    return Object.freeze({
      action: QUOTA_PLAN_ACTION.NONE,
      consume: false,
      eligible: false,
      quantity,
      status: QUOTA_STATUS.DENIED_UNKNOWN_PLAN,
    })
  }

  const status = inspectResult.status
  if (DENY_STATUSES.has(status)) {
    return Object.freeze({
      action: QUOTA_PLAN_ACTION.NONE,
      consume: false,
      eligible: false,
      quantity,
      status,
    })
  }

  if (status === QUOTA_STATUS.UNLIMITED || status === QUOTA_STATUS.ALLOWED_UNMETERED) {
    return Object.freeze({
      action: QUOTA_PLAN_ACTION.NONE,
      consume: false,
      eligible: true,
      quantity,
      status,
    })
  }

  if (status === QUOTA_STATUS.ALLOWED) {
    const remaining = inspectResult.remaining
    if (remaining != null && (!Number.isInteger(remaining) || remaining < quantity)) {
      return Object.freeze({
        action: QUOTA_PLAN_ACTION.NONE,
        consume: false,
        eligible: false,
        quantity,
        status: QUOTA_STATUS.DENIED_QUOTA_EXCEEDED,
      })
    }
    return Object.freeze({
      action: QUOTA_PLAN_ACTION.RESERVE_ON_EXECUTE,
      consume: false,
      eligible: true,
      quantity,
      status,
    })
  }

  return Object.freeze({
    action: QUOTA_PLAN_ACTION.NONE,
    consume: false,
    eligible: false,
    quantity,
    status: status || QUOTA_STATUS.DENIED_UNKNOWN_PLAN,
  })
}

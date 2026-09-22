import { PROVIDER_DISPATCH_STATE } from './foodScanCanary.js'
import { foodScanUsageEventPlan } from './foodScanCanary.js'

/**
 * Shareable durable operation records. Production authority is BILL-1
 * usage_events (event_id PK CAS) plus BILL-2 quota_reservations — not a
 * Node Map. This in-memory store is a single-process stand-in that tests
 * share across isolated lifecycle instances.
 */
export function createDurableOperationStore() {
  const byId = new Map()

  return {
    async claimDispatch(operationId, extra = {}) {
      const id = String(operationId || '').trim()
      const existing = byId.get(id)
      if (existing?.dispatch_started === true) {
        return { claimed: false, record: existing }
      }
      const record = {
        ...existing,
        dispatch_started: true,
        dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
        feature_id: extra.feature_id || existing?.feature_id || null,
        operation_id: id,
        user_id: extra.userId || existing?.user_id || null,
      }
      byId.set(id, record)
      return { claimed: true, record }
    },
    async get(operationId) {
      return byId.get(String(operationId || '').trim()) || null
    },
    async put(operationId, patch = {}) {
      const id = String(operationId || '').trim()
      const next = { ...byId.get(id), ...patch, operation_id: id }
      byId.set(id, next)
      return next
    },
    reset() {
      byId.clear()
    },
  }
}

/**
 * Production-shaped dispatch CAS: unique BILL-1 event_id insert.
 * cost_basis/usage_basis stay UNAVAILABLE — never MEASURED.
 */
export function createUsageBackedDispatchStore({ recordUsage, usageRepository } = {}) {
  return {
    async claimDispatch(operationId, extra = {}) {
      const plan = foodScanUsageEventPlan({
        operationId,
        userId: extra.userId,
      })
      const result = await recordUsage(plan)
      const record = await this.get(operationId)
      if (result?.duplicate === true) {
        return { claimed: false, record }
      }
      if (result?.ok === true) {
        return { claimed: true, record }
      }
      return { claimed: false, record: record || null, error: result }
    },
    async get(operationId) {
      const event = await usageRepository.getByEventId(operationId)
      if (!event) return null
      return {
        cost_basis: event.cost_basis,
        dispatch_started: true,
        dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
        event_id: event.event_id,
        operation_id: operationId,
        usage_basis: event.metadata?.usage_basis || 'UNAVAILABLE',
        usage_ok: true,
      }
    },
    async put(operationId, patch = {}) {
      const current = (await this.get(operationId)) || { operation_id: operationId }
      return { ...current, ...patch }
    },
    reset() {},
  }
}

export const FOOD_SCAN_RECOVERY_HTTP = Object.freeze({
  BILLING_RECOVERY: Object.freeze({
    code: 'BILLING_RECOVERY',
    retryable: false,
    status: 409,
  }),
  PROCESSING: Object.freeze({
    code: 'STALE_REQUEST',
    retryable: false,
    status: 409,
  }),
})

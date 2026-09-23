import { PROVIDER_DISPATCH_STATE } from './foodScanCanary.js'
import { foodScanUsageEventPlan } from './foodScanCanary.js'

export const USAGE_BACKED_DISPATCH_AUTHORITY = 'usage_events'

export const DISPATCH_CAS_RESULT = Object.freeze({
  ALREADY_DISPATCHED: 'ALREADY_DISPATCHED',
  FIRST_DISPATCH: 'FIRST_DISPATCH',
  PERSISTENCE_FAILURE: 'PERSISTENCE_FAILURE',
})

export function isUsageBackedDispatchStore(store) {
  return store?.authority === USAGE_BACKED_DISPATCH_AUTHORITY && store.durable === true
}

/**
 * Test/dev only. Process-local Map. Never production authority.
 */
export function createDurableOperationStore() {
  const byId = new Map()

  return {
    authority: 'process_local_map',
    durable: false,
    async claimDispatch(operationId, extra = {}) {
      const id = String(operationId || '').trim()
      const existing = byId.get(id)
      if (existing?.dispatch_started === true) {
        return {
          claimed: false,
          record: existing,
          result: DISPATCH_CAS_RESULT.ALREADY_DISPATCHED,
        }
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
      return { claimed: true, record, result: DISPATCH_CAS_RESULT.FIRST_DISPATCH }
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

function requireUsageBackedDeps({ recordUsage, usageRepository } = {}) {
  if (typeof recordUsage !== 'function' || typeof usageRepository?.getByEventId !== 'function') {
    const error = new Error('usage_backed_store_unavailable')
    error.code = 'usage_backed_store_unavailable'
    throw error
  }
}

/**
 * Production-capable dispatch CAS: unique BILL-1 usage_events.event_id insert.
 * Two isolates sharing the same repository/Postgres PK yield one FIRST_DISPATCH.
 * cost_basis/usage_basis stay UNAVAILABLE — never MEASURED.
 */
export function createUsageBackedDispatchStore({
  recordUsage,
  usageEventPlan = foodScanUsageEventPlan,
  usageRepository,
} = {}) {
  requireUsageBackedDeps({ recordUsage, usageRepository })

  const store = {
    authority: USAGE_BACKED_DISPATCH_AUTHORITY,
    durable: true,
    async claimDispatch(operationId, extra = {}) {
      try {
        const plan = usageEventPlan({
          operationId,
          userId: extra.userId,
        })
        const result = await recordUsage(plan)
        const record = await store.get(operationId)
        if (result?.duplicate === true) {
          return {
            claimed: false,
            record,
            result: DISPATCH_CAS_RESULT.ALREADY_DISPATCHED,
          }
        }
        if (result?.ok === true) {
          return {
            claimed: true,
            record,
            result: DISPATCH_CAS_RESULT.FIRST_DISPATCH,
          }
        }
        return {
          claimed: false,
          record: record || null,
          result: DISPATCH_CAS_RESULT.PERSISTENCE_FAILURE,
          error: result,
        }
      } catch {
        return {
          claimed: false,
          record: null,
          result: DISPATCH_CAS_RESULT.PERSISTENCE_FAILURE,
        }
      }
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
      const current = (await store.get(operationId)) || { operation_id: operationId }
      return { ...current, ...patch }
    },
    reset() {},
  }

  return store
}

/**
 * BILL-5B2 injection helper. Throws if BILL-1 primitives are missing.
 */
export function createFoodScanDurableDispatchStore(deps) {
  return createUsageBackedDispatchStore(deps)
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
  PERSISTENCE_FAILURE: Object.freeze({
    code: 'BILLING_UNAVAILABLE',
    retryable: true,
    status: 503,
  }),
})

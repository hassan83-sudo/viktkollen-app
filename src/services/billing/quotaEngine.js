import { createInMemoryAtomicBackend } from './quotaAtomicBackend.js'
import { resolveFeatureId } from './features.js'

/**
 * Client claims are discarded. Production authority is PostgreSQL
 * billing.reserve_quota / commit_quota / rollback_quota (service_role only).
 * The optional in-memory backend is a single-store stand-in for tests.
 */
export function createQuotaEngine(options = {}) {
  const backend = options.backend || createInMemoryAtomicBackend(options)

  async function inspectQuota({ userId, feature, unit, clientClaim = {} } = {}) {
    void clientClaim
    return backend.inspect({
      clientClaim: {},
      feature: resolveFeatureId(feature) || feature,
      unit,
      userId,
    })
  }

  async function reserveQuota({
    clientClaim = {},
    expires_at = null,
    feature,
    quantity,
    reservation_id,
    unit,
    user,
  } = {}) {
    void clientClaim
    const userId = typeof user === 'string' ? user : user?.id || user?.user_id || ''
    return backend.reserve({
      clientClaim: {},
      expires_at,
      feature,
      quantity,
      reservation_id,
      unit,
      userId,
    })
  }

  async function commitReservation({ actual_quantity, reservation_id } = {}) {
    return backend.commit({ actual_quantity, reservation_id })
  }

  async function rollbackReservation({ reservation_id } = {}) {
    return backend.rollback({ reservation_id })
  }

  return {
    commitReservation,
    inspectQuota,
    rollbackReservation,
    reserveQuota,
  }
}

export function ignoreClientQuotaClaim(claim = {}) {
  return {
    unlimited: claim.unlimited,
    plan_id: claim.plan_id,
    remaining: claim.remaining,
    used: claim.used,
  }
}

export function passthroughMutex() {
  return {
    runExclusive(_key, fn) {
      return fn()
    },
  }
}

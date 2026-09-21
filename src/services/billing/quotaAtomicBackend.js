import { randomUUID } from 'node:crypto'
import {
  LIMIT_KIND,
  OVERAGE_POLICY,
  QUOTA_STATUS,
  RESERVATION_STATUS,
} from './catalog.js'
import { createAsyncMutex } from './asyncMutex.js'
import { isUnlimitedLimit, limitValue } from './entitlementModel.js'
import { getFeatureDefinition, resolveFeatureId } from './features.js'
import { inPeriod, periodBounds } from './period.js'
import { defaultPlanCatalog, getPlanById, getPlanEntitlement } from './planCatalog.js'
import { createInMemoryPlanAssignmentStore } from './planAssignment.js'
import { createInMemoryReservationStore } from './reservationStore.js'
import { getUsageRepository } from './usageRepository.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_QUANTITY = 1_000_000_000
const TERMINAL = new Set([
  RESERVATION_STATUS.COMMITTED,
  RESERVATION_STATUS.ROLLED_BACK,
  RESERVATION_STATUS.EXPIRED,
])

export function quotaResult(status, extra = {}) {
  const remaining = extra.remaining
  return {
    limit: extra.limit ?? null,
    overage_policy: OVERAGE_POLICY,
    overage_quantity: extra.overage_quantity || 0,
    period_end: extra.period_end || null,
    period_start: extra.period_start || null,
    remaining: remaining == null ? null : Math.max(0, remaining),
    reservation_id: extra.reservation_id || null,
    reserved: extra.reserved || 0,
    status,
    unit: extra.unit || null,
    used: extra.used || 0,
    ...('integrity' in extra ? { integrity: extra.integrity } : {}),
  }
}

export function parseQuotaQuantity(value) {
  if (value === 0 || value === '0') return 0
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > MAX_QUANTITY) return null
  return n
}

export function assertReservationTransition(from, to) {
  if (from === RESERVATION_STATUS.PENDING) {
    if ([
      RESERVATION_STATUS.PENDING,
      RESERVATION_STATUS.COMMITTED,
      RESERVATION_STATUS.ROLLED_BACK,
      RESERVATION_STATUS.EXPIRED,
    ].includes(to)) return
  }
  if (from === to && TERMINAL.has(from)) return
  const error = new Error('illegal_reservation_transition')
  error.code = 'illegal_reservation_transition'
  error.from = from
  error.to = to
  throw error
}

function isExpired(row, nowDate) {
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() <= nowDate.getTime()
}

/**
 * Shared store + lock. Two quota engines must share one backend (Postgres
 * or this in-memory stand-in). Per-engine asyncMutex is not the boundary.
 */
export function createInMemoryAtomicBackend({
  assignments = createInMemoryPlanAssignmentStore(),
  catalog = defaultPlanCatalog,
  mutex = createAsyncMutex(),
  now = () => new Date(),
  reservations = createInMemoryReservationStore(),
  usageRepository = getUsageRepository(),
} = {}) {
  async function periodUsage({ userId, feature, unit, period, nowDate }) {
    const reservationRows = await reservations.list()
    const reservationIds = new Set(reservationRows.map((row) => row.reservation_id))
    let committed = 0
    let reserved = 0
    for (const row of reservationRows) {
      if (row.user_id !== userId || row.feature !== feature || row.unit !== unit) continue
      if (row.period_start !== period.period_start) continue
      if (row.status === RESERVATION_STATUS.ROLLED_BACK) continue
      if (row.status === RESERVATION_STATUS.EXPIRED) continue
      if (row.status === RESERVATION_STATUS.PENDING && isExpired(row, nowDate)) continue
      if (row.status === RESERVATION_STATUS.COMMITTED) {
        committed += Number.isInteger(row.actual_quantity) ? row.actual_quantity : row.quantity
        continue
      }
      if (row.status === RESERVATION_STATUS.PENDING) reserved += row.quantity
    }
    const events = await usageRepository.list?.() || []
    for (const event of events) {
      if (reservationIds.has(event.event_id)) continue
      if (String(event.user_id || '') !== userId) continue
      if (event.feature !== feature && event.event_type !== feature) continue
      if (event.unit !== unit) continue
      if (!inPeriod(event.occurred_at, period)) continue
      committed += Number(event.quantity) || 0
    }
    return { committed, reserved, used: committed + reserved }
  }

  async function inspect({ userId, feature: featureInput, unit: unitInput, clientClaim = {} }) {
    if (!userId || !UUID_RE.test(String(userId))) {
      return quotaResult(QUOTA_STATUS.DENIED_NO_USER)
    }
    const featureId = resolveFeatureId(featureInput)
    const definition = getFeatureDefinition(featureId)
    if (!featureId || !definition) {
      return quotaResult(QUOTA_STATUS.DENIED_UNKNOWN_FEATURE)
    }
    void clientClaim
    const nowDate = now()
    const assignment = await assignments.get(userId)
    const plan = getPlanById(assignment.plan_id, catalog)
    if (!plan) return quotaResult(QUOTA_STATUS.DENIED_UNKNOWN_PLAN)
    const period = periodBounds(plan.billing_interval, nowDate)

    if (!definition.metered) {
      return quotaResult(QUOTA_STATUS.ALLOWED_UNMETERED, {
        limit: LIMIT_KIND.UNLIMITED,
        period_end: period.period_end,
        period_start: period.period_start,
        remaining: null,
        unit: definition.unit,
        used: 0,
      })
    }

    const entitlement = getPlanEntitlement(plan, featureId)
    if (!entitlement || entitlement.enabled !== true) {
      return quotaResult(QUOTA_STATUS.DENIED_DISABLED, {
        period_end: period.period_end,
        period_start: period.period_start,
        unit: definition.unit,
      })
    }
    const unit = String(unitInput || entitlement.unit).trim()
    if (unit !== entitlement.unit) {
      return quotaResult(QUOTA_STATUS.DENIED_UNIT_MISMATCH, {
        period_end: period.period_end,
        period_start: period.period_start,
        unit: entitlement.unit,
      })
    }
    if (isUnlimitedLimit(entitlement.limit)) {
      return quotaResult(QUOTA_STATUS.UNLIMITED, {
        limit: LIMIT_KIND.UNLIMITED,
        period_end: period.period_end,
        period_start: period.period_start,
        remaining: null,
        unit,
        used: 0,
      })
    }
    const usage = await periodUsage({
      feature: featureId,
      nowDate,
      period,
      unit,
      userId,
    })
    const limit = limitValue(entitlement.limit)
    return quotaResult(QUOTA_STATUS.ALLOWED, {
      limit,
      period_end: period.period_end,
      period_start: period.period_start,
      remaining: Math.max(0, limit - usage.used),
      reserved: usage.reserved,
      unit,
      used: usage.committed,
    })
  }

  async function reserve({
    clientClaim = {},
    expires_at = null,
    feature,
    quantity,
    reservation_id,
    unit,
    userId,
  }) {
    const qty = parseQuotaQuantity(quantity)
    const featureId = resolveFeatureId(feature) || feature
    const lockKey = `${userId}:${featureId}`
    return mutex.runExclusive(lockKey, async () => {
      if (qty === null) return quotaResult(QUOTA_STATUS.DENIED_INVALID_QUANTITY)
      if (reservation_id) {
        const existing = await reservations.get(reservation_id)
        if (existing) {
          if (existing.user_id !== userId || existing.feature !== featureId || existing.quantity !== qty) {
            return quotaResult(QUOTA_STATUS.DENIED_INVALID_QUANTITY, { reservation_id })
          }
          const snapshot = await inspect({ clientClaim, feature, unit, userId })
          const status = existing.status === RESERVATION_STATUS.PENDING
            ? QUOTA_STATUS.RESERVED
            : existing.status
          return quotaResult(status, { ...snapshot, reservation_id: existing.reservation_id })
        }
      }
      if (qty === 0) {
        const snapshot = await inspect({ clientClaim, feature, unit, userId })
        return {
          ...snapshot,
          status: snapshot.status === QUOTA_STATUS.DENIED_DISABLED ? snapshot.status : QUOTA_STATUS.ALLOWED,
        }
      }
      const snapshot = await inspect({ clientClaim, feature, unit, userId })
      if ([
        QUOTA_STATUS.DENIED_NO_USER,
        QUOTA_STATUS.DENIED_UNKNOWN_FEATURE,
        QUOTA_STATUS.DENIED_UNKNOWN_PLAN,
        QUOTA_STATUS.DENIED_DISABLED,
        QUOTA_STATUS.DENIED_UNIT_MISMATCH,
      ].includes(snapshot.status)) {
        return snapshot
      }
      if (snapshot.status === QUOTA_STATUS.ALLOWED_UNMETERED || snapshot.status === QUOTA_STATUS.UNLIMITED) {
        return snapshot
      }
      if (snapshot.remaining < qty) {
        return quotaResult(QUOTA_STATUS.DENIED_QUOTA_EXCEEDED, snapshot)
      }
      const assignment = await assignments.get(userId)
      const stored = await reservations.insert({
        actual_quantity: null,
        created_at: now().toISOString(),
        expires_at,
        feature: featureId,
        overage_quantity: 0,
        period_end: snapshot.period_end,
        period_start: snapshot.period_start,
        plan_id: assignment.plan_id,
        plan_version: assignment.plan_version,
        quantity: qty,
        reservation_id: reservation_id || randomUUID(),
        status: RESERVATION_STATUS.PENDING,
        unit: snapshot.unit,
        user_id: userId,
      })
      const after = await inspect({ clientClaim, feature, unit, userId })
      return quotaResult(QUOTA_STATUS.RESERVED, {
        ...after,
        reservation_id: stored.reservation_id,
      })
    })
  }

  async function commit({ actual_quantity, reservation_id }) {
    const existing = await reservations.get(reservation_id)
    if (!existing) return quotaResult(QUOTA_STATUS.DENIED_UNKNOWN_FEATURE)
    const lockKey = `${existing.user_id}:${existing.feature}`
    return mutex.runExclusive(lockKey, async () => {
      const row = await reservations.get(reservation_id)
      if (row.status === RESERVATION_STATUS.COMMITTED) {
        return quotaResult(QUOTA_STATUS.COMMITTED, {
          overage_quantity: row.overage_quantity || 0,
          period_end: row.period_end,
          period_start: row.period_start,
          remaining: null,
          reservation_id: row.reservation_id,
          unit: row.unit,
          used: Number.isInteger(row.actual_quantity) ? row.actual_quantity : row.quantity,
        })
      }
      if (row.status !== RESERVATION_STATUS.PENDING) {
        return quotaResult(row.status, { reservation_id: row.reservation_id, unit: row.unit })
      }
      const actual = parseQuotaQuantity(actual_quantity == null ? row.quantity : actual_quantity)
      if (actual === null) {
        return quotaResult(QUOTA_STATUS.DENIED_INVALID_QUANTITY, { reservation_id: row.reservation_id })
      }
      assertReservationTransition(row.status, RESERVATION_STATUS.COMMITTED)
      const overage = Math.max(0, actual - row.quantity)
      const next = await reservations.replace({
        ...row,
        actual_quantity: actual,
        committed_at: now().toISOString(),
        overage_quantity: overage,
        status: RESERVATION_STATUS.COMMITTED,
      })
      const snapshot = await inspect({
        feature: row.feature,
        unit: row.unit,
        userId: row.user_id,
      })
      return quotaResult(QUOTA_STATUS.COMMITTED, {
        ...snapshot,
        integrity: overage > 0 ? 'OVERAGE' : undefined,
        overage_quantity: overage,
        reservation_id: next.reservation_id,
      })
    })
  }

  async function rollback({ reservation_id }) {
    const existing = await reservations.get(reservation_id)
    if (!existing) return quotaResult(QUOTA_STATUS.DENIED_UNKNOWN_FEATURE)
    const lockKey = `${existing.user_id}:${existing.feature}`
    return mutex.runExclusive(lockKey, async () => {
      const row = await reservations.get(reservation_id)
      if (row.status === RESERVATION_STATUS.ROLLED_BACK) {
        const snapshot = await inspect({
          feature: row.feature,
          unit: row.unit,
          userId: row.user_id,
        })
        return quotaResult(QUOTA_STATUS.ROLLED_BACK, {
          ...snapshot,
          reservation_id: row.reservation_id,
        })
      }
      if (row.status === RESERVATION_STATUS.COMMITTED) {
        return quotaResult(QUOTA_STATUS.COMMITTED, {
          reservation_id: row.reservation_id,
          unit: row.unit,
        })
      }
      if (row.status !== RESERVATION_STATUS.PENDING) {
        return quotaResult(row.status, { reservation_id: row.reservation_id, unit: row.unit })
      }
      assertReservationTransition(row.status, RESERVATION_STATUS.ROLLED_BACK)
      await reservations.replace({
        ...row,
        rolled_back_at: now().toISOString(),
        status: RESERVATION_STATUS.ROLLED_BACK,
      })
      const snapshot = await inspect({
        feature: row.feature,
        unit: row.unit,
        userId: row.user_id,
      })
      return quotaResult(QUOTA_STATUS.ROLLED_BACK, {
        ...snapshot,
        reservation_id: row.reservation_id,
      })
    })
  }

  return { commit, inspect, rollback, reserve }
}

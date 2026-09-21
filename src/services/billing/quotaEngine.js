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

function result(status, extra = {}) {
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

function parseQuantity(value) {
  if (value === 0 || value === '0') return 0
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > MAX_QUANTITY) return null
  return n
}

function isExpired(row, now) {
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() <= now.getTime()
}

export function createQuotaEngine({
  assignments = createInMemoryPlanAssignmentStore(),
  catalog = defaultPlanCatalog,
  mutex = createAsyncMutex(),
  now = () => new Date(),
  reservations = createInMemoryReservationStore(),
  usageRepository = getUsageRepository(),
} = {}) {
  async function resolveUserPlan(userId, clientClaim = {}) {
    const assignment = await assignments.get(userId)
    const claimed = clientClaim?.plan_id || clientClaim?.plan
    if (claimed && claimed !== assignment.plan_id) {
      return { assignment, ignored_client_plan: true }
    }
    return { assignment, ignored_client_plan: Boolean(claimed) }
  }

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

  async function inspectUnlocked({
    userId,
    feature: featureInput,
    unit: unitInput,
    clientClaim = {},
  }) {
    if (!userId || !UUID_RE.test(String(userId))) {
      return result(QUOTA_STATUS.DENIED_NO_USER)
    }
    const featureId = resolveFeatureId(featureInput)
    const definition = getFeatureDefinition(featureId)
    if (!featureId || !definition) {
      return result(QUOTA_STATUS.DENIED_UNKNOWN_FEATURE)
    }

    const nowDate = now()
    const { assignment } = await resolveUserPlan(userId, clientClaim)
    const plan = getPlanById(assignment.plan_id, catalog)
    if (!plan) return result(QUOTA_STATUS.DENIED_UNKNOWN_PLAN)

    const periodToUse = periodBounds(plan.billing_interval, nowDate)

    if (!definition.metered) {
      return result(QUOTA_STATUS.ALLOWED_UNMETERED, {
        limit: LIMIT_KIND.UNLIMITED,
        period_end: periodToUse.period_end,
        period_start: periodToUse.period_start,
        remaining: null,
        unit: definition.unit,
        used: 0,
      })
    }

    const entitlement = getPlanEntitlement(plan, featureId)
    if (!entitlement || entitlement.enabled !== true) {
      return result(QUOTA_STATUS.DENIED_DISABLED, {
        period_end: periodToUse.period_end,
        period_start: periodToUse.period_start,
        unit: definition.unit,
      })
    }

    const unit = String(unitInput || entitlement.unit).trim()
    if (unit !== entitlement.unit) {
      return result(QUOTA_STATUS.DENIED_UNIT_MISMATCH, {
        period_end: periodToUse.period_end,
        period_start: periodToUse.period_start,
        unit: entitlement.unit,
      })
    }

    if (isUnlimitedLimit(entitlement.limit)) {
      return result(QUOTA_STATUS.UNLIMITED, {
        limit: LIMIT_KIND.UNLIMITED,
        period_end: periodToUse.period_end,
        period_start: periodToUse.period_start,
        remaining: null,
        unit,
        used: 0,
      })
    }

    const usage = await periodUsage({
      feature: featureId,
      nowDate,
      period: periodToUse,
      unit,
      userId,
    })
    const limit = limitValue(entitlement.limit)
    return result(QUOTA_STATUS.ALLOWED, {
      limit,
      period_end: periodToUse.period_end,
      period_start: periodToUse.period_start,
      remaining: Math.max(0, limit - usage.used),
      reserved: usage.reserved,
      unit,
      used: usage.committed,
    })
  }

  async function reserveQuota({
    clientClaim = {},
    expires_at = null,
    feature,
    quantity,
    unit,
    user,
  } = {}) {
    const userId = typeof user === 'string' ? user : user?.id || user?.user_id || ''
    const qty = parseQuantity(quantity)
    const lockKey = `${userId}:${resolveFeatureId(feature) || feature}`

    return mutex.runExclusive(lockKey, async () => {
      if (qty === null) {
        return result(QUOTA_STATUS.DENIED_INVALID_QUANTITY)
      }
      if (qty === 0) {
        const snapshot = await inspectUnlocked({ clientClaim, feature, unit, userId })
        return { ...snapshot, status: snapshot.status === QUOTA_STATUS.DENIED_DISABLED ? snapshot.status : QUOTA_STATUS.ALLOWED }
      }

      const snapshot = await inspectUnlocked({ clientClaim, feature, unit, userId })
      if (snapshot.status === QUOTA_STATUS.DENIED_NO_USER
        || snapshot.status === QUOTA_STATUS.DENIED_UNKNOWN_FEATURE
        || snapshot.status === QUOTA_STATUS.DENIED_UNKNOWN_PLAN
        || snapshot.status === QUOTA_STATUS.DENIED_DISABLED
        || snapshot.status === QUOTA_STATUS.DENIED_UNIT_MISMATCH) {
        return snapshot
      }
      if (snapshot.status === QUOTA_STATUS.ALLOWED_UNMETERED || snapshot.status === QUOTA_STATUS.UNLIMITED) {
        return snapshot
      }

      if (snapshot.remaining < qty) {
        return result(QUOTA_STATUS.DENIED_QUOTA_EXCEEDED, snapshot)
      }

      const featureId = resolveFeatureId(feature)
      const nowDate = now()
      const stored = await reservations.insert({
        actual_quantity: null,
        created_at: nowDate.toISOString(),
        expires_at,
        feature: featureId,
        overage_quantity: 0,
        period_end: snapshot.period_end,
        period_start: snapshot.period_start,
        plan_id: (await assignments.get(userId)).plan_id,
        plan_version: (await assignments.get(userId)).plan_version,
        quantity: qty,
        status: RESERVATION_STATUS.PENDING,
        unit: snapshot.unit,
        user_id: userId,
      })

      const after = await inspectUnlocked({ clientClaim, feature, unit, userId })
      return result(QUOTA_STATUS.RESERVED, {
        ...after,
        remaining: after.remaining,
        reservation_id: stored.reservation_id,
        reserved: after.reserved,
        used: after.used,
      })
    })
  }

  async function commitReservation({ actual_quantity, reservation_id } = {}) {
    const existing = await reservations.get(reservation_id)
    if (!existing) {
      return result(QUOTA_STATUS.DENIED_UNKNOWN_FEATURE)
    }
    const lockKey = `${existing.user_id}:${existing.feature}`
    return mutex.runExclusive(lockKey, async () => {
      const row = await reservations.get(reservation_id)
      if (row.status === RESERVATION_STATUS.COMMITTED) {
        return result(QUOTA_STATUS.COMMITTED, {
          limit: null,
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
        return result(QUOTA_STATUS.ROLLED_BACK, { reservation_id: row.reservation_id, unit: row.unit })
      }

      const actual = parseQuantity(actual_quantity == null ? row.quantity : actual_quantity)
      if (actual === null) return result(QUOTA_STATUS.DENIED_INVALID_QUANTITY, { reservation_id: row.reservation_id })

      const overage = Math.max(0, actual - row.quantity)
      const next = await reservations.replace({
        ...row,
        actual_quantity: actual,
        committed_at: now().toISOString(),
        overage_quantity: overage,
        status: RESERVATION_STATUS.COMMITTED,
      })
      const snapshot = await inspectUnlocked({
        feature: row.feature,
        unit: row.unit,
        userId: row.user_id,
      })
      return result(QUOTA_STATUS.COMMITTED, {
        ...snapshot,
        integrity: overage > 0 ? 'OVERAGE' : undefined,
        overage_quantity: overage,
        remaining: snapshot.remaining,
        reservation_id: next.reservation_id,
      })
    })
  }

  async function rollbackReservation({ reservation_id } = {}) {
    const existing = await reservations.get(reservation_id)
    if (!existing) return result(QUOTA_STATUS.DENIED_UNKNOWN_FEATURE)
    const lockKey = `${existing.user_id}:${existing.feature}`
    return mutex.runExclusive(lockKey, async () => {
      const row = await reservations.get(reservation_id)
      if (row.status === RESERVATION_STATUS.ROLLED_BACK) {
        const snapshot = await inspectUnlocked({
          feature: row.feature,
          unit: row.unit,
          userId: row.user_id,
        })
        return result(QUOTA_STATUS.ROLLED_BACK, {
          ...snapshot,
          reservation_id: row.reservation_id,
        })
      }
      if (row.status === RESERVATION_STATUS.COMMITTED) {
        return result(QUOTA_STATUS.COMMITTED, { reservation_id: row.reservation_id, unit: row.unit })
      }
      await reservations.replace({
        ...row,
        rolled_back_at: now().toISOString(),
        status: RESERVATION_STATUS.ROLLED_BACK,
      })
      const snapshot = await inspectUnlocked({
        feature: row.feature,
        unit: row.unit,
        userId: row.user_id,
      })
      return result(QUOTA_STATUS.ROLLED_BACK, {
        ...snapshot,
        reservation_id: row.reservation_id,
      })
    })
  }

  return {
    commitReservation,
    inspectQuota: inspectUnlocked,
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

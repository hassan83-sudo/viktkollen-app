import { createSupabaseAdminClient } from '../supabaseServer.js'
import { QUOTA_STATUS } from '../../../src/services/billing/catalog.js'
import { resolveFeatureId } from '../../../src/services/billing/features.js'
import { periodBounds } from '../../../src/services/billing/period.js'

/**
 * Same feature set as billing.reserve_quota. A display read must not call
 * that function: quantity 0 still inserts billing.quota_period_locks.
 */
const RESERVE_FEATURES = new Set([
  'ai.ear.interpret',
  'ai.eye.analysis',
  'ai.text.request',
  'ai.voice.session',
  'body.scan',
  'food.scan',
  'gps.live.session',
  'tts.request',
  'friend_chat',
  'gps_standard',
  'ready_avatar',
  'smart_ai',
])

const UNMETERED_FEATURES = new Set([
  'friend_chat',
  'gps_standard',
  'ready_avatar',
  'smart_ai',
])

function denied(status, extra = {}) {
  return {
    feature: extra.feature || null,
    limit: extra.limit ?? null,
    period_end: extra.period_end || null,
    period_start: extra.period_start || null,
    plan_id: extra.plan_id || null,
    remaining: extra.remaining ?? null,
    reserved: extra.reserved ?? 0,
    status,
    unit: extra.unit || null,
    used: extra.used ?? 0,
  }
}

/**
 * Matches billing.quota_period_used: committed uses actual quantity when
 * present, and pending counts only while unexpired.
 */
export function summarizeQuotaReservations(rows, now = new Date()) {
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime()
  let committed = 0
  let reserved = 0
  for (const row of rows || []) {
    if (row?.status === 'COMMITTED') {
      const actual = row.actual_quantity
      committed += Number.isInteger(actual) ? actual : Number(row.quantity) || 0
    } else if (row?.status === 'PENDING') {
      const expires = row.expires_at ? new Date(row.expires_at).getTime() : null
      if (expires == null || expires > at) reserved += Number(row.quantity) || 0
    }
  }
  return { committed, reserved }
}

async function maybeSingle(query) {
  const { data, error } = await query.maybeSingle()
  if (error) {
    const wrapped = new Error('quota_read_failed')
    wrapped.code = 'quota_read_failed'
    throw wrapped
  }
  return data || null
}

async function listRows(query) {
  const { data, error } = await query
  if (error) {
    const wrapped = new Error('quota_read_failed')
    wrapped.code = 'quota_read_failed'
    throw wrapped
  }
  return data || []
}

export async function readDurableQuota({
  client = createSupabaseAdminClient(),
  feature,
  now = new Date(),
  unit,
  userId,
} = {}) {
  if (!client || typeof client.schema !== 'function') return { unavailable: true }
  const featureId = resolveFeatureId(feature)
  if (!featureId || !RESERVE_FEATURES.has(featureId)) {
    return { quota: denied(QUOTA_STATUS.DENIED_UNKNOWN_FEATURE, { feature: featureId }), unavailable: false }
  }
  try {
    const billing = client.schema('billing')
    const assignment = await maybeSingle(
      billing.from('user_plan_assignments').select('plan_id, plan_version').eq('user_id', userId),
    )
    const planId = assignment?.plan_id || 'plan.free'
    const plan = await maybeSingle(
      billing.from('plans').select('plan_id, billing_interval, active').eq('plan_id', planId),
    )
    if (!plan || plan.active !== true) {
      return { quota: denied(QUOTA_STATUS.DENIED_UNKNOWN_PLAN, { feature: featureId, plan_id: planId }), unavailable: false }
    }
    const period = periodBounds(plan.billing_interval || 'month', now)
    const entitlement = await maybeSingle(
      billing.from('plan_entitlements').select('enabled, limit_kind, limit_value, unit').eq('plan_id', plan.plan_id).eq('feature', featureId),
    )
    if (!entitlement) {
      return {
        quota: denied(QUOTA_STATUS.DENIED_UNKNOWN_FEATURE, {
          feature: featureId,
          period_end: period.period_end,
          period_start: period.period_start,
          plan_id: plan.plan_id,
        }),
        unavailable: false,
      }
    }
    if (entitlement.enabled !== true) {
      return {
        quota: denied(QUOTA_STATUS.DENIED_DISABLED, {
          feature: featureId,
          period_end: period.period_end,
          period_start: period.period_start,
          plan_id: plan.plan_id,
          unit: entitlement.unit,
        }),
        unavailable: false,
      }
    }
    const requestedUnit = unit == null || unit === '' ? entitlement.unit : unit
    if (requestedUnit !== entitlement.unit) {
      return {
        quota: denied(QUOTA_STATUS.DENIED_UNIT_MISMATCH, {
          feature: featureId,
          period_end: period.period_end,
          period_start: period.period_start,
          plan_id: plan.plan_id,
          unit: entitlement.unit,
        }),
        unavailable: false,
      }
    }
    if (UNMETERED_FEATURES.has(featureId)) {
      return {
        quota: denied(QUOTA_STATUS.ALLOWED_UNMETERED, {
          feature: featureId,
          period_end: period.period_end,
          period_start: period.period_start,
          plan_id: plan.plan_id,
          unit: entitlement.unit,
        }),
        unavailable: false,
      }
    }
    if (entitlement.limit_kind === 'UNLIMITED') {
      return {
        quota: denied(QUOTA_STATUS.UNLIMITED, {
          feature: featureId,
          period_end: period.period_end,
          period_start: period.period_start,
          plan_id: plan.plan_id,
          unit: entitlement.unit,
        }),
        unavailable: false,
      }
    }
    const limit = entitlement.limit_value
    if (!Number.isInteger(limit) || limit < 0) {
      return { quota: denied(QUOTA_STATUS.DENIED_UNKNOWN_PLAN, { feature: featureId, plan_id: plan.plan_id }), unavailable: false }
    }
    const reservations = await listRows(
      billing.from('quota_reservations')
        .select('status, quantity, actual_quantity, expires_at, period_start')
        .eq('user_id', userId)
        .eq('feature', featureId)
        .eq('unit', entitlement.unit),
    )
    const periodStart = new Date(period.period_start).getTime()
    const inPeriod = reservations.filter((row) => new Date(row.period_start).getTime() === periodStart)
    const usage = summarizeQuotaReservations(inPeriod, now)
    const remaining = Math.max(0, limit - usage.committed - usage.reserved)
    return {
      quota: {
        feature: featureId,
        limit,
        period_end: period.period_end,
        period_start: period.period_start,
        plan_id: plan.plan_id,
        remaining,
        reserved: usage.reserved,
        status: remaining > 0 ? QUOTA_STATUS.ALLOWED : QUOTA_STATUS.DENIED_QUOTA_EXCEEDED,
        unit: entitlement.unit,
        used: usage.committed,
      },
      unavailable: false,
    }
  } catch {
    return { unavailable: true }
  }
}

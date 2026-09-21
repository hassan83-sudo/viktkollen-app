import { SUBSCRIPTION_STATUS } from './catalog.js'
import { getPlanById } from './planCatalog.js'

export const BASELINE_PLAN_ID = 'plan.free'

function inPeriod(row, nowDate) {
  const start = new Date(row.current_period_start).getTime()
  const end = new Date(row.current_period_end).getTime()
  const t = nowDate.getTime()
  return t >= start && t < end
}

export function isEntitledStatus(row, nowDate) {
  if (!inPeriod(row, nowDate)) return false
  if (row.status === SUBSCRIPTION_STATUS.TRIALING) return true
  if (row.status === SUBSCRIPTION_STATUS.ACTIVE) return true
  if (row.status === SUBSCRIPTION_STATUS.PAST_DUE) {
    if (!row.past_due_grace_until) return false
    return nowDate.getTime() < new Date(row.past_due_grace_until).getTime()
  }
  return false
}

function pickDeterministic(rows) {
  return [...rows].sort((a, b) => {
    const end = String(b.current_period_end).localeCompare(String(a.current_period_end))
    if (end) return end
    return String(a.subscription_id).localeCompare(String(b.subscription_id))
  })[0]
}

/**
 * Server-authoritative effective plan. Ignores client claims.
 * Open uniqueness (DB): TRIALING, ACTIVE, PAST_DUE, PAUSED.
 * Entitled: TRIALING/ACTIVE in period; PAST_DUE only with explicit grace.
 * PAUSED is open (blocks a second create) but not entitled.
 * Historical subscriptions may keep inactive plan_id; resolver still uses that
 * snapshot for entitlement until the period ends. New assignments must not
 * target inactive plans (enforced at create).
 */
export function resolveEffectivePlan({
  catalog,
  clientClaim = {},
  now = new Date(),
  subscriptions = [],
} = {}) {
  void clientClaim
  const nowDate = now instanceof Date ? now : new Date(now)
  const entitled = (subscriptions || []).filter((row) => isEntitledStatus(row, nowDate))
  if (!entitled.length) {
    const baseline = getPlanById(BASELINE_PLAN_ID, catalog)
    return {
      plan: baseline,
      plan_id: BASELINE_PLAN_ID,
      plan_version: baseline?.version || 1,
      reason: 'NO_SUBSCRIPTION',
      source: 'baseline',
      subscription: null,
    }
  }
  const chosen = pickDeterministic(entitled)
  const plan = getPlanById(chosen.plan_id, catalog)
  if (!plan) {
    const baseline = getPlanById(BASELINE_PLAN_ID, catalog)
    return {
      plan: baseline,
      plan_id: BASELINE_PLAN_ID,
      plan_version: baseline?.version || 1,
      reason: 'UNKNOWN_PLAN',
      source: 'baseline',
      subscription: chosen,
    }
  }
  return {
    plan,
    plan_id: plan.id,
    plan_version: chosen.plan_version || plan.version,
    reason: chosen.status,
    source: 'subscription',
    subscription: chosen,
  }
}

export function toClientSafeSubscription(row, effective) {
  if (!row && !effective) return null
  return {
    cancel_at_period_end: row?.cancel_at_period_end === true,
    current_period_end: row?.current_period_end || null,
    current_period_start: row?.current_period_start || null,
    plan_id: effective?.plan_id || BASELINE_PLAN_ID,
    status: row?.status || 'NONE',
  }
}

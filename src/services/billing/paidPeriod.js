/**
 * A paid assignment grants access only while its period end is still ahead.
 * A missing end is left unchanged here so older in-memory fixtures keep working.
 * PostgreSQL reserve_quota does not use that exception: a paid plan without an
 * open subscription period is the free plan.
 */
export function planIdForOpenPeriod({ assignedPlanId = 'plan.free', now = new Date(), periodEnd = null } = {}) {
  const planId = assignedPlanId || 'plan.free'
  if (planId === 'plan.free') return 'plan.free'
  if (periodEnd == null || periodEnd === '') return planId
  const end = new Date(periodEnd)
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return 'plan.free'
  return planId
}

/** Database-backed eligibility; missing or invalid subscription dates deny access. */
export function planIdForSubscription({ assignedPlanId = 'plan.free', source, subscription, now = new Date() } = {}) {
  if (!assignedPlanId || assignedPlanId === 'plan.free') return 'plan.free'
  if (source === 'admin-seed') return assignedPlanId
  const at = new Date(now).getTime()
  const start = new Date(subscription?.current_period_start || '').getTime()
  const end = new Date(subscription?.current_period_end || '').getTime()
  if (!Number.isFinite(at) || !Number.isFinite(start) || !Number.isFinite(end) || at < start || at >= end) return 'plan.free'
  if (subscription.status === 'ACTIVE' || subscription.status === 'TRIALING') return assignedPlanId
  const grace = new Date(subscription.past_due_grace_until || '').getTime()
  return subscription.status === 'PAST_DUE' && Number.isFinite(grace) && at < grace ? assignedPlanId : 'plan.free'
}

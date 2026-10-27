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

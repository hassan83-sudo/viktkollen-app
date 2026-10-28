// Samma regel som billing.effective_quota_plan_id (reserve_quota): en plan som
// kommer från ett abonnemang (source 'server') gäller bara medan något av
// användarens abonnemang för planen är i sin betalda period. Manuella
// tilldelningar ('admin-seed', 'server-default') och gratisplanen gäller som förut.

export function subscriptionInPaidPeriod(row, now = new Date()) {
  const at = now.getTime()
  const start = new Date(row?.current_period_start).getTime()
  const end = new Date(row?.current_period_end).getTime()
  if (!(at >= start && at < end)) return false
  if (row.status === 'TRIALING' || row.status === 'ACTIVE') return true
  return row.status === 'PAST_DUE' && row.past_due_grace_until != null
    && at < new Date(row.past_due_grace_until).getTime()
}

export const EFFECTIVE_PLAN_SUBSCRIPTION_COLUMNS = 'plan_id, status, current_period_start, current_period_end, past_due_grace_until'

/**
 * assignment: { plan_id, source } or null.
 * loadSubscriptions(planId): the user's subscription rows for that plan.
 */
export async function effectivePlanId(assignment, loadSubscriptions, now = new Date()) {
  const planId = assignment?.plan_id || 'plan.free'
  if (assignment?.source !== 'server' || planId === 'plan.free') return planId
  const rows = await loadSubscriptions(planId)
  return (Array.isArray(rows) ? rows : []).some((row) => subscriptionInPaidPeriod(row, now)) ? planId : 'plan.free'
}

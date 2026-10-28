import { periodBounds } from './period.js'

/**
 * Free plans and recurring subscriptions stay on the calendar interval.
 * A verified one-time purchase opts in with quota_window = 'subscription'
 * and then uses that subscription's stored start and end.
 */
export function quotaPeriodForPlan({
  now = new Date(),
  planInterval = 'month',
  subscription = null,
} = {}) {
  const at = now instanceof Date ? now : new Date(now)
  const calendar = periodBounds(planInterval || 'month', at)
  if (subscription?.quota_window !== 'subscription') return calendar
  const start = new Date(subscription.current_period_start || '')
  const end = new Date(subscription.current_period_end || '')
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return calendar
  }
  if (at.getTime() < start.getTime() || at.getTime() >= end.getTime()) return calendar
  return {
    period_end: end.toISOString(),
    period_start: start.toISOString(),
    plan_id: subscription.plan_id || null,
    quota_window: 'subscription',
  }
}

/**
 * New rows match the active period start. Older paid rows keep the calendar
 * stamp they were written with, and still count when they were created inside
 * the paid window. Free-plan rows and token rows stay out.
 */
export function reservationCountsTowardQuota(row, { period, planId = null } = {}) {
  if (!row || !period?.period_start) return false
  if (new Date(row.period_start).getTime() === new Date(period.period_start).getTime()) return true
  if (period.quota_window !== 'subscription' || !planId || row.plan_id !== planId) return false
  const created = new Date(row.created_at || '').getTime()
  const start = new Date(period.period_start).getTime()
  const end = new Date(period.period_end || '').getTime()
  return !Number.isNaN(created) && created >= start && created < end
}

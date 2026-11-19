import { BASELINE_PLAN_ID } from './effectivePlan.js'

export function hasForgottenCameraAccess(subscription, now = Date.now()) {
  return Boolean(
    subscription?.status === 'ACTIVE'
    && subscription.plan_id
    && subscription.plan_id !== BASELINE_PLAN_ID
    && Date.parse(subscription.current_period_start) <= now
    && Date.parse(subscription.current_period_end) > now,
  )
}

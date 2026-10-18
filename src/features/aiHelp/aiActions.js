// The only customer actions the assistant may offer. Chat text and model output cannot add to this list.
const PLAN_ID_RE = /^[A-Za-z0-9._-]{1,80}$/

export const AI_ACTIONS = Object.freeze({
  delete_account: Object.freeze({
    id: 'delete_account',
    sensitive: true,
  }),
  hosted_checkout: Object.freeze({
    id: 'hosted_checkout',
    sensitive: true,
  }),
  password_reset: Object.freeze({
    id: 'password_reset',
    sensitive: true,
  }),
  plan_change: Object.freeze({
    id: 'plan_change',
    sensitive: true,
  }),
  schedule_cancel: Object.freeze({
    id: 'schedule_cancel',
    sensitive: true,
  }),
  undo_cancel: Object.freeze({
    id: 'undo_cancel',
    sensitive: true,
  }),
})

export function acceptedPlanId(value) {
  const planId = String(value || '').trim()
  if (!PLAN_ID_RE.test(planId) || planId === 'plan.free') return ''
  return planId
}

export function knownAiActionId(value) {
  const id = typeof value === 'string' ? value : value?.action || value?.id
  return AI_ACTIONS[String(id || '')]?.id || null
}

export function sanitizeAiAction(value) {
  const id = knownAiActionId(value)
  if (!id) return null
  if (id !== 'plan_change' && id !== 'hosted_checkout') return { action: id, sensitive: true }
  if (typeof value !== 'object' || value == null) return null
  const planId = acceptedPlanId(value.planId || value.plan_id)
  if (!planId) return null
  return { action: id, planId, sensitive: true }
}

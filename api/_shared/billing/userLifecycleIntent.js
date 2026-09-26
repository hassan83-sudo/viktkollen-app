import { createHash } from 'node:crypto'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import { createServerSubscriptionLifecycle } from './subscriptionLifecycleServer.js'
import { readDurableUserSubscription, toPublicSubscription } from './subscriptionRead.js'

const OPEN_STATUS = new Set(['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'])
const PLAN_ID_RE = /^[A-Za-z0-9._-]{1,80}$/
const ACTIONS = new Set(['plan_change', 'schedule_cancel', 'undo_cancel'])

const ERRORS = Object.freeze({
  billing_rpc_failed: ['BILLING_FAILED', 500],
  duplicate_external_event: ['DUPLICATE_EVENT', 409],
  durable_operation_unavailable: ['DURABLE_UNAVAILABLE', 503],
  illegal_subscription_transition: ['OPERATION_NOT_ALLOWED', 409],
  inactive_plan: ['INVALID_PLAN', 400],
  invalid_pending_plan: ['INVALID_PLAN', 400],
  period_expired: ['OPERATION_NOT_ALLOWED', 409],
  subscription_not_found: ['SUBSCRIPTION_MISSING', 404],
  unknown_plan: ['INVALID_PLAN', 400],
})

let depsOverride = null

export function setLifecycleIntentDepsForTests(deps = null) {
  depsOverride = deps
}

function fail(code, status) {
  return { code, ok: false, status }
}

function mappedError(error) {
  const known = ERRORS[error?.code]
  if (known) return fail(known[0], known[1])
  return fail('BILLING_FAILED', 500)
}

function serverEventId(action, userId, subscriptionId, marker) {
  const digest = createHash('sha256')
    .update(`${action}|${userId}|${subscriptionId}|${marker}`)
    .digest('hex')
    .slice(0, 40)
  return `ui.${digest}`
}

function readBody(body) {
  if (!body) return {}
  if (typeof body === 'object') return body
  try {
    const parsed = JSON.parse(body)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function maybeSingle(query) {
  const { data, error } = await query.maybeSingle()
  if (error) {
    const wrapped = new Error('plan_sale_read_failed')
    wrapped.code = 'durable_operation_unavailable'
    throw wrapped
  }
  return data || null
}

export async function readServerPlanSale(client, planId) {
  const billing = client.schema('billing')
  const plan = await maybeSingle(
    billing.from('plans').select('plan_id, active').eq('plan_id', planId),
  )
  const { data, error } = await billing.rpc('plan_enabled_for_sale', { p_plan_id: planId })
  if (error) {
    const wrapped = new Error('plan_sale_read_failed')
    wrapped.code = 'durable_operation_unavailable'
    throw wrapped
  }
  return {
    active: plan?.active === true,
    enabledForSale: data === true,
    known: Boolean(plan),
  }
}

function liveDeps() {
  const client = createSupabaseAdminClient()
  if (!client) return null
  return {
    lifecycle: createServerSubscriptionLifecycle({ client }).lifecycle,
    readSale: (planId) => readServerPlanSale(client, planId),
    readSubscription: (userId) => readDurableUserSubscription(userId, client),
  }
}

function publicAssignment(assignment) {
  if (!assignment || typeof assignment !== 'object') return null
  return {
    plan_id: assignment.plan_id || null,
    source: assignment.source || null,
  }
}

export async function executeUserBillingIntent({
  action,
  body,
  deps = depsOverride || liveDeps(),
  userId,
} = {}) {
  if (!ACTIONS.has(action)) return fail('BILLING_FAILED', 500)
  if (!deps?.lifecycle || typeof deps.readSubscription !== 'function') {
    return fail('DURABLE_UNAVAILABLE', 503)
  }
  const input = readBody(body)
  void input.current_period_end
  void input.enabled_for_sale
  void input.entitlement
  void input.entitlements
  void input.external_event_id
  void input.grace_until
  void input.past_due_grace_until
  void input.price
  void input.price_minor
  void input.provider_customer_ref
  void input.provider_subscription_ref
  void input.quota
  void input.status
  void input.subscription_id
  void input.usage
  void input.user_id

  const current = await deps.readSubscription(userId)
  if (current?.unavailable) return fail('DURABLE_UNAVAILABLE', 503)
  if (!current?.subscriptionId || !OPEN_STATUS.has(current.subscription?.status)) {
    return fail('SUBSCRIPTION_MISSING', 404)
  }

  try {
    if (action === 'plan_change') {
      const planId = String(input.plan_id || '').trim()
      if (!PLAN_ID_RE.test(planId) || planId === 'plan.free' || planId === current.subscription.plan_id) {
        return fail('INVALID_PLAN', 400)
      }
      if (typeof deps.readSale !== 'function') return fail('DURABLE_UNAVAILABLE', 503)
      const sale = await deps.readSale(planId)
      if (!sale?.known || sale.active !== true || sale.enabledForSale !== true) {
        return fail('INVALID_PLAN', 400)
      }
      const eventId = serverEventId(action, userId, current.subscriptionId, `${planId}|${current.subscription.current_period_end || ''}`)
      const result = await deps.lifecycle.scheduleNextPeriodPlanChange({
        clientClaim: {},
        external_event_id: eventId,
        plan_id: planId,
        subscription_id: current.subscriptionId,
      })
      return {
        assignment: publicAssignment(result?.assignment),
        ok: true,
        status: 200,
        subscription: toPublicSubscription(result?.subscription),
      }
    }

    const eventId = serverEventId(action, userId, current.subscriptionId, current.subscription.current_period_end || '')
    const result = action === 'schedule_cancel'
      ? await deps.lifecycle.scheduleCancelAtPeriodEnd({
        clientClaim: {},
        external_event_id: eventId,
        subscription_id: current.subscriptionId,
      })
      : await deps.lifecycle.clearCancelAtPeriodEnd({
        clientClaim: {},
        external_event_id: eventId,
        subscription_id: current.subscriptionId,
      })
    return {
      assignment: publicAssignment(result?.assignment),
      ok: true,
      status: 200,
      subscription: toPublicSubscription(result?.subscription),
    }
  } catch (error) {
    return mappedError(error)
  }
}

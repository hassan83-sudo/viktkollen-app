import { createSupabaseAdminClient } from '../supabaseServer.js'
import {
  createPrivilegedSubscriptionAuthority,
  SUBSCRIPTION_RPC,
} from '../../../src/services/billing/subscriptionAuthority.js'
import { PLAN_ASSIGNMENT_RPC } from '../../../src/services/billing/planAssignmentSync.js'

const SAFE_MESSAGES = new Map([
  ['duplicate_external_event', 'duplicate_external_event'],
  ['duplicate_open_subscription', 'duplicate_open_subscription'],
  ['durable_operation_unavailable', 'durable_operation_unavailable'],
  ['grace_cannot_extend', 'grace_cannot_extend'],
  ['illegal_subscription_transition', 'illegal_subscription_transition'],
  ['inactive_plan', 'inactive_plan'],
  ['invalid_event_id', 'invalid_event_id'],
  ['invalid_pending_plan', 'invalid_pending_plan'],
  ['invalid_period', 'invalid_period'],
  ['invalid_status', 'invalid_status'],
  ['invalid_user_id', 'invalid_user_id'],
  ['period_expired', 'period_expired'],
  ['subscription_not_found', 'subscription_not_found'],
  ['unknown_plan', 'unknown_plan'],
])

function unavailable() {
  const error = new Error('durable_operation_unavailable')
  error.code = 'durable_operation_unavailable'
  throw error
}

function safeError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

export function mapBillingRpcError(error) {
  if (error?.code === '23505') return safeError('duplicate_external_event')
  const message = String(error?.message || '').trim()
  if (SAFE_MESSAGES.has(message)) return safeError(SAFE_MESSAGES.get(message))
  if (message.startsWith('illegal subscription transition')) {
    return safeError('illegal_subscription_transition')
  }
  return safeError('billing_rpc_failed')
}

function allowedRpcNames() {
  return new Set([
    ...Object.values(SUBSCRIPTION_RPC),
    PLAN_ASSIGNMENT_RPC,
  ])
}

/**
 * Server-only billing RPC caller. Reuses the existing service-role admin
 * client. It does not construct a second Supabase client and it does not
 * fall back to the in-memory subscription store.
 */
export function createServerSubscriptionRpcCaller({ client, env } = {}) {
  const resolved = client !== undefined ? client : createSupabaseAdminClient(env)
  if (!resolved || typeof resolved.schema !== 'function') unavailable()
  const allowed = allowedRpcNames()
  return async function callRpc(name, args) {
    const fn = String(name || '')
    if (!fn.startsWith('billing.') || !allowed.has(fn)) unavailable()
    try {
      const { data, error } = await resolved.schema('billing').rpc(fn.slice('billing.'.length), args || {})
      if (error) throw mapBillingRpcError(error)
      return data
    } catch (error) {
      if (SAFE_MESSAGES.has(error?.code) && error?.message === error.code) throw error
      throw mapBillingRpcError(error)
    }
  }
}

export function createServerPrivilegedSubscriptionAuthority({
  callRpc = null,
  catalog,
  client,
  env,
  now,
} = {}) {
  const resolved = typeof callRpc === 'function'
    ? callRpc
    : createServerSubscriptionRpcCaller({ client, env })
  return createPrivilegedSubscriptionAuthority({ callRpc: resolved, catalog, now })
}

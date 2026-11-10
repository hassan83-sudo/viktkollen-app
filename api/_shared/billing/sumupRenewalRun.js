import { createSupabaseAdminClient } from '../supabaseServer.js'
import { readSumUpConfig, createSumUpHttpTransport, SUMUP_PROVIDER } from './providers/sumup.js'
import { createServerSubscriptionLifecycle } from './subscriptionLifecycleServer.js'
import {
  createServerSumUpInstrumentFingerprintReader,
  createServerSumUpRenewalClaimer,
  createServerSumUpRenewalFinisher,
  createServerSumUpRenewalReserver,
  createSumUpRecurring,
  SUMUP_INSTRUMENT_FINGERPRINT_RPC,
  SUMUP_RENEWAL_CLAIM_RPC,
  SUMUP_RENEWAL_FINISH_RPC,
  SUMUP_RENEWAL_RESERVE_RPC,
} from './sumupRecurring.js'

const DUE_STATUS = new Set(['ACTIVE', 'PAST_DUE'])
const RENEWAL_RPC = new Set([
  SUMUP_INSTRUMENT_FINGERPRINT_RPC,
  SUMUP_RENEWAL_CLAIM_RPC,
  SUMUP_RENEWAL_FINISH_RPC,
  SUMUP_RENEWAL_RESERVE_RPC,
])
const SUBSCRIPTION_COLUMNS = 'subscription_id, user_id, provider, status, plan_id, current_period_end, cancel_at_period_end, pending_plan_id, pending_plan_change'
const SCHEDULED_LIMIT = 20

function closed(code, status) {
  return { accessGranted: false, code, ok: false, status }
}

function renewalRpcError(error) {
  const message = `${error?.code || ''} ${error?.message || ''}`
  if (message.includes('renewal_attempt_conflict') || message.includes('23505') || message.toLowerCase().includes('unique')) {
    const conflict = new Error('renewal_attempt_conflict')
    conflict.code = 'renewal_attempt_conflict'
    return conflict
  }
  if (message.includes('illegal_renewal_transition')) {
    const illegal = new Error('illegal_renewal_transition')
    illegal.code = 'illegal_renewal_transition'
    return illegal
  }
  if (message.includes('renewal_attempt_not_found')) {
    const missing = new Error('renewal_attempt_not_found')
    missing.code = 'renewal_attempt_not_found'
    return missing
  }
  const hidden = new Error('billing_rpc_failed')
  hidden.code = 'billing_rpc_failed'
  return hidden
}

/**
 * Calls only the installed renewal functions. Period booking stays on the
 * existing subscription lifecycle caller.
 */
export function createServerSumUpRenewalRpcCaller({ client, env } = {}) {
  const resolved = client !== undefined ? client : createSupabaseAdminClient(env)
  if (!resolved || typeof resolved.schema !== 'function') return null
  return async function callRenewalRpc(name, args) {
    const fn = String(name || '')
    if (!RENEWAL_RPC.has(fn)) {
      const unavailable = new Error('durable_operation_unavailable')
      unavailable.code = 'durable_operation_unavailable'
      throw unavailable
    }
    const { data, error } = await resolved.schema('billing').rpc(fn.slice('billing.'.length), args || {})
    if (error) throw renewalRpcError(error)
    return data
  }
}

export function isSumUpRenewalDue(row, now) {
  if (!row || row.provider !== SUMUP_PROVIDER) return false
  if (row.cancel_at_period_end === true) return false
  if (!DUE_STATUS.has(row.status)) return false
  const end = new Date(row.current_period_end).getTime()
  return !Number.isNaN(end) && end <= now.getTime()
}

async function listOwnSumUpSubscriptions(client, userId) {
  const { data, error } = await client
    .schema('billing')
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('user_id', userId)
    .eq('provider', SUMUP_PROVIDER)
  if (error) {
    const wrapped = new Error('subscription_read_failed')
    wrapped.code = 'subscription_read_failed'
    throw wrapped
  }
  return Array.isArray(data) ? data : []
}

async function listAllSumUpSubscriptions(client) {
  const { data, error } = await client
    .schema('billing')
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('provider', SUMUP_PROVIDER)
  if (error) {
    const wrapped = new Error('subscription_read_failed')
    wrapped.code = 'subscription_read_failed'
    throw wrapped
  }
  return Array.isArray(data) ? data : []
}

async function processDueRows({
  client,
  due,
  env,
  lifecycle,
  limit,
  now,
  transport,
}) {
  const config = readSumUpConfig(env)
  const callRpc = createServerSumUpRenewalRpcCaller({ client })
  if (!config || !callRpc) return closed('PROVIDER_NOT_CONFIGURED', 503)
  let renewalLifecycle = lifecycle
  if (!renewalLifecycle) {
    try {
      renewalLifecycle = createServerSubscriptionLifecycle({ client, env, now }).lifecycle
    } catch {
      return closed('DURABLE_UNAVAILABLE', 503)
    }
  }
  const current = now()
  const recurring = createSumUpRecurring({
    claimRenewalAttempt: createServerSumUpRenewalClaimer(callRpc),
    finishRenewalAttempt: createServerSumUpRenewalFinisher(callRpc),
    lifecycle: renewalLifecycle,
    merchantCode: config.merchantCode,
    now: () => current,
    readInstrumentFingerprint: createServerSumUpInstrumentFingerprintReader(callRpc),
    reserveRenewalAttempt: createServerSumUpRenewalReserver(callRpc),
    transport: transport || createSumUpHttpTransport({ apiKey: config.apiKey }),
  })
  try {
    const renewed = await recurring.processDueRenewals({ limit, subscriptions: due })
    return {
      accessGranted: false,
      considered: renewed?.considered || 0,
      ok: true,
      results: Array.isArray(renewed?.results) ? renewed.results : [],
      status: 200,
    }
  } catch {
    return closed('SUMUP_RENEWAL_FAILED', 502)
  }
}

/**
 * Renews one already due SumUp period for the authenticated user.
 * The caller must already have verified billing_admin. Client period,
 * amount, plan, and subscription id are not arguments.
 */
export async function runDueSumUpRenewal({
  client,
  env = process.env,
  lifecycle = null,
  now = () => new Date(),
  transport = null,
  userId,
} = {}) {
  const resolved = client !== undefined ? client : createSupabaseAdminClient(env)
  if (!resolved || typeof resolved.schema !== 'function' || !userId) return closed('DURABLE_UNAVAILABLE', 503)
  const current = now()
  let rows
  try {
    rows = await listOwnSumUpSubscriptions(resolved, userId)
  } catch {
    return closed('DURABLE_UNAVAILABLE', 503)
  }
  const due = rows
    .filter((row) => String(row?.user_id || '') === String(userId) && isSumUpRenewalDue(row, current))
    .sort((left, right) => String(left.current_period_end).localeCompare(String(right.current_period_end)))
    .slice(0, 1)
  if (!due.length) return closed('RENEWAL_NOT_DUE', 409)

  const result = await processDueRows({
    client: resolved,
    due,
    env,
    lifecycle,
    limit: 1,
    now: () => current,
    transport,
  })
  if (!result.ok) return result
  if (result.considered !== 1) return closed('RENEWAL_NOT_DUE', 409)
  return result
}

/**
 * Scheduled server renewal for every already-due SumUp subscription.
 * Uses the same reservation/idempotent charge path as the manual admin run.
 * Does not take a user JWT, client period, amount, plan, or subscription id.
 */
export async function runScheduledDueSumUpRenewals({
  client,
  env = process.env,
  lifecycle = null,
  limit = SCHEDULED_LIMIT,
  now = () => new Date(),
  transport = null,
} = {}) {
  const resolved = client !== undefined ? client : createSupabaseAdminClient(env)
  if (!resolved || typeof resolved.schema !== 'function') return closed('DURABLE_UNAVAILABLE', 503)
  if (!Number.isInteger(limit) || limit < 1 || limit > SCHEDULED_LIMIT) {
    return closed('INVALID_RENEWAL_LIMIT', 400)
  }
  const current = now()
  let rows
  try {
    rows = await listAllSumUpSubscriptions(resolved)
  } catch {
    return closed('DURABLE_UNAVAILABLE', 503)
  }
  const due = rows
    .filter((row) => isSumUpRenewalDue(row, current))
    .sort((left, right) => String(left.current_period_end).localeCompare(String(right.current_period_end)))
  return processDueRows({
    client: resolved,
    due,
    env,
    lifecycle,
    limit,
    now: () => current,
    transport,
  })
}

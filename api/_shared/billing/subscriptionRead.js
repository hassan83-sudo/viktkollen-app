import { createSupabaseAdminClient } from '../supabaseServer.js'
import { BASELINE_PLAN_ID } from '../../../src/services/billing/effectivePlan.js'

const OPEN_STATUS = new Set(['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'])
const SUBSCRIPTION_COLUMNS = 'subscription_id, status, plan_id, current_period_start, current_period_end, pending_plan_id, cancel_at_period_end, past_due_grace_until'

/**
 * Authenticated user with no billing.subscriptions row.
 * This is the free baseline. It is not a paid subscription.
 */
export function emptySubscriptionDto() {
  return {
    cancel_at_period_end: false,
    current_period_end: null,
    current_period_start: null,
    past_due_grace_until: null,
    pending_plan_id: null,
    plan_id: BASELINE_PLAN_ID,
    status: 'NONE',
  }
}

export function toPublicSubscription(row) {
  if (!row) return emptySubscriptionDto()
  return {
    cancel_at_period_end: row.cancel_at_period_end === true,
    current_period_end: row.current_period_end || null,
    current_period_start: row.current_period_start || null,
    past_due_grace_until: row.past_due_grace_until || null,
    pending_plan_id: row.pending_plan_id || null,
    plan_id: row.plan_id || BASELINE_PLAN_ID,
    status: row.status || 'NONE',
  }
}

function pickSubscription(rows) {
  const list = Array.isArray(rows) ? rows : []
  const open = list.filter((row) => OPEN_STATUS.has(row?.status))
  const pool = open.length ? open : list
  return [...pool].sort((left, right) => {
    const end = String(right?.current_period_end || '').localeCompare(String(left?.current_period_end || ''))
    if (end) return end
    return String(left?.subscription_id || '').localeCompare(String(right?.subscription_id || ''))
  })[0] || null
}

async function listSubscriptions(client, userId) {
  const { data, error } = await client
    .schema('billing')
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('user_id', userId)
  if (error) {
    const wrapped = new Error('subscription_read_failed')
    wrapped.code = 'subscription_read_failed'
    throw wrapped
  }
  return data || []
}

/**
 * Durable subscription read. The caller must pass the authenticated user id.
 * Query and body fields are not arguments here.
 */
export async function readDurableUserSubscription(userId, client = createSupabaseAdminClient()) {
  if (!client || typeof client.schema !== 'function') return { unavailable: true }
  try {
    const rows = await listSubscriptions(client, userId)
    const row = pickSubscription(rows)
    return {
      subscription: toPublicSubscription(row),
      subscriptionId: row?.subscription_id || null,
      unavailable: false,
    }
  } catch {
    return { unavailable: true }
  }
}

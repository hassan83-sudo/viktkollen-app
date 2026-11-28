import { createSupabaseAdminClient } from '../supabaseServer.js'
import { readDurableUserSubscription, toPublicSubscription } from './subscriptionRead.js'

const CONFLICTS = new Set(['trial_already_used', 'active_period_exists', 'checkout_in_progress', 'duplicate_open_subscription'])

export async function accountTrial({ userId, start = false, client = createSupabaseAdminClient() } = {}) {
  if (!userId) return { ok: false, status: 401, code: 'AUTH_REQUIRED' }
  if (!client) return { ok: false, status: 503, code: 'TRIAL_UNAVAILABLE' }
  try {
    if (start) {
      // Only the authenticated identity crosses this boundary. No client dates,
      // status, plan, quota, price, or payment fields are accepted.
      const { data, error } = await client.schema('billing').rpc('start_account_trial', { p_user_id: userId })
      if (error) {
        if (CONFLICTS.has(error.message)) return { ok: false, status: 409, code: error.message.toUpperCase() }
        if (error.message === 'email_password_required') return { ok: false, status: 403, code: 'EMAIL_PASSWORD_REQUIRED' }
        throw error
      }
      if (!data || data.status !== 'TRIALING' || data.plan_id !== 'plan.trial.30days') throw new Error('invalid_trial')
      return { ok: true, status: 200, subscription: toPublicSubscription(data) }
    }
    const { data, error } = await client.schema('billing').from('account_trials')
      .select('started_at, ends_at').eq('user_id', userId).maybeSingle()
    if (error) throw error
    const current = await readDurableUserSubscription(userId, client)
    if (current.unavailable) throw new Error('subscription_unavailable')
    return {
      ok: true,
      status: 200,
      trial: {
        eligible: !data && !['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'].includes(current.subscription.status),
        used: Boolean(data),
        endsAt: data?.ends_at || null,
      },
    }
  } catch {
    return { ok: false, status: 503, code: 'TRIAL_UNAVAILABLE' }
  }
}

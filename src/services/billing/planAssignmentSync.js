import { BASELINE_PLAN_ID } from './effectivePlan.js'

const EVENT_RE = /^[A-Za-z0-9._:-]+$/

function rejectClientActivationClaim(clientClaim = {}) {
  void clientClaim.entitlement
  void clientClaim.limit
  void clientClaim.payment_success
  void clientClaim.plan_id
  void clientClaim.plan_version
  void clientClaim.price
  void clientClaim.quota
}

export function createInMemoryUserPlanAssignmentStore() {
  const rows = new Map()
  const events = new Map()
  return {
    async get(userId) {
      return rows.get(userId) || null
    },
    async apply({ assignedAt, eventId, planId, planVersion, source, userId }) {
      const prior = events.get(eventId)
      if (prior) {
        if (prior.planId === planId && prior.userId === userId && prior.source === source) {
          return rows.get(userId) || null
        }
        const error = new Error('duplicate_external_event')
        error.code = 'duplicate_external_event'
        throw error
      }
      const row = Object.freeze({
        assigned_at: assignedAt,
        plan_id: planId,
        plan_version: planVersion,
        source,
        user_id: userId,
      })
      rows.set(userId, row)
      events.set(eventId, { planId, source, userId })
      return row
    },
  }
}

export function createPlanActivation({ assignments, now = () => new Date(), subscriptions }) {
  return {
    async syncFromSubscription({ clientClaim = {}, external_event_id, subscription_id }) {
      rejectClientActivationClaim(clientClaim)
      const eventId = String(external_event_id || '').trim()
      if (!EVENT_RE.test(eventId) || eventId.length > 120) {
        const error = new Error('invalid_event_id')
        error.code = 'invalid_event_id'
        throw error
      }
      const subscription = await subscriptions.getSubscription(subscription_id)
      if (!subscription) {
        const error = new Error('subscription_not_found')
        error.code = 'subscription_not_found'
        throw error
      }
      const effective = await subscriptions.resolveForUser(subscription.user_id, {})
      const entitled = effective.source === 'subscription'
      return assignments.apply({
        assignedAt: now().toISOString(),
        eventId,
        planId: entitled ? effective.plan_id : BASELINE_PLAN_ID,
        planVersion: effective.plan_version,
        source: entitled ? 'server' : 'server-default',
        userId: subscription.user_id,
      })
    },
  }
}

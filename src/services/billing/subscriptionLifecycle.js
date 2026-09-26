import { createInMemoryUserPlanAssignmentStore, createPlanActivation } from './planAssignmentSync.js'
import { createRenewalLifecycle } from './renewalResult.js'
import { createSubscriptionAuthority } from './subscriptionAuthority.js'

const EVENT_RE = /^[A-Za-z0-9._:-]+$/

function unavailable(operation) {
  const error = new Error('durable_operation_unavailable')
  error.code = 'durable_operation_unavailable'
  error.operation = operation
  throw error
}

function requireEventId(externalEventId) {
  const eventId = String(externalEventId || '').trim()
  if (!EVENT_RE.test(eventId) || eventId.length > 120) {
    const error = new Error('invalid_event_id')
    error.code = 'invalid_event_id'
    throw error
  }
  return eventId
}

/**
 * Server-side composition of the existing subscription service, renewal
 * contract, and plan-assignment sync. It does not open a database connection
 * and does not create a second subscription authority.
 */
export function createSubscriptionLifecycle({ activation, renewals, subscriptions } = {}) {
  if (!activation?.syncFromSubscription || !renewals?.applyTrustedRenewal || !subscriptions) {
    unavailable('subscription_lifecycle')
  }

  async function follow(row, eventId, clientClaim) {
    const assignment = await activation.syncFromSubscription({
      clientClaim,
      external_event_id: eventId,
      subscription_id: row.subscription_id,
    })
    return { assignment, subscription: row }
  }

  return {
    async advancePeriod(input) {
      const eventId = requireEventId(input?.external_event_id)
      const subscription = await subscriptions.advancePeriod(input)
      return follow(subscription, eventId, input?.clientClaim)
    },
    async applyTrustedRenewal(input) {
      const eventId = requireEventId(input?.external_event_id)
      const subscription = await renewals.applyTrustedRenewal(input)
      return follow(subscription, eventId, input?.clientClaim)
    },
    async clearCancelAtPeriodEnd(input) {
      const eventId = requireEventId(input?.external_event_id)
      const subscription = await subscriptions.clearCancelAtPeriodEnd(input)
      return follow(subscription, eventId, input?.clientClaim)
    },
    async finalizeOpenSubscription(input) {
      const eventId = requireEventId(input?.external_event_id)
      const subscription = await subscriptions.finalizeOpenSubscription(input)
      return follow(subscription, eventId, input?.clientClaim)
    },
    async scheduleCancelAtPeriodEnd(input) {
      const eventId = requireEventId(input?.external_event_id)
      const subscription = await subscriptions.scheduleCancelAtPeriodEnd(input)
      return follow(subscription, eventId, input?.clientClaim)
    },
    async scheduleNextPeriodPlanChange(input) {
      const eventId = requireEventId(input?.external_event_id)
      const subscription = await subscriptions.scheduleNextPeriodPlanChange(input)
      return follow(subscription, eventId, input?.clientClaim)
    },
  }
}

export function createLocalSubscriptionLifecycle({ catalog, now = () => new Date() } = {}) {
  const authority = createSubscriptionAuthority({ catalog, now })
  const assignments = createInMemoryUserPlanAssignmentStore()
  const activation = createPlanActivation({
    assignments,
    now,
    subscriptions: authority.subscriptions,
  })
  const renewals = createRenewalLifecycle({
    now,
    store: authority.store,
    subscriptions: authority.subscriptions,
  })
  return {
    activation,
    assignments,
    authority,
    lifecycle: createSubscriptionLifecycle({
      activation,
      renewals,
      subscriptions: authority.subscriptions,
    }),
    renewals,
    subscriptions: authority.subscriptions,
  }
}

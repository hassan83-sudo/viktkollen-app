import { randomUUID } from 'node:crypto'
import { SUBSCRIPTION_OPEN } from './catalog.js'
import { assertSubscriptionTransition } from './subscriptionState.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * In-memory Maps for unit tests and local isolation proofs only.
 * Not production authority. Two isolated stores can both insert an open
 * row for the same user. Production create is billing.create_subscription
 * plus subscriptions_one_open_per_user_uidx.
 */

function clone(row) {
  return Object.freeze({ ...row })
}

export function createInMemorySubscriptionStore() {
  const byId = new Map()
  const byEvent = new Map()

  return {
    async get(subscriptionId) {
      return byId.get(subscriptionId) || null
    },
    async getByExternalEventId(eventId) {
      if (!eventId) return null
      const subscriptionId = byEvent.get(eventId)
      if (subscriptionId) return byId.get(subscriptionId) || null
      return [...byId.values()].find((row) => row.external_event_id === eventId) || null
    },
    async listByUser(userId) {
      return [...byId.values()].filter((row) => row.user_id === userId)
    },
    async insert(row) {
      const stored = clone({
        ...row,
        subscription_id: row.subscription_id || randomUUID(),
      })
      if (byId.has(stored.subscription_id)) {
        const error = new Error('duplicate_subscription')
        error.code = 'duplicate_subscription'
        throw error
      }
      if (stored.external_event_id) {
        const existing = await this.getByExternalEventId(stored.external_event_id)
        if (existing) return existing
        byEvent.set(stored.external_event_id, stored.subscription_id)
      }
      if (SUBSCRIPTION_OPEN.includes(stored.status)) {
        const open = [...byId.values()].find((row) => (
          row.user_id === stored.user_id && SUBSCRIPTION_OPEN.includes(row.status)
        ))
        if (open) {
          const error = new Error('duplicate_active_subscription')
          error.code = 'duplicate_active_subscription'
          throw error
        }
      }
      byId.set(stored.subscription_id, stored)
      return stored
    },
    async replace(next) {
      const prev = byId.get(next.subscription_id)
      if (!prev) {
        const error = new Error('subscription_not_found')
        error.code = 'subscription_not_found'
        throw error
      }
      if (
        prev.user_id !== next.user_id
        || prev.subscription_id !== next.subscription_id
        || prev.plan_id !== next.plan_id
        || prev.plan_version !== next.plan_version
        || prev.created_at !== next.created_at
      ) {
        const error = new Error('immutable_subscription_identity')
        error.code = 'immutable_subscription_identity'
        throw error
      }
      if (prev.current_period_start !== next.current_period_start) {
        const error = new Error('immutable_period_start')
        error.code = 'immutable_period_start'
        throw error
      }
      if (new Date(next.current_period_end).getTime() > new Date(prev.current_period_end).getTime()) {
        const error = new Error('period_end_cannot_extend')
        error.code = 'period_end_cannot_extend'
        throw error
      }
      if (next.external_event_id) {
        const mapped = await this.getByExternalEventId(next.external_event_id)
        if (mapped && mapped.subscription_id !== prev.subscription_id) {
          const error = new Error('duplicate_external_event')
          error.code = 'duplicate_external_event'
          throw error
        }
        byEvent.set(next.external_event_id, prev.subscription_id)
      }
      if (prev.provider && next.provider !== prev.provider) {
        const error = new Error('immutable_provider')
        error.code = 'immutable_provider'
        throw error
      }
      if (prev.past_due_grace_until && next.past_due_grace_until
        && new Date(next.past_due_grace_until).getTime() > new Date(prev.past_due_grace_until).getTime()) {
        const error = new Error('grace_cannot_extend')
        error.code = 'grace_cannot_extend'
        throw error
      }
      assertSubscriptionTransition(prev.status, next.status)
      const stored = clone({
        ...next,
        external_event_id: prev.external_event_id || next.external_event_id || null,
      })
      byId.set(stored.subscription_id, stored)
      return stored
    },
    reset() {
      byId.clear()
      byEvent.clear()
    },
  }
}

export { UUID_RE }

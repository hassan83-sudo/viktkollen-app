import { randomUUID } from 'node:crypto'
import { SUBSCRIPTION_OPEN } from './catalog.js'
import { assertSubscriptionTransition } from './subscriptionState.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clone(row) {
  return Object.freeze({ ...row })
}

export function createInMemorySubscriptionStore() {
  const byId = new Map()

  return {
    async get(subscriptionId) {
      return byId.get(subscriptionId) || null
    },
    async getByExternalEventId(eventId) {
      if (!eventId) return null
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
      if (prev.user_id !== next.user_id || prev.subscription_id !== next.subscription_id) {
        const error = new Error('immutable_subscription_identity')
        error.code = 'immutable_subscription_identity'
        throw error
      }
      assertSubscriptionTransition(prev.status, next.status)
      const stored = clone(next)
      byId.set(stored.subscription_id, stored)
      return stored
    },
    reset() {
      byId.clear()
    },
  }
}

export { UUID_RE }

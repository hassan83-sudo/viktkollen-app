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
  const events = []

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
    async listEvents() {
      return events.map((event) => ({ ...event }))
    },
    async scheduleCancel({ createdAt, externalEventId, subscriptionId }) {
      if (externalEventId && byEvent.has(externalEventId)) return byId.get(byEvent.get(externalEventId)) || null
      const prev = byId.get(subscriptionId)
      if (!prev) {
        const error = new Error('subscription_not_found')
        error.code = 'subscription_not_found'
        throw error
      }
      if (prev.status !== 'ACTIVE' && prev.status !== 'TRIALING') {
        const error = new Error('illegal_subscription_transition')
        error.code = 'illegal_subscription_transition'
        throw error
      }
      const stored = clone({
        ...prev,
        cancel_at_period_end: true,
        updated_at: createdAt,
      })
      if (externalEventId) {
        events.push({
          created_at: createdAt,
          current_period_end: prev.current_period_end,
          external_event_id: externalEventId,
          from_cancel_at_period_end: prev.cancel_at_period_end === true,
          from_plan_id: prev.plan_id,
          from_plan_version: prev.plan_version,
          from_status: prev.status,
          operation: 'cancel.schedule',
          subscription_id: prev.subscription_id,
          to_cancel_at_period_end: true,
          to_plan_id: prev.plan_id,
          to_plan_version: prev.plan_version,
          to_status: prev.status,
        })
        byEvent.set(externalEventId, prev.subscription_id)
      }
      byId.set(stored.subscription_id, stored)
      return stored
    },
    async clearCancel({ createdAt, externalEventId, now, subscriptionId }) {
      if (externalEventId && byEvent.has(externalEventId)) return byId.get(byEvent.get(externalEventId)) || null
      const prev = byId.get(subscriptionId)
      if (!prev) {
        const error = new Error('subscription_not_found')
        error.code = 'subscription_not_found'
        throw error
      }
      if (prev.status !== 'ACTIVE' && prev.status !== 'TRIALING') {
        const error = new Error('illegal_subscription_transition')
        error.code = 'illegal_subscription_transition'
        throw error
      }
      if (new Date(now).getTime() >= new Date(prev.current_period_end).getTime()) {
        const error = new Error('period_expired')
        error.code = 'period_expired'
        throw error
      }
      if (prev.cancel_at_period_end !== true) {
        const error = new Error('cancel_not_scheduled')
        error.code = 'cancel_not_scheduled'
        throw error
      }
      const stored = clone({
        ...prev,
        cancel_at_period_end: false,
        updated_at: createdAt,
      })
      events.push({
        created_at: createdAt,
        current_period_end: prev.current_period_end,
        external_event_id: externalEventId,
        from_cancel_at_period_end: true,
        from_plan_id: prev.plan_id,
        from_plan_version: prev.plan_version,
        from_status: prev.status,
        operation: 'cancel.clear',
        subscription_id: prev.subscription_id,
        to_cancel_at_period_end: false,
        to_plan_id: prev.plan_id,
        to_plan_version: prev.plan_version,
        to_status: prev.status,
      })
      byEvent.set(externalEventId, prev.subscription_id)
      byId.set(stored.subscription_id, stored)
      return stored
    },
    async finalizeOpen({ createdAt, externalEventId, now, subscriptionId }) {
      if (externalEventId && byEvent.has(externalEventId)) return byId.get(byEvent.get(externalEventId)) || null
      const prev = byId.get(subscriptionId)
      if (!prev) {
        const error = new Error('subscription_not_found')
        error.code = 'subscription_not_found'
        throw error
      }
      if (prev.status === 'CANCELED' || prev.status === 'EXPIRED') return prev
      const at = new Date(now).getTime()
      const periodEnded = at >= new Date(prev.current_period_end).getTime()
      const graceEnded = prev.past_due_grace_until
        ? at >= new Date(prev.past_due_grace_until).getTime()
        : false
      let toStatus = null
      if ((prev.status === 'ACTIVE' || prev.status === 'TRIALING') && prev.cancel_at_period_end === true && periodEnded) {
        toStatus = 'CANCELED'
      } else if (prev.status === 'ACTIVE' && prev.cancel_at_period_end !== true && periodEnded) {
        toStatus = 'EXPIRED'
      } else if (prev.status === 'PAST_DUE' && (prev.past_due_grace_until == null || graceEnded)) {
        toStatus = 'EXPIRED'
      }
      if (!toStatus) return prev
      assertSubscriptionTransition(prev.status, toStatus)
      const stored = clone({
        ...prev,
        past_due_grace_until: null,
        pending_plan_change: null,
        pending_plan_id: null,
        status: toStatus,
        updated_at: createdAt,
      })
      events.push({
        created_at: createdAt,
        current_period_end: prev.current_period_end,
        external_event_id: externalEventId,
        from_cancel_at_period_end: prev.cancel_at_period_end === true,
        from_plan_id: prev.plan_id,
        from_plan_version: prev.plan_version,
        from_status: prev.status,
        operation: 'subscription.terminal',
        past_due_grace_until: prev.past_due_grace_until,
        previous_pending_plan_change: prev.pending_plan_change,
        previous_pending_plan_id: prev.pending_plan_id,
        subscription_id: prev.subscription_id,
        to_cancel_at_period_end: prev.cancel_at_period_end === true,
        to_plan_id: prev.plan_id,
        to_plan_version: prev.plan_version,
        to_status: toStatus,
      })
      byEvent.set(externalEventId, prev.subscription_id)
      byId.set(stored.subscription_id, stored)
      return stored
    },
    async advancePeriod({ appliedPlan = null, createdAt, externalEventId, nextPeriodEnd, subscriptionId }) {
      const replayId = byEvent.get(externalEventId)
      if (replayId) return byId.get(replayId) || null
      const prev = byId.get(subscriptionId)
      if (!prev) {
        const error = new Error('subscription_not_found')
        error.code = 'subscription_not_found'
        throw error
      }
      if (prev.status !== 'ACTIVE' && prev.status !== 'PAST_DUE') {
        const error = new Error('illegal_subscription_transition')
        error.code = 'illegal_subscription_transition'
        throw error
      }
      const nextEnd = new Date(nextPeriodEnd).getTime()
      if (Number.isNaN(nextEnd) || nextEnd <= new Date(prev.current_period_end).getTime()) {
        const error = new Error('period_end_not_later')
        error.code = 'period_end_not_later'
        throw error
      }
      assertSubscriptionTransition(prev.status, 'ACTIVE')
      const applyPending = prev.pending_plan_change === 'next_period'
      if (applyPending && !appliedPlan) {
        const error = new Error('invalid_pending_plan')
        error.code = 'invalid_pending_plan'
        throw error
      }
      const stored = clone({
        ...prev,
        current_period_end: new Date(nextPeriodEnd).toISOString(),
        past_due_grace_until: null,
        pending_plan_change: applyPending ? null : prev.pending_plan_change,
        pending_plan_id: applyPending ? null : prev.pending_plan_id,
        plan_id: applyPending ? appliedPlan.id : prev.plan_id,
        plan_version: applyPending ? appliedPlan.version : prev.plan_version,
        status: 'ACTIVE',
        updated_at: createdAt,
      })
      events.push({
        created_at: createdAt,
        external_event_id: externalEventId,
        from_plan_id: prev.plan_id,
        from_plan_version: prev.plan_version,
        from_status: prev.status,
        new_period_end: stored.current_period_end,
        operation: 'period.advance',
        previous_period_end: prev.current_period_end,
        subscription_id: prev.subscription_id,
        to_plan_id: stored.plan_id,
        to_plan_version: stored.plan_version,
        to_status: 'ACTIVE',
      })
      byEvent.set(externalEventId, prev.subscription_id)
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
      events.length = 0
    },
  }
}

export { UUID_RE }

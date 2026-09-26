import { SUBSCRIPTION_STATUS } from './catalog.js'
import { resolveEffectivePlan, toClientSafeSubscription } from './effectivePlan.js'
import { getPlanById } from './planCatalog.js'
import { createSubscriptionService } from './subscriptionService.js'
import { UUID_RE, createInMemorySubscriptionStore } from './subscriptionStore.js'

/**
 * Application port for subscription authority.
 * The default implementation is in-memory. A caller may inject another store
 * with the same methods. This module does not open a database connection.
 *
 * Existing SQL RPCs cover create, advance, cancel, undo, terminalize, and
 * next-period plan scheduling. This module does not apply migrations.
 */
export const SUBSCRIPTION_RPC = Object.freeze({
  advancePeriod: 'billing.advance_subscription_period',
  clearCancelAtPeriodEnd: 'billing.clear_cancel_at_period_end',
  createSubscription: 'billing.create_subscription',
  finalizeOpenSubscription: 'billing.finalize_open_subscription',
  markRenewalFailed: 'billing.mark_renewal_failed',
  scheduleCancelAtPeriodEnd: 'billing.schedule_cancel_at_period_end',
  scheduleNextPeriodPlanChange: 'billing.schedule_next_period_plan_change',
})

const EVENT_RE = /^[A-Za-z0-9._:-]+$/

function unavailable(operation) {
  const error = new Error('durable_operation_unavailable')
  error.code = 'durable_operation_unavailable'
  error.operation = operation
  throw error
}

function rejectClientClaim(clientClaim = {}) {
  void clientClaim.entitlement
  void clientClaim.limit
  void clientClaim.payment_success
  void clientClaim.period_end
  void clientClaim.plan_id
  void clientClaim.plan_version
  void clientClaim.price
  void clientClaim.provider
  void clientClaim.quota
  void clientClaim.status
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

function requireActivePlan(planId, catalog) {
  const plan = getPlanById(planId, catalog)
  if (!plan) {
    const error = new Error('unknown_plan')
    error.code = 'unknown_plan'
    throw error
  }
  if (plan.active !== true || plan.id === 'plan.free') {
    const error = new Error('invalid_pending_plan')
    error.code = 'invalid_pending_plan'
    throw error
  }
  return plan
}

/**
 * Privileged write path. It calls the existing billing RPCs and remembers
 * only rows those RPCs returned. It does not open a connection.
 */
export function createDurableSubscriptionOperations({
  catalog,
  now = () => new Date(),
  port,
} = {}) {
  const seen = new Map()
  function remember(row) {
    if (row?.subscription_id) seen.set(row.subscription_id, row)
    return row
  }

  return {
    async advancePeriod({ clientClaim = {}, current_period_end, external_event_id, subscription_id }) {
      rejectClientClaim(clientClaim)
      const row = await port.advancePeriod({
        p_external_event_id: requireEventId(external_event_id),
        p_period_end: current_period_end,
        p_subscription_id: subscription_id,
      })
      return remember(row)
    },
    async clearCancelAtPeriodEnd({ clientClaim = {}, external_event_id, subscription_id }) {
      rejectClientClaim(clientClaim)
      const row = await port.clearCancelAtPeriodEnd({
        p_external_event_id: requireEventId(external_event_id),
        p_subscription_id: subscription_id,
      })
      return remember(row)
    },
    async createSubscription({
      cancel_at_period_end = false,
      clientClaim = {},
      current_period_end,
      current_period_start,
      external_event_id = null,
      past_due_grace_until = null,
      pending_plan_change = null,
      pending_plan_id = null,
      plan_id,
      status = SUBSCRIPTION_STATUS.ACTIVE,
      user_id,
    }) {
      rejectClientClaim(clientClaim)
      const userId = String(user_id || '').trim()
      if (!UUID_RE.test(userId)) {
        const error = new Error('invalid_user_id')
        error.code = 'invalid_user_id'
        throw error
      }
      const plan = getPlanById(plan_id, catalog)
      if (!plan || plan.active !== true) {
        const error = new Error(plan ? 'inactive_plan' : 'unknown_plan')
        error.code = plan ? 'inactive_plan' : 'unknown_plan'
        throw error
      }
      const row = await port.createSubscription({
        p_cancel_at_period_end: cancel_at_period_end === true,
        p_external_event_id: external_event_id,
        p_past_due_grace_until: past_due_grace_until,
        p_pending_plan_change: pending_plan_change,
        p_pending_plan_id: pending_plan_id,
        p_period_end: current_period_end,
        p_period_start: current_period_start,
        p_plan_id: plan.id,
        p_status: status,
        p_user_id: userId,
      })
      return remember(row)
    },
    async finalizeOpenSubscription({ clientClaim = {}, external_event_id, subscription_id }) {
      rejectClientClaim(clientClaim)
      const row = await port.finalizeOpenSubscription({
        p_external_event_id: requireEventId(external_event_id),
        p_subscription_id: subscription_id,
      })
      return remember(row)
    },
    async markPastDue({
      clientClaim = {},
      currentPeriodEnd,
      current_period_end,
      externalEventId,
      external_event_id,
      graceUntil,
      past_due_grace_until,
      subscriptionId,
      subscription_id,
    }) {
      rejectClientClaim(clientClaim)
      const periodEnd = current_period_end === undefined ? currentPeriodEnd : current_period_end
      if (periodEnd == null || Number.isNaN(new Date(periodEnd).getTime())) {
        const error = new Error('invalid_period')
        error.code = 'invalid_period'
        throw error
      }
      const row = await port.markRenewalFailed({
        p_external_event_id: requireEventId(external_event_id || externalEventId),
        p_past_due_grace_until: past_due_grace_until === undefined ? graceUntil ?? null : past_due_grace_until,
        p_period_end: new Date(periodEnd).toISOString(),
        p_subscription_id: subscription_id || subscriptionId,
      })
      return remember(row)
    },
    async getClientSafe(userId, clientClaim = {}) {
      const effective = await this.resolveForUser(userId, clientClaim)
      return toClientSafeSubscription(effective.subscription, effective)
    },
    async getSubscription(subscriptionId) {
      return seen.get(subscriptionId) || null
    },
    async resolveForUser(userId, clientClaim = {}) {
      rejectClientClaim(clientClaim)
      const id = String(userId || '').trim()
      const subscriptions = UUID_RE.test(id)
        ? [...seen.values()].filter((row) => row.user_id === id)
        : []
      return resolveEffectivePlan({
        catalog,
        clientClaim: {},
        now: now(),
        subscriptions,
      })
    },
    async scheduleCancelAtPeriodEnd({ clientClaim = {}, external_event_id, subscription_id }) {
      rejectClientClaim(clientClaim)
      const row = await port.scheduleCancelAtPeriodEnd({
        p_external_event_id: requireEventId(external_event_id),
        p_subscription_id: subscription_id,
      })
      return remember(row)
    },
    async scheduleNextPeriodPlanChange({
      clientClaim = {},
      external_event_id,
      plan_id,
      subscription_id,
    }) {
      rejectClientClaim(clientClaim)
      const target = requireActivePlan(plan_id, catalog)
      const current = seen.get(subscription_id)
      if (current && target.id === current.plan_id) {
        const error = new Error('invalid_pending_plan')
        error.code = 'invalid_pending_plan'
        throw error
      }
      const row = await port.scheduleNextPeriodPlanChange({
        p_external_event_id: requireEventId(external_event_id),
        p_plan_id: target.id,
        p_subscription_id: subscription_id,
      })
      return remember(row)
    },
    async transition() {
      unavailable('transition')
    },
  }
}

export function createSubscriptionAuthority({
  callRpc = null,
  catalog,
  durable = false,
  now = () => new Date(),
  store = createInMemorySubscriptionStore(),
} = {}) {
  if (durable === true) {
    if (typeof callRpc !== 'function') unavailable('subscription')
    const port = createRpcSubscriptionPort(callRpc)
    return {
      durable: true,
      port,
      subscriptions: createDurableSubscriptionOperations({ catalog, now, port }),
    }
  }
  const subscriptions = createSubscriptionService({ catalog, now, store })
  return {
    durable: false,
    read: (subscriptionId) => store.get(subscriptionId),
    store,
    subscriptions,
  }
}

export function createPrivilegedSubscriptionAuthority(options = {}) {
  return createSubscriptionAuthority({ ...options, durable: true })
}

export function createRpcSubscriptionPort(callRpc) {
  async function call(operation, args) {
    const name = SUBSCRIPTION_RPC[operation]
    if (!name) {
      const error = new Error('durable_operation_unavailable')
      error.code = 'durable_operation_unavailable'
      error.operation = operation
      throw error
    }
    return callRpc(name, args)
  }
  return {
    advancePeriod: (args) => call('advancePeriod', args),
    clearCancelAtPeriodEnd: (args) => call('clearCancelAtPeriodEnd', args),
    createSubscription: (args) => call('createSubscription', args),
    finalizeOpenSubscription: (args) => call('finalizeOpenSubscription', args),
    markRenewalFailed: (args) => call('markRenewalFailed', args),
    scheduleCancelAtPeriodEnd: (args) => call('scheduleCancelAtPeriodEnd', args),
    scheduleNextPeriodPlanChange: (args) => call('scheduleNextPeriodPlanChange', args),
  }
}

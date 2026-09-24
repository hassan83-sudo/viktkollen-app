import { PLAN_CHANGE_WHEN, SUBSCRIPTION_STATUS } from './catalog.js'
import { getPlanById } from './planCatalog.js'
import { BASELINE_PLAN_ID, resolveEffectivePlan, toClientSafeSubscription } from './effectivePlan.js'
import { UUID_RE, createInMemorySubscriptionStore } from './subscriptionStore.js'
import { assertSubscriptionTransition } from './subscriptionState.js'

function requireUuid(userId) {
  const id = String(userId || '').trim()
  if (!UUID_RE.test(id)) {
    const error = new Error('invalid_user_id')
    error.code = 'invalid_user_id'
    throw error
  }
  return id
}

function requirePeriod(start, end) {
  const a = new Date(start)
  const b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b.getTime() <= a.getTime()) {
    const error = new Error('invalid_period')
    error.code = 'invalid_period'
    throw error
  }
  return { current_period_end: b.toISOString(), current_period_start: a.toISOString() }
}

/**
 * Trusted application service. The default store is in-memory and is not
 * production authority. When persistence is enabled, callers must use
 * billing.create_subscription (PostgreSQL unique open-row index).
 */
export function createSubscriptionService({
  catalog,
  now = () => new Date(),
  store = createInMemorySubscriptionStore(),
} = {}) {
  async function createSubscription({
    cancel_at_period_end = false,
    current_period_end,
    current_period_start,
    external_event_id = null,
    pending_plan_change = null,
    pending_plan_id = null,
    past_due_grace_until = null,
    plan_id,
    status = SUBSCRIPTION_STATUS.ACTIVE,
    user_id,
  }) {
    const userId = requireUuid(user_id)
    const period = requirePeriod(current_period_start, current_period_end)
    if (external_event_id) {
      const replay = await store.getByExternalEventId(external_event_id)
      if (replay) return replay
    }
    const plan = getPlanById(plan_id, catalog)
    if (!plan) {
      const error = new Error('unknown_plan')
      error.code = 'unknown_plan'
      throw error
    }
    if (plan.active !== true) {
      const error = new Error('inactive_plan')
      error.code = 'inactive_plan'
      throw error
    }
    if (![
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.TRIALING,
      SUBSCRIPTION_STATUS.PAST_DUE,
      SUBSCRIPTION_STATUS.PAUSED,
    ].includes(status)) {
      const error = new Error('invalid_status')
      error.code = 'invalid_status'
      throw error
    }
    if (pending_plan_change && !Object.values(PLAN_CHANGE_WHEN).includes(pending_plan_change)) {
      const error = new Error('invalid_plan_change')
      error.code = 'invalid_plan_change'
      throw error
    }
    return store.insert({
      cancel_at_period_end: cancel_at_period_end === true,
      created_at: now().toISOString(),
      ...period,
      external_event_id,
      past_due_grace_until,
      pending_plan_change,
      pending_plan_id,
      plan_id: plan.id,
      plan_version: plan.version,
      provider: '',
      provider_customer_ref: '',
      provider_subscription_ref: '',
      status,
      updated_at: now().toISOString(),
      user_id: userId,
    })
  }

  async function advancePeriod({
    clientClaim = {},
    current_period_end,
    external_event_id,
    subscription_id,
  }) {
    void clientClaim.entitlement
    void clientClaim.payment_success
    void clientClaim.period_end
    void clientClaim.plan_id
    void clientClaim.plan_version
    void clientClaim.price
    void clientClaim.provider
    void clientClaim.quota
    const eventId = String(external_event_id || '').trim()
    if (!/^[A-Za-z0-9._:-]+$/.test(eventId) || eventId.length > 120) {
      const error = new Error('invalid_event_id')
      error.code = 'invalid_event_id'
      throw error
    }
    const replay = await store.getByExternalEventId(eventId)
    if (replay) return replay
    const current = await store.get(subscription_id)
    let appliedPlan = null
    if (current?.pending_plan_change === 'next_period') {
      const pending = getPlanById(current.pending_plan_id, catalog)
      if (!pending || pending.active !== true || pending.id === 'plan.free') {
        const error = new Error('invalid_pending_plan')
        error.code = 'invalid_pending_plan'
        throw error
      }
      appliedPlan = { id: pending.id, version: pending.version }
    }
    return store.advancePeriod({
      appliedPlan,
      createdAt: now().toISOString(),
      externalEventId: eventId,
      nextPeriodEnd: current_period_end,
      subscriptionId: subscription_id,
    })
  }

  function rejectClientSubscriptionClaim(clientClaim = {}) {
    void clientClaim.entitlement
    void clientClaim.payment_success
    void clientClaim.period_end
    void clientClaim.plan_id
    void clientClaim.plan_version
    void clientClaim.price
    void clientClaim.provider
    void clientClaim.quota
    void clientClaim.status
  }

  async function ownedRow(subscriptionId, actorUserId) {
    const row = await store.get(subscriptionId)
    if (!row) return null
    if (actorUserId && row.user_id !== actorUserId) {
      const error = new Error('forbidden_subscription')
      error.code = 'forbidden_subscription'
      throw error
    }
    return row
  }

  async function scheduleCancelAtPeriodEnd({
    actor_user_id = null,
    clientClaim = {},
    external_event_id = null,
    subscription_id,
  }) {
    rejectClientSubscriptionClaim(clientClaim)
    if (actor_user_id) await ownedRow(subscription_id, actor_user_id)
    return store.scheduleCancel({
      createdAt: now().toISOString(),
      externalEventId: external_event_id ? String(external_event_id) : null,
      subscriptionId: subscription_id,
    })
  }

  async function clearCancelAtPeriodEnd({
    actor_user_id = null,
    clientClaim = {},
    external_event_id,
    subscription_id,
  }) {
    rejectClientSubscriptionClaim(clientClaim)
    const eventId = String(external_event_id || '').trim()
    if (!/^[A-Za-z0-9._:-]+$/.test(eventId) || eventId.length > 120) {
      const error = new Error('invalid_event_id')
      error.code = 'invalid_event_id'
      throw error
    }
    if (actor_user_id) await ownedRow(subscription_id, actor_user_id)
    return store.clearCancel({
      createdAt: now().toISOString(),
      externalEventId: eventId,
      now: now().toISOString(),
      subscriptionId: subscription_id,
    })
  }

  async function finalizeOpenSubscription({
    clientClaim = {},
    external_event_id,
    subscription_id,
  }) {
    rejectClientSubscriptionClaim(clientClaim)
    void clientClaim.pending_plan_change
    void clientClaim.pending_plan_id
    const eventId = String(external_event_id || '').trim()
    if (!/^[A-Za-z0-9._:-]+$/.test(eventId) || eventId.length > 120) {
      const error = new Error('invalid_event_id')
      error.code = 'invalid_event_id'
      throw error
    }
    return store.finalizeOpen({
      createdAt: now().toISOString(),
      externalEventId: eventId,
      now: now().toISOString(),
      subscriptionId: subscription_id,
    })
  }

  async function transition({ subscription_id, to, cancel_at_period_end, external_event_id }) {
    if (external_event_id) {
      const replay = await store.getByExternalEventId(external_event_id)
      if (replay) return replay
    }
    const row = await store.get(subscription_id)
    if (!row) {
      const error = new Error('subscription_not_found')
      error.code = 'subscription_not_found'
      throw error
    }
    assertSubscriptionTransition(row.status, to)
    return store.replace({
      ...row,
      cancel_at_period_end: cancel_at_period_end == null ? row.cancel_at_period_end : cancel_at_period_end === true,
      external_event_id: external_event_id || row.external_event_id,
      status: to,
      updated_at: now().toISOString(),
    })
  }

  async function resolveForUser(userId, clientClaim = {}) {
    void clientClaim
    const id = String(userId || '').trim()
    const subscriptions = UUID_RE.test(id) ? await store.listByUser(id) : []
    return resolveEffectivePlan({
      catalog,
      clientClaim: {},
      now: now(),
      subscriptions,
    })
  }

  async function getClientSafe(userId, clientClaim = {}) {
    const effective = await resolveForUser(userId, clientClaim)
    return toClientSafeSubscription(effective.subscription, effective)
  }

  return {
    advancePeriod,
    createSubscription,
    getClientSafe,
    clearCancelAtPeriodEnd,
    finalizeOpenSubscription,
    resolveForUser,
    scheduleCancelAtPeriodEnd,
    transition,
  }
}

export function createSubscriptionAssignmentStore(service) {
  return {
    async get(userId) {
      const effective = await service.resolveForUser(userId, {})
      return {
        current_period_end: effective.subscription?.current_period_end || null,
        current_period_start: effective.subscription?.current_period_start || null,
        plan_id: effective.plan_id || BASELINE_PLAN_ID,
        plan_version: effective.plan_version,
        source: effective.source === 'subscription' ? 'subscription' : 'server-default',
        user_id: userId,
      }
    },
    async set() {
      const error = new Error('assignment_is_subscription_derived')
      error.code = 'assignment_is_subscription_derived'
      throw error
    },
    reset() {},
  }
}

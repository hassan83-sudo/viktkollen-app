import { providerEventFingerprint } from './paymentProviderContract.js'

function reject(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

export function createMemoryProviderInbox() {
  const rows = new Map()
  return {
    async get(eventId) {
      return rows.get(eventId) || null
    },
    async put(eventId, row) {
      const existing = rows.get(eventId)
      if (existing) {
        if (existing.fingerprint !== row.fingerprint) reject('duplicate_external_event')
        return existing
      }
      rows.set(eventId, row)
      return row
    },
  }
}

export function createMemoryCheckoutIntents() {
  const rows = new Map()
  return {
    async complete(checkoutId, patch) {
      const current = rows.get(checkoutId)
      if (!current) return null
      const next = { ...current, ...patch, status: 'completed' }
      rows.set(checkoutId, next)
      return next
    },
    async get(checkoutId) {
      return rows.get(checkoutId) || null
    },
    async put(row) {
      rows.set(row.checkoutId, { ...row, status: 'pending' })
      return rows.get(row.checkoutId)
    },
  }
}

export function createMemoryProviderBindings() {
  const rows = new Map()
  const key = (provider, ref) => `${provider}\n${ref}`
  return {
    async bind(provider, ref, value) {
      const existing = rows.get(key(provider, ref))
      if (existing && (existing.userId !== value.userId || existing.subscriptionId !== value.subscriptionId)) {
        reject('provider_subscription_conflict')
      }
      if (!existing) rows.set(key(provider, ref), value)
      return rows.get(key(provider, ref))
    },
    async find(provider, ref) {
      return rows.get(key(provider, ref)) || null
    },
  }
}

/**
 * Applies an already normalized provider event. Callers must verify the
 * provider signature first. This function does not accept a raw HTTP body.
 */
export function createProviderEventProcessor({
  activation,
  bindings,
  durableActivate = null,
  inbox,
  intents,
  readSale,
  renewals,
  subscriptions,
} = {}) {
  if (!inbox || !bindings || !intents || !subscriptions || !renewals) {
    const error = new Error('durable_operation_unavailable')
    error.code = 'durable_operation_unavailable'
    throw error
  }

  async function remember(event, result) {
    await inbox.put(event.providerEventId, {
      fingerprint: providerEventFingerprint(event),
      result,
    })
    return result
  }

  async function boundSubscription(event) {
    const binding = await bindings.find(event.provider, event.providerSubscriptionRef)
    if (!binding) reject('subscription_not_found')
    return binding
  }

  return {
    async apply(event) {
      if (!event?.providerEventId || !event.type || event.userId || event.user_id || event.plan_id || event.planId) {
        reject('CLIENT_AUTHORITY_REJECTED')
      }
      const prior = await inbox.get(event.providerEventId)
      const fingerprint = providerEventFingerprint(event)
      if (prior) {
        if (prior.fingerprint !== fingerprint) reject('duplicate_external_event')
        return prior.result
      }

      if (event.type === 'checkout.activated') {
        if (typeof durableActivate === 'function') return remember(event, await durableActivate(event))
        return remember(event, await activateCheckout(event))
      }
      if (event.type === 'renewal.succeeded' || event.type === 'renewal.failed') {
        return remember(event, await applyRenewal(event))
      }
      if (event.type === 'subscription.cancelled') return remember(event, await cancelRenewal(event))
      if (event.type === 'subscription.terminated') return remember(event, await terminate(event))
      reject('UNKNOWN_EVENT')
    },
  }

  async function activateCheckout(event) {
    const intent = await intents.get(event.checkoutId)
    if (!intent) reject('checkout_intent_missing')
    if (intent.status === 'completed') reject('checkout_intent_consumed')
    if (intent.planId === 'plan.free') reject('INVALID_PLAN')
    if (typeof readSale !== 'function') reject('durable_operation_unavailable')
    const sale = await readSale(intent.planId)
    if (!sale?.known || sale.active !== true || sale.enabledForSale !== true) reject('INVALID_PLAN')
    const existingBinding = await bindings.find(event.provider, event.providerSubscriptionRef)
    if (existingBinding) reject('provider_subscription_conflict')
    const created = await subscriptions.createSubscription({
      clientClaim: {},
      current_period_end: event.periodEnd,
      current_period_start: event.periodStart,
      external_event_id: event.providerEventId,
      plan_id: intent.planId,
      status: 'ACTIVE',
      user_id: intent.userId,
    })
    if (created.user_id !== intent.userId || created.plan_id !== intent.planId) {
      reject('checkout_binding_mismatch')
    }
    await bindings.bind(event.provider, event.providerSubscriptionRef, {
      planId: intent.planId,
      subscriptionId: created.subscription_id,
      userId: intent.userId,
    })
    const assignment = activation
      ? await activation.syncFromSubscription({
        clientClaim: {},
        external_event_id: event.providerEventId,
        subscription_id: created.subscription_id,
      })
      : null
    await intents.complete(event.checkoutId, {
      providerEventId: event.providerEventId,
      subscriptionId: created.subscription_id,
    })
    return {
      accessGranted: true,
      assignmentPlanId: assignment?.plan_id || null,
      planId: created.plan_id,
      subscriptionId: created.subscription_id,
      userId: created.user_id,
    }
  }

  async function applyRenewal(event) {
    const binding = await boundSubscription(event)
    const row = await renewals.applyTrustedRenewal({
      clientClaim: {},
      current_period_end: event.periodEnd,
      external_event_id: event.providerEventId,
      outcome: event.type === 'renewal.succeeded' ? 'succeeded' : 'failed',
      past_due_grace_until: event.graceUntil,
      subscription_id: binding.subscriptionId,
    })
    if (activation) {
      await activation.syncFromSubscription({
        clientClaim: {},
        external_event_id: `${event.providerEventId}.assignment`,
        subscription_id: binding.subscriptionId,
      })
    }
    return {
      accessGranted: row.status === 'ACTIVE' || row.status === 'PAST_DUE',
      currentPeriodEnd: row.current_period_end,
      planId: row.plan_id,
      proration: false,
      refund: false,
      status: row.status,
      userId: row.user_id,
    }
  }

  async function cancelRenewal(event) {
    const binding = await boundSubscription(event)
    const before = await subscriptions.getSubscription(binding.subscriptionId)
    const row = await subscriptions.scheduleCancelAtPeriodEnd({
      clientClaim: {},
      external_event_id: event.providerEventId,
      subscription_id: binding.subscriptionId,
    })
    return {
      accessGranted: row.status === 'ACTIVE' || row.status === 'TRIALING',
      cancelAtPeriodEnd: row.cancel_at_period_end === true,
      currentPeriodEnd: row.current_period_end,
      periodUnchanged: row.current_period_end === before?.current_period_end,
      proration: false,
      refund: false,
      status: row.status,
    }
  }

  async function terminate(event) {
    const binding = await boundSubscription(event)
    const row = await subscriptions.finalizeOpenSubscription({
      clientClaim: {},
      external_event_id: event.providerEventId,
      subscription_id: binding.subscriptionId,
    })
    return {
      accessGranted: false,
      proration: false,
      refund: false,
      status: row.status,
    }
  }
}

function reject(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function quotaPlan(state, userId) {
  const assignment = state.assignments.find((row) => row.userId === userId)
  return assignment?.planId || 'plan.free'
}

/**
 * Local stand-in for billing.activate_verified_checkout. State commits only
 * after subscription creation, provider-ref binding, assignment sync, and
 * intent consumption all succeed.
 */
export function createInMemoryCheckoutActivation({ now = () => new Date(), plans = new Map() } = {}) {
  let state = { assignments: [], intents: [], quotaReservations: [], subscriptions: [] }
  let sequence = 0

  function commit(next) {
    state = next
  }

  return {
    async activate(input = {}) {
      const next = clone(state)
      const intent = next.intents.find((row) => row.checkoutId === input.checkoutId)
      if (!intent) reject('checkout_intent_missing')
      if (intent.provider !== input.provider) reject('provider_mismatch')
      if (intent.providerCheckoutRef && intent.providerCheckoutRef !== input.providerCheckoutRef) {
        reject('provider_checkout_mismatch')
      }
      if (intent.status === 'consumed') {
        if (intent.providerEventId !== input.providerEventId) reject('checkout_intent_consumed')
        const stored = next.subscriptions.find((row) => row.subscriptionId === intent.subscriptionId)
        if (!stored || stored.userId !== intent.userId || stored.planId !== intent.planId
          || stored.providerSubscriptionRef !== input.providerSubscriptionRef) {
          reject('duplicate_external_event')
        }
        return resultFrom(intent, stored, quotaPlan(next, intent.userId))
      }
      if (intent.status === 'cancelled') reject('checkout_intent_cancelled')
      if (intent.status === 'expired' || new Date(intent.expiresAt).getTime() <= now().getTime()) {
        if (intent.status === 'pending') intent.status = 'expired'
        commit(next)
        reject('checkout_intent_expired')
      }
      if (next.subscriptions.some((row) => row.provider === input.provider && row.providerSubscriptionRef === input.providerSubscriptionRef)
        || next.intents.some((row) => row.providerEventId === input.providerEventId && row.checkoutId !== intent.checkoutId)) {
        reject('provider_subscription_conflict')
      }
      const subscription = {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: input.periodEnd,
        currentPeriodStart: input.periodStart,
        planId: intent.planId,
        provider: input.provider,
        providerCustomerRef: input.providerCustomerRef,
        providerEventId: input.providerEventId,
        providerSubscriptionRef: input.providerSubscriptionRef,
        status: 'ACTIVE',
        subscriptionId: `sub_${sequence += 1}`,
        userId: intent.userId,
      }
      next.subscriptions.push(subscription)
      next.assignments.push({ planId: intent.planId, userId: intent.userId })
      intent.providerEventId = input.providerEventId
      intent.status = 'consumed'
      intent.subscriptionId = subscription.subscriptionId
      if (input.failAt === 'assignment') reject('assignment_sync_unconfirmed')
      commit(next)
      return resultFrom(intent, subscription, intent.planId)
    },
    async bindCheckoutRef({ checkoutId, provider, providerCheckoutRef }) {
      const next = clone(state)
      const intent = next.intents.find((row) => row.checkoutId === checkoutId)
      if (!intent) reject('checkout_intent_missing')
      if (intent.provider !== provider) reject('provider_mismatch')
      if (intent.status === 'cancelled') reject('checkout_intent_cancelled')
      if (intent.status === 'expired' || new Date(intent.expiresAt).getTime() <= now().getTime()) {
        reject('checkout_intent_expired')
      }
      if (intent.status !== 'pending') reject('checkout_intent_consumed')
      if (intent.providerCheckoutRef && intent.providerCheckoutRef !== providerCheckoutRef) {
        reject('provider_checkout_conflict')
      }
      if (next.intents.some((row) => row.checkoutId !== checkoutId && row.provider === provider && row.providerCheckoutRef === providerCheckoutRef)) {
        reject('provider_checkout_conflict')
      }
      intent.providerCheckoutRef = providerCheckoutRef
      commit(next)
      return { accessGranted: false, checkoutId, planId: intent.planId, status: intent.status, userId: intent.userId }
    },
    async cancelIntent(checkoutId) {
      const next = clone(state)
      const intent = next.intents.find((row) => row.checkoutId === checkoutId)
      if (!intent) reject('checkout_intent_missing')
      if (intent.status === 'consumed') reject('checkout_intent_consumed')
      if (intent.status === 'pending') intent.status = 'cancelled'
      commit(next)
      return { accessGranted: false, status: intent.status, subscriptionId: intent.subscriptionId || null }
    },
    async createIntent({ clientPlanId, clientUserId, planId, provider, providerPriceRef, userId }) {
      void clientPlanId
      void clientUserId
      const plan = plans.get(planId)
      if (planId === 'plan.free' || !plan?.active || plan.enabledForSale !== true) reject('invalid_checkout_intent')
      const intent = {
        checkoutId: `chk_${sequence += 1}`,
        expiresAt: new Date(now().getTime() + 30 * 60 * 1000).toISOString(),
        planId,
        provider,
        providerCheckoutRef: '',
        providerEventId: '',
        providerPriceRef: providerPriceRef || '',
        status: 'pending',
        subscriptionId: null,
        userId,
      }
      const next = clone(state)
      next.intents.push(intent)
      commit(next)
      return {
        accessGranted: false,
        checkoutId: intent.checkoutId,
        planId: intent.planId,
        status: 'pending',
        subscriptionId: null,
        userId: intent.userId,
      }
    },
    getIntent(checkoutId) {
      return state.intents.find((row) => row.checkoutId === checkoutId) || null
    },
    quotaPlan(userId) {
      return quotaPlan(state, userId)
    },
    quotaReservations() {
      return state.quotaReservations.length
    },
  }
}

function resultFrom(intent, subscription, assignmentPlanId) {
  return {
    accessGranted: true,
    assignmentPlanId,
    currentPeriodEnd: subscription.currentPeriodEnd,
    planId: intent.planId,
    proration: false,
    provider: subscription.provider,
    providerCustomerRef: subscription.providerCustomerRef,
    providerSubscriptionRef: subscription.providerSubscriptionRef,
    refund: false,
    status: subscription.status,
    subscriptionId: subscription.subscriptionId,
    userId: intent.userId,
  }
}

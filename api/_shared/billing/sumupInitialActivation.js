import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import {
  minorUnitsFromSumUpAmount,
  SUMUP_PROVIDER,
  sumUpMonthPeriod,
} from './providers/sumup.js'
import { instrumentFingerprint, sumUpCustomerIdForUser } from './sumupRecurring.js'

export const SUMUP_INITIAL_ACTIVATION_RPC = 'billing.activate_verified_sumup_setup'
export const SUMUP_CHECKOUT_INTENT_RPC = 'billing.read_sumup_checkout_intent'

export function createServerSumUpCheckoutIntentReader(callRpc) {
  return {
    async get(checkoutId) {
      const data = await callRpc(SUMUP_CHECKOUT_INTENT_RPC, { p_checkout_id: checkoutId })
      const row = data && typeof data === 'object' && !Array.isArray(data) ? data : null
      if (!row || row.checkout_id !== checkoutId || row.provider !== SUMUP_PROVIDER) return null
      return {
        checkoutId: row.checkout_id,
        expiresAt: row.expires_at,
        planId: row.plan_id,
        provider: row.provider,
        providerCheckoutRef: row.provider_checkout_ref || '',
        status: row.status,
        userId: row.user_id,
      }
    },
  }
}

const CHECKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FORBIDDEN_ARGS = ['p_plan_id', 'p_subscription_id', 'p_token', 'p_user_id', 'token']

function reject(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function failure(code) {
  return { accessGranted: false, code, ok: false }
}

function quotaPlan(state, userId) {
  const assignment = state.assignments.find((row) => row.userId === userId)
  return assignment?.planId || 'plan.free'
}

/**
 * Local stand-in for billing.activate_verified_sumup_setup. The cloned
 * state replaces the stored state only after subscription creation,
 * instrument binding, assignment sync, and intent consumption all succeed.
 */
export function createInMemorySumUpInitialActivation({ now = () => new Date(), plans = new Map() } = {}) {
  let state = { assignments: [], instruments: [], intents: [], subscriptions: [] }
  let sequence = 0

  function commit(next) {
    state = next
  }

  return {
    async activate(args = {}) {
      if (FORBIDDEN_ARGS.some((key) => args[key] != null)) reject('CLIENT_AUTHORITY_REJECTED')
      const input = {
        checkoutId: args.p_checkout_id,
        customerRef: args.p_provider_customer_ref,
        eventId: args.p_provider_event_id,
        failAt: args.failAt || '',
        fingerprint: args.p_instrument_fingerprint,
        periodEnd: args.p_period_end,
        periodStart: args.p_period_start,
        providerCheckoutRef: args.p_provider_checkout_ref,
        providerSubscriptionRef: args.p_provider_subscription_ref,
      }
      if (!/^[A-Za-z0-9._:-]+$/.test(String(input.eventId || ''))
        || String(input.eventId).length > 120
        || !/^vk[0-9a-f]{32}$/.test(String(input.customerRef || ''))
        || !/^[A-Za-z0-9._:-]{1,120}$/.test(String(input.providerSubscriptionRef || ''))
        || !/^[A-Za-z0-9._:-]{1,80}$/.test(String(input.providerCheckoutRef || ''))
        || !input.periodStart
        || !input.periodEnd
        || new Date(input.periodEnd).getTime() <= new Date(input.periodStart).getTime()) {
        reject('invalid_provider_event')
      }
      if (!/^[0-9a-f]{64}$/.test(String(input.fingerprint || ''))) reject('invalid_recurring_instrument')

      const next = clone(state)
      const intent = next.intents.find((row) => row.checkoutId === input.checkoutId)
      if (!intent) reject('checkout_intent_missing')
      if (intent.provider !== SUMUP_PROVIDER) reject('provider_mismatch')
      if (!intent.providerCheckoutRef || intent.providerCheckoutRef !== input.providerCheckoutRef) {
        reject('provider_checkout_mismatch')
      }
      if (input.customerRef !== sumUpCustomerIdForUser(intent.userId)) reject('customer_mismatch')

      if (intent.status === 'consumed') {
        if (intent.providerEventId !== input.eventId) reject('checkout_intent_consumed')
        const stored = next.subscriptions.find((row) => row.subscriptionId === intent.subscriptionId)
        const instrument = next.instruments.find((row) => row.subscriptionId === intent.subscriptionId)
        const assigned = next.assignments.find((row) => row.userId === intent.userId)
        if (!stored || stored.userId !== intent.userId || stored.planId !== intent.planId
          || stored.providerSubscriptionRef !== input.providerSubscriptionRef
          || stored.providerCustomerRef !== input.customerRef
          || stored.currentPeriodStart !== input.periodStart
          || stored.currentPeriodEnd !== input.periodEnd) {
          reject('duplicate_external_event')
        }
        if (!instrument || instrument.userId !== intent.userId || instrument.fingerprint !== input.fingerprint
          || instrument.customerId !== input.customerRef || instrument.setupCheckoutRef !== input.providerCheckoutRef) {
          reject('instrument_conflict')
        }
        if (!assigned || assigned.planId !== intent.planId) reject('assignment_sync_unconfirmed')
        return resultFrom(intent, stored, assigned.planId)
      }
      if (intent.status === 'cancelled') reject('checkout_intent_cancelled')
      if (intent.status === 'expired' || new Date(intent.expiresAt).getTime() <= now().getTime()) {
        reject('checkout_intent_expired')
      }
      if (next.subscriptions.some((row) => row.userId === intent.userId && row.status === 'ACTIVE')) {
        reject('duplicate_open_subscription')
      }
      if (next.subscriptions.some((row) => row.providerSubscriptionRef === input.providerSubscriptionRef)
        || next.intents.some((row) => row.providerEventId === input.eventId && row.checkoutId !== intent.checkoutId)) {
        reject('provider_subscription_conflict')
      }
      if (next.instruments.some((row) => row.fingerprint === input.fingerprint || row.customerId === input.customerRef)) {
        reject('instrument_conflict')
      }

      if (input.failAt === 'subscription') reject('duplicate_open_subscription')
      const subscription = {
        currentPeriodEnd: input.periodEnd,
        currentPeriodStart: input.periodStart,
        planId: intent.planId,
        provider: SUMUP_PROVIDER,
        providerCustomerRef: input.customerRef,
        providerSubscriptionRef: input.providerSubscriptionRef,
        status: 'ACTIVE',
        subscriptionId: `sub_${sequence += 1}`,
        userId: intent.userId,
      }
      next.subscriptions.push(subscription)

      if (input.failAt === 'instrument') reject('instrument_bind_failed')
      next.instruments.push({
        customerId: input.customerRef,
        fingerprint: input.fingerprint,
        setupCheckoutRef: input.providerCheckoutRef,
        subscriptionId: subscription.subscriptionId,
        userId: intent.userId,
      })

      if (input.failAt === 'assignment') reject('assignment_sync_unconfirmed')
      const plan = plans.get(intent.planId)
      if (!plan?.active) reject('assignment_sync_unconfirmed')
      next.assignments.push({ planId: intent.planId, userId: intent.userId })

      intent.providerEventId = input.eventId
      intent.status = 'consumed'
      intent.subscriptionId = subscription.subscriptionId
      if (input.failAt === 'intent') reject('checkout_intent_unconfirmed')
      commit(next)
      return resultFrom(intent, subscription, intent.planId)
    },
    async cancelIntent(checkoutId) {
      const next = clone(state)
      const intent = next.intents.find((row) => row.checkoutId === checkoutId)
      if (!intent) reject('checkout_intent_missing')
      if (intent.status === 'consumed') reject('checkout_intent_consumed')
      if (intent.status === 'pending') intent.status = 'cancelled'
      commit(next)
      return { accessGranted: false, status: intent.status }
    },
    async bindCheckoutRef({ checkoutId, providerCheckoutRef }) {
      const next = clone(state)
      const intent = next.intents.find((row) => row.checkoutId === checkoutId)
      if (!intent || intent.status !== 'pending') reject('checkout_intent_missing')
      if (intent.providerCheckoutRef && intent.providerCheckoutRef !== providerCheckoutRef) {
        reject('provider_checkout_conflict')
      }
      if (next.intents.some((row) => row.checkoutId !== checkoutId && row.providerCheckoutRef === providerCheckoutRef)) {
        reject('provider_checkout_conflict')
      }
      intent.providerCheckoutRef = providerCheckoutRef
      commit(next)
      return { accessGranted: false, checkoutId }
    },
    async createIntent({ checkoutId, clientPlanId, clientUserId, planId, userId } = {}) {
      void clientPlanId
      void clientUserId
      const plan = plans.get(planId)
      if (!userId || planId === 'plan.free' || !plan?.active || plan.enabledForSale !== true) {
        reject('invalid_checkout_intent')
      }
      const intent = {
        checkoutId: checkoutId || `chk_${sequence += 1}`,
        expiresAt: new Date(now().getTime() + (30 * 60 * 1000)).toISOString(),
        planId,
        provider: SUMUP_PROVIDER,
        providerCheckoutRef: '',
        providerEventId: '',
        status: 'pending',
        subscriptionId: null,
        userId,
      }
      const next = clone(state)
      next.intents.push(intent)
      commit(next)
      return { accessGranted: false, checkoutId: intent.checkoutId, planId, userId }
    },
    getIntent(checkoutId) {
      return state.intents.find((row) => row.checkoutId === checkoutId) || null
    },
    inspect() {
      return {
        assignments: state.assignments.map((row) => ({ planId: row.planId, userId: row.userId })),
        instruments: state.instruments.map((row) => ({
          fingerprint: row.fingerprint,
          subscriptionId: row.subscriptionId,
          userId: row.userId,
        })),
        subscriptions: state.subscriptions.map((row) => ({
          planId: row.planId,
          subscriptionId: row.subscriptionId,
          userId: row.userId,
        })),
      }
    },
    quotaPlan(userId) {
      return quotaPlan(state, userId)
    },
  }
}

/**
 * Retrieves the SumUp checkout, verifies the paid setup, then calls the
 * atomic activation RPC once. Client payment fields are ignored.
 */
export async function activateVerifiedSumUpSetup({
  amount,
  callRpc,
  catalog,
  checkoutId,
  clientStatus,
  currency,
  instrumentToken,
  intents,
  merchantCode,
  now = () => new Date(),
  periodEnd,
  periodStart,
  planId,
  providerCustomerRef,
  subscriptionId,
  transport,
  userId,
} = {}) {
  void amount
  void clientStatus
  void currency
  void instrumentToken
  void periodEnd
  void periodStart
  void planId
  void providerCustomerRef
  void subscriptionId
  void userId
  if (typeof callRpc !== 'function' || typeof transport?.retrieveCheckout !== 'function' || typeof intents?.get !== 'function') {
    return failure('durable_operation_unavailable')
  }
  if (!CHECKOUT_ID_RE.test(String(checkoutId || ''))) return failure('INVALID_PROVIDER_EVENT')
  let checkout
  try {
    checkout = await transport.retrieveCheckout(checkoutId)
  } catch {
    return failure('SUMUP_UNAVAILABLE')
  }
  if (String(checkout?.id || '').toLowerCase() !== String(checkoutId).toLowerCase()) {
    return failure('WRONG_CHECKOUT_REF')
  }
  const intent = await intents.get(String(checkout?.checkout_reference || ''))
  if (!intent || intent.provider !== SUMUP_PROVIDER) return failure('CHECKOUT_INTENT_MISSING')
  if (intent.status !== 'consumed') {
    if (intent.status === 'cancelled') return failure('CHECKOUT_INTENT_CANCELLED')
    if (intent.status === 'expired' || new Date(intent.expiresAt).getTime() <= now().getTime()) {
      return failure('CHECKOUT_INTENT_EXPIRED')
    }
  }
  if (!intent.providerCheckoutRef || intent.providerCheckoutRef !== checkout.id) return failure('WRONG_CHECKOUT_REF')
  if (checkout.purpose !== 'SETUP_RECURRING_PAYMENT') return failure('PURPOSE_MISMATCH')
  const plan = getPlanById(intent.planId, catalog)
  if (!plan || plan.id === 'plan.free' || plan.currency !== 'SEK' || plan.active !== true) return failure('INVALID_PLAN')
  if (checkout.currency !== 'SEK') return failure('CURRENCY_MISMATCH')
  if (minorUnitsFromSumUpAmount(checkout.amount) !== plan.price_minor) return failure('AMOUNT_MISMATCH')
  if (checkout.merchant_code !== merchantCode) return failure('MERCHANT_MISMATCH')
  if (checkout.status === 'PENDING') return failure('PAYMENT_PENDING')
  if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') return failure('PAYMENT_FAILED')
  if (checkout.status !== 'PAID') return failure('PAYMENT_UNKNOWN')
  const customerRef = sumUpCustomerIdForUser(intent.userId)
  if (!customerRef || checkout.customer_id !== customerRef) return failure('CUSTOMER_MISMATCH')
  const paid = (Array.isArray(checkout.transactions) ? checkout.transactions : []).filter((row) => row?.status === 'SUCCESSFUL')
  if (paid.length !== 1 || !CHECKOUT_ID_RE.test(String(paid[0]?.id || ''))) return failure('PAYMENT_BINDING_UNAVAILABLE')
  if (paid[0].currency !== 'SEK' || minorUnitsFromSumUpAmount(paid[0].amount) !== plan.price_minor) {
    return failure('AMOUNT_MISMATCH')
  }
  const paidAt = new Date(paid[0].timestamp || '')
  if (Number.isNaN(paidAt.getTime())) return failure('PAYMENT_BINDING_UNAVAILABLE')
  const fingerprint = instrumentFingerprint(checkout.payment_instrument?.token)
  if (!fingerprint) return failure('UNVERIFIED_INSTRUMENT')
  const period = sumUpMonthPeriod(paidAt)
  const applied = await callRpc(SUMUP_INITIAL_ACTIVATION_RPC, {
    p_checkout_id: intent.checkoutId,
    p_instrument_fingerprint: fingerprint,
    p_period_end: period.end,
    p_period_start: period.start,
    p_provider_checkout_ref: checkout.id,
    p_provider_customer_ref: customerRef,
    p_provider_event_id: `paid:${checkout.id}`,
    p_provider_subscription_ref: String(paid[0].id),
  })
  if (applied?.access_granted !== true) return failure('activation_unconfirmed')
  return {
    accessGranted: true,
    assignmentPlanId: applied.assignment_plan_id,
    ok: true,
    planId: applied.plan_id,
    subscriptionId: applied.subscription_id,
    userId: applied.user_id,
  }
}

function resultFrom(intent, subscription, assignmentPlanId) {
  return {
    access_granted: true,
    assignment_plan_id: assignmentPlanId,
    current_period_end: subscription.currentPeriodEnd,
    plan_id: intent.planId,
    proration: false,
    provider: SUMUP_PROVIDER,
    provider_customer_ref: subscription.providerCustomerRef,
    provider_subscription_ref: subscription.providerSubscriptionRef,
    refund: false,
    status: subscription.status,
    subscription_id: subscription.subscriptionId,
    user_id: intent.userId,
  }
}

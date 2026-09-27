/**
 * Provider-neutral Minimum Paid Launch contract.
 *
 * A provider may supply only these facts: provider name, customer ref,
 * subscription ref, event id, price/product ref, payment status, period
 * boundary, renewal outcome, and optional grace. This app derives the user,
 * internal plan, sale flag, subscription status, pending plan, cancellation,
 * assignment, and quota.
 *
 * Mapping:
 * successful initial checkout -> billing.create_subscription + assignment sync
 * successful renewal -> billing renewal success / period advance
 * failed renewal -> billing renewal failure / PAST_DUE grace
 * user cancellation -> schedule cancel at current_period_end, no refund
 * provider termination -> finalize the open subscription, no refund
 *
 * Checkout creation does not grant paid access. SumUp is the selected
 * provider and stays unconfigured until server credentials exist.
 */

const EVENT_RE = /^[A-Za-z0-9._:-]+$/
const TOKEN_RE = /^[A-Za-z0-9._-]{1,40}$/

export const PROVIDER_EVENT_TYPES = Object.freeze([
  'checkout.activated',
  'renewal.succeeded',
  'renewal.failed',
  'subscription.cancelled',
  'subscription.terminated',
])

const AUTHORITY_FIELDS = [
  'cancel_at_period_end',
  'current_period_end',
  'current_period_start',
  'enabled_for_sale',
  'entitlement',
  'entitlements',
  'plan_id',
  'planId',
  'price',
  'price_minor',
  'quota',
  'status',
  'subscription_id',
  'subscriptionId',
  'user_id',
  'userId',
]

export function createProviderRegistry() {
  const adapters = new Map()
  return {
    get(provider) {
      return adapters.get(String(provider || '')) || null
    },
    list() {
      return [...adapters.keys()]
    },
    register(adapter) {
      const provider = String(adapter?.provider || '')
      if (!TOKEN_RE.test(provider) || typeof adapter.verify !== 'function') {
        const error = new Error('invalid_provider_adapter')
        error.code = 'invalid_provider_adapter'
        throw error
      }
      adapters.set(provider, adapter)
      return adapter
    },
  }
}

let registry = createProviderRegistry()
let trustedApply = null

export function getPaymentProviderRegistry() {
  return registry
}

export function getTrustedProviderApply() {
  return trustedApply
}

export function setPaymentProviderRegistryForTests(next = null) {
  registry = next || createProviderRegistry()
}

export function setTrustedProviderApplyForTests(next = null) {
  trustedApply = typeof next === 'function' ? next : null
}

export function normalizeProviderEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { code: 'UNKNOWN_EVENT', ok: false, status: 400 }
  }
  for (const field of AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      return { code: 'CLIENT_AUTHORITY_REJECTED', ok: false, status: 400 }
    }
  }
  const type = String(payload.type || '')
  if (!PROVIDER_EVENT_TYPES.includes(type)) {
    return { code: 'UNKNOWN_EVENT', ok: false, status: 400 }
  }
  const provider = String(payload.provider || '')
  const providerEventId = String(payload.providerEventId || '').trim()
  if (!TOKEN_RE.test(provider) || !EVENT_RE.test(providerEventId) || providerEventId.length > 120) {
    return { code: 'INVALID_PROVIDER_EVENT', ok: false, status: 400 }
  }
  const event = {
    checkoutId: optionalToken(payload.checkoutId, 80),
    graceUntil: optionalTimestamp(payload.graceUntil),
    paymentStatus: optionalToken(payload.paymentStatus, 40),
    periodEnd: optionalTimestamp(payload.periodEnd),
    periodStart: optionalTimestamp(payload.periodStart),
    provider,
    providerCheckoutRef: optionalToken(payload.providerCheckoutRef, 120),
    providerCustomerRef: optionalToken(payload.providerCustomerRef, 120),
    providerEventId,
    providerPriceRef: optionalToken(payload.providerPriceRef, 120),
    providerSubscriptionRef: optionalToken(payload.providerSubscriptionRef, 120),
    type,
  }
  if (event.checkoutId === false || event.graceUntil === false || event.paymentStatus === false
    || event.periodEnd === false || event.periodStart === false || event.providerCheckoutRef === false
    || event.providerCustomerRef === false
    || event.providerPriceRef === false || event.providerSubscriptionRef === false) {
    return { code: 'INVALID_PROVIDER_EVENT', ok: false, status: 400 }
  }
  return { event, ok: true }
}

function optionalToken(value, max) {
  if (value == null || value === '') return null
  const token = String(value)
  if (!EVENT_RE.test(token) || token.length > max) return false
  return token
}

function optionalTimestamp(value) {
  if (value == null || value === '') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString()
}

export function providerEventFingerprint(event) {
  return JSON.stringify({
    checkoutId: event.checkoutId,
    graceUntil: event.graceUntil,
    paymentStatus: event.paymentStatus,
    periodEnd: event.periodEnd,
    periodStart: event.periodStart,
    provider: event.provider,
    providerCheckoutRef: event.providerCheckoutRef,
    providerCustomerRef: event.providerCustomerRef,
    providerEventId: event.providerEventId,
    providerPriceRef: event.providerPriceRef,
    providerSubscriptionRef: event.providerSubscriptionRef,
    type: event.type,
  })
}

import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import { isOfficialSumUpHostedUrl, minorUnitsFromSumUpAmount, SUMUP_PROVIDER } from './providers/sumup.js'
import { sumUpCustomerIdForUser } from './sumupRecurring.js'

// SumUp Hosted Checkout, engångsköp: 30 dagar, ingen förnyelse.
// Webhooken och kundens återkomst anropar samma verifiering och samma
// atomiska aktivering. Återkomsten i sig ger aldrig tillgång.

export const ONE_TIME_ACTIVATION_RPC = 'billing.activate_verified_one_time_checkout'
export const ONE_TIME_READ_RPC = 'billing.read_one_time_checkout'
export const ONE_TIME_TTL_SECONDS = 30 * 60

const CHECKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INTENT_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/

function failure(code, state = 'failed') {
  return { accessGranted: false, code, ok: false, state }
}

/**
 * Webhook and return addresses come from server configuration only, never
 * from the request. BILLING_PUBLIC_BASE_URL is the app origin, e.g.
 * https://viktkollen-git-<branch>.vercel.app on an isolated Preview.
 */
export function hostedCheckoutUrls(checkoutId, env = process.env) {
  const raw = typeof env.BILLING_PUBLIC_BASE_URL === 'string' ? env.BILLING_PUBLIC_BASE_URL.trim() : ''
  if (!raw || !INTENT_ID_RE.test(String(checkoutId || ''))) return null
  let base
  try {
    base = new URL(raw)
  } catch {
    return null
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
    || (base.pathname !== '/' && base.pathname !== '')) {
    return null
  }
  const origin = base.origin
  return {
    redirectUrl: `${origin}/?vk_checkout=${encodeURIComponent(checkoutId)}#installningar`,
    returnUrl: `${origin}/api/billing/webhook`,
  }
}

/** Durable one-time ports; the same service-role client as the other checkout ports. */
export function createOneTimeCheckoutPorts({ client } = {}) {
  const resolved = client !== undefined ? client : createSupabaseAdminClient()
  if (!resolved || typeof resolved.schema !== 'function') return null
  async function rpc(name, args) {
    const { data, error } = await resolved.schema('billing').rpc(name, args)
    if (error) {
      const message = String(error.message || '')
      const wrapped = new Error(message)
      wrapped.code = ['active_period_exists', 'checkout_in_progress', 'invalid_checkout_intent', 'provider_checkout_conflict']
        .includes(message) ? message : 'checkout_intent_failed'
      throw wrapped
    }
    return data
  }
  return {
    async open({ planId, userId }) {
      const data = await rpc('open_one_time_checkout', {
        p_plan_id: planId,
        p_provider: SUMUP_PROVIDER,
        p_ttl_seconds: ONE_TIME_TTL_SECONDS,
        p_user_id: userId,
      })
      if (!data || data.user_id !== userId || data.plan_id !== planId || data.status !== 'pending'
        || !INTENT_ID_RE.test(String(data.checkout_id || ''))) {
        const wrapped = new Error('invalid_checkout_intent')
        wrapped.code = 'checkout_intent_failed'
        throw wrapped
      }
      return {
        checkoutId: data.checkout_id,
        expiresAt: data.expires_at,
        hostedUrl: data.provider_hosted_url || '',
        planId: data.plan_id,
        providerCheckoutRef: data.provider_checkout_ref || '',
        reused: data.reused === true,
      }
    },
    async bind({ checkoutId, hostedUrl, providerCheckoutRef }) {
      const data = await rpc('bind_hosted_checkout', {
        p_checkout_id: checkoutId,
        p_hosted_url: hostedUrl,
        p_provider: SUMUP_PROVIDER,
        p_provider_checkout_ref: providerCheckoutRef,
      })
      if (data?.checkout_id !== checkoutId || data?.provider_checkout_ref !== providerCheckoutRef
        || data?.provider_hosted_url !== hostedUrl) {
        const wrapped = new Error('provider_checkout_mismatch')
        wrapped.code = 'checkout_intent_failed'
        throw wrapped
      }
      return data
    },
    async cancel(checkoutId) {
      return rpc('cancel_checkout_intent', { p_checkout_id: checkoutId })
    },
  }
}

/** Intent reader for the activation. Identity comes from the database row. */
export function createOneTimeIntentReader(callRpc) {
  return async function readIntent(checkoutId) {
    if (!INTENT_ID_RE.test(String(checkoutId || ''))) return null
    const row = await callRpc(ONE_TIME_READ_RPC, { p_checkout_id: checkoutId })
    if (!row || typeof row !== 'object' || row.checkout_id !== checkoutId || row.provider !== SUMUP_PROVIDER) return null
    return {
      checkoutId: row.checkout_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      planId: row.plan_id,
      providerCheckoutRef: row.provider_checkout_ref || '',
      status: row.status,
      userId: String(row.user_id || ''),
    }
  }
}

/**
 * Retrieves the SumUp checkout with the server key, verifies it against the
 * stored purchase and the server price, and only for a single successful
 * payment calls the atomic activation. Anything else grants nothing.
 *
 * expectUserId: set by the return view; the purchase must belong to the
 * signed-in user. The webhook has no user and relies on the stored purchase.
 */
export async function activateVerifiedOneTimeCheckout({
  callRpc,
  catalog,
  expectUserId = null,
  merchantCode,
  providerCheckoutRef,
  readIntent,
  transport,
} = {}) {
  if (typeof callRpc !== 'function' || typeof readIntent !== 'function'
    || typeof transport?.retrieveCheckout !== 'function' || !merchantCode) {
    return failure('durable_operation_unavailable', 'error')
  }
  if (!CHECKOUT_ID_RE.test(String(providerCheckoutRef || ''))) return failure('INVALID_PROVIDER_EVENT')
  let checkout
  try {
    checkout = await transport.retrieveCheckout(providerCheckoutRef)
  } catch {
    return failure('SUMUP_UNAVAILABLE', 'pending')
  }
  if (String(checkout?.id || '').toLowerCase() !== String(providerCheckoutRef).toLowerCase()) {
    return failure('WRONG_CHECKOUT_REF')
  }
  if (checkout.purpose === 'SETUP_RECURRING_PAYMENT') return failure('PURPOSE_MISMATCH')
  const intent = await readIntent(String(checkout.checkout_reference || ''))
  if (!intent) return failure('CHECKOUT_INTENT_MISSING')
  if (expectUserId != null && intent.userId !== String(expectUserId)) return failure('CHECKOUT_INTENT_MISSING')
  if (!intent.providerCheckoutRef || intent.providerCheckoutRef !== checkout.id) return failure('WRONG_CHECKOUT_REF')
  if (intent.status === 'cancelled') return failure('CHECKOUT_INTENT_CANCELLED', 'cancelled')

  const plan = getPlanById(intent.planId, catalog)
  if (!plan || plan.id === 'plan.free' || plan.currency !== 'SEK' || plan.active !== true
    || !Number.isInteger(plan.price_minor) || plan.price_minor <= 0) {
    return failure('INVALID_PLAN')
  }
  if (checkout.merchant_code !== merchantCode) return failure('MERCHANT_MISMATCH')
  if (checkout.currency !== 'SEK') return failure('CURRENCY_MISMATCH')
  if (minorUnitsFromSumUpAmount(checkout.amount) !== plan.price_minor) return failure('AMOUNT_MISMATCH')

  if (checkout.status === 'PENDING') return failure('PAYMENT_PENDING', 'pending')
  if (checkout.status === 'EXPIRED') return failure('PAYMENT_EXPIRED', 'cancelled')
  if (checkout.status === 'FAILED') return failure('PAYMENT_FAILED', 'failed')
  if (checkout.status !== 'PAID') return failure('PAYMENT_UNKNOWN', 'pending')

  const paid = (Array.isArray(checkout.transactions) ? checkout.transactions : [])
    .filter((row) => row?.status === 'SUCCESSFUL')
  if (paid.length !== 1 || !CHECKOUT_ID_RE.test(String(paid[0]?.id || ''))) {
    return failure('PAYMENT_BINDING_UNAVAILABLE', 'review')
  }
  if (paid[0].currency !== 'SEK' || minorUnitsFromSumUpAmount(paid[0].amount) !== plan.price_minor) {
    return failure('AMOUNT_MISMATCH', 'review')
  }
  const paidAt = new Date(paid[0].timestamp || '')
  if (Number.isNaN(paidAt.getTime())) return failure('PAYMENT_BINDING_UNAVAILABLE', 'review')

  // The customer reference is derived from the purchase owner, never read from SumUp
  // alone. A SumUp customer that belongs to someone else is rejected.
  const customerRef = sumUpCustomerIdForUser(intent.userId)
  if (!customerRef) return failure('CUSTOMER_MISMATCH', 'review')
  if (checkout.customer_id && checkout.customer_id !== customerRef) return failure('CUSTOMER_MISMATCH', 'review')

  let applied
  try {
    applied = await callRpc(ONE_TIME_ACTIVATION_RPC, {
      p_checkout_id: intent.checkoutId,
      p_paid_at: paidAt.toISOString(),
      p_provider: SUMUP_PROVIDER,
      p_provider_checkout_ref: checkout.id,
      p_provider_customer_ref: customerRef,
      p_provider_event_id: `paid:${checkout.id}`,
      p_provider_subscription_ref: String(paid[0].id),
    })
  } catch (error) {
    // Paid at SumUp but not activatable (e.g. paid after expiry): manual review.
    return failure(String(error?.code || 'activation_unconfirmed'), 'review')
  }
  if (applied?.access_granted !== true || String(applied.user_id) !== intent.userId) {
    return failure('activation_unconfirmed', 'review')
  }
  return {
    accessGranted: true,
    code: 'PAID',
    currentPeriodEnd: applied.current_period_end,
    ok: true,
    planId: applied.plan_id,
    state: 'paid',
  }
}

/**
 * Return view status for the signed-in owner. Uses the same verification as
 * the webhook; a still-pending payment returns 'pending' and grants nothing.
 */
export async function oneTimeCheckoutStatus({ checkoutId, userId, ...ports } = {}) {
  if (!userId || !INTENT_ID_RE.test(String(checkoutId || ''))) return failure('INVALID_REQUEST', 'unknown')
  const intent = await ports.readIntent(checkoutId)
  if (!intent || intent.userId !== String(userId)) return failure('NOT_FOUND', 'unknown')
  if (intent.status === 'cancelled') return failure('CHECKOUT_INTENT_CANCELLED', 'cancelled')
  if (!intent.providerCheckoutRef) {
    const expired = new Date(intent.expiresAt).getTime() <= Date.now()
    return failure(expired ? 'CHECKOUT_INTENT_EXPIRED' : 'PAYMENT_PENDING', expired ? 'cancelled' : 'pending')
  }
  const result = await activateVerifiedOneTimeCheckout({
    ...ports,
    expectUserId: String(userId),
    providerCheckoutRef: intent.providerCheckoutRef,
  })
  // An unpaid checkout past its lifetime (plus clock margin) can no longer be paid.
  if (result.state === 'pending' && new Date(intent.expiresAt).getTime() + (2 * 60 * 1000) <= Date.now()) {
    return failure('CHECKOUT_INTENT_EXPIRED', 'cancelled')
  }
  return result
}

export function isValidHostedCheckoutUrl(value) {
  return isOfficialSumUpHostedUrl(value)
}

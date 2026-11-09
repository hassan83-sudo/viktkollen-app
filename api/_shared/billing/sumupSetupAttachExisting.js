import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../aiRouteErrors.js'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { requireBillingAdmin } from './admin.js'
import {
  createSumUpHttpTransport,
  minorUnitsFromSumUpAmount,
  readSumUpConfig,
  SUMUP_PROVIDER,
} from './providers/sumup.js'
import { createServerSumUpCheckoutIntentReader } from './sumupInitialActivation.js'
import { createServerSubscriptionRpcCaller } from './subscriptionRpcCaller.js'
import { instrumentFingerprint, sumUpCustomerIdForUser } from './sumupRecurring.js'

export const SUMUP_SETUP_ATTACH_EXISTING_RPC = 'billing.attach_verified_sumup_setup_to_existing'

/** Production recovery target for chk_3552… / subscription 3ad2bfcf…. */
export const SUMUP_SETUP_ATTACH_TARGET = Object.freeze({
  intentCheckoutId: 'chk_3552adcebd09484eb0ff05629af65586',
  planId: 'plan.prelim.sek.month.12',
  providerCheckoutRef: '113c2e77-0c63-4ad6-9624-06dc28c2a3c3',
  subscriptionId: '3ad2bfcf-431b-42c4-9c8f-bf32c6cff0c1',
})

const CHECKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INTENT_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/

function failure(code, status = 400) {
  return { ok: false, code, status }
}

function readBody(request) {
  if (!request.body) return {}
  if (typeof request.body === 'object') return request.body
  try {
    return JSON.parse(request.body)
  } catch {
    return {}
  }
}

function attachEventId(providerCheckoutRef) {
  return `attach:${providerCheckoutRef}`
}

function clearCancelEventId(providerCheckoutRef) {
  return `attach-clear:${providerCheckoutRef}`
}

/**
 * Re-verifies a paid SumUp SETUP checkout, then attaches the mandate to the
 * pinned existing subscription without creating a subscription or charging.
 */
export async function attachVerifiedSumUpSetupToExisting({
  callRpc,
  catalog,
  checkoutId,
  env = process.env,
  intents,
  merchantCode,
  now = () => new Date(),
  subscriptionId,
  transport,
} = {}) {
  void now
  if (typeof callRpc !== 'function' || typeof transport?.retrieveCheckout !== 'function' || typeof intents?.get !== 'function') {
    return failure('DURABLE_UNAVAILABLE', 503)
  }

  const requestedCheckout = String(checkoutId || '').trim()
  const requestedSubscription = String(subscriptionId || '').trim()
  if (!INTENT_ID_RE.test(requestedCheckout) || !INTENT_ID_RE.test(requestedSubscription)) {
    return failure('INVALID_ATTACH_TARGET')
  }
  if (
    requestedCheckout !== SUMUP_SETUP_ATTACH_TARGET.intentCheckoutId
    && requestedCheckout.toLowerCase() !== SUMUP_SETUP_ATTACH_TARGET.providerCheckoutRef
  ) {
    return failure('ATTACH_TARGET_MISMATCH')
  }
  if (requestedSubscription !== SUMUP_SETUP_ATTACH_TARGET.subscriptionId) {
    return failure('ATTACH_TARGET_MISMATCH')
  }

  let intent
  try {
    intent = await intents.get(SUMUP_SETUP_ATTACH_TARGET.intentCheckoutId)
  } catch {
    return failure('DURABLE_UNAVAILABLE', 503)
  }
  if (!intent || intent.provider !== SUMUP_PROVIDER) return failure('CHECKOUT_INTENT_MISSING', 404)
  if (intent.checkoutId !== SUMUP_SETUP_ATTACH_TARGET.intentCheckoutId) {
    return failure('ATTACH_TARGET_MISMATCH')
  }
  if (String(intent.providerCheckoutRef || '').toLowerCase()
    !== SUMUP_SETUP_ATTACH_TARGET.providerCheckoutRef) {
    return failure('WRONG_CHECKOUT_REF')
  }
  if (intent.planId !== SUMUP_SETUP_ATTACH_TARGET.planId) return failure('INVALID_PLAN')
  if (intent.status === 'cancelled') return failure('CHECKOUT_INTENT_CANCELLED')
  if (intent.status !== 'consumed' && intent.status !== 'pending') {
    return failure('CHECKOUT_INTENT_UNCONFIRMED')
  }

  const providerCheckoutRef = SUMUP_SETUP_ATTACH_TARGET.providerCheckoutRef
  let checkout
  try {
    checkout = await transport.retrieveCheckout(providerCheckoutRef)
  } catch {
    return failure('SUMUP_UNAVAILABLE', 503)
  }
  if (String(checkout?.id || '').toLowerCase() !== providerCheckoutRef) {
    return failure('WRONG_CHECKOUT_REF')
  }
  if (checkout.purpose !== 'SETUP_RECURRING_PAYMENT') return failure('PURPOSE_MISMATCH')
  if (String(checkout.checkout_reference || '') !== SUMUP_SETUP_ATTACH_TARGET.intentCheckoutId) {
    return failure('WRONG_CHECKOUT_REF')
  }

  const plan = getPlanById(intent.planId, catalog)
  if (!plan || plan.id !== SUMUP_SETUP_ATTACH_TARGET.planId || plan.currency !== 'SEK' || plan.active !== true) {
    return failure('INVALID_PLAN')
  }
  const resolvedMerchant = merchantCode || readSumUpConfig(env)?.merchantCode
  if (!resolvedMerchant) return failure('SUMUP_NOT_CONFIGURED', 503)
  if (checkout.currency !== 'SEK') return failure('CURRENCY_MISMATCH')
  if (minorUnitsFromSumUpAmount(checkout.amount) !== plan.price_minor) return failure('AMOUNT_MISMATCH')
  if (checkout.merchant_code !== resolvedMerchant) return failure('MERCHANT_MISMATCH')
  if (checkout.status === 'PENDING') return failure('PAYMENT_PENDING')
  if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') return failure('PAYMENT_FAILED')
  if (checkout.status !== 'PAID') return failure('PAYMENT_UNKNOWN')

  const customerRef = sumUpCustomerIdForUser(intent.userId)
  if (!customerRef || checkout.customer_id !== customerRef) return failure('CUSTOMER_MISMATCH')

  const paid = (Array.isArray(checkout.transactions) ? checkout.transactions : [])
    .filter((row) => row?.status === 'SUCCESSFUL')
  if (paid.length !== 1 || !CHECKOUT_ID_RE.test(String(paid[0]?.id || ''))) {
    return failure('PAYMENT_BINDING_UNAVAILABLE')
  }
  if (paid[0].currency !== 'SEK' || minorUnitsFromSumUpAmount(paid[0].amount) !== plan.price_minor) {
    return failure('AMOUNT_MISMATCH')
  }

  const fingerprint = instrumentFingerprint(checkout.payment_instrument?.token)
  if (!fingerprint) return failure('UNVERIFIED_INSTRUMENT')

  let applied
  try {
    applied = await callRpc(SUMUP_SETUP_ATTACH_EXISTING_RPC, {
      p_checkout_id: intent.checkoutId,
      p_clear_cancel_event_id: clearCancelEventId(providerCheckoutRef),
      p_instrument_fingerprint: fingerprint,
      p_provider_checkout_ref: providerCheckoutRef,
      p_provider_customer_ref: customerRef,
      p_provider_event_id: attachEventId(providerCheckoutRef),
      p_subscription_id: SUMUP_SETUP_ATTACH_TARGET.subscriptionId,
    })
  } catch (error) {
    const code = String(error?.code || 'ATTACH_FAILED').toUpperCase()
    const status = code === 'DURABLE_OPERATION_UNAVAILABLE' || code === 'BILLING_RPC_FAILED' ? 503 : 409
    return failure(code, status)
  }

  if (
    applied?.instrument_bound !== true
    || applied?.subscription_id !== SUMUP_SETUP_ATTACH_TARGET.subscriptionId
    || applied?.user_id !== intent.userId
    || applied?.plan_id !== SUMUP_SETUP_ATTACH_TARGET.planId
    || applied?.cancel_at_period_end !== false
    || applied?.provider_customer_ref !== customerRef
    || applied?.proration !== false
    || applied?.refund !== false
  ) {
    return failure('ATTACH_UNCONFIRMED', 409)
  }

  return {
    ok: true,
    accessGranted: applied.access_granted === true,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: applied.current_period_end,
    currentPeriodStart: applied.current_period_start,
    instrumentBound: true,
    planId: applied.plan_id,
    status: 200,
    subscriptionId: applied.subscription_id,
    userId: applied.user_id,
  }
}

export async function handleSumUpSetupAttachExisting(request, response, {
  attach = attachVerifiedSumUpSetupToExisting,
  callRpcFactory = createServerSubscriptionRpcCaller,
  catalog,
  env = process.env,
  transport,
} = {}) {
  const requestId = `bill-sumup-attach-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast POST stöds.',
      status: 405,
    })
  }

  void request.body?.amount
  void request.body?.token
  void request.body?.payment_instrument
  void request.body?.activate
  void request.body?.billing_admin
  void request.body?.current_period_end
  void request.body?.current_period_start
  void request.query?.token

  const admin = await requireBillingAdmin(request, { requestId })
  if (!admin.ok) {
    return response.status(admin.status).json({
      accessGranted: false,
      error: admin.error,
      ok: false,
      requestId,
    })
  }

  const body = readBody(request)
  const checkoutId = typeof body.checkout_id === 'string' ? body.checkout_id.trim() : ''
  const subscriptionId = typeof body.subscription_id === 'string' ? body.subscription_id.trim() : ''

  let callRpc = null
  let intents = null
  try {
    callRpc = callRpcFactory()
    intents = createServerSumUpCheckoutIntentReader(callRpc)
  } catch {
    callRpc = null
    intents = null
  }

  const config = readSumUpConfig(env)
  const http = transport || (config ? createSumUpHttpTransport({ apiKey: config.apiKey }) : null)

  const result = await attach({
    callRpc,
    catalog,
    checkoutId,
    env,
    intents,
    merchantCode: config?.merchantCode,
    subscriptionId,
    transport: http,
  })

  if (!result.ok) {
    return response.status(result.status || 400).json({
      accessGranted: false,
      error: { code: result.code },
      ok: false,
      requestId,
    })
  }

  return response.status(200).json({
    accessGranted: result.accessGranted === true,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: result.currentPeriodEnd,
    currentPeriodStart: result.currentPeriodStart,
    instrumentBound: true,
    ok: true,
    planId: result.planId,
    requestId,
    subscriptionId: result.subscriptionId,
  })
}

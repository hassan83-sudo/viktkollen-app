import { createSupabaseAdminClient } from '../supabaseServer.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../aiRouteErrors.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { readServerPlanSale } from './userLifecycleIntent.js'

const PLAN_ID_RE = /^[A-Za-z0-9._-]{1,80}$/
let saleReaderOverride = null
let checkoutAdapterOverride = null
let checkoutPortsOverride = null

export function setCheckoutSaleReaderForTests(reader = null) {
  saleReaderOverride = typeof reader === 'function' ? reader : null
}

export function setCheckoutAdapterForTests(adapter = null) {
  checkoutAdapterOverride = adapter?.testOnly === true ? adapter : null
}

export function setCheckoutPortsForTests(ports = null) {
  checkoutPortsOverride = ports || null
}

export function getCheckoutAdapter() {
  return checkoutAdapterOverride
}

async function defaultReadSale(planId) {
  return readServerPlanSale(createSupabaseAdminClient(), planId)
}

function fail(code, status, extra = {}) {
  return {
    accessGranted: false,
    code,
    ok: false,
    status,
    ...extra,
  }
}

function readBody(body) {
  if (!body) return {}
  if (typeof body === 'object') return body
  try {
    const parsed = JSON.parse(body)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Starts checkout for the authenticated user. The client may send a plan id.
 * User, sale, status, period, quota, and entitlements are never taken from
 * the body. No provider is connected, so a validated request fails closed
 * and does not create a subscription.
 */
export async function beginCheckout({
  body,
  ports = checkoutPortsOverride,
  readSale = saleReaderOverride || defaultReadSale,
  userId,
} = {}) {
  if (!userId) return fail('AUTH_REQUIRED', 401)
  const input = readBody(body)
  void input.cancel_at_period_end
  void input.current_period_end
  void input.current_period_start
  void input.enabled_for_sale
  void input.entitlement
  void input.entitlements
  void input.price
  void input.price_minor
  void input.provider_checkout_ref
  void input.provider_customer_ref
  void input.provider_subscription_ref
  void input.quota
  void input.status
  void input.subscription_id
  void input.user_id
  void input.userId

  const planId = String(input.plan_id || '').trim()
  if (!PLAN_ID_RE.test(planId) || planId === 'plan.free') return fail('INVALID_PLAN', 400)
  if (typeof readSale !== 'function') return fail('DURABLE_UNAVAILABLE', 503)
  let sale
  try {
    sale = await readSale(planId)
  } catch {
    return fail('DURABLE_UNAVAILABLE', 503)
  }
  if (!sale?.known || sale.active !== true || sale.enabledForSale !== true) {
    return fail('INVALID_PLAN', 400)
  }
  const adapter = getCheckoutAdapter()
  if (!adapter) return fail('PROVIDER_NOT_CONFIGURED', 503, { validated: true })
  if (typeof ports?.createIntent !== 'function' || typeof ports?.bindCheckoutRef !== 'function') {
    return fail('DURABLE_UNAVAILABLE', 503, { validated: true })
  }
  const intent = await ports.createIntent({
    planId,
    provider: adapter.provider,
    providerPriceRef: adapter.priceRef || null,
    userId,
  })
  const prepared = await adapter.prepare({ checkoutId: intent.checkoutId, planId, userId })
  if (prepared?.checkoutUrl || prepared?.url) return fail('PROVIDER_NOT_CONFIGURED', 503, { validated: true })
  await ports.bindCheckoutRef({
    checkoutId: intent.checkoutId,
    provider: adapter.provider,
    providerCheckoutRef: prepared.providerCheckoutRef,
  })
  return fail('CHECKOUT_PENDING', 202, { checkoutId: intent.checkoutId, validated: true })
}

export async function handleCheckoutRequest(request, response) {
  const requestId = `bill-checkout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({ error: auth.error, ok: false })
  }
  const result = await beginCheckout({
    body: request.body,
    userId: auth.user.id,
  })
  return response.status(result.status).json({
    accessGranted: false,
    ...(result.checkoutId ? { checkoutId: result.checkoutId } : {}),
    error: { code: result.code },
    ok: false,
    requestId,
    validated: result.validated === true,
  })
}

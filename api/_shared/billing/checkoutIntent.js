import { createSupabaseAdminClient } from '../supabaseServer.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../aiRouteErrors.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { readServerPlanSale } from './userLifecycleIntent.js'
import { getPlanById, listActivePlans } from '../../../src/services/billing/planCatalog.js'
import { createServerCheckoutIntentPorts } from './sumupSandboxSetup.js'
import { getConfiguredSumUpAdapter, minorUnitsFromSumUpAmount, SUMUP_PROVIDER } from './providers/sumup.js'
import {
  createOneTimeCheckoutPorts,
  createOneTimeIntentReader,
  hostedCheckoutUrls,
  isValidHostedCheckoutUrl,
  oneTimeCheckoutMode,
  oneTimeCheckoutStatus,
} from './sumupOneTimeCheckout.js'
import { createServerSubscriptionRpcCaller } from './subscriptionRpcCaller.js'

const PLAN_ID_RE = /^[A-Za-z0-9._-]{1,80}$/
let saleReaderOverride = null
let checkoutAdapterOverride = null
let checkoutPortsOverride = null
let oneTimePortsOverride = null

export function setCheckoutSaleReaderForTests(reader = null) {
  saleReaderOverride = typeof reader === 'function' ? reader : null
}

export function setCheckoutAdapterForTests(adapter = null) {
  checkoutAdapterOverride = adapter?.testOnly === true ? adapter : null
}

export function setCheckoutPortsForTests(ports = null) {
  checkoutPortsOverride = ports || null
}

export function setOneTimeCheckoutPortsForTests(ports = null) {
  oneTimePortsOverride = ports || null
}

export function getCheckoutAdapter() {
  return checkoutAdapterOverride || getConfiguredSumUpAdapter()
}

async function defaultReadSale(planId) {
  return readServerPlanSale(createSupabaseAdminClient(), planId)
}

// The plan list shows a neutral offer key (sek-<öre>) instead of internal plan ids.
function planIdFromOfferKey(value) {
  const match = /^sek-([1-9][0-9]{0,7})$/.exec(String(value || ''))
  if (!match) return ''
  const matches = listActivePlans().filter((plan) => plan.id !== 'plan.free' && plan.currency === 'SEK'
    && plan.price_minor === Number(match[1]))
  return matches.length === 1 ? matches[0].id : ''
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
  env = process.env,
  oneTimePorts,
  ports = checkoutPortsOverride || createServerCheckoutIntentPorts(),
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
  const clientAmount = input.amount
  const clientCurrency = input.currency
  void input.provider_checkout_ref
  void input.provider_customer_ref
  void input.provider_subscription_ref
  void input.quota
  void input.status
  void input.subscription_id
  void input.user_id
  void input.userId
  void input.BILLING_SUMUP_LIVE_ENABLED
  void input.live_enabled
  void input.sumup_live

  const paymentMode = input.payment_mode == null ? 'one_time' : input.payment_mode
  if (paymentMode !== 'one_time') return fail('UNSUPPORTED_PAYMENT_MODE', 400)
  const planId = String(input.plan_id || planIdFromOfferKey(input.offer_key)).trim()
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
  const plan = getPlanById(planId)
  if (!plan || plan.currency !== 'SEK' || !Number.isInteger(plan.price_minor) || plan.price_minor <= 0) {
    return fail('INVALID_PLAN', 400)
  }
  if (clientAmount != null && minorUnitsFromSumUpAmount(clientAmount) !== plan.price_minor) {
    return fail('INVALID_AMOUNT', 400)
  }
  if (clientCurrency != null && String(clientCurrency).trim().toUpperCase() !== 'SEK') {
    return fail('INVALID_CURRENCY', 400)
  }
  const adapter = getCheckoutAdapter()
  if (!adapter) return fail('PROVIDER_NOT_CONFIGURED', 503, { validated: true })
  if (adapter.provider === SUMUP_PROVIDER) {
    return beginSumUpOneTimeCheckout({
      adapter,
      env,
      planId,
      ports: oneTimePorts || oneTimePortsOverride || createOneTimeCheckoutPorts(),
      userId,
    })
  }
  if (typeof ports?.createIntent !== 'function' || typeof ports?.bindCheckoutRef !== 'function') {
    return fail('DURABLE_UNAVAILABLE', 503, { validated: true })
  }
  if (adapter.provider === SUMUP_PROVIDER && typeof ports.cancelIntent !== 'function') {
    return fail('DURABLE_UNAVAILABLE', 503, { validated: true })
  }
  const intent = await ports.createIntent({
    planId,
    provider: adapter.provider,
    providerPriceRef: adapter.priceRef || null,
    userId,
  })
  let prepared
  try {
    prepared = await adapter.prepare({ checkoutId: intent.checkoutId, planId, userId })
  } catch {
    await cancelQuietly(ports, intent.checkoutId)
    return fail('SUMUP_CHECKOUT_FAILED', 502, { validated: true })
  }
  if (prepared?.checkoutUrl || prepared?.url) {
    await cancelQuietly(ports, intent.checkoutId)
    return fail('PROVIDER_NOT_CONFIGURED', 503, { validated: true })
  }
  if (prepared?.hostedCheckoutUrl && adapter.provider !== SUMUP_PROVIDER) {
    await cancelQuietly(ports, intent.checkoutId)
    return fail('PROVIDER_NOT_CONFIGURED', 503, { validated: true })
  }
  try {
    await ports.bindCheckoutRef({
      checkoutId: intent.checkoutId,
      provider: adapter.provider,
      providerCheckoutRef: prepared.providerCheckoutRef,
    })
  } catch {
    await cancelQuietly(ports, intent.checkoutId)
    return fail('SUMUP_CHECKOUT_FAILED', 502, { validated: true })
  }
  return fail('CHECKOUT_PENDING', 202, {
    checkoutId: intent.checkoutId,
    ...(prepared?.hostedCheckoutUrl ? { hostedCheckoutUrl: prepared.hostedCheckoutUrl } : {}),
    validated: true,
  })
}

/**
 * SumUp Hosted Checkout, one-time purchase. The database allows at most one
 * payable checkout per user: an open one for the same plan is reused, another
 * plan or an open subscription is refused. Nothing here grants access.
 */
async function beginSumUpOneTimeCheckout({ adapter, env, planId, ports, userId }) {
  const identity = oneTimeCheckoutMode(env)
  if (!identity.ok) {
    return fail(identity.code, identity.code === 'LIVE_IDENTITY_REQUIRED' ? 403 : 503, { validated: true })
  }
  const identityCode = identity.mode === 'live' ? 'LIVE_IDENTITY_REQUIRED' : 'SANDBOX_IDENTITY_REQUIRED'
  if (typeof adapter?.transport?.retrieveMerchant !== 'function' || !adapter.merchantCode) {
    return fail(identityCode, 403, { validated: true })
  }
  let merchant
  try {
    merchant = await adapter.transport.retrieveMerchant(adapter.merchantCode)
  } catch {
    return fail(identityCode, 403, { validated: true })
  }
  const sandbox = merchant?.sandbox
  const merchantMatches = merchant?.merchant_code === adapter.merchantCode
    && (identity.mode === 'live' ? sandbox === false : sandbox === true)
  if (!merchantMatches) return fail(identityCode, 403, { validated: true })
  if (typeof ports?.open !== 'function' || typeof ports?.bind !== 'function' || typeof ports?.cancel !== 'function') {
    return fail('DURABLE_UNAVAILABLE', 503, { validated: true })
  }
  let intent
  try {
    intent = await ports.open({ planId, userId })
  } catch (error) {
    if (error?.code === 'active_period_exists') return fail('ACTIVE_PERIOD_EXISTS', 409, { validated: true })
    if (error?.code === 'checkout_in_progress') return fail('CHECKOUT_IN_PROGRESS', 409, { validated: true })
    if (error?.code === 'invalid_checkout_intent') return fail('INVALID_PLAN', 400)
    return fail('DURABLE_UNAVAILABLE', 503, { validated: true })
  }
  if (intent.reused && intent.providerCheckoutRef && isValidHostedCheckoutUrl(intent.hostedUrl)) {
    return fail('CHECKOUT_PENDING', 202, {
      checkoutId: intent.checkoutId,
      hostedCheckoutUrl: intent.hostedUrl,
      validated: true,
    })
  }
  // A reused, not yet bound purchase is left to expire on failure: another
  // request may be finishing it. A new one is cancelled.
  const abandon = async () => {
    if (!intent.reused) {
      try {
        await ports.cancel(intent.checkoutId)
      } catch {
        /* Expiry closes it; it was never shown to the user. */
      }
    }
  }
  const urls = hostedCheckoutUrls(intent.checkoutId, env)
  if (!urls) {
    await abandon()
    return fail('PROVIDER_NOT_CONFIGURED', 503, { validated: true })
  }
  let prepared
  try {
    prepared = await adapter.prepare({
      checkoutId: intent.checkoutId,
      planId,
      redirectUrl: urls.redirectUrl,
      returnUrl: urls.returnUrl,
      validUntil: intent.expiresAt,
    })
  } catch {
    await abandon()
    return fail('SUMUP_CHECKOUT_FAILED', 502, { validated: true })
  }
  if (!isValidHostedCheckoutUrl(prepared?.hostedCheckoutUrl)) {
    await abandon()
    return fail('SUMUP_CHECKOUT_FAILED', 502, { validated: true })
  }
  try {
    await ports.bind({
      checkoutId: intent.checkoutId,
      hostedUrl: prepared.hostedCheckoutUrl,
      providerCheckoutRef: prepared.providerCheckoutRef,
    })
  } catch {
    await abandon()
    return fail('SUMUP_CHECKOUT_FAILED', 502, { validated: true })
  }
  return fail('CHECKOUT_PENDING', 202, {
    checkoutId: intent.checkoutId,
    hostedCheckoutUrl: prepared.hostedCheckoutUrl,
    validated: true,
  })
}

async function cancelQuietly(ports, checkoutId) {
  if (typeof ports?.cancelIntent !== 'function') return
  try {
    await ports.cancelIntent(checkoutId)
  } catch {
    /* The failed checkout still grants no access. Expiry closes a pending intent. */
  }
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
    ...(result.hostedCheckoutUrl ? { hostedCheckoutUrl: result.hostedCheckoutUrl } : {}),
    error: { code: result.code },
    ok: false,
    requestId,
    validated: result.validated === true,
  })
}

/**
 * POST /api/billing/checkout/status { checkout_id }. The customer's return
 * from SumUp: the server retrieves and verifies the payment itself and runs
 * the same atomic activation as the webhook. Returning here grants nothing.
 */
export async function handleCheckoutStatusRequest(request, response, { callRpcFactory = createServerSubscriptionRpcCaller } = {}) {
  const requestId = `bill-checkout-status-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: { code: 'INVALID_REQUEST' }, ok: false, requestId })
  }
  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) return response.status(auth.status).json({ error: auth.error, ok: false })
  const input = readBody(request.body)
  const adapter = getCheckoutAdapter()
  let callRpc
  try {
    callRpc = callRpcFactory()
  } catch {
    callRpc = null
  }
  if (!adapter || adapter.provider !== SUMUP_PROVIDER || typeof callRpc !== 'function') {
    return response.status(503).json({ accessGranted: false, error: { code: 'PROVIDER_NOT_CONFIGURED' }, ok: false, requestId, state: 'unknown' })
  }
  const result = await oneTimeCheckoutStatus({
    callRpc,
    checkoutId: String(input.checkout_id || ''),
    merchantCode: adapter.merchantCode,
    readIntent: createOneTimeIntentReader(callRpc),
    transport: adapter.transport,
    userId: auth.user.id,
  })
  const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'INVALID_REQUEST' ? 400 : 200
  return response.status(status).json({
    accessGranted: result.accessGranted === true,
    ...(result.accessGranted ? { currentPeriodEnd: result.currentPeriodEnd } : { error: { code: result.code } }),
    ok: result.ok === true,
    requestId,
    state: result.state || 'unknown',
  })
}

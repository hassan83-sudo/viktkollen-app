import { setNoStoreHeaders } from '../aiRouteErrors.js'
import { createProviderRegistry, getPaymentProviderRegistry, getTrustedProviderApply, normalizeProviderEvent } from './paymentProviderContract.js'
import { getConfiguredSumUpAdapter, isSumUpCheckoutNotification, SUMUP_PROVIDER, sumUpNotificationCheckoutId } from './providers/sumup.js'
import { createServerSubscriptionRpcCaller, mapBillingRpcError } from './subscriptionRpcCaller.js'
import { activateVerifiedSumUpSetup, createServerSumUpCheckoutIntentReader } from './sumupInitialActivation.js'

const PUBLIC_CODES = new Set([
  'AMOUNT_MISMATCH',
  'BILLING_FAILED',
  'CHECKOUT_INTENT_CANCELLED',
  'CHECKOUT_INTENT_CONSUMED',
  'CHECKOUT_INTENT_EXPIRED',
  'CHECKOUT_INTENT_MISSING',
  'CURRENCY_MISMATCH',
  'CUSTOMER_MISMATCH',
  'INVALID_PLAN',
  'INVALID_PROVIDER_EVENT',
  'MERCHANT_MISMATCH',
  'PAYMENT_BINDING_UNAVAILABLE',
  'PAYMENT_FAILED',
  'PAYMENT_PENDING',
  'PAYMENT_UNKNOWN',
  'PROVIDER_NOT_CONFIGURED',
  'SUMUP_UNAVAILABLE',
  'UNVERIFIED_INSTRUMENT',
  'WRONG_CHECKOUT_REF',
  'activation_unconfirmed',
  'assignment_sync_unconfirmed',
  'billing_rpc_failed',
  'checkout_binding_mismatch',
  'checkout_intent_unconfirmed',
  'customer_mismatch',
  'duplicate_external_event',
  'durable_operation_unavailable',
  'instrument_bind_failed',
  'instrument_conflict',
  'invalid_provider_event',
  'invalid_recurring_instrument',
  'provider_checkout_mismatch',
  'provider_mismatch',
  'provider_subscription_conflict',
])

function fail(code, status) {
  return { accessGranted: false, code, ok: false, status }
}

function httpStatus(code) {
  if (code === 'duplicate_external_event' || code === 'provider_subscription_conflict' || code === 'instrument_conflict') {
    return 409
  }
  if (
    code === 'SUMUP_UNAVAILABLE'
    || code === 'PROVIDER_NOT_CONFIGURED'
    || code === 'durable_operation_unavailable'
    || code === 'billing_rpc_failed'
    || code === 'activation_unconfirmed'
    || code === 'assignment_sync_unconfirmed'
    || code === 'checkout_intent_unconfirmed'
  ) {
    return 503
  }
  return 400
}

function publicBillingCode(error) {
  const direct = String(error?.code || '')
  if (PUBLIC_CODES.has(direct)) return direct
  const mapped = mapBillingRpcError(error)
  return PUBLIC_CODES.has(mapped.code) ? mapped.code : 'BILLING_FAILED'
}

function seal(applied) {
  if (applied?.ok === true && applied?.accessGranted === true) {
    return { accessGranted: true, ok: true, status: 200 }
  }
  const code = publicBillingCode({ code: applied?.code, message: applied?.code })
  return fail(code, httpStatus(code))
}

function adapterWithIntents(adapter, callRpc) {
  if (adapter?.provider !== SUMUP_PROVIDER) return adapter
  if (typeof adapter.intents?.get === 'function' || typeof callRpc !== 'function') return adapter
  return {
    ...adapter,
    intents: createServerSumUpCheckoutIntentReader(callRpc),
  }
}

/**
 * A SumUp notification is only a checkout id. Paid setup access is granted
 * only after server retrieval and the one atomic activation RPC.
 * Any other checkout purpose keeps the existing hosted verification path.
 */
async function activateVerifiedSetupNotification({ adapter, callRpc, now, rawBody }) {
  if (adapter?.provider !== SUMUP_PROVIDER || typeof adapter.transport?.retrieveCheckout !== 'function') {
    return null
  }
  const checkoutId = sumUpNotificationCheckoutId(rawBody)
  if (!checkoutId) return null
  let checkout
  try {
    checkout = await adapter.transport.retrieveCheckout(checkoutId)
  } catch {
    return fail('SUMUP_UNAVAILABLE', 503)
  }
  if (checkout?.purpose !== 'SETUP_RECURRING_PAYMENT') return null
  if (typeof callRpc !== 'function' || typeof adapter.intents?.get !== 'function' || !adapter.merchantCode) {
    return fail('PROVIDER_NOT_CONFIGURED', 503)
  }
  try {
    return seal(await activateVerifiedSumUpSetup({
      callRpc,
      checkoutId,
      intents: adapter.intents,
      merchantCode: adapter.merchantCode,
      now,
      transport: adapter.transport,
    }))
  } catch (error) {
    const code = publicBillingCode(error)
    return fail(code, httpStatus(code))
  }
}

/**
 * Public ingress. Signature verification is mandatory. Raw JSON never reaches
 * the trusted lifecycle processor.
 */
export async function ingestProviderWebhook({
  applyTrusted = getTrustedProviderApply(),
  callRpc = null,
  headers = {},
  now,
  rawBody = '',
  registry = getPaymentProviderRegistry(),
} = {}) {
  const headerProvider = String(headers['x-billing-provider'] || headers['X-Billing-Provider'] || '').trim()
  const provider = headerProvider || (isSumUpCheckoutNotification(rawBody) ? SUMUP_PROVIDER : '')
  const adapter = provider ? registry.get(provider) : null
  if (!adapter) return fail('UNKNOWN_PROVIDER', 404)
  if (isSumUpCheckoutNotification(rawBody)) {
    const setup = await activateVerifiedSetupNotification({
      adapter: adapterWithIntents(adapter, callRpc),
      callRpc,
      now,
      rawBody,
    })
    if (setup) return setup
  }
  let verified
  try {
    verified = await adapter.verify({ headers, rawBody })
  } catch {
    return fail('INVALID_SIGNATURE', 401)
  }
  if (!verified?.ok || !verified.payload || typeof verified.payload !== 'object') {
    return fail(verified?.code || 'INVALID_SIGNATURE', verified?.status || 401)
  }
  const normalized = normalizeProviderEvent(verified.payload)
  if (!normalized.ok) return normalized
  if (typeof applyTrusted !== 'function') return fail('PROVIDER_NOT_CONFIGURED', 503)
  try {
    const applied = await applyTrusted(normalized.event)
    return { accessGranted: applied?.accessGranted === true, ok: true, status: 200 }
  } catch (error) {
    const code = error?.code || 'BILLING_FAILED'
    const status = code === 'duplicate_external_event' || code === 'provider_subscription_conflict' ? 409 : 400
    return fail(code, status)
  }
}

function safeServerCallRpc() {
  try {
    return createServerSubscriptionRpcCaller()
  } catch (error) {
    if (error?.code === 'durable_operation_unavailable') return null
    throw error
  }
}

function registryWithConfiguredSumUp(callRpc) {
  const current = getPaymentProviderRegistry()
  if (current.get(SUMUP_PROVIDER)) return current
  const configured = getConfiguredSumUpAdapter()
  if (!configured) return current
  const registry = createProviderRegistry()
  registry.register(adapterWithIntents(configured, callRpc))
  return registry
}

export async function handleWebhookRequest(request, response, options = {}) {
  const requestId = `bill-webhook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: { code: 'INVALID_REQUEST' }, ok: false, requestId })
  }
  const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? '')
  const sumUpNote = isSumUpCheckoutNotification(rawBody)
  const callRpc = Object.prototype.hasOwnProperty.call(options, 'callRpc')
    ? options.callRpc
    : (sumUpNote ? safeServerCallRpc() : null)
  const registry = options.registry || (sumUpNote ? registryWithConfiguredSumUp(callRpc) : getPaymentProviderRegistry())
  const result = await ingestProviderWebhook({
    callRpc,
    headers: request.headers || {},
    now: options.now,
    rawBody,
    registry,
  })
  return response.status(result.status).json({
    accessGranted: result.accessGranted === true,
    ...(result.ok ? {} : { error: { code: result.code } }),
    ok: result.ok === true,
    requestId,
  })
}

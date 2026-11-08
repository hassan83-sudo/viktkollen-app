import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../aiRouteErrors.js'
import { requireBillingAdmin } from './admin.js'
import {
  createSumUpHttpTransport,
  readSumUpConfig,
  SUMUP_PROVIDER,
} from './providers/sumup.js'
import { createServerSumUpCheckoutIntentReader } from './sumupInitialActivation.js'
import { createServerSubscriptionRpcCaller } from './subscriptionRpcCaller.js'
import { instrumentFingerprint } from './sumupRecurring.js'

const CHECKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INTENT_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/

function readBody(request) {
  if (!request.body) return {}
  if (typeof request.body === 'object') return request.body
  try {
    return JSON.parse(request.body)
  } catch {
    return {}
  }
}

function readCheckoutId(request) {
  const queryId = typeof request.query?.checkout_id === 'string' ? request.query.checkout_id.trim() : ''
  if (queryId) return queryId
  const body = readBody(request)
  return typeof body.checkout_id === 'string' ? body.checkout_id.trim() : ''
}

/**
 * Read-only SumUp merchant checkout inspection for billing_admin.
 * Never returns tokens, card data, or API keys. Never charges or activates.
 */
export async function inspectSumUpCheckout({
  checkoutId,
  env = process.env,
  intents,
  now = () => new Date(),
  transport,
} = {}) {
  const requested = String(checkoutId || '').trim()
  if (!INTENT_ID_RE.test(requested)) {
    return { ok: false, code: 'INVALID_CHECKOUT', status: 400 }
  }

  let providerCheckoutRef = ''
  let intentStatus = null
  let intentExpired = null
  let purpose = null

  if (CHECKOUT_ID_RE.test(requested)) {
    providerCheckoutRef = requested
  } else {
    if (typeof intents?.get !== 'function') {
      return { ok: false, code: 'DURABLE_UNAVAILABLE', status: 503 }
    }
    let intent
    try {
      intent = await intents.get(requested)
    } catch {
      return { ok: false, code: 'DURABLE_UNAVAILABLE', status: 503 }
    }
    if (!intent || intent.provider !== SUMUP_PROVIDER) {
      return { ok: false, code: 'CHECKOUT_INTENT_MISSING', status: 404 }
    }
    providerCheckoutRef = String(intent.providerCheckoutRef || '')
    intentStatus = intent.status || null
    intentExpired = intent.status === 'expired'
      || (intent.expiresAt ? new Date(intent.expiresAt).getTime() <= now().getTime() : null)
    if (!CHECKOUT_ID_RE.test(providerCheckoutRef)) {
      return {
        ok: true,
        accessGranted: false,
        checkoutStatus: null,
        exactlyOneSuccessfulTransaction: false,
        intentExpired,
        intentStatus,
        paymentInstrumentTokenPresent: false,
        paymentInstrumentTokenShapeOk: false,
        purposeSetupRecurring: false,
        status: 200,
      }
    }
  }

  const config = readSumUpConfig(env)
  if (!config) return { ok: false, code: 'SUMUP_NOT_CONFIGURED', status: 503 }
  const http = transport || createSumUpHttpTransport({ apiKey: config.apiKey })
  if (typeof http.retrieveCheckout !== 'function') {
    return { ok: false, code: 'SUMUP_NOT_CONFIGURED', status: 503 }
  }

  let checkout
  try {
    checkout = await http.retrieveCheckout(providerCheckoutRef)
  } catch {
    return { ok: false, code: 'SUMUP_UNAVAILABLE', status: 503 }
  }
  if (String(checkout?.id || '').toLowerCase() !== providerCheckoutRef.toLowerCase()) {
    return { ok: false, code: 'WRONG_CHECKOUT_REF', status: 400 }
  }

  const transactions = Array.isArray(checkout.transactions) ? checkout.transactions : []
  const successful = transactions.filter((row) => row?.status === 'SUCCESSFUL')
  const token = checkout?.payment_instrument?.token
  const tokenText = typeof token === 'string' ? token : ''
  const tokenShapeOk = instrumentFingerprint(tokenText) != null

  return {
    ok: true,
    accessGranted: false,
    checkoutStatus: typeof checkout.status === 'string' ? checkout.status : null,
    exactlyOneSuccessfulTransaction: successful.length === 1
      && CHECKOUT_ID_RE.test(String(successful[0]?.id || '')),
    intentExpired,
    intentStatus,
    paymentInstrumentTokenPresent: tokenText.length > 0,
    paymentInstrumentTokenShapeOk: tokenShapeOk,
    purposeSetupRecurring: checkout.purpose === 'SETUP_RECURRING_PAYMENT',
    status: 200,
  }
}

export async function handleSumUpCheckoutInspect(request, response, {
  callRpcFactory = createServerSubscriptionRpcCaller,
  env = process.env,
  inspect = inspectSumUpCheckout,
  now = () => new Date(),
  transport,
} = {}) {
  const requestId = `bill-sumup-inspect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast GET och POST stöds.',
      status: 405,
    })
  }

  void request.body?.amount
  void request.body?.token
  void request.body?.payment_instrument
  void request.body?.activate
  void request.body?.billing_admin
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

  const checkoutId = readCheckoutId(request)
  let intents
  try {
    intents = createServerSumUpCheckoutIntentReader(callRpcFactory())
  } catch {
    intents = null
  }

  const result = await inspect({
    checkoutId,
    env,
    intents,
    now,
    transport,
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
    accessGranted: false,
    checkoutStatus: result.checkoutStatus,
    exactlyOneSuccessfulTransaction: result.exactlyOneSuccessfulTransaction === true,
    intentExpired: result.intentExpired,
    intentStatus: result.intentStatus,
    ok: true,
    paymentInstrumentTokenPresent: result.paymentInstrumentTokenPresent === true,
    paymentInstrumentTokenShapeOk: result.paymentInstrumentTokenShapeOk === true,
    purposeSetupRecurring: result.purposeSetupRecurring === true,
    requestId,
  })
}

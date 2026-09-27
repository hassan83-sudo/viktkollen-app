import { setNoStoreHeaders } from '../aiRouteErrors.js'
import { getPaymentProviderRegistry, getTrustedProviderApply, normalizeProviderEvent } from './paymentProviderContract.js'
import { isSumUpCheckoutNotification, SUMUP_PROVIDER } from './providers/sumup.js'

function fail(code, status) {
  return { code, ok: false, status }
}

/**
 * Public ingress. Signature verification is mandatory. Raw JSON never reaches
 * the trusted lifecycle processor.
 */
export async function ingestProviderWebhook({
  applyTrusted = getTrustedProviderApply(),
  headers = {},
  rawBody = '',
  registry = getPaymentProviderRegistry(),
} = {}) {
  const headerProvider = String(headers['x-billing-provider'] || headers['X-Billing-Provider'] || '').trim()
  const provider = headerProvider || (isSumUpCheckoutNotification(rawBody) ? SUMUP_PROVIDER : '')
  const adapter = provider ? registry.get(provider) : null
  if (!adapter) return fail('UNKNOWN_PROVIDER', 404)
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

export async function handleWebhookRequest(request, response) {
  const requestId = `bill-webhook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: { code: 'INVALID_REQUEST' }, ok: false, requestId })
  }
  const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? '')
  const result = await ingestProviderWebhook({
    headers: request.headers || {},
    rawBody,
  })
  return response.status(result.status).json({
    accessGranted: result.accessGranted === true,
    ...(result.ok ? {} : { error: { code: result.code } }),
    ok: result.ok === true,
    requestId,
  })
}

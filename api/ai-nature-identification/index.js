import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from '../_shared/analysisConsent.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'

// AI Natur remains fail-closed until a dedicated metered billing feature is
// configured. Never reuse food-scan or AI-eye credits for nature scans.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_TYPES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
}
const fail = (response, requestId, code, status) =>
  sendSafeAiError(response, { requestId, code, status })

export default async function handler(request, response) {
  const requestId = `ai-nature-${Date.now().toString(36)}`
  setNoStoreHeaders(response)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return fail(response, requestId, aiRouteErrorCodes.INVALID_REQUEST, 405)
  }
  const origin = request.headers?.origin
  const host = request.headers?.host
  const allowedHosts = [host, process.env.VERCEL_URL].filter(Boolean)
  if (origin) {
    let originHost
    try {
      const parsed = new URL(origin)
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('origin')
      originHost = parsed.host.toLowerCase()
    } catch {
      return fail(response, requestId, aiRouteErrorCodes.INVALID_REQUEST, 403)
    }
    if (!allowedHosts.some((value) => value.toLowerCase() === originHost)) {
      return fail(response, requestId, aiRouteErrorCodes.INVALID_REQUEST, 403)
    }
  }
  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) return response.status(auth.status).json({ ok: false, error: auth.error })
  const limited = checkAiRouteRateLimit({ route: 'aiNature', userId: auth.user.id, limit: 8 })
  if (limited.limited) {
    response.setHeader('Retry-After', String(limited.retryAfterSeconds))
    return fail(response, requestId, aiRouteErrorCodes.RATE_LIMITED, 429)
  }
  const contentType = String(request.headers?.['content-type'] || '')
  if (!contentType.startsWith('application/json')) {
    return fail(response, requestId, aiRouteErrorCodes.INVALID_REQUEST, 415)
  }
  let data
  try {
    // Reject oversized JSON before decoding and avoid ever logging image bytes.
    const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {})
    if (body.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4096) {
      return fail(response, requestId, aiRouteErrorCodes.REQUEST_TOO_LARGE, 413)
    }
    data = JSON.parse(body)
  } catch {
    return fail(response, requestId, aiRouteErrorCodes.INVALID_REQUEST, 400)
  }
  const mimeType = data?.mimeType
  const encoded = data?.imageBase64
  if (!Object.hasOwn(IMAGE_TYPES, mimeType) || typeof encoded !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    return fail(response, requestId, aiRouteErrorCodes.INVALID_REQUEST, 400)
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    return fail(response, requestId, aiRouteErrorCodes.REQUEST_TOO_LARGE, 413)
  }
  if (!IMAGE_TYPES[mimeType](bytes)) {
    return fail(response, requestId, aiRouteErrorCodes.INVALID_REQUEST, 400)
  }
  const consent = verifyAnalysisConsentToken({
    imageEntries: [{ label: 'image', bytes }],
    purpose: analysisConsentPurposes.aiNatureIdentification,
    token: request.headers?.['x-viktkollen-consent-token'],
    userId: auth.user.id,
  })
  if (!consent.ok) return fail(response, requestId, aiRouteErrorCodes.CONSENT_REQUIRED, 403)

  // A separate quota/billing configuration is required before any provider
  // call. Intentionally return 503; no image is sent to OpenAI and no charge
  // can occur through this unfinished route.
  return fail(response, requestId, aiRouteErrorCodes.FEATURE_LOCKED, 503)
}

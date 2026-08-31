import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'
import { isAllowedAnalysisConsentPurpose, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'

/**
 * Issues a short-lived, HMAC-signed analysis consent token.
 *
 * This route must only ever be called by a client that has already shown
 * the user the visible "Godkann och analysera"-style approval control and
 * received an explicit click - the `uiConsentApproved` flag below is that
 * client's claim of that fact, required alongside real Supabase
 * authentication, an allowed purpose, and the SHA-256 canonical hash of
 * the exact image payload the client is about to send. This route never
 * accepts image bytes itself; it only certifies a hash the client
 * computed locally.
 */
export default async function handler(request, response) {
  const requestId = `consent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }

  const rateLimit = checkAiRouteRateLimit({
    limit: process.env.ANALYSIS_CONSENT_RATE_LIMIT_MAX,
    route: 'analysisConsent',
    userId: auth.user.id,
  })
  if (rateLimit.limited) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.RATE_LIMITED,
      requestId,
      retryable: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      status: 429,
    })
  }

  let body
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body ?? {})
  } catch {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Ogiltig JSON i förfrågan.',
      status: 400,
    })
  }

  const purpose = typeof body?.purpose === 'string' ? body.purpose : ''
  const imageHash = typeof body?.imageHash === 'string' ? body.imageHash : ''
  const uiConsentApproved = body?.uiConsentApproved === true

  // The most important gate in this route: no token is ever issued unless
  // the client explicitly claims the visible UI approval step happened.
  // Ordinary sync/backup/export/analytics/logging code has no path that
  // can set this to true.
  if (!uiConsentApproved) {
    console.warn('[api/analysis-consent] Token requested without explicit UI approval claim', { requestId })
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.CONSENT_REQUIRED,
      requestId,
      status: 403,
    })
  }

  if (!isAllowedAnalysisConsentPurpose(purpose)) {
    console.warn('[api/analysis-consent] Token requested for a disallowed purpose', { requestId })
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.CONSENT_REQUIRED,
      requestId,
      status: 403,
    })
  }

  const issued = issueAnalysisConsentToken({
    env: process.env,
    imageHash,
    purpose,
    userId: auth.user.id,
  })

  if (!issued.ok) {
    // Deliberately generic: never reveal *why* issuance failed (e.g.
    // whether the server secret is missing or too short) to the client or
    // to logs.
    console.warn('[api/analysis-consent] Token issuance failed', { requestId })
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
      requestId,
      status: 503,
    })
  }

  return response.status(200).json({
    expiresAt: issued.expiresAt,
    ok: true,
    requestId,
    token: issued.token,
  })
}

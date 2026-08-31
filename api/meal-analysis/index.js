import { fallbackMealAnalysis } from '../../src/services/mealAnalysisService.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

// Legacy meal-photo analysis has no visible, explicit consent step in the
// current UI (see src/components/PhotoAnalysis.jsx - its "Uppskatta
// måltiden" button has no privacy/consent confirmation step, unlike the
// body-scan and nutrition-photo-scan flows). No purpose for this route
// exists in api/_shared/analysisConsent.js's analysisConsentPurposes
// allowlist, so no consent token can ever satisfy this route, and this
// handler fails closed unconditionally right after authentication - it
// never reads the request body, never calls OpenAI, and never produces a
// real analysis. fallbackMealAnalysis is imported only so any legacy
// caller still gets a valid-shaped mock result from the client-side
// fallback path (src/services/mealAnalysisService.js's analyzeMealPhoto
// never calls this route at all any more).
void fallbackMealAnalysis

export default async function handler(request, response) {
  const requestId = `meal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    limit: process.env.MEAL_ANALYSIS_RATE_LIMIT_MAX,
    route: 'mealAnalysis',
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

  // Fail closed unconditionally - see the module doc comment above. No
  // image is parsed, no consent token is even looked for, and no OpenAI
  // call is ever reachable from this route.
  console.warn('[api/meal-analysis] Legacy flow has no UI consent step - request rejected unconditionally', { requestId })
  return sendSafeAiError(response, {
    code: aiRouteErrorCodes.CONSENT_REQUIRED,
    requestId,
    status: 403,
  })
}

import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

/**
 * AI-örat: which optional third-party audio features are actually configured
 * on this server. Returns booleans only (never names, hosts or values), for
 * logged-in users, so the UI can hide a feature instead of offering one that
 * cannot work.
 */
export default async function handler(request, response) {
  const requestId = `ai-ear-providers-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendSafeAiError(response, { code: aiRouteErrorCodes.INVALID_REQUEST, requestId, status: 405 })
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) return response.status(auth.status).json({ error: auth.error, ok: false })

  const rateLimit = checkAiRouteRateLimit({ limit: process.env.AI_EAR_RATE_LIMIT_MAX, route: 'aiEar', userId: auth.user.id })
  if (rateLimit.limited) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendSafeAiError(response, { code: aiRouteErrorCodes.RATE_LIMITED, requestId, retryAfterSeconds: rateLimit.retryAfterSeconds, retryable: true, status: 429 })
  }

  return response.status(200).json({
    ok: true,
    providers: {
      humming: Boolean(process.env.ACRCLOUD_HOST && process.env.ACRCLOUD_ACCESS_KEY && process.env.ACRCLOUD_ACCESS_SECRET),
      music: Boolean(process.env.AUDD_API_TOKEN),
      transcription: Boolean(process.env.OPENAI_API_KEY),
    },
    requestId,
  })
}

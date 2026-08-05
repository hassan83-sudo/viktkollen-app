export const aiRouteErrorCodes = {
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_UNAVAILABLE: 'AUTH_UNAVAILABLE',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  PROVIDER_INVALID_RESPONSE: 'PROVIDER_INVALID_RESPONSE',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  REQUEST_ABORTED: 'REQUEST_ABORTED',
  REQUEST_TOO_LARGE: 'REQUEST_TOO_LARGE',
  SAFETY_BLOCKED: 'SAFETY_BLOCKED',
  STALE_REQUEST: 'STALE_REQUEST',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
}

const safeMessages = {
  [aiRouteErrorCodes.AUTH_EXPIRED]: 'Sessionen har gått ut. Logga in igen och försök på nytt.',
  [aiRouteErrorCodes.AUTH_INVALID]: 'Du behöver logga in igen innan AI kan användas.',
  [aiRouteErrorCodes.AUTH_REQUIRED]: 'Logga in för att använda remote AI.',
  [aiRouteErrorCodes.AUTH_UNAVAILABLE]: 'Inloggningen kunde inte verifieras just nu. Försök igen senare.',
  [aiRouteErrorCodes.CONSENT_REQUIRED]: 'Aktivt samtycke krävs innan remote AI används.',
  [aiRouteErrorCodes.INVALID_REQUEST]: 'AI-underlaget kunde inte valideras säkert.',
  [aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE]: 'AI-svaret kunde inte valideras.',
  [aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED]: 'Remote AI är inte konfigurerad på servern.',
  [aiRouteErrorCodes.PROVIDER_TIMEOUT]: 'AI-anropet tog för lång tid.',
  [aiRouteErrorCodes.PROVIDER_UNAVAILABLE]: 'AI-tjänsten är tillfälligt otillgänglig.',
  [aiRouteErrorCodes.RATE_LIMITED]: 'För många AI-anrop just nu. Försök igen senare.',
  [aiRouteErrorCodes.REQUEST_ABORTED]: 'AI-anropet avbröts.',
  [aiRouteErrorCodes.REQUEST_TOO_LARGE]: 'AI-underlaget är för stort.',
  [aiRouteErrorCodes.SAFETY_BLOCKED]: 'AI-förslaget blockerades av säkerhetsfiltret.',
  [aiRouteErrorCodes.STALE_REQUEST]: 'Ett nyare AI-anrop finns redan.',
  [aiRouteErrorCodes.UNKNOWN_ERROR]: 'Remote AI kunde inte användas just nu.',
}

export function setNoStoreHeaders(response) {
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  response.setHeader('Pragma', 'no-cache')
  response.setHeader('Expires', '0')
}

export function makeSafeAiRouteError({
  code = aiRouteErrorCodes.UNKNOWN_ERROR,
  requestId = '',
  retryable = false,
  retryAfterSeconds,
  safeMessage,
  status = 500,
} = {}) {
  return {
    error: {
      code,
      requestId,
      retryable,
      safeMessage: safeMessage || safeMessages[code] || safeMessages[aiRouteErrorCodes.UNKNOWN_ERROR],
      ...(Number.isFinite(Number(retryAfterSeconds)) ? { retryAfterSeconds: Number(retryAfterSeconds) } : {}),
    },
    ok: false,
    status,
  }
}

export function sendSafeAiError(response, options = {}) {
  setNoStoreHeaders(response)
  const error = makeSafeAiRouteError(options)
  return response.status(error.status).json({
    error: error.error,
    ok: false,
  })
}

export function mapGatewayErrorCode(code) {
  const mapping = {
    aiNotConfigured: aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED,
    invalidProviderResponse: aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE,
    invalidRequest: aiRouteErrorCodes.INVALID_REQUEST,
    providerUnavailable: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
    rateLimited: aiRouteErrorCodes.RATE_LIMITED,
    timeout: aiRouteErrorCodes.PROVIDER_TIMEOUT,
  }

  return mapping[code] || aiRouteErrorCodes.PROVIDER_UNAVAILABLE
}

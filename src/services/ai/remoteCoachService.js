import { validateAiCoachSafety } from './aiResponseSafety.js'
import {
  aiAuthErrorCode,
  getAiAuthSafeMessage,
  getCurrentAiAuthorization,
  hasSameAiAuthUser,
} from './aiAuthTransport.js'
import {
  buildCoachRemoteRequestPayload,
  fingerprintCoachPayload,
} from './coachRequestBuilder.js'

const coachEndpoint = '/api/adaptive-coach'

const activeRequests = new Map()
let latestRequestToken = ''

function safeErrorMessage(code) {
  const messages = {
    AUTH_EXPIRED: 'Sessionen har gått ut. Logga in igen och försök på nytt.',
    AUTH_INVALID: 'Du behöver logga in igen innan remote AI kan användas.',
    AUTH_REQUIRED: 'Logga in för att använda remote AI.',
    AUTH_UNAVAILABLE: 'Inloggningen kunde inte verifieras just nu. Försök igen senare.',
    CONSENT_REQUIRED: 'Samtycke krävs innan remote AI används.',
    INVALID_REQUEST: 'AI-underlaget kunde inte skickas säkert.',
    PROVIDER_INVALID_RESPONSE: 'AI-svaret kunde inte valideras. Regelbaserad coach används.',
    PROVIDER_NOT_CONFIGURED: 'Remote AI är inte konfigurerad på servern. Regelbaserad coach används.',
    PROVIDER_TIMEOUT: 'AI-anropet tog för lång tid. Regelbaserad coach används.',
    PROVIDER_UNAVAILABLE: 'AI-tjänsten är tillfälligt otillgänglig. Regelbaserad coach används.',
    RATE_LIMITED: 'För många AI-anrop just nu. Försök igen senare.',
    aiNotConfigured: 'Remote AI är inte konfigurerad på servern. Regelbaserad coach används.',
    consentRequired: 'Samtycke krävs innan remote AI används.',
    invalidProviderResponse: 'AI-svaret kunde inte valideras. Regelbaserad coach används.',
    invalidRequest: 'AI-underlaget kunde inte skickas säkert.',
    lowCoverage: 'Coachen behöver mer underlag innan remote AI används.',
    rateLimited: 'För många AI-anrop just nu. Försök igen senare.',
    safetyBlocked: 'AI-förslaget blockerades av säkerhetsfiltret.',
    timeout: 'AI-anropet tog för lång tid. Regelbaserad coach används.',
  }
  return messages[code] || 'Remote AI kunde inte användas. Regelbaserad coach används.'
}

export async function requestRemoteCoachSuggestions(input = {}, options = {}) {
  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) {
    return {
      errorCode: auth.errorCode || aiAuthErrorCode.AUTH_REQUIRED,
      ok: false,
      retryable: false,
      warning: auth.warning || getAiAuthSafeMessage(auth.errorCode),
    }
  }

  const built = buildCoachRemoteRequestPayload(input, options)
  const payloadFingerprint = fingerprintCoachPayload(built.payload)
  const fingerprint = `${auth.userScope || 'signed-in'}:${payloadFingerprint}`

  if (activeRequests.has(fingerprint)) {
    return activeRequests.get(fingerprint)
  }

  const controller = new AbortController()
  const requestToken = `${fingerprint}-${Date.now()}`
  latestRequestToken = requestToken

  const promise = (async () => {
    try {
      const response = await fetch(coachEndpoint, {
        body: JSON.stringify(built.payload),
        headers: {
          Authorization: auth.authorizationHeader,
          'Content-Type': 'application/json',
          'x-viktkollen-client-id': payloadFingerprint,
        },
        method: 'POST',
        signal: options.signal || controller.signal,
      })
      const payload = await response.json().catch(() => ({}))

      if (requestToken !== latestRequestToken) {
        return {
          ok: false,
          stale: true,
          warning: safeErrorMessage('STALE_REQUEST'),
        }
      }

      if (!await hasSameAiAuthUser(auth.userScope)) {
        return {
          errorCode: aiAuthErrorCode.AUTH_STALE,
          ok: false,
          stale: true,
          warning: getAiAuthSafeMessage(aiAuthErrorCode.AUTH_STALE),
        }
      }

      if (!response.ok || payload.ok === false) {
        const code = payload.error?.code || 'providerUnavailable'
        return {
          errorCode: code,
          ok: false,
          retryable: payload.error?.retryable === true,
          warning: safeErrorMessage(code),
        }
      }

      const safety = validateAiCoachSafety(payload.coach)
      if (!safety.ok) {
        return {
          errorCode: 'safetyBlocked',
          ok: false,
          safety,
          warning: safeErrorMessage('safetyBlocked'),
        }
      }

      return {
        coach: payload.coach,
        generatedAt: payload.coach.generatedAt,
        ok: true,
        preview: built.preview,
        providerType: payload.providerType || 'openai',
        requestId: payload.requestId,
      }
    } catch (error) {
      return {
        aborted: error?.name === 'AbortError',
        errorCode: error?.name === 'AbortError' ? 'aborted' : 'network',
        ok: false,
        warning: error?.name === 'AbortError'
          ? 'AI-anropet avbröts.'
          : 'Remote AI kunde inte nås. Regelbaserad coach används.',
      }
    } finally {
      activeRequests.delete(fingerprint)
    }
  })()

  promise.abort = () => controller.abort()
  activeRequests.set(fingerprint, promise)

  return promise
}

export function buildRemoteCoachPreview(input = {}, options = {}) {
  return buildCoachRemoteRequestPayload(input, options).preview
}

export const remoteCoachServiceInternals = {
  activeRequests,
  safeErrorMessage,
}

import { validateAiCoachSafety } from './aiResponseSafety.js'
import {
  buildCoachRemoteRequestPayload,
  fingerprintCoachPayload,
} from './coachRequestBuilder.js'

const coachEndpoint = '/api/adaptive-coach'

const activeRequests = new Map()
let latestRequestToken = ''

function safeErrorMessage(code) {
  const messages = {
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
  const built = buildCoachRemoteRequestPayload(input, options)
  const fingerprint = fingerprintCoachPayload(built.payload)

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
          'Content-Type': 'application/json',
          'x-viktkollen-client-id': fingerprint,
        },
        method: 'POST',
        signal: options.signal || controller.signal,
      })
      const payload = await response.json().catch(() => ({}))

      if (requestToken !== latestRequestToken) {
        return {
          ok: false,
          stale: true,
          warning: safeErrorMessage('staleResponse'),
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

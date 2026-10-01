import { filterCoachRequestContext } from '../../../api/_shared/aiCoach/requestContext.js'
import { getCurrentAiAuthorization } from '../../services/ai/aiAuthTransport.js'

let inFlight = null

export function resetCoachModelRequestForTests() {
  inFlight = null
}

export function coachModelRequestBody({ context, language = 'sv', messages, route } = {}) {
  const history = Array.isArray(messages) ? messages.slice(-8) : []
  const latest = history.at(-1)?.content || ''
  return {
    context: filterCoachRequestContext(context, latest),
    featureIds: (Array.isArray(route?.entries) ? route.entries : [])
      .map((entry) => entry?.id)
      .filter(Boolean)
      .slice(0, 4),
    language: language || 'sv',
    messages: history,
  }
}

async function postCoachModel(input) {
  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) return { code: auth.errorCode || 'AUTH_REQUIRED', ok: false }

  let response
  try {
    response = await fetch('/api/ai-coach', {
      body: JSON.stringify(coachModelRequestBody(input)),
      headers: {
        Authorization: auth.authorizationHeader,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  } catch {
    return { code: 'PROVIDER_UNAVAILABLE', ok: false }
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    return { code: payload?.error?.code || 'UNKNOWN_ERROR', ok: false }
  }
  return {
    answer: payload.answer || '',
    ok: true,
    source: payload.source || '',
    status: payload.status === 'unanswered' ? 'unanswered' : 'answered',
  }
}

export function requestCoachModelReply(input) {
  if (inFlight) return Promise.resolve({ code: 'REQUEST_IN_FLIGHT', ok: false })
  inFlight = postCoachModel(input).finally(() => {
    inFlight = null
  })
  return inFlight
}

import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'
import { answerCoachQuestion } from '../_shared/aiCoach/service.js'
import { filterCoachRequestContext } from '../_shared/aiCoach/requestContext.js'
import { createCostStoreFromEnv } from '../_shared/aiHelp/supabaseCostStore.js'

function parseBody(request) {
  if (typeof request.body === 'string') return JSON.parse(request.body)
  return request.body || {}
}

export default async function handler(request, response) {
  const requestId = `ai-coach-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      status: 405,
    })
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({ error: auth.error, ok: false })
  }

  let body
  try {
    body = parseBody(request)
  } catch {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      status: 400,
    })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  const latest = [...messages].reverse().find((message) => message?.role === 'user')?.content || ''
  const context = filterCoachRequestContext(body.context, latest)
  const result = await answerCoachQuestion({
    body: {
      featureIds: body.featureIds,
      language: body.language,
      messages,
    },
    contextProvider: () => context,
    costStore: createCostStoreFromEnv(process.env, fetch),
    fetchImpl: fetch,
    userId: auth.user.id,
  })

  if (!result.ok) {
    const code = result.code === 'MODEL_LIMITED'
      ? 'MODEL_LIMITED'
      : (aiRouteErrorCodes[result.code] || aiRouteErrorCodes.UNKNOWN_ERROR)
    if (result.retryAfterSeconds) response.setHeader('Retry-After', String(result.retryAfterSeconds))
    return sendSafeAiError(response, {
      code,
      requestId,
      retryable: result.status === 429 || result.status === 503,
      retryAfterSeconds: result.retryAfterSeconds,
      status: result.status,
    })
  }

  return response.status(200).json({
    answer: result.answer,
    knowledgeIds: result.knowledgeIds || [],
    language: result.language,
    ok: true,
    requestId,
    source: result.source,
    status: result.status,
  })
}

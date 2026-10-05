import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../aiRouteErrors.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { answerAiHelpQuestion } from './service.js'

function parseBody(request) {
  if (typeof request.body === 'string') return JSON.parse(request.body)
  return request.body || {}
}

export async function handleAiHelpRequest(request, response) {
  const requestId = `ai-help-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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

  const result = await answerAiHelpQuestion({ body, userId: auth.user.id })
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
    featureIds: result.featureIds,
    language: result.language,
    ok: true,
    requestId,
    source: result.source,
    status: result.status,
    ...(result.tool ? { tool: result.tool } : {}),
    ...(result.confirmation?.action === 'schedule_cancel' ? { confirmation: { action: 'schedule_cancel' } } : {}),
    ...(result.unansweredId ? { unansweredId: result.unansweredId } : {}),
  })
}

export default handleAiHelpRequest

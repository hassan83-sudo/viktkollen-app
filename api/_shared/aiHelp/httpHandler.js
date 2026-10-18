import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../aiRouteErrors.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { sanitizeAiAction } from '../../../src/features/aiHelp/aiActions.js'
import { answerAiHelpQuestion } from './service.js'
import { executeConfirmedAiAction } from './executeAiAction.js'

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

  if (body && Object.prototype.hasOwnProperty.call(body, 'confirmAction')) {
    const result = await executeConfirmedAiAction({
      actionId: body.confirmAction,
      actorUserId: auth.user.id,
      confirmed: body.confirmed === true,
    })
    return response.status(result.status || 400).json({
      action: sanitizeAiAction(result.action || body.confirmAction)?.action || null,
      code: result.code || null,
      ok: result.ok === true,
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
    ...(Array.isArray(result.followUps) ? { followUps: result.followUps.slice(0, 2) } : {}),
    ...(result.handoff === true ? { handoff: true } : {}),
    ...(result.tool ? { tool: result.tool } : {}),
    ...(sanitizeAiAction(result.confirmation) ? { confirmation: sanitizeAiAction(result.confirmation) } : {}),
    ...(result.unansweredId ? { unansweredId: result.unansweredId } : {}),
  })
}

export default handleAiHelpRequest

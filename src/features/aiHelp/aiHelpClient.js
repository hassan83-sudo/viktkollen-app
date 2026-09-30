import { getCurrentAiAuthorization } from '../../services/ai/aiAuthTransport.js'
import { getActiveLanguageCode } from '../../i18n/index.js'
import { sanitizeHelpTool } from './aiHelpTools.js'

export async function requestAiHelpReply({
  featureIds = [],
  messages = [],
  languageCode = getActiveLanguageCode(),
} = {}) {
  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) {
    return { code: auth.errorCode || 'AUTH_REQUIRED', ok: false }
  }

  const response = await fetch('/api/ai-help', {
    body: JSON.stringify({
      featureIds,
      language: languageCode,
      messages,
    }),
    headers: {
      Authorization: auth.authorizationHeader,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.ok) {
    return {
      code: payload?.error?.code || 'UNKNOWN_ERROR',
      ok: false,
      retryAfterSeconds: payload?.error?.retryAfterSeconds,
    }
  }

  return {
    answer: payload.answer || '',
    featureIds: Array.isArray(payload.featureIds) ? payload.featureIds : [],
    language: payload.language || null,
    ok: true,
    source: payload.source || '',
    status: payload.status === 'unanswered' ? 'unanswered' : 'answered',
    tool: sanitizeHelpTool(payload.tool),
    unansweredId: payload.unansweredId || '',
  }
}

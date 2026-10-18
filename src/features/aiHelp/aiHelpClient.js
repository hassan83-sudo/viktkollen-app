import { getCurrentAiAuthorization, hasSameAiAuthUser } from '../../services/ai/aiAuthTransport.js'
import { getActiveLanguageCode } from '../../i18n/index.js'
import { sanitizeAiAction } from './aiActions.js'
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
  if (!await hasSameAiAuthUser(auth.userScope)) return { code: 'AUTH_STALE', ok: false }

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
    followUps: Array.isArray(payload.followUps) ? payload.followUps.filter((item) => typeof item === 'string').slice(0, 2) : [],
    handoff: payload.handoff === true,
    tool: sanitizeHelpTool(payload.tool),
    unansweredId: payload.unansweredId || '',
    ...(() => {
      const confirmation = sanitizeAiAction(payload.confirmation)
      if (!confirmation) return {}
      return {
        confirmation: {
          action: confirmation.action,
          userScope: auth.userScope,
          ...(confirmation.planId ? { planId: confirmation.planId } : {}),
        },
      }
    })(),
  }
}

export async function confirmAiAction(userScope, confirmation) {
  const action = sanitizeAiAction(confirmation)
  if (!action) return { code: 'UNKNOWN_ACTION', ok: false }
  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) return { code: auth.errorCode || 'AUTH_REQUIRED', ok: false }
  if (!userScope || userScope !== auth.userScope) return { code: 'AUTH_STALE', ok: false }
  const response = await fetch('/api/ai-help', {
    body: JSON.stringify({
      confirmAction: action.action,
      confirmed: true,
      ...(action.planId ? { planId: action.planId } : {}),
    }),
    headers: {
      Authorization: auth.authorizationHeader,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    return { code: payload?.error?.code || 'UNKNOWN_ERROR', ok: false }
  }
  return { ok: true, subscription: payload.subscription || null }
}

export async function confirmScheduleCancel(userScope) {
  return confirmAiAction(userScope, { action: 'schedule_cancel' })
}

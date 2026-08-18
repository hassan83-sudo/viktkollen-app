import { safeLogger } from './safeLogger.js'
import {
  aiAuthErrorCode,
  getAiAuthSafeMessage,
  getCurrentAiAuthorization,
  hasSameAiAuthUser,
} from './ai/aiAuthTransport.js'

const aiEndpoint = '/api/ai'

let endpointUnavailableReason = ''

function isUnavailableStatus(status) {
  return status === 404 || status === 405 || status === 501
}

function makeUnavailableResult(reason = 'Lokal AI används just nu.') {
  return {
    data: null,
    error: null,
    ok: false,
    reason,
    skipped: true,
    source: 'local',
  }
}

export function getLocalAiStatusMessage() {
  return endpointUnavailableReason || 'Lokal AI används just nu.'
}

export function isAiEndpointUnavailable() {
  return Boolean(endpointUnavailableReason)
}

export async function requestAiEndpoint(payload) {
  if (endpointUnavailableReason) {
    return makeUnavailableResult(endpointUnavailableReason)
  }

  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) {
      return makeUnavailableResult(auth.warning || getAiAuthSafeMessage(auth.errorCode))
    }

    const response = await fetch(aiEndpoint, {
      body: JSON.stringify(payload),
      headers: {
        Authorization: auth.authorizationHeader,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const data = await response.json().catch(() => ({}))

    if (isUnavailableStatus(response.status)) {
      endpointUnavailableReason = 'Lokal AI används just nu.'
      return makeUnavailableResult(endpointUnavailableReason)
    }

    if (!response.ok) {
      const safeMessage = data.error?.safeMessage || data.error || `AI-anrop misslyckades med status ${response.status}`
      return {
        data,
        error: new Error(safeMessage),
        ok: false,
        reason: safeMessage || 'AI-tjänsten svarade inte som väntat.',
        skipped: false,
        source: 'error',
      }
    }

    if (!(await hasSameAiAuthUser(auth.userScope))) {
      return {
        data: null,
        error: new Error(getAiAuthSafeMessage(aiAuthErrorCode.AUTH_STALE)),
        ok: false,
        reason: getAiAuthSafeMessage(aiAuthErrorCode.AUTH_STALE),
        skipped: false,
        source: 'error',
      }
    }

    return {
      data,
      error: null,
      ok: true,
      reason: '',
      skipped: false,
      source: data.source === 'openai' ? 'openai' : 'mock',
    }
  } catch (error) {
    endpointUnavailableReason = 'Lokal AI används just nu.'

    safeLogger.info('/api/ai är inte tillgänglig, använder lokal fallback.', {
      message: error?.message,
    })

    return makeUnavailableResult(endpointUnavailableReason)
  }
}

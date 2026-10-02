import {
  analysisConsentPurposes,
  requestAnalysisConsentToken,
  withAnalysisConsentTokenHeader,
} from './security/analysisConsentProof.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './ai/aiAuthTransport.js'
import { mapAiEarHttpError } from './aiEarInterpret.js'

const ENDPOINT = '/api/ai-ear/humming'
const TIMEOUT_MS = 20000

function timeoutSignal(ms, upstreamSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('clientTimeout'), ms)
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason || 'explicitAbort')
  if (upstreamSignal?.aborted) abortFromUpstream()
  upstreamSignal?.addEventListener?.('abort', abortFromUpstream, { once: true })
  return {
    cleanup: () => {
      clearTimeout(timer)
      upstreamSignal?.removeEventListener?.('abort', abortFromUpstream)
    },
    signal: controller.signal,
  }
}

function mapHummingHttpError(status, payload) {
  if (status === 402 || payload?.error?.code === 'QUOTA_EXCEEDED' || payload?.error?.reason === 'quota_exceeded') {
    return { reason: 'quota_exceeded', retryable: false }
  }
  return mapAiEarHttpError(status, payload)
}

export async function recognizeAiEarHumming({ consentApproved, signal, wav } = {}) {
  if (consentApproved !== true) return { ok: false, reason: 'consent_not_approved', retryable: false }
  if (!wav || !wav.size) return { ok: false, reason: 'invalid_audio', retryable: false }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline', retryable: true }

  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) return { ok: false, reason: 'auth_required', retryable: false }

  const timeout = timeoutSignal(TIMEOUT_MS, signal)
  try {
    let consentToken
    try {
      consentToken = await requestAnalysisConsentToken({
        authorizationHeader: auth.authorizationHeader,
        consentApproved,
        images: wav,
        purpose: analysisConsentPurposes.aiEarHumming,
        signal: timeout.signal,
      })
    } catch (error) {
      if (timeout.signal.aborted) throw error
      if (error?.message === 'consent_token_network_error') return { ok: false, reason: 'network', retryable: true }
      return { ok: false, reason: 'consent_required', retryable: false }
    }

    const response = await fetch(ENDPOINT, {
      body: wav,
      headers: withAnalysisConsentTokenHeader({
        Authorization: auth.authorizationHeader,
        'Content-Type': 'audio/wav',
      }, consentToken.token),
      method: 'POST',
      signal: timeout.signal,
    })

    if (!await hasSameAiAuthUser(auth.userScope)) return { ok: false, reason: 'auth_required', retryable: false }

    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok || payload?.ok !== true || !payload.result) return { ok: false, ...mapHummingHttpError(response.status, payload) }
    return { ok: true, result: payload.result }
  } catch {
    if (signal?.aborted) return { ok: false, reason: 'aborted', retryable: false }
    if (timeout.signal.aborted) return { ok: false, reason: 'timeout', retryable: true }
    return { ok: false, reason: 'network', retryable: true }
  } finally {
    timeout.cleanup()
  }
}

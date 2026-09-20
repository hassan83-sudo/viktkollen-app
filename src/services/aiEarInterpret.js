import {
  analysisConsentPurposes,
  requestAnalysisConsentToken,
  withAnalysisConsentTokenHeader,
} from './security/analysisConsentProof.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './ai/aiAuthTransport.js'

/**
 * Client call for AI-örat -> our own server-side hop (/api/ai-ear/interpret).
 *
 * The browser only ever holds the user's Supabase session. It never sees or
 * creates any Google credential: the hop authenticates to the private Cloud
 * Run service. Fails closed and NEVER throws: every problem is returned as
 * { ok: false, reason, retryable } so the UI can show a friendly message.
 *
 * Nothing here logs or stores audio, tokens or responses.
 */

export const aiEarInterpretTimeoutMs = 35000 // Cloud Run cold start is ~8 s; single attempt with margin.
const ENDPOINT = '/api/ai-ear/interpret'

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

/** Maps a hop response to a small set of UI reasons. Exported for tests. */
export function mapAiEarHttpError(status, payload) {
  const code = payload?.error?.code
  const reason = payload?.error?.reason
  const retryable = payload?.error?.retryable === true

  if (status === 400 || status === 415) return { reason: reason === 'unsupported_media' ? 'unsupported_media' : 'invalid_audio', retryable: false }
  if (status === 413 || code === 'REQUEST_TOO_LARGE') return { reason: 'too_large', retryable: false }
  if (status === 401 || code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID' || code === 'AUTH_EXPIRED') return { reason: 'auth_required', retryable: false }
  if (status === 403 && code === 'CONSENT_REQUIRED') return { reason: 'consent_required', retryable: false }
  if (status === 429 || code === 'RATE_LIMITED') return { reason: 'rate_limited', retryable: true }
  if (status === 504 || code === 'PROVIDER_TIMEOUT') return { reason: 'timeout', retryable: true }
  if (code === 'PROVIDER_NOT_CONFIGURED') return { reason: 'not_available', retryable: false }
  // Any other 403 / 5xx (incl. hop-to-Cloud-Run auth problems) is a generic service error for the user.
  return { reason: 'service_unavailable', retryable: retryable || status >= 500 }
}

/**
 * @param {object} params
 * @param {Blob} params.wav - one WAV recording from aiEarAudio.js
 * @param {boolean} params.consentApproved - must be exactly true, set only from the real "Analysera" tap
 * @param {string} [params.locale]
 * @param {AbortSignal} [params.signal]
 */
export async function interpretAiEarAudio({ consentApproved, locale = 'sv-SE', signal, wav } = {}) {
  if (consentApproved !== true) return { ok: false, reason: 'consent_not_approved', retryable: false }
  if (!wav || !wav.size) return { ok: false, reason: 'invalid_audio', retryable: false }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline', retryable: true }

  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) return { ok: false, reason: 'auth_required', retryable: false }

  const timeout = timeoutSignal(aiEarInterpretTimeoutMs, signal)
  try {
    let consentToken
    try {
      consentToken = await requestAnalysisConsentToken({
        authorizationHeader: auth.authorizationHeader,
        consentApproved,
        images: wav,
        purpose: analysisConsentPurposes.aiEarInterpret,
        signal: timeout.signal,
      })
    } catch (error) {
      if (timeout.signal.aborted) throw error
      if (error?.message === 'consent_token_network_error') return { ok: false, reason: 'network', retryable: true }
      return { ok: false, reason: 'consent_required', retryable: false }
    }

    const response = await fetch(`${ENDPOINT}?locale=${encodeURIComponent(locale)}`, {
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

    if (!response.ok || payload?.ok !== true) return { ok: false, ...mapAiEarHttpError(response.status, payload) }
    if (!payload.result || typeof payload.result.state !== 'string') return { ok: false, reason: 'invalid_response', retryable: true }
    return { ok: true, result: payload.result }
  } catch {
    if (signal?.aborted) return { ok: false, reason: 'aborted', retryable: false }
    if (timeout.signal.aborted) return { ok: false, reason: 'timeout', retryable: true }
    return { ok: false, reason: 'network', retryable: true }
  } finally {
    timeout.cleanup()
  }
}

import {
  analysisConsentPurposes,
  requestAnalysisConsentToken,
  withAnalysisConsentTokenHeader,
} from '../security/analysisConsentProof.js'
import {
  getCurrentAiAuthorization,
  hasSameAiAuthUser,
} from '../ai/aiAuthTransport.js'

/**
 * Client-side call for AI-örat -> Musik's real song-identification flow
 * (Sprint 4). This is the ONLY place in AI-örat that sends recorded audio
 * anywhere - every other category (Nynna & vissla, Fågelläten, Fordon &
 * maskiner, Andra ljud) stays on the local "not-connected" stub in
 * providers.js and never reaches this file or any network call.
 *
 * Fails closed for ANY reason - missing explicit consent approval, no
 * auth, consent denied, offline, timeout, malformed response - by
 * returning { ok: false, reason: 'error' } and NEVER throwing. It never
 * invents a result: a network/provider failure and "no confident song
 * match" are always kept distinct (see recognizeMusic's return shape).
 *
 * Nothing in this module logs the audio blob, its bytes, the consent
 * token, or the recognized song - only generic reason codes.
 */

const MUSIC_RECOGNITION_ENDPOINT = '/api/ai-ear-music-recognition'
export const musicRecognitionTimeoutMs = 20000

function timeoutSignal(ms, upstreamSignal) {
  if (typeof AbortController === 'undefined') {
    return { cleanup: () => {}, signal: undefined }
  }
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

/**
 * @param {object} params
 * @param {Blob} params.audioBlob - the exact recorded clip the user chose
 *   to analyze (see AiEarSection.jsx); never a live MediaStream.
 * @param {boolean} params.consentApproved - must be exactly `true`, set
 *   only from inside the real "Skicka för identifiering" consent tap.
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<
 *   {ok: true, matched: false} |
 *   {ok: true, matched: true, result: {title: string, artist: string, details: object|null}} |
 *   {ok: false, reason: string}
 * >}
 */
export async function recognizeMusic({ audioBlob, consentApproved, signal } = {}) {
  if (consentApproved !== true) {
    return { ok: false, reason: 'error' }
  }
  if (!(audioBlob instanceof Blob) || audioBlob.size === 0) {
    return { ok: false, reason: 'error' }
  }

  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) {
    return { ok: false, reason: 'error' }
  }

  const timeout = timeoutSignal(musicRecognitionTimeoutMs, signal)

  try {
    let consentToken
    try {
      consentToken = await requestAnalysisConsentToken({
        authorizationHeader: auth.authorizationHeader,
        consentApproved,
        images: audioBlob,
        purpose: analysisConsentPurposes.audioMusicRecognition,
        signal: timeout.signal,
      })
    } catch {
      return { ok: false, reason: 'error' }
    }

    const formData = new FormData()
    formData.append('audio', audioBlob, 'ai-ear-clip')

    const response = await fetch(MUSIC_RECOGNITION_ENDPOINT, {
      body: formData,
      headers: withAnalysisConsentTokenHeader({
        Authorization: auth.authorizationHeader,
      }, consentToken.token),
      method: 'POST',
      signal: timeout.signal,
    })

    if (!await hasSameAiAuthUser(auth.userScope)) {
      return { ok: false, reason: 'error' }
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      return { ok: false, reason: 'error' }
    }

    if (!response.ok || payload?.ok === false) {
      return { ok: false, reason: 'error' }
    }

    if (payload.matched === false) {
      return { ok: true, matched: false }
    }

    if (!payload.matched || !payload.result?.title) {
      return { ok: false, reason: 'error' }
    }

    return {
      ok: true,
      matched: true,
      result: {
        details: payload.result.details && typeof payload.result.details === 'object' ? payload.result.details : null,
        provider: 'AudD',
        subtitle: String(payload.result.artist || ''),
        title: String(payload.result.title || ''),
      },
    }
  } catch {
    return { ok: false, reason: 'error' }
  } finally {
    timeout.cleanup()
  }
}

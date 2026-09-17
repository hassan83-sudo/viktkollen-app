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
 * Client-side call for AI-örat -> Nynna & vissla's real melody-matching
 * flow (Sprint 6): humming, whistling, or a sung melody, identified via
 * ACRCloud's Humming Recognition engine. This is the ONLY place in
 * AI-örat that sends a hummed/whistled/sung clip anywhere - Musik keeps
 * using musicRecognitionProvider.js (AudD) for ordinary recorded music,
 * and every other category (Fågelläten, Fordon & maskiner, Andra ljud)
 * stays on the local "not-connected" stub in providers.js.
 *
 * Deliberately mirrors musicRecognitionProvider.js's shape (same fail-
 * closed error handling, same consent-token flow), but is NOT the same
 * code path: it uses a separate consent purpose
 * (analysisConsentPurposes.audioHummingRecognition, never
 * audioMusicRecognition) and a separate backend route
 * (/api/ai-ear-humming-recognition, never /api/ai-ear-music-recognition),
 * because a different external provider (ACRCloud, never AudD) receives
 * the clip.
 *
 * Fails closed for ANY reason - missing explicit consent approval, no
 * auth, consent denied, offline, timeout, malformed response - by
 * returning { ok: false, reason: 'error' } and NEVER throwing. It never
 * invents a result: a network/provider failure and "no confident melody
 * match" are always kept distinct (see recognizeHumming's return shape).
 *
 * Nothing in this module logs the audio blob, its bytes, the consent
 * token, or the recognized song - only generic reason codes.
 */

const HUMMING_RECOGNITION_ENDPOINT = '/api/ai-ear-humming-recognition'
export const hummingRecognitionTimeoutMs = 20000

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

function toAlternative(candidate) {
  return {
    confidence: typeof candidate?.score === 'number' ? candidate.score : null,
    subtitle: String(candidate?.artist || ''),
    title: String(candidate?.title || ''),
  }
}

/**
 * @param {object} params
 * @param {Blob} params.audioBlob - the exact recorded clip the user chose
 *   to analyze (see AiEarSection.jsx); never a live MediaStream.
 * @param {boolean} params.consentApproved - must be exactly `true`, set
 *   only from inside the real "Skicka för identifiering" consent tap for
 *   Nynna & vissla.
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<
 *   {ok: true, matched: false} |
 *   {ok: true, matched: true, result: {title: string, subtitle: string, confidence: number|null, alternatives: object[], details: object|null, provider: string}} |
 *   {ok: false, reason: string}
 * >}
 */
export async function recognizeHumming({ audioBlob, consentApproved, signal } = {}) {
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

  const timeout = timeoutSignal(hummingRecognitionTimeoutMs, signal)

  try {
    let consentToken
    try {
      consentToken = await requestAnalysisConsentToken({
        authorizationHeader: auth.authorizationHeader,
        consentApproved,
        images: audioBlob,
        purpose: analysisConsentPurposes.audioHummingRecognition,
        signal: timeout.signal,
      })
    } catch {
      return { ok: false, reason: 'error' }
    }

    const formData = new FormData()
    formData.append('audio', audioBlob, 'ai-ear-clip')

    const response = await fetch(HUMMING_RECOGNITION_ENDPOINT, {
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
        alternatives: Array.isArray(payload.result.alternatives) ? payload.result.alternatives.map(toAlternative) : [],
        confidence: typeof payload.result.score === 'number' ? payload.result.score : null,
        details: payload.result.details && typeof payload.result.details === 'object' ? payload.result.details : null,
        provider: 'ACRCloud',
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

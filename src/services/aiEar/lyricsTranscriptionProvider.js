import {
  analysisConsentPurposes,
  requestAnalysisConsentToken,
  withAnalysisConsentTokenHeader,
} from '../security/analysisConsentProof.js'
import {
  getCurrentAiAuthorization,
  hasSameAiAuthUser,
} from '../ai/aiAuthTransport.js'
import { search as searchLyrics } from './lyricsSearchProvider.js'

/**
 * Client-side call for AI-örat -> "Ord ur en låt" (Sprint 7): the user
 * spoke or sang a few words from a song, and this asks Viktkollen's own
 * server-side speech-to-text route what was said. This is the ONLY place
 * in AI-örat that sends this kind of clip anywhere - Musik keeps using
 * musicRecognitionProvider.js (AudD) and Nynna & vissla keeps using
 * hummingRecognitionProvider.js (ACRCloud); neither is touched here.
 *
 * Deliberately mirrors hummingRecognitionProvider.js's shape (same fail-
 * closed error handling, same consent-token flow), but is NOT the same
 * code path: it uses a separate consent purpose
 * (analysisConsentPurposes.audioLyricsTranscription, never
 * audioMusicRecognition or audioHummingRecognition) and a separate
 * backend route (/api/ai-ear-lyrics-transcription), because a different
 * external provider (OpenAI, never AudD or ACRCloud) receives the clip.
 *
 * IMPORTANT - the result is a TRANSCRIPT, never a song match: unlike
 * musicProvider/humProvider, this never returns a { title, subtitle,
 * confidence } "hit" shape (see audioResultModel.js). It always returns
 * { transcript, language, noSpeech }, plus a lyricsSearch field produced
 * by locally calling lyricsSearchProvider.search() - which makes no
 * network call and always resolves to { status: 'not-connected' } this
 * sprint. The transcript is only ever transported to
 * /api/ai-ear-lyrics-transcription (for the initial speech-to-text call)
 * and is NEVER sent to any other endpoint, provider, or third party by
 * this module.
 *
 * Fails closed for ANY reason - missing explicit consent approval, no
 * auth, consent denied, offline, timeout, malformed response - by
 * returning { ok: false, reason: 'error' } and NEVER throwing.
 *
 * Nothing in this module logs the audio blob, its bytes, the consent
 * token, or the transcribed text - only generic reason codes.
 */

const LYRICS_TRANSCRIPTION_ENDPOINT = '/api/ai-ear-lyrics-transcription'
export const lyricsTranscriptionTimeoutMs = 20000

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
 *   only from inside the real "Skicka för texttolkning" consent tap for
 *   "Ord ur en låt".
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<
 *   {ok: true, transcript: string, noSpeech: boolean, language: string|null, lyricsSearch: {status: string}} |
 *   {ok: false, reason: string}
 * >}
 */
export async function recognizeLyrics({ audioBlob, consentApproved, signal } = {}) {
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

  const timeout = timeoutSignal(lyricsTranscriptionTimeoutMs, signal)

  try {
    let consentToken
    try {
      consentToken = await requestAnalysisConsentToken({
        authorizationHeader: auth.authorizationHeader,
        consentApproved,
        images: audioBlob,
        purpose: analysisConsentPurposes.audioLyricsTranscription,
        signal: timeout.signal,
      })
    } catch {
      return { ok: false, reason: 'error' }
    }

    const formData = new FormData()
    formData.append('audio', audioBlob, 'ai-ear-clip')

    const response = await fetch(LYRICS_TRANSCRIPTION_ENDPOINT, {
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

    if (typeof payload.transcript !== 'string') {
      return { ok: false, reason: 'error' }
    }

    const transcript = payload.transcript
    const noSpeech = payload.noSpeech === true || transcript.length === 0

    // The lyrics-search boundary is called locally, client-side, and
    // makes no network request of its own this sprint (see
    // lyricsSearchProvider.js) - it is never routed through the backend.
    const lyricsSearch = noSpeech ? { status: 'not-connected' } : await searchLyrics(transcript)

    return {
      language: typeof payload.language === 'string' ? payload.language : null,
      lyricsSearch: lyricsSearch && typeof lyricsSearch === 'object' ? lyricsSearch : { status: 'not-connected' },
      noSpeech,
      ok: true,
      transcript,
    }
  } catch {
    return { ok: false, reason: 'error' }
  } finally {
    timeout.cleanup()
  }
}

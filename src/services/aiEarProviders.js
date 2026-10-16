import {
  analysisConsentPurposes,
  requestAnalysisConsentToken,
  withAnalysisConsentTokenHeader,
} from './security/analysisConsentProof.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './ai/aiAuthTransport.js'
import { mapAiEarHttpError } from './aiEarInterpret.js'

/**
 * Client calls for the three third-party AI-örat features re-integrated in
 * Sprint 12A (historical Sprint 4 / 6 / 7 providers, adapted to today's
 * shared audio pipeline and auth):
 *
 *   identifyMusic     -> /api/ai-ear-music-recognition    (AudD)
 *   identifyHumming   -> /api/ai-ear-humming-recognition  (ACRCloud)
 *   transcribeSpeech  -> /api/ai-ear-lyrics-transcription (OpenAI speech-to-text)
 *
 * Each has its OWN consent purpose and endpoint because a different external
 * provider receives the clip; a failure in one can never affect another or the
 * Perch/YAMNet analysis (src/services/aiEarInterpret.js). Like that module they
 * fail closed, never throw, return { ok:false, reason, retryable } and never
 * log or store audio, tokens or the (sensitive) transcript.
 *
 * Wire contract (unchanged from the historical routes): multipart/form-data
 * with one `audio` file, Supabase bearer, consent token in a dedicated header
 * bound to the exact audio bytes with label `audio`.
 */

export const aiEarProviderTimeoutMs = 25000
const STATUS_ENDPOINT = '/api/ai-ear-providers'

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

async function postAudioToProvider({ consentApproved, endpoint, parse, purpose, signal, wav }) {
  if (consentApproved !== true) return { ok: false, reason: 'consent_not_approved', retryable: false }
  if (!wav || !wav.size) return { ok: false, reason: 'invalid_audio', retryable: false }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline', retryable: true }

  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) return { ok: false, reason: 'auth_required', retryable: false }

  const timeout = timeoutSignal(aiEarProviderTimeoutMs, signal)
  try {
    let consentToken
    try {
      consentToken = await requestAnalysisConsentToken({
        authorizationHeader: auth.authorizationHeader,
        consentApproved,
        images: [{ label: 'audio', source: wav }],
        purpose,
        signal: timeout.signal,
      })
    } catch (error) {
      if (timeout.signal.aborted) throw error
      if (error?.message === 'consent_token_network_error') return { ok: false, reason: 'network', retryable: true }
      return { ok: false, reason: 'consent_required', retryable: false }
    }

    const form = new FormData()
    form.append('audio', wav, 'ai-ear-clip.wav')
    const response = await fetch(endpoint, {
      body: form,
      headers: withAnalysisConsentTokenHeader({ Authorization: auth.authorizationHeader }, consentToken.token),
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

    const parsed = parse(payload)
    return parsed ? { ok: true, ...parsed } : { ok: false, reason: 'invalid_response', retryable: true }
  } catch {
    if (signal?.aborted) return { ok: false, reason: 'aborted', retryable: false }
    if (timeout.signal.aborted) return { ok: false, reason: 'timeout', retryable: true }
    return { ok: false, reason: 'network', retryable: true }
  } finally {
    timeout.cleanup()
  }
}

const text = (value, max = 200) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '')

function parseMusic(payload) {
  if (payload.matched === false) return { matched: false }
  const result = payload.result
  if (!payload.matched || !text(result?.title)) return null
  return {
    matched: true,
    result: {
      album: text(result?.details?.album) || null,
      artist: text(result?.artist) || null,
      provider: 'AudD',
      releaseYear: /^\d{4}$/.test(String(result?.details?.releaseYear || '')) ? String(result.details.releaseYear) : null,
      title: text(result.title),
    },
  }
}

function parseHumming(payload) {
  if (payload.matched === false) return { matched: false }
  const result = payload.result
  if (!payload.matched || !text(result?.title)) return null
  const alternatives = Array.isArray(result.alternatives)
    ? result.alternatives.map((entry) => ({ artist: text(entry?.artist) || null, title: text(entry?.title) })).filter((entry) => entry.title).slice(0, 2)
    : []
  // The provider score is deliberately NOT passed on: the UI never shows it as a confidence or percentage.
  return {
    matched: true,
    result: { album: text(result?.details?.album) || null, alternatives, artist: text(result?.artist) || null, provider: 'ACRCloud', title: text(result.title) },
  }
}

function parseTranscription(payload) {
  if (typeof payload.transcript !== 'string') return null
  const transcript = payload.transcript.trim().slice(0, 2000)
  return { language: typeof payload.language === 'string' ? payload.language : null, noSpeech: payload.noSpeech === true || transcript.length === 0, transcript }
}

export const identifyMusic = ({ consentApproved, signal, wav } = {}) => postAudioToProvider({
  consentApproved, endpoint: '/api/ai-ear-music-recognition', parse: parseMusic, purpose: analysisConsentPurposes.audioMusicRecognition, signal, wav,
})

export const identifyHumming = ({ consentApproved, signal, wav } = {}) => postAudioToProvider({
  consentApproved, endpoint: '/api/ai-ear-humming-recognition', parse: parseHumming, purpose: analysisConsentPurposes.audioHummingRecognition, signal, wav,
})

export const transcribeSpeech = ({ consentApproved, signal, wav } = {}) => postAudioToProvider({
  consentApproved, endpoint: '/api/ai-ear-lyrics-transcription', parse: parseTranscription, purpose: analysisConsentPurposes.audioLyricsTranscription, signal, wav,
})

const noProviders = Object.freeze({ humming: false, music: false, transcription: false })

/** Which optional features the server has configured. Fails closed: any problem = nothing extra is offered. */
export async function loadAiEarProviderStatus({ signal } = {}) {
  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) return { ...noProviders }
    const response = await fetch(STATUS_ENDPOINT, { headers: { Authorization: auth.authorizationHeader }, method: 'GET', signal })
    const payload = await response.json()
    if (!response.ok || payload?.ok !== true) return { ...noProviders }
    return { humming: payload.providers?.humming === true, music: payload.providers?.music === true, transcription: payload.providers?.transcription === true }
  } catch {
    return { ...noProviders }
  }
}

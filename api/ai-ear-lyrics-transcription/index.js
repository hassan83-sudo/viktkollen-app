import { baseContentType, createProviderRouteHandler, fetchProviderJson, providerError, providerRouteConfig } from '../_shared/aiEarProviderRoute.js'
import { analysisConsentPurposes } from '../_shared/analysisConsent.js'

/**
 * AI-örat -> "Ord ur en låt": speech-to-text ONLY. Re-integrated in Sprint 12A
 * from the historical Sprint 7 implementation (branch ai-ear-sprint7, commit
 * bb24648): same endpoint (POST /v1/audio/transcriptions), same model default
 * (`gpt-transcribe`, overridable with AI_EAR_LYRICS_MODEL), same server-side
 * OPENAI_API_KEY as the rest of the app, same result contract
 * ({ transcript, noSpeech, language }). No song lookup is done or implied.
 *
 * The transcript is the user's own words: it is returned to the caller only,
 * held in memory for this request, never stored, never sent to analytics or
 * any other provider, and NEVER logged (only its length).
 */

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'
export const LYRICS_TRANSCRIPTION_TIMEOUT_MS = Number(process.env.AI_EAR_LYRICS_TIMEOUT_MS || 15000)
const MAX_AUDIO_BYTES = Number(process.env.AI_EAR_LYRICS_MAX_FILE_BYTES || 4 * 1024 * 1024)

export const config = providerRouteConfig

export function audioFileName(contentType) {
  const extension = {
    'audio/mp3': 'mp3', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/wave': 'wav', 'audio/webm': 'webm', 'audio/x-wav': 'wav',
  }[baseContentType(contentType)] || 'webm'
  return `ai-ear-lyrics-clip.${extension}`
}

export async function callOpenAiTranscription(audio, { fetchImpl, timeoutMs = LYRICS_TRANSCRIPTION_TIMEOUT_MS } = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || '')
  if (!apiKey) throw providerError('serverConfiguration')

  const form = new FormData()
  form.append('model', process.env.AI_EAR_LYRICS_MODEL || 'gpt-transcribe')
  form.append('response_format', 'json')
  form.append('file', new Blob([audio.data], { type: audio.contentType || 'application/octet-stream' }), audioFileName(audio.contentType))

  const payload = await fetchProviderJson(
    OPENAI_TRANSCRIPTION_URL,
    { body: form, headers: { Authorization: `Bearer ${apiKey}` }, method: 'POST' },
    // 401/403 = our own API key is missing/invalid/lacks access: configuration, not an outage.
    { fetchImpl, httpErrorCode: (status) => (status === 401 || status === 403 ? 'serverConfiguration' : 'providerUnavailable'), timeoutMs },
  )

  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  const language = Array.isArray(payload?.languages) && typeof payload.languages[0]?.code === 'string' ? payload.languages[0].code : null
  return { language, noSpeech: text.length === 0, transcript: text }
}

export default createProviderRouteHandler({
  buildBody: (outcome, requestId) => ({ language: outcome.language, noSpeech: outcome.noSpeech, ok: true, requestId, transcript: outcome.transcript }),
  callProvider: (audio) => callOpenAiTranscription(audio),
  idPrefix: 'ai-ear-lyrics',
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
  // Length only, never content.
  logFields: (outcome) => ({ language: outcome.language, noSpeech: outcome.noSpeech, transcriptLength: outcome.transcript.length }),
  logName: '[api/ai-ear-lyrics-transcription]',
  maxBytes: MAX_AUDIO_BYTES,
  purpose: analysisConsentPurposes.audioLyricsTranscription,
  rateLimitEnv: 'AI_EAR_LYRICS_RATE_LIMIT_MAX',
  rateRoute: 'aiEarLyrics',
})

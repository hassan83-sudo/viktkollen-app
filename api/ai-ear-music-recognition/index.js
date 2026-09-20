import { createProviderRouteHandler, fetchProviderJson, providerError, providerRouteConfig } from '../_shared/aiEarProviderRoute.js'
import { analysisConsentPurposes } from '../_shared/analysisConsent.js'

/**
 * AI-örat -> "Identifiera musik": exact-song identification via AudD.
 * Re-integrated in Sprint 12A from the historical Sprint 4 implementation
 * (branch ai-ear-sprint4, commit a35271c): same provider call, same
 * `AUDD_API_TOKEN` (server-only), same result contract
 * ({ matched, result: { title, artist, details: { album, provider, releaseYear } } }).
 * Only ordinary recorded music goes here; humming/whistling is ACRCloud
 * (api/ai-ear-humming-recognition), speech is OpenAI, birds/ambient is Perch/YAMNet.
 * See api/_shared/aiEarProviderRoute.js for the shared auth/consent/limits.
 */

const AUDD_ENDPOINT = 'https://api.audd.io/'
export const MUSIC_RECOGNITION_TIMEOUT_MS = Number(process.env.AI_EAR_MUSIC_TIMEOUT_MS || 15000)
const MAX_AUDIO_BYTES = Number(process.env.AI_EAR_MUSIC_MAX_FILE_BYTES || 4 * 1024 * 1024)

export const config = providerRouteConfig

/** Returns { matched: false } for AudD's normal "no match" (result: null); throws coded errors otherwise. */
export async function callAudD(audio, { fetchImpl, timeoutMs = MUSIC_RECOGNITION_TIMEOUT_MS } = {}) {
  const apiToken = String(process.env.AUDD_API_TOKEN || '')
  if (!apiToken) throw providerError('serverConfiguration')

  const form = new FormData()
  form.append('api_token', apiToken)
  form.append('return', 'apple_music,spotify')
  form.append('file', new Blob([audio.data], { type: audio.contentType || 'application/octet-stream' }), 'ai-ear-clip')

  const payload = await fetchProviderJson(AUDD_ENDPOINT, { body: form, method: 'POST' }, { fetchImpl, timeoutMs })
  if (payload?.status !== 'success') throw providerError('providerUnavailable')
  if (!payload.result) return { matched: false }

  return {
    matched: true,
    result: {
      album: payload.result.album || null,
      artist: payload.result.artist || null,
      releaseDate: payload.result.release_date || null,
      title: payload.result.title || null,
    },
  }
}

export default createProviderRouteHandler({
  buildBody: (outcome, requestId) => {
    if (!outcome.matched || !outcome.result?.title) return { matched: false, ok: true, requestId }
    return {
      matched: true,
      ok: true,
      requestId,
      result: {
        artist: outcome.result.artist,
        details: {
          album: outcome.result.album,
          provider: 'AudD',
          releaseYear: outcome.result.releaseDate ? String(outcome.result.releaseDate).slice(0, 4) : null,
        },
        title: outcome.result.title,
      },
    }
  },
  callProvider: (audio) => callAudD(audio),
  idPrefix: 'ai-ear-music',
  isConfigured: () => Boolean(process.env.AUDD_API_TOKEN),
  logFields: (outcome) => ({ matched: Boolean(outcome.matched) }),
  logName: '[api/ai-ear-music-recognition]',
  maxBytes: MAX_AUDIO_BYTES,
  purpose: analysisConsentPurposes.audioMusicRecognition,
  rateLimitEnv: 'AI_EAR_MUSIC_RATE_LIMIT_MAX',
  rateRoute: 'aiEarMusic',
})

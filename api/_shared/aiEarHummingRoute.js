import { createHmac } from 'node:crypto'
import { createProviderRouteHandler, fetchProviderJson, providerError, providerRouteConfig } from './aiEarProviderRoute.js'
import { analysisConsentPurposes } from './analysisConsent.js'

/**
 * AI-örat -> "Nynna / vissla / sjung": melody identification via ACRCloud's
 * Humming engine. Re-integrated in Sprint 12A from the historical Sprint 6
 * implementation (branch ai-ear-sprint6, commit 8a3d604): same HMAC-SHA1
 * request signature, same Identify endpoint, same credentials (server-only
 * ACRCLOUD_HOST / ACRCLOUD_ACCESS_KEY / ACRCLOUD_ACCESS_SECRET), same
 * result contract ({ matched, result: { title, artist, score, alternatives, details } }).
 * The access secret is only used to sign; neither it nor the signature is
 * ever logged or returned. Results come from metadata.humming; the provider
 * score (0-1) is passed through untouched and is not turned into a product
 * decision anywhere.
 */

const ACRCLOUD_HTTP_URI = '/v1/identify'
const ACRCLOUD_HTTP_METHOD = 'POST'
const ACRCLOUD_DATA_TYPE = 'audio'
const ACRCLOUD_SIGNATURE_VERSION = '1'
export const HUMMING_RECOGNITION_TIMEOUT_MS = Number(process.env.AI_EAR_HUMMING_TIMEOUT_MS || 15000)
// ACRCloud's Identify "sample" limit is < 5 MB; the Vercel body limit is lower still.
const MAX_AUDIO_BYTES = Number(process.env.AI_EAR_HUMMING_MAX_FILE_BYTES || 4 * 1024 * 1024)

export const config = providerRouteConfig

/** base64(HMAC-SHA1(access_secret, "POST\n/v1/identify\n<key>\naudio\n1\n<timestamp>")) per ACRCloud's Identify API. */
export function buildAcrCloudSignature({ accessKey, accessSecret, timestamp }) {
  const stringToSign = [ACRCLOUD_HTTP_METHOD, ACRCLOUD_HTTP_URI, accessKey, ACRCLOUD_DATA_TYPE, ACRCLOUD_SIGNATURE_VERSION, String(timestamp)].join('\n')
  return createHmac('sha1', accessSecret).update(stringToSign, 'utf8').digest('base64')
}

function isConfigured() {
  return Boolean(process.env.ACRCLOUD_HOST && process.env.ACRCLOUD_ACCESS_KEY && process.env.ACRCLOUD_ACCESS_SECRET)
}

export async function callAcrCloud(audio, { fetchImpl, now = Date.now(), timeoutMs = HUMMING_RECOGNITION_TIMEOUT_MS } = {}) {
  const host = String(process.env.ACRCLOUD_HOST || '')
  const accessKey = String(process.env.ACRCLOUD_ACCESS_KEY || '')
  const accessSecret = String(process.env.ACRCLOUD_ACCESS_SECRET || '')
  if (!host || !accessKey || !accessSecret) throw providerError('serverConfiguration')
  if (!/^[a-z0-9.-]+$/i.test(host)) throw providerError('serverConfiguration')

  const timestamp = Math.floor(now / 1000)
  const form = new FormData()
  form.append('access_key', accessKey)
  form.append('sample_bytes', String(audio.size))
  form.append('timestamp', String(timestamp))
  form.append('signature', buildAcrCloudSignature({ accessKey, accessSecret, timestamp }))
  form.append('signature_version', ACRCLOUD_SIGNATURE_VERSION)
  form.append('data_type', ACRCLOUD_DATA_TYPE)
  form.append('sample', new Blob([audio.data], { type: audio.contentType || 'application/octet-stream' }), 'ai-ear-clip')

  const payload = await fetchProviderJson(`https://${host}${ACRCLOUD_HTTP_URI}`, { body: form, method: ACRCLOUD_HTTP_METHOD }, { fetchImpl, timeoutMs })

  const statusCode = payload?.status?.code
  // 1001 = "no recognition result": a normal, non-error outcome.
  if (statusCode === 1001) return { matched: false }
  if (statusCode !== 0) {
    // 3001 (wrong access key) / 3014 (invalid signature): our own credentials are wrong.
    throw providerError(statusCode === 3001 || statusCode === 3014 ? 'serverConfiguration' : 'providerUnavailable')
  }

  const humming = Array.isArray(payload?.metadata?.humming) ? payload.metadata.humming : []
  const candidates = humming.map((entry) => ({
    album: entry?.album?.name || null,
    artist: Array.isArray(entry?.artists) && entry.artists[0]?.name ? entry.artists[0].name : null,
    score: typeof entry?.score === 'number' ? entry.score : null,
    title: entry?.title || null,
  })).filter((entry) => entry.title)

  return candidates.length ? { candidates, matched: true } : { matched: false }
}

export default createProviderRouteHandler({
  buildBody: (outcome, requestId) => {
    if (!outcome.matched) return { matched: false, ok: true, requestId }
    const [best, ...rest] = outcome.candidates
    return {
      matched: true,
      ok: true,
      requestId,
      result: {
        alternatives: rest.slice(0, 2).map((candidate) => ({ artist: candidate.artist, score: candidate.score, title: candidate.title })),
        artist: best.artist,
        details: { album: best.album, provider: 'ACRCloud' },
        score: best.score,
        title: best.title,
      },
    }
  },
  callProvider: (audio) => callAcrCloud(audio),
  idPrefix: 'ai-ear-humming',
  isConfigured,
  logFields: (outcome) => ({ candidateCount: outcome.candidates?.length || 0, matched: Boolean(outcome.matched) }),
  logName: '[api/ai-ear-humming-recognition]',
  maxBytes: MAX_AUDIO_BYTES,
  purpose: analysisConsentPurposes.audioHummingRecognition,
  rateLimitEnv: 'AI_EAR_HUMMING_RATE_LIMIT_MAX',
  rateRoute: 'aiEarHumming',
})

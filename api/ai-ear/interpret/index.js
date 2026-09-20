import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../../_shared/aiRateLimiter.js'
import { verifySupabaseUser } from '../../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from '../../_shared/analysisConsent.js'
import { getGoogleIdToken } from '../../_shared/googleIdToken.js'

/**
 * AI-örat: secure server-side hop from the Viktkollen app to the PRIVATE
 * Cloud Run service `perch-inference` (POST /v2/interpret).
 *
 *   browser -> POST /api/ai-ear/interpret (Supabase bearer + consent token,
 *              body = one WAV recording)
 *           -> this function: origin, Supabase auth, rate limit, size/format,
 *              consent-token gate bound to these exact audio bytes
 *           -> Google ID token minted server-side -> Cloud Run /v2/interpret
 *           -> only a reduced, validated result is returned.
 *
 * Nothing Google-related ever reaches the browser. Audio is held in memory for
 * this one request only: never written to disk, Supabase or logs. Logs carry
 * only a request id, generic status codes and byte counts - never audio,
 * file names, Authorization values, tokens, species or scores.
 *
 * Kept OFF by default: AI_EAR_ENABLED must be exactly "true" on the server
 * (in addition to the client feature flag) and the Cloud Run URL and service
 * account credential must be configured, otherwise the route answers with a
 * generic "not configured" error.
 */

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024 // Vercel serverless request bodies are limited to ~4.5 MB.
const DEFAULT_TIMEOUT_MS = 28000 // Cloud Run cold start is ~8 s; backend warm latency < 0.5 s.
const allowedLocales = new Set(['sv-SE', 'en-US'])
const allowedStates = new Set(['speech', 'music', 'human_whistle', 'mixed_scene', 'species_candidate', 'unresolved', 'insufficient_signal', 'unavailable'])
const allowedDispositions = new Set(['lead', 'caveat', 'withhold', 'unavailable'])
const clientSafeBackendErrorCodes = new Set([
  'audio_decode_failed',
  'decoded_audio_too_long',
  'empty_audio',
  'invalid_request',
  'non_finite_audio',
  'unsupported_sample_rate',
])

export const config = {
  api: {
    bodyParser: false,
  },
}

function getHeader(request, name) {
  const headers = request.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

function normalizeAllowedHost(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).host.toLowerCase()
  } catch {
    return ''
  }
}

function isAllowedOrigin(origin, ...allowedHosts) {
  if (!origin) return true
  try {
    const parsedOrigin = new URL(origin)
    if (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:') return false
    return allowedHosts.map(normalizeAllowedHost).filter(Boolean).includes(parsedOrigin.host.toLowerCase())
  } catch {
    return false
  }
}

function safeText(value, max = 200) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function sendError(response, status, code, requestId, { reason, retryable = false } = {}) {
  if (reason) {
    setNoStoreHeaders(response)
    return response.status(status).json({
      error: { code, reason, requestId, retryable },
      ok: false,
    })
  }
  return sendSafeAiError(response, { code, requestId, retryable, status })
}

/** Reads the raw request body, aborting as soon as it exceeds `maxBytes`. */
async function readBodyLimited(request, maxBytes) {
  const declared = Number(getHeader(request, 'content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true }

  if (request.body && !(typeof request.on === 'function')) {
    const buffer = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body)
    return buffer.length > maxBytes ? { tooLarge: true } : { buffer }
  }

  const chunks = []
  let total = 0
  for await (const chunk of request) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += piece.length
    if (total > maxBytes) return { tooLarge: true }
    chunks.push(piece)
  }
  return { buffer: Buffer.concat(chunks) }
}

function looksLikeWav(buffer) {
  return buffer.length >= 44
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WAVE'
}

function reduceBackendResult(body) {
  const result = body?.interpretedResult
  if (body?.apiVersion !== 2 || !result || !allowedStates.has(result.state) || !allowedDispositions.has(result.speciesDisposition)) {
    return null
  }

  const showSpecies = result.speciesDisposition === 'lead' || result.speciesDisposition === 'caveat'
  const userFacing = body.userFacing && typeof body.userFacing === 'object' ? body.userFacing : {}
  const signal = body.signalMetadata && typeof body.signalMetadata === 'object' ? body.signalMetadata : {}
  const flags = body.flags && typeof body.flags === 'object' ? body.flags : {}
  const list = (value, max, length) => (Array.isArray(value) ? value.slice(0, max).map((entry) => safeText(entry, length)).filter(Boolean) : [])

  return {
    apiVersion: 2,
    flags: {
      caveat: flags.caveat === true,
      partialModels: flags.partialModels === true,
    },
    reasonCodes: list(result.reasonCodes, 12, 60),
    routerVersion: safeText(body.modelMetadata?.router?.version, 20),
    signal: {
      durationSec: Number.isFinite(Number(signal.durationSec)) ? Number(signal.durationSec) : null,
      nearSilence: signal.nearSilence === true,
      tooShort: signal.tooShort === true,
      truncated: signal.truncated === true,
    },
    speciesCandidates: showSpecies && Array.isArray(result.speciesCandidates)
      ? result.speciesCandidates.slice(0, 5).map((entry, index) => ({
        ebirdCode: safeText(entry?.ebirdCode, 30),
        label: safeText(entry?.label, 80),
        rank: Number.isFinite(Number(entry?.rank)) ? Number(entry.rank) : index + 1,
      })).filter((entry) => entry.label)
      : [],
    speciesDisposition: result.speciesDisposition,
    state: result.state,
    userFacing: {
      body: userFacing.body ? safeText(userFacing.body, 400) : null,
      contextLines: list(userFacing.contextLines, 6, 80),
      copyKey: safeText(userFacing.copyKey, 60),
      headline: safeText(userFacing.headline, 200),
      locale: allowedLocales.has(userFacing.locale) ? userFacing.locale : 'sv-SE',
      speciesLines: showSpecies ? list(userFacing.speciesLines, 5, 120) : [],
    },
  }
}

export const aiEarRouteInternals = { reduceBackendResult }

export default async function handler(request, response) {
  const requestId = `ai-ear-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendError(response, 405, aiRouteErrorCodes.INVALID_REQUEST, requestId)
  }

  const origin = getHeader(request, 'origin')
  if (!isAllowedOrigin(origin, getHeader(request, 'host'), process.env.VERCEL_URL)) {
    return sendError(response, 403, aiRouteErrorCodes.INVALID_REQUEST, requestId)
  }

  const backendUrl = String(process.env.AI_EAR_BACKEND_URL || '').trim().replace(/\/+$/, '')
  if (process.env.AI_EAR_ENABLED !== 'true' || !backendUrl.startsWith('https://')) {
    return sendError(response, 503, aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED, requestId)
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({ error: auth.error, ok: false })
  }

  const contentType = String(getHeader(request, 'content-type') || '').toLowerCase()
  if (!/^audio\/(wav|x-wav|wave)(;|$)/.test(contentType)) {
    return sendError(response, 415, aiRouteErrorCodes.INVALID_REQUEST, requestId, { reason: 'unsupported_media' })
  }

  const rateLimit = checkAiRouteRateLimit({
    limit: process.env.AI_EAR_RATE_LIMIT_MAX,
    route: 'aiEar',
    userId: auth.user.id,
  })
  if (rateLimit.limited) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.RATE_LIMITED,
      requestId,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      retryable: true,
      status: 429,
    })
  }

  const maxBytes = Number(process.env.AI_EAR_MAX_BYTES || DEFAULT_MAX_BYTES)
  let body
  try {
    body = await readBodyLimited(request, maxBytes)
  } catch {
    // The client went away mid-upload (cancel, navigation, lost connection): nothing to process.
    console.warn('[api/ai-ear/interpret] Upload aborted by client', { requestId })
    return sendError(response, 400, aiRouteErrorCodes.REQUEST_ABORTED, requestId, { reason: 'aborted' })
  }
  if (body.tooLarge) return sendError(response, 413, aiRouteErrorCodes.REQUEST_TOO_LARGE, requestId)
  const audio = body.buffer
  if (!audio?.length) return sendError(response, 400, aiRouteErrorCodes.INVALID_REQUEST, requestId, { reason: 'empty_audio' })
  if (!looksLikeWav(audio)) return sendError(response, 415, aiRouteErrorCodes.INVALID_REQUEST, requestId, { reason: 'unsupported_media' })

  // Consent proof bound to this exact audio, this user and this purpose.
  const consent = verifyAnalysisConsentToken({
    env: process.env,
    imageEntries: [{ bytes: audio, label: 'image' }],
    purpose: analysisConsentPurposes.aiEarInterpret,
    token: getHeader(request, 'x-viktkollen-consent-token'),
    userId: auth.user.id,
  })
  if (!consent.ok) {
    console.warn('[api/ai-ear/interpret] Consent rejected', { reason: consent.reason, requestId })
    return sendSafeAiError(response, { code: aiRouteErrorCodes.CONSENT_REQUIRED, requestId, status: 403 })
  }

  const url = new URL(request.url || '/', 'https://viktkollen.invalid')
  const requestedLocale = url.searchParams.get('locale')
  const locale = allowedLocales.has(requestedLocale) ? requestedLocale : 'sv-SE'

  let idToken
  try {
    idToken = await getGoogleIdToken({ audience: process.env.AI_EAR_BACKEND_AUDIENCE || backendUrl })
  } catch (error) {
    console.error('[api/ai-ear/interpret] Backend auth unavailable', { code: error?.code || 'unknown', requestId })
    return sendError(response, 502, aiRouteErrorCodes.PROVIDER_UNAVAILABLE, requestId, { retryable: false })
  }

  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav')
  form.append('locale', locale)

  let upstream
  try {
    upstream = await fetch(`${backendUrl}/v2/interpret`, {
      body: form,
      headers: { Authorization: `Bearer ${idToken}` },
      method: 'POST',
      signal: AbortSignal.timeout(Number(process.env.AI_EAR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)),
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    console.warn('[api/ai-ear/interpret] Backend request failed', { requestId, timedOut })
    return sendError(response, timedOut ? 504 : 502, timedOut ? aiRouteErrorCodes.PROVIDER_TIMEOUT : aiRouteErrorCodes.PROVIDER_UNAVAILABLE, requestId, { retryable: true })
  }

  const payload = await upstream.json().catch(() => null)

  if (!upstream.ok) {
    console.warn('[api/ai-ear/interpret] Backend returned an error status', { requestId, status: upstream.status })
    if (upstream.status === 400) {
      const backendCode = payload?.error?.code
      return sendError(response, 400, aiRouteErrorCodes.INVALID_REQUEST, requestId, {
        reason: clientSafeBackendErrorCodes.has(backendCode) ? backendCode : 'invalid_request',
      })
    }
    if (upstream.status === 413) return sendError(response, 413, aiRouteErrorCodes.REQUEST_TOO_LARGE, requestId)
    // 401/403 from Cloud Run means OUR service-account setup is wrong: generic error, no detail to the client.
    return sendError(response, 502, aiRouteErrorCodes.PROVIDER_UNAVAILABLE, requestId, { retryable: upstream.status >= 500 || upstream.status === 429 })
  }

  const result = reduceBackendResult(payload)
  if (!result) {
    console.warn('[api/ai-ear/interpret] Backend response failed validation', { requestId })
    return sendError(response, 502, aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE, requestId)
  }

  console.info('[api/ai-ear/interpret] Completed', { audioBytes: audio.length, requestId })
  return response.status(200).json({ ok: true, requestId, result })
}

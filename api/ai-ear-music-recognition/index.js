import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from '../_shared/analysisConsent.js'
// Note: this route lives directly under api/ (api/ai-ear-music-recognition/),
// one level deep like every other route in this project (api/body-analysis,
// api/forgotten-items-analysis, ...) - not nested under an extra api/ai-ear/
// grouping folder - so these ../_shared/ imports resolve the same way theirs do.

/**
 * AI-örat -> Musik: real music (song) identification, Sprint 4.
 *
 * Scope, deliberately narrow: given ONE user-recorded audio clip the user
 * has already explicitly approved sending (see the consent gate below),
 * ask a server-side music-fingerprinting provider (AudD) whether it
 * recognizes an exact recorded song in it. Nothing else. This route is
 * never used for humming/whistling, bird calls, vehicles/machines or any
 * other AI-örat category - see src/services/aiEar/providers.js, where
 * every other category still returns "not-connected" and never reaches
 * any route at all.
 *
 * Security posture mirrors api/forgotten-items-analysis/index.js and
 * api/body-analysis/index.js exactly: Supabase auth -> per-route rate
 * limit -> the same HMAC consent-token gate (api/_shared/analysisConsent.js),
 * bound to this exact audio byte hash, this user, and the
 * audio-music-recognition purpose only - before the clip is ever sent to
 * AudD. The audio is never written to disk, never stored in Supabase, and
 * never logged (only generic status codes, sizes and durations are
 * logged) - it exists only in memory for the duration of this one request
 * and is discarded once the response is sent.
 *
 * The AudD API token lives only in the server-side AUDD_API_TOKEN
 * environment variable - it is never sent to, or reachable from, the
 * client bundle.
 */

const DEFAULT_TIMEOUT_MS = 15000
export const MUSIC_RECOGNITION_TIMEOUT_MS = Number(process.env.AI_EAR_MUSIC_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
// AudD's standard (non-Enterprise) endpoint accepts files up to ~10 MB.
const MAX_AUDIO_SIZE_BYTES = Number(process.env.AI_EAR_MUSIC_MAX_FILE_BYTES || 10 * 1024 * 1024)
const AUDD_ENDPOINT = 'https://api.audd.io/'
// Base MIME types actually produced by MediaRecorder across current major
// browsers (Chrome/Firefox/Edge: audio/webm; Safari: audio/mp4; some
// Firefox builds: audio/ogg). Any ";codecs=..." parameter is stripped
// before this check runs.
const allowedAudioTypes = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/3gpp',
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

function safeError(response, status, code, message, retryable = false, requestId = '') {
  const mapping = {
    consentRequired: aiRouteErrorCodes.CONSENT_REQUIRED,
    invalidContentType: aiRouteErrorCodes.INVALID_REQUEST,
    invalidProviderResponse: aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE,
    methodNotAllowed: aiRouteErrorCodes.INVALID_REQUEST,
    missingAudio: aiRouteErrorCodes.INVALID_REQUEST,
    oversizedAudio: aiRouteErrorCodes.REQUEST_TOO_LARGE,
    providerUnavailable: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
    rateLimit: aiRouteErrorCodes.RATE_LIMITED,
    serverConfiguration: aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED,
    timeout: aiRouteErrorCodes.PROVIDER_TIMEOUT,
    unsupportedFormat: aiRouteErrorCodes.INVALID_REQUEST,
  }
  return sendSafeAiError(response, {
    code: mapping[code] || aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
    requestId,
    retryable,
    safeMessage: message,
    status,
  })
}

function getBoundary(contentType) {
  return contentType
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('boundary='))
    ?.replace('boundary=', '')
}

async function readBody(request) {
  if (request.body) {
    return Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body), 'latin1')
  }
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

const CRLF_CRLF = Buffer.from('\r\n\r\n', 'latin1')

/**
 * Byte-safe multipart boundary scan (never decodes the whole body to a
 * string and splits on a substring) - identical approach to
 * api/forgotten-items-analysis/index.js's findMultipartBoundaries, needed
 * here for the same reason: a raw "--boundary" byte sequence can occur by
 * chance inside binary audio content, and only a CRLF-framed delimiter
 * line is ever treated as a real boundary.
 */
function findMultipartBoundaries(rawBody, boundary) {
  const delimiter = Buffer.from(`--${boundary}`, 'latin1')
  const boundaries = []
  let searchFrom = 0

  while (searchFrom <= rawBody.length - delimiter.length) {
    const index = rawBody.indexOf(delimiter, searchFrom)
    if (index === -1) break

    const atLineStart = index === 0 || (rawBody[index - 2] === 0x0d && rawBody[index - 1] === 0x0a)
    const after = index + delimiter.length
    const isClosing = rawBody[after] === 0x2d && rawBody[after + 1] === 0x2d
    const isOpen = rawBody[after] === 0x0d && rawBody[after + 1] === 0x0a

    if (atLineStart && (isOpen || isClosing)) {
      boundaries.push({
        contentStart: after + 2,
        lineStart: index > 0 ? index - 2 : index,
      })
      if (isClosing) break
      searchFrom = after
    } else {
      searchFrom = index + 1
    }
  }

  return boundaries
}

function parseMultipart(rawBodyBuffer, boundary) {
  const fields = {}
  const files = {}
  const boundaries = findMultipartBoundaries(rawBodyBuffer, boundary)

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const part = rawBodyBuffer.subarray(boundaries[index].contentStart, boundaries[index + 1].lineStart)
    const headerEnd = part.indexOf(CRLF_CRLF)
    if (headerEnd === -1) continue

    const rawHeaders = part.subarray(0, headerEnd).toString('latin1')
    if (!rawHeaders.includes('Content-Disposition')) continue

    const fieldName = rawHeaders.match(/name="([^"]+)"/)?.[1]
    const fileName = rawHeaders.match(/filename="([^"]*)"/)?.[1]
    const contentType = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.toLowerCase() || ''
    if (!fieldName) continue

    const content = part.subarray(headerEnd + CRLF_CRLF.length)

    if (!fileName) {
      fields[fieldName] = content.toString('latin1').trim()
      continue
    }

    files[fieldName] = {
      contentType,
      data: content,
      size: content.length,
    }
  }

  return { fields, files }
}

async function parseRequest(request) {
  const contentType = getHeader(request, 'content-type')
  if (!contentType.includes('multipart/form-data')) {
    return { error: { code: 'invalidContentType', message: 'Skicka ljudet som multipart/form-data.', status: 415 } }
  }
  const boundary = getBoundary(contentType)
  if (!boundary) {
    return { error: { code: 'invalidContentType', message: 'Multipart boundary saknas.', status: 415 } }
  }
  const rawBody = await readBody(request)
  if (!rawBody.length) {
    return { error: { code: 'missingAudio', message: 'Ljud saknas.', status: 400 } }
  }
  if (rawBody.length > MAX_AUDIO_SIZE_BYTES + 200000) {
    return { error: { code: 'oversizedAudio', message: 'Ljudfilen är för stor. Maxstorlek är 10 MB.', status: 413 } }
  }
  return { parsed: parseMultipart(rawBody, boundary) }
}

function baseContentType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase()
}

function validateAudio(audio) {
  if (!audio || !audio.data?.length) return { code: 'missingAudio', message: 'Ljud saknas.', status: 400 }
  const base = baseContentType(audio.contentType)
  if (!allowedAudioTypes.has(base)) return { code: 'unsupportedFormat', message: 'Ljudformatet stöds inte.', status: 415 }
  if (audio.size <= 0) return { code: 'missingAudio', message: 'Ljudfilen är tom.', status: 400 }
  if (audio.size > MAX_AUDIO_SIZE_BYTES) return { code: 'oversizedAudio', message: 'Ljudfilen är för stor. Maxstorlek är 10 MB.', status: 413 }
  return null
}

/**
 * Calls AudD's music recognition API server-side with the exact audio
 * bytes the user approved, and nothing else. Returns { matched: false }
 * for a normal "no confident song match" result (AudD's own result: null)
 * - this is NOT an error - or { matched: true, result } for a real hit.
 * Any provider/network/configuration problem throws, and the caller maps
 * that to a generic, safe client error.
 */
async function callAudD(audio) {
  const apiToken = String(process.env.AUDD_API_TOKEN || '')
  if (!apiToken) {
    const error = new Error('missing_configuration')
    error.code = 'serverConfiguration'
    throw error
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MUSIC_RECOGNITION_TIMEOUT_MS)

  try {
    const outboundForm = new FormData()
    outboundForm.append('api_token', apiToken)
    outboundForm.append('return', 'apple_music,spotify')
    outboundForm.append('file', new Blob([audio.data], { type: audio.contentType || 'application/octet-stream' }), 'ai-ear-clip')

    let auddResponse
    try {
      auddResponse = await fetch(AUDD_ENDPOINT, {
        body: outboundForm,
        method: 'POST',
        signal: controller.signal,
      })
    } catch (networkError) {
      if (networkError?.name === 'AbortError') {
        const timeoutError = new Error('timeout')
        timeoutError.code = 'timeout'
        throw timeoutError
      }
      const error = new Error('provider_network_error')
      error.code = 'providerUnavailable'
      throw error
    }

    if (!auddResponse.ok) {
      const error = new Error('provider_http_error')
      error.code = 'providerUnavailable'
      throw error
    }

    let payload
    try {
      payload = await auddResponse.json()
    } catch {
      const error = new Error('invalid_provider_response')
      error.code = 'invalidProviderResponse'
      throw error
    }

    if (payload?.status !== 'success') {
      const error = new Error('provider_error')
      error.code = 'providerUnavailable'
      throw error
    }

    // AudD returns result: null when nothing matched confidently - a
    // normal, non-error outcome.
    if (!payload.result) {
      return { matched: false }
    }

    return {
      matched: true,
      result: {
        album: payload.result.album || null,
        artist: payload.result.artist || null,
        releaseDate: payload.result.release_date || null,
        title: payload.result.title || null,
      },
    }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(request, response) {
  const requestId = `ai-ear-music-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return safeError(response, 405, 'methodNotAllowed', 'Endast POST stöds.', false, requestId)
  }

  const contentType = getHeader(request, 'content-type')
  if (!contentType.includes('multipart/form-data')) {
    return safeError(response, 415, 'invalidContentType', 'Skicka ljudet som multipart/form-data.', false, requestId)
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }

  const rateLimit = checkAiRouteRateLimit({
    limit: process.env.AI_EAR_MUSIC_RATE_LIMIT_MAX,
    route: 'aiEarMusic',
    userId: auth.user.id,
  })
  if (rateLimit.limited) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.RATE_LIMITED,
      requestId,
      retryable: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      status: 429,
    })
  }

  try {
    const parsedRequest = await parseRequest(request)
    if (parsedRequest.error) {
      return safeError(response, parsedRequest.error.status, parsedRequest.error.code, parsedRequest.error.message, false, requestId)
    }
    const audio = parsedRequest.parsed.files.audio
    const audioError = validateAudio(audio)
    if (audioError) return safeError(response, audioError.status, audioError.code, audioError.message, false, requestId)

    // Verified before AudD is ever called, in every environment (no
    // NODE_ENV bypass). The token is read from a dedicated header - never
    // a form field, JSON field, URL or query parameter. A missing/too-short
    // ANALYSIS_CONSENT_SECRET makes verifyAnalysisConsentToken itself
    // return ok:false, so this route fails closed the same way whether the
    // token is bad or the server secret is not configured at all.
    const consentToken = getHeader(request, 'x-viktkollen-consent-token')
    const consent = verifyAnalysisConsentToken({
      env: process.env,
      imageEntries: [{ bytes: audio.data, label: 'audio' }],
      purpose: analysisConsentPurposes.audioMusicRecognition,
      token: consentToken,
      userId: auth.user.id,
    })
    if (!consent.ok) {
      // consent.reason is a generic code, never the token, audio hash or
      // audio bytes.
      console.warn('[api/ai-ear-music-recognition] Analysis consent rejected', { reason: consent.reason, requestId })
      return safeError(response, 403, 'consentRequired', undefined, false, requestId)
    }

    console.info('[api/ai-ear-music-recognition] Provider request started', {
      audioSize: audio.size,
      requestId,
    })
    const outcome = await callAudD(audio)

    if (!outcome.matched) {
      console.info('[api/ai-ear-music-recognition] No confident match', { requestId })
      return response.status(200).json({ matched: false, ok: true, requestId })
    }

    console.info('[api/ai-ear-music-recognition] Match found', { requestId })
    return response.status(200).json({
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
    })
  } catch (error) {
    const code = error?.code === 'serverConfiguration'
      ? 'serverConfiguration'
      : error?.code === 'timeout'
        ? 'timeout'
        : error?.code === 'invalidProviderResponse'
          ? 'invalidProviderResponse'
          : 'providerUnavailable'
    console.warn('[api/ai-ear-music-recognition] Safe failure', {
      code,
      requestId,
    })
    return safeError(
      response,
      code === 'serverConfiguration' ? 503 : code === 'timeout' ? 504 : code === 'invalidProviderResponse' ? 502 : 502,
      code,
      undefined,
      code !== 'serverConfiguration' && code !== 'invalidProviderResponse',
      requestId,
    )
  }
}

export const aiEarMusicRecognitionRouteInternals = {
  callAudD,
  findMultipartBoundaries,
  parseMultipart,
  validateAudio,
}

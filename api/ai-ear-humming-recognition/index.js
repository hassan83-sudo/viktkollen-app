import { createHmac } from 'node:crypto'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from '../_shared/analysisConsent.js'

/**
 * AI-örat -> Nynna & vissla: real humming/whistling/sung-melody
 * identification, Sprint 6.
 *
 * Scope, deliberately narrow: given ONE user-recorded audio clip the user
 * has already explicitly approved sending (see the consent gate below),
 * ask ACRCloud's Humming Recognition engine whether it recognizes a
 * matching melody. Nothing else - this route is never used for ordinary
 * recorded music (that stays on AudD via api/ai-ear-music-recognition),
 * never for bird calls, vehicles/machines or any other AI-örat category.
 * See src/services/aiEar/providers.js, where every other category still
 * returns "not-connected" and never reaches any route at all.
 *
 * ACRCloud background (verified against docs.acrcloud.com before writing
 * this file, Sprint 6): Humming Recognition is NOT a separate ACRCloud
 * project type - it is the "Cover Song (humming) Identification" audio
 * engine option on an ordinary AVR (Audio & Video Recognition) project,
 * using the same host/access_key/access_secret credential shape as any
 * other ACRCloud Identify request. Humming results come back in the
 * response's metadata.humming array (never metadata.music), each with a
 * score already in the 0-1 range - the same range this app's shared
 * result model already expects, so no rescaling is needed beyond a
 * straight pass-through.
 *
 * Security posture mirrors api/ai-ear-music-recognition/index.js exactly:
 * Supabase auth -> per-route rate limit -> the same HMAC consent-token
 * gate (api/_shared/analysisConsent.js), bound to this exact audio byte
 * hash, this user, and the audio-humming-recognition purpose only -
 * before the clip is ever sent to ACRCloud. This is a DIFFERENT purpose
 * than audio-music-recognition (Sprint 4), never reused, because a
 * different external provider receives the clip.
 *
 * The audio is never written to disk, never stored in Supabase, and
 * never logged (only generic status codes, sizes and durations are
 * logged) - it exists only in memory for the duration of this one
 * request and is discarded once the response is sent.
 *
 * ACRCloud credentials live only in server-side environment variables
 * (ACRCLOUD_HOST, ACRCLOUD_ACCESS_KEY, ACRCLOUD_ACCESS_SECRET) - never
 * sent to, or reachable from, the client bundle. The access_secret is
 * used only to compute an HMAC-SHA1 request signature server-side; it is
 * never itself transmitted to ACRCloud or to the client.
 */

const DEFAULT_TIMEOUT_MS = 15000
export const HUMMING_RECOGNITION_TIMEOUT_MS = Number(process.env.AI_EAR_HUMMING_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
// ACRCloud's Identify API hard limit for the "sample" field is < 5 MB.
// ACRCloud also recommends short clips (well under 15s) for best humming
// results, but this route does not trim/re-encode audio - see the Sprint
// 6 report for why that is left as a future refinement, not built now.
const MAX_AUDIO_SIZE_BYTES = Number(process.env.AI_EAR_HUMMING_MAX_FILE_BYTES || 5 * 1024 * 1024)
const ACRCLOUD_SIGNATURE_VERSION = '1'
const ACRCLOUD_DATA_TYPE = 'audio'
const ACRCLOUD_HTTP_METHOD = 'POST'
const ACRCLOUD_HTTP_URI = '/v1/identify'
// Base MIME types actually produced by MediaRecorder across current major
// browsers (Chrome/Firefox/Edge: audio/webm; Safari: audio/mp4; some
// Firefox builds: audio/ogg). ACRCloud's documented format list (mp3,
// wav, wma, amr, ogg, ape, aac, spx, m4a, mp4, FLAC, ...) does not
// explicitly list webm/opus, but ACRCloud's own tutorials show ordinary
// browser-recorded clips being sent as-is; this is flagged as a
// MÅSTE TESTAS item rather than assumed to work.
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
 * Byte-safe multipart boundary scan - identical approach to
 * api/ai-ear-music-recognition/index.js's findMultipartBoundaries, needed
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
    return { error: { code: 'oversizedAudio', message: 'Ljudfilen är för stor. Maxstorlek är 5 MB.', status: 413 } }
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
  if (audio.size > MAX_AUDIO_SIZE_BYTES) return { code: 'oversizedAudio', message: 'Ljudfilen är för stor. Maxstorlek är 5 MB.', status: 413 }
  return null
}

/**
 * Builds the ACRCloud Identify API signature exactly as documented
 * (verified against docs.acrcloud.com/reference/identification-api,
 * Sprint 6): base64(HMAC-SHA1(access_secret, stringToSign)), where
 * stringToSign is the five ACRCloud-defined lines joined by "\n":
 * HTTP method, HTTP URI, access key, data type, signature version,
 * timestamp (unix seconds).
 */
function buildAcrCloudSignature({ accessKey, accessSecret, timestamp }) {
  const stringToSign = [
    ACRCLOUD_HTTP_METHOD,
    ACRCLOUD_HTTP_URI,
    accessKey,
    ACRCLOUD_DATA_TYPE,
    ACRCLOUD_SIGNATURE_VERSION,
    String(timestamp),
  ].join('\n')
  return createHmac('sha1', accessSecret).update(stringToSign, 'utf8').digest('base64')
}

/**
 * Calls ACRCloud's Identify API server-side with the exact audio bytes
 * the user approved, and nothing else. Returns { matched: false } for
 * ACRCloud's documented "no result" status (code 1001) - this is NOT an
 * error - or { matched: true, result, alternatives } for one or more
 * humming candidates (ACRCloud's metadata.humming array). Any
 * provider/network/configuration problem throws, and the caller maps
 * that to a generic, safe client error.
 */
async function callAcrCloud(audio) {
  const host = String(process.env.ACRCLOUD_HOST || '')
  const accessKey = String(process.env.ACRCLOUD_ACCESS_KEY || '')
  const accessSecret = String(process.env.ACRCLOUD_ACCESS_SECRET || '')
  if (!host || !accessKey || !accessSecret) {
    const error = new Error('missing_configuration')
    error.code = 'serverConfiguration'
    throw error
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = buildAcrCloudSignature({ accessKey, accessSecret, timestamp })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HUMMING_RECOGNITION_TIMEOUT_MS)

  try {
    const outboundForm = new FormData()
    outboundForm.append('access_key', accessKey)
    outboundForm.append('sample_bytes', String(audio.size))
    outboundForm.append('timestamp', String(timestamp))
    outboundForm.append('signature', signature)
    outboundForm.append('signature_version', ACRCLOUD_SIGNATURE_VERSION)
    outboundForm.append('data_type', ACRCLOUD_DATA_TYPE)
    outboundForm.append('sample', new Blob([audio.data], { type: audio.contentType || 'application/octet-stream' }), 'ai-ear-clip')

    let acrResponse
    try {
      acrResponse = await fetch(`https://${host}${ACRCLOUD_HTTP_URI}`, {
        body: outboundForm,
        method: ACRCLOUD_HTTP_METHOD,
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

    if (!acrResponse.ok) {
      const error = new Error('provider_http_error')
      error.code = 'providerUnavailable'
      throw error
    }

    let payload
    try {
      payload = await acrResponse.json()
    } catch {
      const error = new Error('invalid_provider_response')
      error.code = 'invalidProviderResponse'
      throw error
    }

    const statusCode = payload?.status?.code

    // ACRCloud status code 1001 = "No recognition result" - a normal,
    // successful-but-empty outcome, never an error (verified against
    // docs.acrcloud.com/sdk-reference/error-codes, Sprint 6).
    if (statusCode === 1001) {
      return { matched: false }
    }

    if (statusCode !== 0) {
      const error = new Error(`acrcloud_status_${statusCode}`)
      // 3001 (wrong access key) / 3014 (invalid signature) mean the
      // server's own credentials are wrong - a configuration problem,
      // not a transient provider outage.
      error.code = statusCode === 3001 || statusCode === 3014 ? 'serverConfiguration' : 'providerUnavailable'
      throw error
    }

    const humming = Array.isArray(payload?.metadata?.humming) ? payload.metadata.humming : []
    if (humming.length === 0) {
      return { matched: false }
    }

    const candidates = humming.map((entry) => ({
      album: entry?.album?.name || null,
      artist: Array.isArray(entry?.artists) && entry.artists[0]?.name ? entry.artists[0].name : null,
      // ACRCloud's humming score is already documented as a 0-1 value
      // (their own examples show 0.88, 0.87, 0.67) - the same range this
      // app's shared result model expects, so it is passed through as-is
      // and never invented or rescaled.
      score: typeof entry?.score === 'number' ? entry.score : null,
      title: entry?.title || null,
    })).filter((entry) => entry.title)

    if (candidates.length === 0) {
      return { matched: false }
    }

    return { candidates, matched: true }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(request, response) {
  const requestId = `ai-ear-humming-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    limit: process.env.AI_EAR_HUMMING_RATE_LIMIT_MAX,
    route: 'aiEarHumming',
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

    // Verified before ACRCloud is ever called, in every environment (no
    // NODE_ENV bypass). The token is read from a dedicated header - never
    // a form field, JSON field, URL or query parameter. This is the
    // audio-humming-recognition purpose - a different, separate consent
    // than Musik's audio-music-recognition (Sprint 4), never reused.
    const consentToken = getHeader(request, 'x-viktkollen-consent-token')
    const consent = verifyAnalysisConsentToken({
      env: process.env,
      imageEntries: [{ bytes: audio.data, label: 'audio' }],
      purpose: analysisConsentPurposes.audioHummingRecognition,
      token: consentToken,
      userId: auth.user.id,
    })
    if (!consent.ok) {
      // consent.reason is a generic code, never the token, audio hash or
      // audio bytes.
      console.warn('[api/ai-ear-humming-recognition] Analysis consent rejected', { reason: consent.reason, requestId })
      return safeError(response, 403, 'consentRequired', undefined, false, requestId)
    }

    console.info('[api/ai-ear-humming-recognition] Provider request started', {
      audioSize: audio.size,
      requestId,
    })
    const outcome = await callAcrCloud(audio)

    if (!outcome.matched) {
      console.info('[api/ai-ear-humming-recognition] No confident match', { requestId })
      return response.status(200).json({ matched: false, ok: true, requestId })
    }

    const [best, ...rest] = outcome.candidates
    console.info('[api/ai-ear-humming-recognition] Match found', { candidateCount: outcome.candidates.length, requestId })
    return response.status(200).json({
      matched: true,
      ok: true,
      requestId,
      result: {
        alternatives: rest.slice(0, 2).map((candidate) => ({
          artist: candidate.artist,
          score: candidate.score,
          title: candidate.title,
        })),
        artist: best.artist,
        details: {
          album: best.album,
          provider: 'ACRCloud',
        },
        score: best.score,
        title: best.title,
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
    console.warn('[api/ai-ear-humming-recognition] Safe failure', {
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

export const aiEarHummingRecognitionRouteInternals = {
  buildAcrCloudSignature,
  callAcrCloud,
  findMultipartBoundaries,
  parseMultipart,
  validateAudio,
}

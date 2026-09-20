import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from './aiRouteErrors.js'
import { checkAiRouteRateLimit } from './aiRateLimiter.js'
import { verifySupabaseUser } from './verifySupabaseUser.js'
import { verifyAnalysisConsentToken } from './analysisConsent.js'

/**
 * Shared skeleton for the three AI-örat third-party audio routes that were
 * re-integrated in Sprint 12A from the historical Sprint 4 / 6 / 7 branches:
 *
 *   api/ai-ear-music-recognition    (AudD)      - Musik
 *   api/ai-ear-humming-recognition  (ACRCloud)  - Nynna / vissla / melodi
 *   api/ai-ear-lyrics-transcription (OpenAI)    - "Ord ur en låt" (speech-to-text)
 *
 * Wire contract kept from the historical implementation: multipart/form-data
 * with ONE file field `audio`, Supabase bearer auth, HMAC consent token in
 * the `x-viktkollen-consent-token` header bound to these exact audio bytes
 * (label `audio`), per-route rate limit, fixed safe error envelope.
 *
 * Changes vs. the historical routes (see docs/ai-ear/SPRINT_12A_REINTEGRATION_REPORT.md):
 * - the body is read with a streamed size limit (aborts at the limit) and a
 *   client abort mid-upload is handled instead of crashing;
 * - missing provider configuration is answered BEFORE the body is read, after
 *   auth, as a generic "not configured" (503) so the UI can say so;
 * - one shared implementation instead of three copies of the multipart parser.
 *
 * Audio and (for transcription) the resulting text exist only in memory for
 * one request: nothing is written to disk, Supabase or analytics, and logs
 * carry only request id, byte counts, generic codes and text LENGTH.
 * Providers are isolated: each route only ever talks to its own provider.
 */

const VERCEL_BODY_LIMIT_BYTES = 4 * 1024 * 1024
const CRLF_CRLF = Buffer.from('\r\n\r\n', 'latin1')

export const defaultAllowedAudioTypes = Object.freeze([
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/aac', 'audio/3gpp',
])

export const providerRouteConfig = { api: { bodyParser: false } }

function getHeader(request, name) {
  const headers = request.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

function getBoundary(contentType) {
  return contentType.split(';').map((part) => part.trim()).find((part) => part.startsWith('boundary='))?.replace('boundary=', '').replace(/^"|"$/g, '')
}

export function findMultipartBoundaries(rawBody, boundary) {
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
      boundaries.push({ contentStart: after + 2, lineStart: index > 0 ? index - 2 : index })
      if (isClosing) break
      searchFrom = after
    } else {
      searchFrom = index + 1
    }
  }
  return boundaries
}

export function parseMultipart(rawBody, boundary) {
  const files = {}
  const boundaries = findMultipartBoundaries(rawBody, boundary)
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const part = rawBody.subarray(boundaries[index].contentStart, boundaries[index + 1].lineStart)
    const headerEnd = part.indexOf(CRLF_CRLF)
    if (headerEnd === -1) continue
    const rawHeaders = part.subarray(0, headerEnd).toString('latin1')
    if (!rawHeaders.includes('Content-Disposition')) continue
    const fieldName = rawHeaders.match(/name="([^"]+)"/)?.[1]
    const hasFile = /filename="/.test(rawHeaders)
    const contentType = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.toLowerCase() || ''
    if (!fieldName || !hasFile) continue
    const content = part.subarray(headerEnd + CRLF_CRLF.length)
    files[fieldName] = { contentType, data: content, size: content.length }
  }
  return { files }
}

async function readBodyLimited(request, maxBytes) {
  const declared = Number(getHeader(request, 'content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true }
  if (request.body && typeof request.on !== 'function') {
    const buffer = Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body), 'latin1')
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

export function baseContentType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase()
}

/** Error codes thrown by provider call functions -> safe HTTP status + retryability. */
export function mapProviderFailure(error) {
  const code = ['serverConfiguration', 'timeout', 'invalidProviderResponse'].includes(error?.code) ? error.code : 'providerUnavailable'
  if (code === 'serverConfiguration') return { code, aiCode: aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED, retryable: false, status: 503 }
  if (code === 'timeout') return { code, aiCode: aiRouteErrorCodes.PROVIDER_TIMEOUT, retryable: true, status: 504 }
  if (code === 'invalidProviderResponse') return { code, aiCode: aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE, retryable: false, status: 502 }
  return { code, aiCode: aiRouteErrorCodes.PROVIDER_UNAVAILABLE, retryable: true, status: 502 }
}

export function providerError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

/** Runs one provider fetch with timeout + uniform network/HTTP error mapping. Returns the parsed JSON body. */
export async function fetchProviderJson(url, init, { timeoutMs, fetchImpl = globalThis.fetch, httpErrorCode = () => 'providerUnavailable' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let providerResponse
    try {
      providerResponse = await fetchImpl(url, { ...init, signal: controller.signal })
    } catch (networkError) {
      throw providerError(networkError?.name === 'AbortError' ? 'timeout' : 'providerUnavailable')
    }
    if (!providerResponse.ok) throw providerError(httpErrorCode(providerResponse.status))
    try {
      return await providerResponse.json()
    } catch {
      throw providerError('invalidProviderResponse')
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {object} options
 * @param {string} options.logName   e.g. '[api/ai-ear-music-recognition]'
 * @param {string} options.idPrefix  request id prefix
 * @param {string} options.rateRoute route name known to aiRateLimiter
 * @param {string} [options.rateLimitEnv] env var name with a numeric per-user limit
 * @param {string} options.purpose   analysisConsentPurposes value
 * @param {number} options.maxBytes  provider-specific audio cap (further capped to the Vercel body limit)
 * @param {() => boolean} options.isConfigured
 * @param {(audio: {data: Buffer, size: number, contentType: string}) => Promise<object>} options.callProvider
 * @param {(outcome: object, requestId: string) => object} options.buildBody JSON body for HTTP 200
 * @param {(outcome: object) => object} options.logFields non-sensitive fields to log on success
 */
export function createProviderRouteHandler({ allowedTypes = defaultAllowedAudioTypes, buildBody, callProvider, idPrefix, isConfigured, logFields = () => ({}), logName, maxBytes, purpose, rateLimitEnv, rateRoute }) {
  const allowed = new Set(allowedTypes)
  const cap = () => Math.min(maxBytes, VERCEL_BODY_LIMIT_BYTES)
  const fail = (response, status, aiCode, requestId, retryable = false, reason) => {
    if (reason) {
      setNoStoreHeaders(response)
      return response.status(status).json({ error: { code: aiCode, reason, requestId, retryable }, ok: false })
    }
    return sendSafeAiError(response, { code: aiCode, requestId, retryable, status })
  }

  return async function handler(request, response) {
    const requestId = `${idPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    setNoStoreHeaders(response)

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      return fail(response, 405, aiRouteErrorCodes.INVALID_REQUEST, requestId)
    }

    const contentType = String(getHeader(request, 'content-type') || '')
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return fail(response, 415, aiRouteErrorCodes.INVALID_REQUEST, requestId, false, 'unsupported_media')
    }

    const auth = await verifySupabaseUser(request, { requestId })
    if (!auth.authenticated) return response.status(auth.status).json({ error: auth.error, ok: false })

    if (!isConfigured()) return fail(response, 503, aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED, requestId)

    const rateLimit = checkAiRouteRateLimit({ limit: rateLimitEnv ? process.env[rateLimitEnv] : undefined, route: rateRoute, userId: auth.user.id })
    if (rateLimit.limited) {
      response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
      return sendSafeAiError(response, { code: aiRouteErrorCodes.RATE_LIMITED, requestId, retryAfterSeconds: rateLimit.retryAfterSeconds, retryable: true, status: 429 })
    }

    const boundary = getBoundary(contentType)
    if (!boundary) return fail(response, 415, aiRouteErrorCodes.INVALID_REQUEST, requestId, false, 'unsupported_media')

    let body
    try {
      body = await readBodyLimited(request, cap() + 200000)
    } catch {
      console.warn(`${logName} Upload aborted by client`, { requestId })
      return fail(response, 400, aiRouteErrorCodes.REQUEST_ABORTED, requestId, false, 'aborted')
    }
    if (body.tooLarge) return fail(response, 413, aiRouteErrorCodes.REQUEST_TOO_LARGE, requestId)
    if (!body.buffer?.length) return fail(response, 400, aiRouteErrorCodes.INVALID_REQUEST, requestId, false, 'empty_audio')

    const audio = parseMultipart(body.buffer, boundary).files.audio
    if (!audio || !audio.data?.length) return fail(response, 400, aiRouteErrorCodes.INVALID_REQUEST, requestId, false, 'empty_audio')
    if (!allowed.has(baseContentType(audio.contentType))) return fail(response, 415, aiRouteErrorCodes.INVALID_REQUEST, requestId, false, 'unsupported_media')
    if (audio.size > cap()) return fail(response, 413, aiRouteErrorCodes.REQUEST_TOO_LARGE, requestId)

    const consent = verifyAnalysisConsentToken({
      env: process.env,
      imageEntries: [{ bytes: audio.data, label: 'audio' }],
      purpose,
      token: getHeader(request, 'x-viktkollen-consent-token'),
      userId: auth.user.id,
    })
    if (!consent.ok) {
      console.warn(`${logName} Consent rejected`, { reason: consent.reason, requestId })
      return sendSafeAiError(response, { code: aiRouteErrorCodes.CONSENT_REQUIRED, requestId, status: 403 })
    }

    try {
      console.info(`${logName} Provider request started`, { audioBytes: audio.size, requestId })
      const outcome = await callProvider(audio)
      console.info(`${logName} Completed`, { ...logFields(outcome), requestId })
      return response.status(200).json(buildBody(outcome, requestId))
    } catch (error) {
      const failure = mapProviderFailure(error)
      console.warn(`${logName} Safe failure`, { code: failure.code, requestId })
      return fail(response, failure.status, failure.aiCode, requestId, failure.retryable)
    }
  }
}

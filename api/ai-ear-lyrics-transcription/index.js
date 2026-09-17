import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from '../_shared/analysisConsent.js'

/**
 * AI-örat -> "Ord ur en låt": speech-to-text ONLY, Sprint 7.
 *
 * Scope, deliberately narrow: given ONE user-recorded audio clip the user
 * has already explicitly approved sending (see the consent gate below),
 * ask OpenAI's audio transcription API what was said or sung. This route
 * returns PLAIN TEXT ONLY - it never searches for a song, never returns a
 * title/artist, and never pretends a transcript is a song match. The next
 * step (looking up which song a transcript might be from) is deliberately
 * left at src/services/aiEar/lyricsSearchProvider.js, which stays
 * "not-connected" and makes no network call of any kind this sprint - see
 * that file for why (no commercial lyrics-search provider has been
 * selected/approved yet; Musixmatch's free tier is not commercially
 * usable and their commercial terms/pricing are still unverified, per the
 * Sprint 5 research).
 *
 * This is the THIRD, and last, separate audio-analysis provider in
 * AI-örat: Musik stays on AudD (api/ai-ear-music-recognition, Sprint 4),
 * Nynna & vissla stays on ACRCloud (api/ai-ear-humming-recognition,
 * Sprint 6), and this route is the only one that ever calls OpenAI. None
 * of the three are blended or reused for one another.
 *
 * OpenAI backend note (verified against developers.openai.com before
 * writing this file, Sprint 7): this project's existing OpenAI usage
 * (api/_shared/openaiGateway.js - AI Coach chat/vision via
 * /v1/responses, and a disabled realtime voice-session flow via
 * /v1/realtime/sessions) does not include audio file transcription at
 * all, so a new helper was needed. It reuses the exact same server-side
 * secret, process.env.OPENAI_API_KEY, already used by every other OpenAI
 * call in this codebase - no new secret, no new architecture. The
 * transcription endpoint (POST https://api.openai.com/v1/audio/
 * transcriptions, multipart/form-data, model "gpt-transcribe" - OpenAI's
 * current general-purpose transcription model, released July 2026 and
 * generally available, superseding gpt-4o-transcribe for this use case)
 * is a plain, stateless REST call, unrelated to and never touching the
 * realtime/session-based voice flow in openaiGateway.js - nothing in
 * AiCoachOverlay, ChatPanel or the reminder system is touched by this
 * file.
 *
 * Security posture mirrors api/ai-ear-humming-recognition/index.js
 * exactly: Supabase auth -> per-route rate limit -> the same HMAC
 * consent-token gate (api/_shared/analysisConsent.js), bound to this
 * exact audio byte hash, this user, and the audio-lyrics-transcription
 * purpose only - before the clip is ever sent to OpenAI. This is a
 * DIFFERENT purpose than audio-music-recognition (Sprint 4) and
 * audio-humming-recognition (Sprint 6), never reused, because a
 * different external provider receives the clip.
 *
 * The audio is never written to disk, never stored in Supabase, and
 * never logged (only generic status codes, sizes and durations are
 * logged) - it exists only in memory for the duration of this one
 * request and is discarded once the response is sent. The transcribed
 * TEXT itself is also never logged in full - only its length - since it
 * is the user's own spoken/sung words, not a system diagnostic value.
 *
 * OPENAI_API_KEY lives only in a server-side environment variable -
 * never sent to, or reachable from, the client bundle.
 */

const DEFAULT_TIMEOUT_MS = 15000
export const LYRICS_TRANSCRIPTION_TIMEOUT_MS = Number(process.env.AI_EAR_LYRICS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
// A spoken/sung phrase ("bailando bailando") is short - this is a
// generous ceiling for that, well under OpenAI's documented 25 MB limit
// for the transcription endpoint.
const MAX_AUDIO_SIZE_BYTES = Number(process.env.AI_EAR_LYRICS_MAX_FILE_BYTES || 8 * 1024 * 1024)
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'
// Verified against developers.openai.com/api/docs/models/gpt-transcribe
// and developers.openai.com/api/docs/guides/speech-to-text, Sprint 7:
// "gpt-transcribe" is OpenAI's current, generally-available, recommended
// model for general file transcription (released July 2026). It is not
// guessed from old research - the sprint's explicit requirement was to
// re-verify this before writing any code.
const OPENAI_TRANSCRIPTION_MODEL = process.env.AI_EAR_LYRICS_MODEL || 'gpt-transcribe'

// Base MIME types actually produced by MediaRecorder across current major
// browsers (Chrome/Firefox/Edge: audio/webm; Safari: audio/mp4; some
// Firefox builds: audio/ogg), each of which IS explicitly present in
// OpenAI's documented accepted-format list for this endpoint (flac, mp3,
// mp4, mpeg, mpga, m4a, ogg, wav, webm) - unlike the ACRCloud gap flagged
// in Sprint 6, webm is confirmed accepted here.
const allowedAudioTypes = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
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
 * api/ai-ear-humming-recognition/index.js's findMultipartBoundaries,
 * needed here for the same reason: a raw "--boundary" byte sequence can
 * occur by chance inside binary audio content, and only a CRLF-framed
 * delimiter line is ever treated as a real boundary.
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
    return { error: { code: 'oversizedAudio', message: 'Ljudfilen är för stor. Maxstorlek är 8 MB.', status: 413 } }
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
  if (audio.size > MAX_AUDIO_SIZE_BYTES) return { code: 'oversizedAudio', message: 'Ljudfilen är för stor. Maxstorlek är 8 MB.', status: 413 }
  return null
}

/**
 * Picks a filename extension matching the recorded clip's real content
 * type, purely so the outbound multipart part carries a sensible
 * filename - OpenAI identifies the audio by its actual bytes/Content-Type,
 * not by trusting the filename alone, but a matching extension is good
 * practice and matches how every browser-originated recording actually
 * arrives here.
 */
function audioFileName(contentType) {
  const base = baseContentType(contentType)
  const extension = {
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/x-wav': 'wav',
  }[base] || 'webm'
  return `ai-ear-lyrics-clip.${extension}`
}

/**
 * Calls OpenAI's audio transcription API server-side with the exact audio
 * bytes the user approved, and nothing else. An empty/whitespace-only
 * transcript ("no speech detected") is returned as a NORMAL, successful
 * outcome (transcript: '', noSpeech: true) - never as an error - exactly
 * mirroring how ACRCloud's "no recognition result" (Sprint 6) and AudD's
 * "no confident match" (Sprint 4) are both treated as normal outcomes,
 * not failures. Any provider/network/configuration problem throws, and
 * the caller maps that to a generic, safe client error.
 */
async function callOpenAiTranscription(audio) {
  const apiKey = String(process.env.OPENAI_API_KEY || '')
  if (!apiKey) {
    const error = new Error('missing_configuration')
    error.code = 'serverConfiguration'
    throw error
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LYRICS_TRANSCRIPTION_TIMEOUT_MS)

  try {
    const outboundForm = new FormData()
    outboundForm.append('model', OPENAI_TRANSCRIPTION_MODEL)
    outboundForm.append('response_format', 'json')
    outboundForm.append(
      'file',
      new Blob([audio.data], { type: audio.contentType || 'application/octet-stream' }),
      audioFileName(audio.contentType),
    )
    // No `language` or `languages` hint is sent: OpenAI's documented
    // auto-detection is used as-is (per the sprint's explicit
    // instruction to rely on reliable auto-detect rather than build a
    // language picker), and the exact multipart encoding of the
    // `languages` hint array was not confirmed clearly enough in the
    // verified docs to guess at safely - see the Sprint 7 report.

    let openAiResponse
    try {
      openAiResponse = await fetch(OPENAI_TRANSCRIPTION_URL, {
        body: outboundForm,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
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

    if (!openAiResponse.ok) {
      const error = new Error(`openai_http_${openAiResponse.status}`)
      // 401/403 mean the server's own API key is missing/invalid/lacks
      // access - a configuration problem, not a transient provider
      // outage (mirrors the humming route's 3001/3014 -> serverConfiguration
      // split for ACRCloud's own credential-error codes).
      error.code = (openAiResponse.status === 401 || openAiResponse.status === 403)
        ? 'serverConfiguration'
        : 'providerUnavailable'
      throw error
    }

    let payload
    try {
      payload = await openAiResponse.json()
    } catch {
      const error = new Error('invalid_provider_response')
      error.code = 'invalidProviderResponse'
      throw error
    }

    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    // Only ever read back a language code OpenAI itself returned - never
    // invented, never defaulted to a guess.
    const languageCode = Array.isArray(payload?.languages) && typeof payload.languages[0]?.code === 'string'
      ? payload.languages[0].code
      : null

    return {
      language: languageCode,
      noSpeech: text.length === 0,
      transcript: text,
    }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(request, response) {
  const requestId = `ai-ear-lyrics-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    limit: process.env.AI_EAR_LYRICS_RATE_LIMIT_MAX,
    route: 'aiEarLyrics',
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

    // Verified before OpenAI is ever called, in every environment (no
    // NODE_ENV bypass). The token is read from a dedicated header - never
    // a form field, JSON field, URL or query parameter. This is the
    // audio-lyrics-transcription purpose - separate from both Musik's
    // audio-music-recognition (Sprint 4) and Nynna & vissla's
    // audio-humming-recognition (Sprint 6), never reused.
    const consentToken = getHeader(request, 'x-viktkollen-consent-token')
    const consent = verifyAnalysisConsentToken({
      env: process.env,
      imageEntries: [{ bytes: audio.data, label: 'audio' }],
      purpose: analysisConsentPurposes.audioLyricsTranscription,
      token: consentToken,
      userId: auth.user.id,
    })
    if (!consent.ok) {
      // consent.reason is a generic code, never the token, audio hash or
      // audio bytes.
      console.warn('[api/ai-ear-lyrics-transcription] Analysis consent rejected', { reason: consent.reason, requestId })
      return safeError(response, 403, 'consentRequired', undefined, false, requestId)
    }

    console.info('[api/ai-ear-lyrics-transcription] Provider request started', {
      audioSize: audio.size,
      requestId,
    })
    const outcome = await callOpenAiTranscription(audio)

    // Only the transcript's LENGTH is logged, never its content - it is
    // the user's own spoken/sung words, not a diagnostic value.
    console.info('[api/ai-ear-lyrics-transcription] Transcription completed', {
      language: outcome.language,
      noSpeech: outcome.noSpeech,
      requestId,
      transcriptLength: outcome.transcript.length,
    })

    return response.status(200).json({
      language: outcome.language,
      noSpeech: outcome.noSpeech,
      ok: true,
      requestId,
      transcript: outcome.transcript,
    })
  } catch (error) {
    const code = error?.code === 'serverConfiguration'
      ? 'serverConfiguration'
      : error?.code === 'timeout'
        ? 'timeout'
        : error?.code === 'invalidProviderResponse'
          ? 'invalidProviderResponse'
          : 'providerUnavailable'
    console.warn('[api/ai-ear-lyrics-transcription] Safe failure', {
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

export const aiEarLyricsTranscriptionRouteInternals = {
  audioFileName,
  callOpenAiTranscription,
  findMultipartBoundaries,
  parseMultipart,
  validateAudio,
}

import {
  callOpenAiJson,
  getAiGatewayConfig,
} from '../_shared/openaiGateway.js'
import { aiRouteErrorCodes, mapGatewayErrorCode, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { createImageFingerprint, runDedupedAiRequest } from '../_shared/aiRequestDeduper.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from '../_shared/analysisConsent.js'

/**
 * "Har jag glömt något?" remote AI object check.
 *
 * Scope, deliberately narrow: given one image the user just captured and a
 * short list of item labels drawn from their OWN carry checklist, ask the
 * model which of those specific labels it can see. Nothing else. The model
 * is never asked to freely describe the image, diagnose anything, or
 * decide what the user "forgot" - it only classifies each requested label
 * as identified / uncertain / not_confirmed, and a missing/malformed
 * answer for a label always falls back to not_confirmed (never
 * identified). See src/features/smart-camera/itemVisibility.js on the
 * client for how not_confirmed is turned into user-facing copy that never
 * claims something is definitely forgotten.
 *
 * Security posture mirrors api/nutrition-photo-analysis/index.js exactly:
 * Supabase auth -> per-route rate limit -> the same HMAC consent-token
 * gate (api/_shared/analysisConsent.js), bound to this exact image byte
 * hash, this user, and the forgotten-items-analysis purpose only - before
 * any OpenAI call. The image is never written to disk, never stored in
 * Supabase, and never logged; only generic status codes and counts are
 * logged, exactly like the nutrition-photo route.
 */

const DEFAULT_MODEL = 'gpt-4.1-mini'
export const FORGOTTEN_ITEMS_ANALYSIS_TIMEOUT_MS = 30000
const MAX_IMAGE_SIZE_BYTES = Number(process.env.FORGOTTEN_ITEMS_MAX_FILE_BYTES || 8 * 1024 * 1024)
const REQUEST_TIMEOUT_MS = Number(process.env.FORGOTTEN_ITEMS_TIMEOUT_MS || FORGOTTEN_ITEMS_ANALYSIS_TIMEOUT_MS)
const MAX_OUTPUT_TOKENS = 500
const MAX_ITEMS = 25
const MAX_LABEL_LENGTH = 60
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const allowedStatuses = new Set(['identified', 'not_confirmed', 'uncertain'])

export const config = {
  api: {
    bodyParser: false,
  },
}

function getHeader(request, name) {
  const headers = request.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

function isAllowedOrigin(origin, vercelUrl) {
  if (!origin || !vercelUrl) return true

  try {
    return new URL(origin).hostname === vercelUrl
  } catch {
    return false
  }
}

function safeText(value, fallback = '', max = 220) {
  return String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function safeError(response, status, code, message, retryable = false, requestId = '') {
  const mapping = {
    consentRequired: aiRouteErrorCodes.CONSENT_REQUIRED,
    corsBlocked: aiRouteErrorCodes.INVALID_REQUEST,
    invalidContentType: aiRouteErrorCodes.INVALID_REQUEST,
    invalidItems: aiRouteErrorCodes.INVALID_REQUEST,
    invalidProviderResponse: aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE,
    methodNotAllowed: aiRouteErrorCodes.INVALID_REQUEST,
    missingImage: aiRouteErrorCodes.INVALID_REQUEST,
    oversizedImage: aiRouteErrorCodes.REQUEST_TOO_LARGE,
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
 * Finds only the byte positions in rawBody that are structurally valid
 * multipart delimiter lines per RFC 2046: a "--boundary" sequence that
 * starts a new line (preceded by CRLF, or the very start of the body)
 * and is immediately followed by either CRLF (an ordinary delimiter -
 * another part follows) or "--" (the closing delimiter). A "--boundary"
 * byte sequence that happens to occur inside binary file content, but is
 * not framed by CRLF on both sides like a real delimiter line, is never
 * treated as a boundary - it is left untouched as part of the file data.
 *
 * This replaces the previous implementation, which decoded the whole
 * request to a string and split on the bare `--boundary` substring
 * anywhere it appeared - including inside image bytes, silently
 * truncating any image whose binary content happened to contain that
 * sequence.
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
      // Not a real delimiter (e.g. this exact byte sequence occurred
      // inside file content without CRLF framing) - keep scanning from
      // just past this candidate rather than skipping the whole match.
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
    // Each part's raw bytes run from right after this boundary line to
    // right before the CRLF that precedes the next boundary line - taken
    // directly as a Buffer slice of the original request body, never
    // re-encoded through a string, so file content can never be altered
    // no matter what bytes it contains.
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
      fileName: safeText(fileName, 'image', 80),
      size: content.length,
    }
  }

  return { fields, files }
}

async function parseRequest(request) {
  const contentType = getHeader(request, 'content-type')
  if (!contentType.includes('multipart/form-data')) {
    return { error: { code: 'invalidContentType', message: 'Skicka bilden som multipart/form-data.', status: 415 } }
  }
  const boundary = getBoundary(contentType)
  if (!boundary) {
    return { error: { code: 'invalidContentType', message: 'Multipart boundary saknas.', status: 415 } }
  }
  const rawBody = await readBody(request)
  if (!rawBody.length) {
    return { error: { code: 'missingImage', message: 'Bild saknas.', status: 400 } }
  }
  if (rawBody.length > MAX_IMAGE_SIZE_BYTES + 200000) {
    return { error: { code: 'oversizedImage', message: 'Förfrågan är för stor.', status: 413 } }
  }
  return { parsed: parseMultipart(rawBody, boundary) }
}

function validateImage(image) {
  if (!image || !image.data?.length) return { code: 'missingImage', message: 'Bild saknas.', status: 400 }
  if (!allowedImageTypes.includes(image.contentType)) return { code: 'unsupportedFormat', message: 'Endast JPEG, PNG och WebP stöds.', status: 415 }
  if (image.size <= 0) return { code: 'missingImage', message: 'Bildfilen är tom.', status: 400 }
  if (image.size > MAX_IMAGE_SIZE_BYTES) return { code: 'oversizedImage', message: 'Bilden är för stor.', status: 413 }
  const header = image.data.subarray(0, 12)
  const isJpeg = image.contentType === 'image/jpeg' && header[0] === 0xff && header[1] === 0xd8
  const isPng = image.contentType === 'image/png' && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const isWebp = image.contentType === 'image/webp' && header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!isJpeg && !isPng && !isWebp) return { code: 'unsupportedFormat', message: 'Bildens filsignatur matchar inte formatet.', status: 415 }
  return null
}

/**
 * Parses and validates the `items` form field: a small, client-supplied
 * JSON array of the checklist labels to check for, in the exact order the
 * model must answer in. Only { id, label } is accepted - no other
 * checklist metadata (done state, kind, timestamps, etc.) is ever sent to
 * this route, matching "skicka endast information som faktiskt behövs".
 */
function parseRequestedItems(rawField) {
  let list
  try {
    list = JSON.parse(String(rawField || '[]'))
  } catch {
    return { error: { code: 'invalidItems', message: 'Listan över saker kunde inte läsas.', status: 400 } }
  }
  if (!Array.isArray(list) || list.length === 0) {
    return { error: { code: 'invalidItems', message: 'Minst en sak att kontrollera krävs.', status: 400 } }
  }
  const items = list.slice(0, MAX_ITEMS).map((entry, index) => ({
    id: safeText(entry?.id, `item-${index}`, 80),
    label: safeText(entry?.label, `Sak ${index + 1}`, MAX_LABEL_LENGTH),
  })).filter((entry) => entry.label)
  if (!items.length) {
    return { error: { code: 'invalidItems', message: 'Listan över saker kunde inte läsas.', status: 400 } }
  }
  // Duplicate (or positional-fallback-colliding) ids would make the provider's
  // positional status mapping ambiguous on the client (two results map to the
  // same id and the last one silently wins) - fail closed instead.
  const seenIds = new Set()
  for (const item of items) {
    if (seenIds.has(item.id)) {
      return { error: { code: 'invalidItems', message: 'Listan innehåller dubbletter och kunde inte läsas.', status: 400 } }
    }
    seenIds.add(item.id)
  }
  return { items }
}

function createPrompt(items) {
  const numberedLabels = items.map((item, index) => `${index + 1}. ${item.label}`).join('\n')
  return [
    'Du tittar på en enda bild från en användares egen "har jag glömt något"-kontroll i appen Viktkollen.',
    'Användaren håller upp sina vardagssaker mot kameran. Din enda uppgift är att bedöma, för varje sak i listan nedan och i EXAKT samma ordning, om just den saken syns tydligt i bilden.',
    'Använd bara tre möjliga värden per sak: "identified" om saken syns tydligt och otvetydigt, "uncertain" om du är osäker (dålig vinkel, delvis skymd, ser ut som saken men du är inte säker, liknande föremål), "not_confirmed" om du inte ser något i bilden som matchar saken alls.',
    'Hitta ALDRIG på att en sak saknas, är borttappad eller glömd - du beskriver bara vad som går att se i just denna bild, inget annat. Gissa inte identiteten på ett otydligt föremål; välj hellre "uncertain" eller "not_confirmed" än att gissa fel.',
    'Ge ingen fritext, inga förklaringar, ingen diagnos eller rådgivning om personen, kroppen eller något annat än de listade sakerna.',
    'Returnera ENDAST strikt JSON på formen { "items": [ { "status": "identified" } , ... ] } med exakt en post per sak, i given ordning. Inget annat fält behövs.',
    'Sakerna att bedöma, i ordning:',
    numberedLabels,
  ].join(' ')
}

function normalizeStatus(value) {
  const text = safeText(value?.status || value, '', 20).toLowerCase()
  return allowedStatuses.has(text) ? text : 'not_confirmed'
}

/**
 * Maps the model's positional status array back onto the caller's item
 * ids. If the model did not return an array, or returned the wrong
 * number of entries, the whole response is rejected (ok: false) rather
 * than guessed at position-by-position - a length mismatch means the
 * mapping to ids can no longer be trusted at all.
 */
function validateProviderPayload(payload = {}, items = []) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : null
  if (!rawItems || rawItems.length !== items.length) {
    return { ok: false }
  }
  return {
    ok: true,
    result: {
      items: items.map((item, index) => ({
        id: item.id,
        status: normalizeStatus(rawItems[index]),
      })),
    },
  }
}

async function callOpenAi(image, items) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('missing_configuration')
    error.code = 'serverConfiguration'
    throw error
  }

  const imageUrl = `data:${image.contentType};base64,${image.data.toString('base64')}`
  const config = getAiGatewayConfig('photo')
  const result = await callOpenAiJson({
    input: [{
      content: [
        { text: createPrompt(items), type: 'input_text' },
        { detail: 'low', image_url: imageUrl, type: 'input_image' },
      ],
      role: 'user',
    }],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    model: config.model || DEFAULT_MODEL,
    timeoutMs: REQUEST_TIMEOUT_MS,
    type: 'photo',
  })

  if (!result.ok) {
    const error = new Error(result.error?.code || 'providerUnavailable')
    error.code = result.error?.code === 'rateLimited' ? 'rateLimit' : result.error?.code
    throw error
  }

  const validated = validateProviderPayload(result.value, items)
  if (!validated.ok) {
    const error = new Error('invalidProviderResponse')
    error.code = 'invalidProviderResponse'
    throw error
  }
  return validated.result
}

export default async function handler(request, response) {
  const requestId = `forgotten-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)
  const clientAttemptId = safeText(getHeader(request, 'x-viktkollen-request-id'), '', 80)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return safeError(response, 405, 'methodNotAllowed', 'Endast POST stöds.', false, requestId)
  }
  const contentType = getHeader(request, 'content-type')
  const origin = getHeader(request, 'origin')
  if (!isAllowedOrigin(origin, process.env.VERCEL_URL)) {
    return safeError(response, 403, 'corsBlocked', 'Ursprunget är inte tillåtet.', false, requestId)
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }

  if (!contentType.includes('multipart/form-data')) {
    return safeError(response, 415, 'invalidContentType', 'Skicka bilden som multipart/form-data.', false, requestId)
  }

  const rateLimit = checkAiRouteRateLimit({
    limit: process.env.FORGOTTEN_ITEMS_RATE_LIMIT_MAX,
    route: 'forgottenItems',
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
    const image = parsedRequest.parsed.files.image
    const imageError = validateImage(image)
    if (imageError) return safeError(response, imageError.status, imageError.code, imageError.message, false, requestId)

    const parsedItems = parseRequestedItems(parsedRequest.parsed.fields.items)
    if (parsedItems.error) {
      return safeError(response, parsedItems.error.status, parsedItems.error.code, parsedItems.error.message, false, requestId)
    }

    // Verified before any OpenAI call, in every environment (no NODE_ENV
    // bypass). The token is read from a dedicated header - never a form
    // field, JSON field, URL or query parameter. A missing/too-short
    // ANALYSIS_CONSENT_SECRET makes verifyAnalysisConsentToken itself
    // return ok:false, so this route fails closed the same way whether
    // the token is bad or the server secret is not configured at all.
    const consentToken = getHeader(request, 'x-viktkollen-consent-token')
    const consent = verifyAnalysisConsentToken({
      env: process.env,
      imageEntries: [{ bytes: image?.data, label: 'image' }],
      purpose: analysisConsentPurposes.forgottenItemsAnalysis,
      token: consentToken,
      userId: auth.user.id,
    })
    if (!consent.ok) {
      // consent.reason is a generic code, never the token, image hash or
      // image bytes.
      console.warn('[api/forgotten-items-analysis] Analysis consent rejected', { reason: consent.reason, requestId })
      return safeError(response, 403, 'consentRequired', undefined, false, requestId)
    }

    const { promise: providerPromise } = runDedupedAiRequest({
      fingerprint: createImageFingerprint(image),
      route: 'forgottenItems',
      userId: auth.user.id,
    }, () => callOpenAi(image, parsedItems.items))
    console.info('[api/forgotten-items-analysis] Provider request started', {
      clientAttemptId,
      itemCount: parsedItems.items.length,
      modelName: getAiGatewayConfig('photo').model || DEFAULT_MODEL,
      requestId,
      upstreamRequestStarted: true,
    })
    const result = await providerPromise
    console.info('[api/forgotten-items-analysis] Analysis completed', {
      clientAttemptId,
      itemCount: result.items.length,
      requestCompleted: true,
      requestId,
      source: 'remote',
    })
    return response.status(200).json({
      ok: true,
      requestId,
      result,
      source: 'remote',
    })
  } catch (error) {
    const rawCode = error?.code === 'serverConfiguration'
      ? 'aiNotConfigured'
      : error?.code === 'timeout' || error?.name === 'AbortError'
        ? 'timeout'
        : error?.code === 'requestAborted'
          ? 'requestAborted'
          : error?.code === 'rateLimit'
            ? 'rateLimited'
            : error?.code === 'invalidProviderResponse'
              ? 'invalidProviderResponse'
              : 'providerUnavailable'
    const code = mapGatewayErrorCode(rawCode)
    const status = code === aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED ? 503
      : code === aiRouteErrorCodes.PROVIDER_TIMEOUT ? 504
        : code === aiRouteErrorCodes.REQUEST_ABORTED ? 499
          : code === aiRouteErrorCodes.RATE_LIMITED ? 429
            : code === aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE ? 502
              : 502
    console.warn('[api/forgotten-items-analysis] Safe failure', {
      clientAttemptId,
      code,
      requestCompleted: false,
      requestId,
      source: 'remote',
    })
    return sendSafeAiError(response, {
      code,
      requestId,
      retryable: code !== aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED && code !== aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE,
      status,
    })
  }
}

export const forgottenItemsRouteInternals = {
  createPrompt,
  isAllowedOrigin,
  parseMultipart,
  parseRequestedItems,
  validateImage,
  validateProviderPayload,
}

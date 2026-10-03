import { createHmac, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from './aiRouteErrors.js'
import { checkAiRouteRateLimit } from './aiRateLimiter.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from './analysisConsent.js'
import { verifySupabaseUser } from './verifySupabaseUser.js'
import { QUOTA_STATUS } from '../../src/services/billing/catalog.js'
import { createQuotaEngine } from '../../src/services/billing/quotaEngine.js'
import { createPostgresQuotaBackend, createSupabaseBillingRpcQuery } from '../../src/services/billing/quotaPostgres.js'

const ACRCLOUD_HTTP_URI = '/v1/identify'
const ACRCLOUD_HTTP_METHOD = 'POST'
const ACRCLOUD_DATA_TYPE = 'audio'
const ACRCLOUD_SIGNATURE_VERSION = '1'
const HUMMING_TIMEOUT_MS = 15000
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024
const FEATURE = 'ai.ear.humming'
const UNIT = 'requests'

let quotaEngineOverride

export function setAiEarHummingQuotaForTests(engine) {
  quotaEngineOverride = engine
}

export function isAiEarHummingDispatch(request) {
  const fromQuery = request?.query?.__vk_route
  if (fromQuery === 'humming') return true
  try {
    return new URL(request?.url || '/', 'https://viktkollen.invalid').searchParams.get('__vk_route') === 'humming'
  } catch {
    return false
  }
}

/** base64(HMAC-SHA1(access_secret, "POST\n/v1/identify\n<key>\naudio\n1\n<timestamp>")) */
export function buildAcrCloudSignature({ accessKey, accessSecret, timestamp }) {
  const stringToSign = [ACRCLOUD_HTTP_METHOD, ACRCLOUD_HTTP_URI, accessKey, ACRCLOUD_DATA_TYPE, ACRCLOUD_SIGNATURE_VERSION, String(timestamp)].join('\n')
  return createHmac('sha1', accessSecret).update(stringToSign, 'utf8').digest('base64')
}

export function isAcrCloudConfigured(env = process.env) {
  return Boolean(env.ACRCLOUD_HOST && env.ACRCLOUD_ACCESS_KEY && env.ACRCLOUD_ACCESS_SECRET)
}

function providerError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

export async function callAcrCloud(audio, { env = process.env, fetchImpl = fetch, now = Date.now(), timeoutMs = HUMMING_TIMEOUT_MS } = {}) {
  const host = String(env.ACRCLOUD_HOST || '')
  const accessKey = String(env.ACRCLOUD_ACCESS_KEY || '')
  const accessSecret = String(env.ACRCLOUD_ACCESS_SECRET || '')
  if (!host || !accessKey || !accessSecret) throw providerError('serverConfiguration')
  if (!/^[a-z0-9.-]+$/i.test(host)) throw providerError('serverConfiguration')

  const timestamp = Math.floor(now / 1000)
  const form = new FormData()
  form.append('access_key', accessKey)
  form.append('sample_bytes', String(audio.length))
  form.append('timestamp', String(timestamp))
  form.append('signature', buildAcrCloudSignature({ accessKey, accessSecret, timestamp }))
  form.append('signature_version', ACRCLOUD_SIGNATURE_VERSION)
  form.append('data_type', ACRCLOUD_DATA_TYPE)
  form.append('sample', new Blob([audio], { type: 'audio/wav' }), 'ai-ear-clip')

  let response
  try {
    response = await fetchImpl(`https://${host}${ACRCLOUD_HTTP_URI}`, {
      body: form,
      method: ACRCLOUD_HTTP_METHOD,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    throw providerError(timedOut ? 'timeout' : 'providerUnavailable')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) throw providerError('providerUnavailable')

  const statusCode = payload?.status?.code
  if (statusCode === 1001) return { matched: false }
  if (statusCode !== 0) {
    throw providerError(statusCode === 3001 || statusCode === 3014 ? 'serverConfiguration' : 'providerUnavailable')
  }

  const humming = Array.isArray(payload?.metadata?.humming) ? payload.metadata.humming : []
  const candidates = humming.map((entry) => ({
    artist: Array.isArray(entry?.artists) && entry.artists[0]?.name ? String(entry.artists[0].name).slice(0, 200) : null,
    title: typeof entry?.title === 'string' ? entry.title.slice(0, 200) : null,
  })).filter((entry) => entry.title)

  return candidates.length ? { candidates, matched: true } : { matched: false }
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

function sendError(response, status, code, requestId, { reason, retryable = false } = {}) {
  setNoStoreHeaders(response)
  if (reason) {
    return response.status(status).json({
      error: { code, reason, requestId, retryable },
      ok: false,
    })
  }
  return sendSafeAiError(response, { code, requestId, retryable, status })
}

async function readBodyLimited(request, maxBytes) {
  const declared = Number(getHeader(request, 'content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true }

  if (request.body && typeof request.on !== 'function') {
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

function publicResult(outcome) {
  if (!outcome.matched) return { matched: false }
  const [best, ...rest] = outcome.candidates
  return {
    artist: best.artist,
    alternatives: rest.slice(0, 2).map((candidate) => ({ artist: candidate.artist, title: candidate.title })),
    matched: true,
    title: best.title,
  }
}

export function getHummingQuotaConfig(env = process.env) {
  return {
    serviceRoleKey: env.HUMMING_QUOTA_SUPABASE_SERVICE_ROLE_KEY || '',
    url: env.HUMMING_QUOTA_SUPABASE_URL || '',
  }
}

function createHummingQuotaClient(env = process.env) {
  const config = getHummingQuotaConfig(env)
  if (!config.url || !config.serviceRoleKey) return null
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function resolveQuotaEngine() {
  if (quotaEngineOverride) return quotaEngineOverride
  const client = createHummingQuotaClient()
  if (!client) return null
  return createQuotaEngine({
    backend: createPostgresQuotaBackend(createSupabaseBillingRpcQuery(client)),
  })
}

export async function handleAiEarHummingRequest(request, response) {
  const requestId = `ai-ear-humming-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendError(response, 405, aiRouteErrorCodes.INVALID_REQUEST, requestId)
  }

  const origin = getHeader(request, 'origin')
  if (!isAllowedOrigin(origin, getHeader(request, 'host'), process.env.VERCEL_URL)) {
    return sendError(response, 403, aiRouteErrorCodes.INVALID_REQUEST, requestId)
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({ error: auth.error, ok: false })
  }

  const contentType = String(getHeader(request, 'content-type') || '').toLowerCase()
  if (!/^audio\/(wav|x-wav|wave)(;|$)/.test(contentType)) {
    return sendError(response, 415, aiRouteErrorCodes.INVALID_REQUEST, requestId, { reason: 'unsupported_media' })
  }

  const maxBytes = Number(process.env.AI_EAR_HUMMING_MAX_BYTES || DEFAULT_MAX_BYTES)
  let body
  try {
    body = await readBodyLimited(request, maxBytes)
  } catch {
    return sendError(response, 400, aiRouteErrorCodes.REQUEST_ABORTED, requestId, { reason: 'aborted' })
  }
  if (body.tooLarge) return sendError(response, 413, aiRouteErrorCodes.REQUEST_TOO_LARGE, requestId)
  const audio = body.buffer
  if (!audio?.length) return sendError(response, 400, aiRouteErrorCodes.INVALID_REQUEST, requestId, { reason: 'empty_audio' })
  if (!looksLikeWav(audio)) return sendError(response, 415, aiRouteErrorCodes.INVALID_REQUEST, requestId, { reason: 'unsupported_media' })

  const consent = verifyAnalysisConsentToken({
    env: process.env,
    imageEntries: [{ bytes: audio, label: 'image' }],
    purpose: analysisConsentPurposes.aiEarHumming,
    token: getHeader(request, 'x-viktkollen-consent-token'),
    userId: auth.user.id,
  })
  if (!consent.ok) {
    return sendSafeAiError(response, { code: aiRouteErrorCodes.CONSENT_REQUIRED, requestId, status: 403 })
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
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      retryable: true,
      status: 429,
    })
  }

  if (!isAcrCloudConfigured()) {
    return sendError(response, 503, aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED, requestId)
  }

  const quota = await resolveQuotaEngine()
  if (!quota) return sendError(response, 503, aiRouteErrorCodes.PROVIDER_UNAVAILABLE, requestId, { retryable: true })

  const reservationId = `hum-${randomUUID()}`
  const reserved = await quota.reserveQuota({
    feature: FEATURE,
    quantity: 1,
    reservation_id: reservationId,
    unit: UNIT,
    user: auth.user.id,
  })
  if (reserved?.status === QUOTA_STATUS.DENIED_QUOTA_EXCEEDED) {
    return sendError(response, 402, 'QUOTA_EXCEEDED', requestId, { reason: 'quota_exceeded' })
  }
  if (reserved?.status !== QUOTA_STATUS.RESERVED) {
    return sendError(response, 503, aiRouteErrorCodes.PROVIDER_UNAVAILABLE, requestId, { retryable: true })
  }

  try {
    const outcome = await callAcrCloud(audio)
    const committed = await quota.commitReservation({ actual_quantity: 1, reservation_id: reservationId })
    if (committed?.status !== QUOTA_STATUS.COMMITTED) {
      await quota.rollbackReservation({ reservation_id: reservationId })
      return sendError(response, 503, aiRouteErrorCodes.PROVIDER_UNAVAILABLE, requestId, { retryable: true })
    }
    return response.status(200).json({ ok: true, requestId, result: publicResult(outcome) })
  } catch (error) {
    await quota.rollbackReservation({ reservation_id: reservationId }).catch(() => {})
    const timedOut = error?.code === 'timeout'
    const unconfigured = error?.code === 'serverConfiguration'
    console.warn('[api/ai-ear/humming] Provider call failed', { requestId, timedOut, unconfigured })
    if (timedOut) return sendError(response, 504, aiRouteErrorCodes.PROVIDER_TIMEOUT, requestId, { retryable: true })
    if (unconfigured) return sendError(response, 503, aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED, requestId)
    return sendError(response, 502, aiRouteErrorCodes.PROVIDER_UNAVAILABLE, requestId, { retryable: true })
  }
}

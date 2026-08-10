const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_TEXT_MODEL = 'gpt-4.1-mini'
const DEFAULT_VISION_MODEL = 'gpt-4.1-mini'
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_MAX_OUTPUT_TOKENS = 900
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const DEFAULT_COACH_RATE_LIMIT_MAX = 8
const DEFAULT_PHOTO_RATE_LIMIT_MAX = 12

const buckets = new Map()

function safeText(value, fallback = '', max = 240) {
  return String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function getHeader(request, name) {
  const headers = request?.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

export function createSafeRequestId(prefix = 'ai') {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

export function getAnonymousClientScope(request, fallback = 'anonymous') {
  const raw = getHeader(request, 'x-viktkollen-client-id') ||
    getHeader(request, 'x-forwarded-for').split(',')[0] ||
    request?.socket?.remoteAddress ||
    fallback

  const text = safeText(raw, fallback, 120)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `scope-${(hash >>> 0).toString(36)}`
}

export function checkRateLimit({
  limit = DEFAULT_COACH_RATE_LIMIT_MAX,
  now = Date.now(),
  scope = 'anonymous',
  type = 'coach',
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
} = {}) {
  const key = `${type}:${scope}`
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs }

  if (bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { limited: false, remaining: Math.max(0, limit - 1), resetAt: now + windowMs }
  }

  if (bucket.count >= limit) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
    }
  }

  bucket.count += 1
  buckets.set(key, bucket)

  return {
    limited: false,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  }
}

export function makeAiError(code, message, status = 500, retryable = false, requestId = '') {
  return {
    error: {
      code,
      message,
      requestId,
      retryable,
      status,
    },
    ok: false,
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim()
  return data?.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text)
    ?.filter(Boolean)
    ?.join('\n')
    ?.trim() || ''
}

export function parseJsonResponseText(text) {
  return JSON.parse(String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim())
}

function timeoutSignal(ms, upstreamSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const abort = () => controller.abort()
  if (upstreamSignal?.aborted) controller.abort()
  upstreamSignal?.addEventListener?.('abort', abort, { once: true })

  return {
    cleanup: () => {
      clearTimeout(timer)
      upstreamSignal?.removeEventListener?.('abort', abort)
    },
    signal: controller.signal,
  }
}

export function getAiGatewayConfig(type = 'coach', env = process.env) {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    maxOutputTokens: Number(env.OPENAI_MAX_OUTPUT_TOKENS || env.NUTRITION_PHOTO_MAX_OUTPUT_TOKENS || DEFAULT_MAX_OUTPUT_TOKENS),
    model: type === 'photo'
      ? (env.NUTRITION_PHOTO_MODEL || env.OPENAI_MODEL || DEFAULT_VISION_MODEL)
      : (env.OPENAI_COACH_MODEL || env.OPENAI_MODEL || DEFAULT_TEXT_MODEL),
    rateLimitMax: Number(type === 'photo'
      ? env.NUTRITION_PHOTO_RATE_LIMIT_MAX || DEFAULT_PHOTO_RATE_LIMIT_MAX
      : env.OPENAI_COACH_RATE_LIMIT_MAX || DEFAULT_COACH_RATE_LIMIT_MAX),
    timeoutMs: Number(type === 'photo'
      ? env.NUTRITION_PHOTO_TIMEOUT_MS || DEFAULT_TIMEOUT_MS
      : env.OPENAI_COACH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  }
}

export async function callOpenAiJson({
  env = process.env,
  fetchImpl = fetch,
  input,
  maxOutputTokens,
  model,
  requestId = createSafeRequestId(),
  signal,
  temperature = 0.2,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  type = 'coach',
} = {}) {
  if (!env.OPENAI_API_KEY) {
    return {
      error: makeAiError('aiNotConfigured', 'AI-tjänsten är inte konfigurerad på servern.', 503, false, requestId).error,
      ok: false,
      requestId,
    }
  }

  const config = getAiGatewayConfig(type, env)
  const timeout = timeoutSignal(timeoutMs || config.timeoutMs, signal)

  try {
    const response = await fetchImpl(OPENAI_API_URL, {
      body: JSON.stringify({
        input,
        max_output_tokens: Math.min(Number(maxOutputTokens || config.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS, 1200),
        model: model || config.model,
        temperature,
      }),
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Viktkollen-Request-Id': requestId,
      },
      method: 'POST',
      signal: timeout.signal,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const code = response.status === 429
        ? 'rateLimited'
        : response.status >= 500
          ? 'providerUnavailable'
          : 'invalidRequest'
      return {
        error: makeAiError(code, code === 'rateLimited'
          ? 'For manga AI-anrop just nu.'
          : 'AI-tjänsten svarade inte som väntat.', response.status, response.status === 429 || response.status >= 500, requestId).error,
        ok: false,
        requestId,
      }
    }

    const text = extractResponseText(data)
    if (!text) {
      return {
        error: makeAiError('invalidProviderResponse', 'AI-svaret saknade strukturerad text.', 502, true, requestId).error,
        ok: false,
        requestId,
      }
    }

    return {
      ok: true,
      providerStatus: response.status,
      requestId,
      value: parseJsonResponseText(text),
    }
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'timeout' : 'providerUnavailable'
    return {
      error: makeAiError(code, code === 'timeout'
        ? 'AI-anropet tog for lang tid.'
        : 'AI-tjänsten är tillfälligt otillgänglig.', code === 'timeout' ? 504 : 502, code !== 'timeout', requestId).error,
      ok: false,
      requestId,
    }
  } finally {
    timeout.cleanup()
  }
}

export const openAiGatewayInternals = {
  buckets,
  extractResponseText,
  safeText,
}

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_TEXT_MODEL = 'gpt-4.1-mini'
const DEFAULT_VISION_MODEL = 'gpt-4.1-mini'
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_MAX_OUTPUT_TOKENS = 900
const DEFAULT_PHOTO_MAX_OUTPUT_TOKENS = 3400
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

function getOutputChunkCount(data = {}) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return 1
  return data?.output
    ?.flatMap((item) => item.content || [])
    ?.filter((content) => typeof content?.text === 'string' && content.text.trim())
    ?.length || 0
}

function findFirstCompleteJsonObject(text = '') {
  const source = String(text || '')
  const start = source.indexOf('{')
  if (start < 0) return ''

  let depth = 0
  let escaped = false
  let inString = false

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = inString
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }

  return ''
}

function extractJsonCandidate(text = '') {
  const source = String(text || '').trim()
  const fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidateSource = fenceMatch ? fenceMatch[1].trim() : source
  const directCandidate = candidateSource.trim()
  if (directCandidate.startsWith('{') && directCandidate.endsWith('}')) return directCandidate
  return findFirstCompleteJsonObject(candidateSource)
}

function createOutputTextDiagnostics(text = '', data = {}) {
  const source = String(text || '').trim()
  const providerIncompleteReason = safeText(data?.incomplete_details?.reason || data?.incomplete_details?.type || '', '', 80)
  return {
    containsCodeFence: source.includes('```'),
    endsWithBrace: source.endsWith('}'),
    outputChunkCount: getOutputChunkCount(data),
    outputTextLength: source.length,
    outputTextPresent: source.length > 0,
    providerIncompleteReason,
    providerResponseStatus: safeText(data?.status, '', 80),
    startsWithBrace: source.startsWith('{'),
    startsWithCodeFence: /^```(?:json)?/i.test(source),
    truncatedLikely: Boolean(
      providerIncompleteReason ||
      data?.status === 'incomplete' ||
      (source.length > 0 && source.includes('{') && !findFirstCompleteJsonObject(source))
    ),
  }
}

export function parseJsonResponseText(text) {
  const candidate = extractJsonCandidate(text)
  return JSON.parse(candidate || String(text || '').trim())
}

function safeProviderErrorCode(data = {}) {
  return safeText(data?.error?.code || data?.error?.type || data?.error?.param || '', '', 80)
}

function safeThrownErrorText(value, max = 180) {
  const text = safeText(value, '', max)
  if (!text) return ''
  if (/authorization|bearer|openai_api_key|api[_-]?key|sk-[a-z0-9_-]+|data:image|base64|;base64|image_url|input_image/i.test(text)) {
    return ''
  }

  return text
}

function createSafeThrownFetchDiagnostics(error = {}) {
  return {
    fetchErrorCauseCode: safeThrownErrorText(error?.cause?.code, 80),
    fetchErrorCauseMessage: safeThrownErrorText(error?.cause?.message),
    fetchErrorCauseName: safeThrownErrorText(error?.cause?.name, 80),
    fetchErrorCode: safeThrownErrorText(error?.code, 80),
    fetchErrorMessage: safeThrownErrorText(error?.message),
    fetchErrorName: safeThrownErrorText(error?.name, 80),
  }
}

function createProviderResponseParseError({
  parseErrorCode = 'invalidProviderJson',
  parseErrorName = '',
  requestId = '',
  retryable = true,
  status = 502,
  upstreamStatus = '',
  upstreamStatusText = '',
  outputDiagnostics = {},
} = {}) {
  return {
    ...makeAiError('invalidProviderResponse', 'AI-tjänsten svarade inte med giltig JSON.', status, retryable, requestId).error,
    networkError: false,
    parseError: true,
    parseErrorCode,
    parseErrorName: safeThrownErrorText(parseErrorName, 80),
    upstreamErrorCode: parseErrorCode,
    upstreamStatus,
    upstreamStatusText,
    ...outputDiagnostics,
  }
}

async function readProviderJsonResponse(response, requestId) {
  const upstreamStatus = response.status
  const upstreamStatusText = safeText(response.statusText, '', 80)
  let rawBody

  try {
    rawBody = await response.text()
  } catch (error) {
    return {
      data: {},
      error: createProviderResponseParseError({
        parseErrorCode: 'providerBodyReadFailed',
        parseErrorName: error?.name,
        requestId,
        status: response.ok ? 502 : upstreamStatus,
        upstreamStatus,
        upstreamStatusText,
      }),
      ok: false,
      upstreamStatus,
      upstreamStatusText,
    }
  }

  if (!rawBody.trim()) {
    return {
      data: {},
      error: createProviderResponseParseError({
        parseErrorCode: 'emptyProviderBody',
        requestId,
        status: response.ok ? 502 : upstreamStatus,
        upstreamStatus,
        upstreamStatusText,
      }),
      ok: false,
      upstreamStatus,
      upstreamStatusText,
    }
  }

  try {
    return {
      data: JSON.parse(rawBody),
      ok: true,
      upstreamStatus,
      upstreamStatusText,
    }
  } catch (error) {
    return {
      data: {},
      error: createProviderResponseParseError({
        parseErrorCode: 'malformedProviderJson',
        parseErrorName: error?.name,
        requestId,
        status: response.ok ? 502 : upstreamStatus,
        upstreamStatus,
        upstreamStatusText,
      }),
      ok: false,
      upstreamStatus,
      upstreamStatusText,
    }
  }
}

function timeoutSignal(ms, upstreamSignal) {
  const controller = new AbortController()
  let timedOut = false
  let upstreamAborted = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, ms)
  const abort = () => {
    upstreamAborted = true
    controller.abort()
  }
  if (upstreamSignal?.aborted) abort()
  upstreamSignal?.addEventListener?.('abort', abort, { once: true })

  return {
    cleanup: () => {
      clearTimeout(timer)
      upstreamSignal?.removeEventListener?.('abort', abort)
    },
    getAbortReason: () => ({
      upstreamAborted,
      timedOut,
    }),
    signal: controller.signal,
  }
}

export function getAiGatewayConfig(type = 'coach', env = process.env) {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    maxOutputTokens: Number(type === 'photo'
      ? env.NUTRITION_PHOTO_MAX_OUTPUT_TOKENS || env.OPENAI_MAX_OUTPUT_TOKENS || DEFAULT_PHOTO_MAX_OUTPUT_TOKENS
      : env.OPENAI_MAX_OUTPUT_TOKENS || DEFAULT_MAX_OUTPUT_TOKENS),
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
        max_output_tokens: Math.min(
          Number(maxOutputTokens || config.maxOutputTokens) || (type === 'photo' ? DEFAULT_PHOTO_MAX_OUTPUT_TOKENS : DEFAULT_MAX_OUTPUT_TOKENS),
          type === 'photo' ? 3600 : 1200,
        ),
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

    const parsedResponse = await readProviderJsonResponse(response, requestId)
    const data = parsedResponse.data
    if (!response.ok) {
      const code = response.status === 429
        ? 'rateLimited'
        : response.status >= 500
          ? 'providerUnavailable'
          : 'invalidRequest'
      const upstreamErrorCode = safeProviderErrorCode(data)
      return {
        error: {
          ...makeAiError(code, code === 'rateLimited'
            ? 'For manga AI-anrop just nu.'
            : 'AI-tjänsten svarade inte som väntat.', response.status, response.status === 429 || response.status >= 500, requestId).error,
          networkError: false,
          parseError: parsedResponse.error?.parseError === true,
          parseErrorCode: parsedResponse.error?.parseErrorCode || '',
          parseErrorName: parsedResponse.error?.parseErrorName || '',
          upstreamErrorCode: upstreamErrorCode || parsedResponse.error?.upstreamErrorCode || '',
          upstreamStatus: parsedResponse.upstreamStatus,
          upstreamStatusText: parsedResponse.upstreamStatusText,
        },
        ok: false,
        requestId,
      }
    }

    if (!parsedResponse.ok) {
      return {
        error: parsedResponse.error,
        ok: false,
        requestId,
      }
    }

    const text = extractResponseText(data)
    if (!text) {
      return {
        error: {
          ...makeAiError('invalidProviderResponse', 'AI-svaret saknade strukturerad text.', 502, true, requestId).error,
          networkError: false,
          parseError: false,
          upstreamStatus: parsedResponse.upstreamStatus,
          upstreamStatusText: parsedResponse.upstreamStatusText,
        },
        ok: false,
        requestId,
      }
    }

    let value
    const outputDiagnostics = createOutputTextDiagnostics(text, data)
    const jsonCandidate = extractJsonCandidate(text)
    try {
      value = JSON.parse(jsonCandidate || String(text || '').trim())
    } catch (error) {
      return {
        error: createProviderResponseParseError({
          outputDiagnostics,
          parseErrorCode: outputDiagnostics.truncatedLikely ? 'truncatedProviderOutput' : 'malformedProviderOutputJson',
          parseErrorName: error?.name,
          requestId,
          upstreamStatus: parsedResponse.upstreamStatus,
          upstreamStatusText: parsedResponse.upstreamStatusText,
        }),
        ok: false,
        requestId,
      }
    }

    return {
      ok: true,
      providerStatus: parsedResponse.upstreamStatus,
      requestId,
      value,
    }
  } catch (error) {
    const abortReason = timeout.getAbortReason()
    const code = error?.name === 'AbortError'
      ? abortReason.upstreamAborted && !abortReason.timedOut
        ? 'requestAborted'
        : 'timeout'
      : 'providerUnavailable'
    const thrownDiagnostics = code === 'providerUnavailable'
      ? createSafeThrownFetchDiagnostics(error)
      : {}
    return {
      error: {
        ...makeAiError(code, code === 'timeout'
          ? 'AI-anropet tog for lang tid.'
          : code === 'requestAborted'
            ? 'AI-anropet avbröts.'
            : 'AI-tjänsten är tillfälligt otillgänglig.', code === 'timeout' ? 504 : 502, code !== 'timeout' && code !== 'requestAborted', requestId).error,
        aborted: code === 'requestAborted',
        ...thrownDiagnostics,
        networkError: error?.name !== 'AbortError',
        timeout: code === 'timeout',
      },
      ok: false,
      requestId,
    }
  } finally {
    timeout.cleanup()
  }
}

export const openAiGatewayInternals = {
  buckets,
  createOutputTextDiagnostics,
  extractResponseText,
  extractJsonCandidate,
  findFirstCompleteJsonObject,
  getOutputChunkCount,
  safeText,
  safeProviderErrorCode,
  createSafeThrownFetchDiagnostics,
  createProviderResponseParseError,
  readProviderJsonResponse,
  safeThrownErrorText,
}

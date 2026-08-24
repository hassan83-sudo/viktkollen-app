import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callOpenAiJson,
  checkRateLimit,
  createRealtimeVoiceSession,
  getAiGatewayConfig,
  getVoiceAiGatewayConfig,
  openAiGatewayInternals,
  parseJsonResponseText,
} from './openaiGateway.js'

describe('openaiGateway', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports configured status without exposing key values', () => {
    const config = getAiGatewayConfig('coach', {
      OPENAI_API_KEY: 'secret-value',
      OPENAI_COACH_MODEL: 'server-model',
    })

    expect(config.configured).toBe(true)
    expect(JSON.stringify(config)).not.toContain('secret-value')
    expect(config.model).toBe('server-model')
  })

  it('returns safe missing-key error', async () => {
    const result = await callOpenAiJson({
      env: {},
      fetchImpl: vi.fn(),
      input: [],
    })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('aiNotConfigured')
    expect(JSON.stringify(result)).not.toMatch(/OPENAI_API_KEY|Bearer/)
  })

  it('parses fenced json response text', () => {
    expect(parseJsonResponseText('```json\n{"ok":true}\n```')).toEqual({ ok: true })
  })

  it('parses json surrounded by safe prose', () => {
    expect(parseJsonResponseText('Här är JSON:\n{"ok":true,"nested":{"count":1}}\nKlart.')).toEqual({
      nested: { count: 1 },
      ok: true,
    })
  })

  it('rate limits per anonymous scope', () => {
    openAiGatewayInternals.buckets.clear()

    expect(checkRateLimit({ limit: 1, now: 1, scope: 'a', type: 'coach' }).limited).toBe(false)
    expect(checkRateLimit({ limit: 1, now: 2, scope: 'a', type: 'coach' }).limited).toBe(true)
    expect(checkRateLimit({ limit: 1, now: 3, scope: 'b', type: 'coach' }).limited).toBe(false)
  })

  it('calls provider with server-selected model and max output', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify({ summary: 'ok' }),
    }), { status: 200 }))
    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret', OPENAI_COACH_MODEL: 'server-model' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
      maxOutputTokens: 100,
    })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)

    expect(result.ok).toBe(true)
    expect(body.model).toBe('server-model')
    expect(body.max_output_tokens).toBe(100)
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer secret')
  })

  it('allows nutrition photo calls to use a larger V3 output budget', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify({ summary: 'ok' }),
    }), { status: 200 }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
      maxOutputTokens: 3400,
      type: 'photo',
    })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)

    expect(result.ok).toBe(true)
    expect(body.max_output_tokens).toBe(3400)
  })

  it('caps nutrition photo output at a bounded 3600 tokens', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify({ summary: 'ok' }),
    }), { status: 200 }))

    await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
      maxOutputTokens: 9999,
      type: 'photo',
    })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)

    expect(body.max_output_tokens).toBe(3600)
  })

  it('preserves safe upstream status and provider error code without exposing secrets', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'invalid_api_key', message: 'redacted by test' },
    }), { status: 401, statusText: 'Unauthorized' }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'invalidRequest',
      upstreamErrorCode: 'invalid_api_key',
      upstreamStatus: 401,
      upstreamStatusText: 'Unauthorized',
    })
    expect(JSON.stringify(result)).not.toMatch(/secret|Bearer|redacted by test/)
  })

  it('preserves upstream status for HTTP errors without JSON body', async () => {
    const fetchImpl = vi.fn(async () => new Response('', {
      status: 500,
      statusText: 'Internal Server Error',
    }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'providerUnavailable',
      networkError: false,
      parseError: true,
      parseErrorCode: 'emptyProviderBody',
      upstreamErrorCode: 'emptyProviderBody',
      upstreamStatus: 500,
      upstreamStatusText: 'Internal Server Error',
    })
  })

  it('classifies empty successful provider bodies as invalid responses, not network errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('', {
      status: 200,
      statusText: 'OK',
    }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'invalidProviderResponse',
      networkError: false,
      parseError: true,
      parseErrorCode: 'emptyProviderBody',
      upstreamStatus: 200,
      upstreamStatusText: 'OK',
    })
  })

  it('classifies malformed provider JSON as invalid response, not network error', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"output_text":', {
      status: 200,
      statusText: 'OK',
    }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'invalidProviderResponse',
      networkError: false,
      parseError: true,
      parseErrorCode: 'malformedProviderJson',
      parseErrorName: 'SyntaxError',
      upstreamStatus: 200,
    })
  })

  it('classifies malformed model output JSON as invalid response, not network error', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output_text: '{"summary":"ok",}',
    }), { status: 200, statusText: 'OK' }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'invalidProviderResponse',
      networkError: false,
      parseError: true,
      parseErrorCode: 'malformedProviderOutputJson',
      parseErrorName: 'SyntaxError',
      outputTextPresent: true,
      upstreamStatus: 200,
    })
  })

  it('extracts fenced model JSON before parsing', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output_text: '```json\n{"summary":"ok","items":[{"name":"A"}]}\n```',
    }), { status: 200, statusText: 'OK' }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ items: [{ name: 'A' }], summary: 'ok' })
  })

  it('extracts the first complete top-level object from prose', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output_text: 'Absolut.\n{"summary":"ok","nested":{"valid":true}}\nObservera.',
    }), { status: 200, statusText: 'OK' }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ nested: { valid: true }, summary: 'ok' })
  })

  it('joins multiple output text chunks before extracting JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output: [{
        content: [
          { text: 'Intro\n{"summary":', type: 'output_text' },
          { text: '"ok","count":2}\nOutro', type: 'output_text' },
        ],
      }],
    }), { status: 200, statusText: 'OK' }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ count: 2, summary: 'ok' })
  })

  it('classifies incomplete model JSON as truncated provider output', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      incomplete_details: { reason: 'max_output_tokens' },
      output_text: '{"summary":"ok","items":[',
      status: 'incomplete',
    }), { status: 200, statusText: 'OK' }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
      type: 'photo',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'invalidProviderResponse',
      networkError: false,
      outputChunkCount: 1,
      outputTextPresent: true,
      parseError: true,
      parseErrorCode: 'truncatedProviderOutput',
      providerIncompleteReason: 'max_output_tokens',
      providerResponseStatus: 'incomplete',
      startsWithBrace: true,
      truncatedLikely: true,
      upstreamStatus: 200,
    })
    expect(JSON.stringify(result)).not.toMatch(/secret|Bearer/)
  })

  it('distinguishes timeout aborts from HTTP provider errors', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl: vi.fn(async () => {
        throw abortError
      }),
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      aborted: false,
      code: 'timeout',
      networkError: false,
      timeout: true,
    })
  })

  it('allows a feature-specific 45s timeout to wait past the 15s global default', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve(new Response(JSON.stringify({
        output_text: JSON.stringify({ summary: 'ok after vision latency' }),
      }), { status: 200 })), 16000)
    }))

    const resultPromise = callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
      timeoutMs: 45000,
    })

    await vi.advanceTimersByTimeAsync(16000)
    const result = await resultPromise

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('aborts provider calls that exceed the feature-specific timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
      setTimeout(() => resolve(new Response(JSON.stringify({
        output_text: JSON.stringify({ summary: 'too late' }),
      }), { status: 200 })), 46000)
    }))

    const resultPromise = callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
      timeoutMs: 45000,
    })

    await vi.advanceTimersByTimeAsync(45000)
    const result = await resultPromise

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      aborted: false,
      code: 'timeout',
      timeout: true,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('distinguishes upstream client aborts from server timeouts', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }))

    const resultPromise = callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
      signal: controller.signal,
      timeoutMs: 45000,
    })
    controller.abort()
    const result = await resultPromise

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      aborted: true,
      code: 'requestAborted',
      networkError: false,
      timeout: false,
    })
  })

  it('adds safe diagnostics for thrown network fetch errors', async () => {
    const networkError = new TypeError('fetch failed')
    networkError.cause = {
      code: 'UND_ERR_SOCKET',
      message: 'other side closed',
      name: 'SocketError',
    }

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret' },
      fetchImpl: vi.fn(async () => {
        throw networkError
      }),
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'providerUnavailable',
      fetchErrorCauseCode: 'UND_ERR_SOCKET',
      fetchErrorCauseMessage: 'other side closed',
      fetchErrorCauseName: 'SocketError',
      fetchErrorMessage: 'fetch failed',
      fetchErrorName: 'TypeError',
      networkError: true,
      timeout: false,
    })
    expect(JSON.stringify(result)).not.toMatch(/secret|Bearer/)
  })

  it('redacts sensitive thrown fetch diagnostics', () => {
    expect(openAiGatewayInternals.safeThrownErrorText('Authorization Bearer secret')).toBe('')
    expect(openAiGatewayInternals.safeThrownErrorText('data:image/png;base64,abc')).toBe('')
    expect(openAiGatewayInternals.safeThrownErrorText('Socket closed safely')).toBe('Socket closed safely')
  })

  it('keeps the realtime voice model server-configurable without exposing the API key', async () => {
    const config = getVoiceAiGatewayConfig({
      OPENAI_API_KEY: 'secret-value',
      VOICE_AI_MODEL: 'gpt-4o-mini-realtime-preview',
    })

    expect(config.model).toBe('gpt-4o-mini-realtime-preview')
    expect(JSON.stringify(config)).not.toContain('secret-value')

    const session = await createRealtimeVoiceSession({
      env: { OPENAI_API_KEY: 'secret-value', VOICE_AI_MODEL: 'gpt-4o-mini-realtime-preview' },
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          client_secret: { expires_at: 1700000000, value: 'ek_test' },
          model: 'gpt-4o-mini-realtime-preview',
        }),
      })),
      instructions: 'Du är Viktkollens röstcoach.',
    })

    expect(session.ok).toBe(true)
    expect(session.clientSecret).toBe('ek_test')
    expect(JSON.stringify(session)).not.toMatch(/secret-value|OPENAI_API_KEY|Bearer/)
  })
})

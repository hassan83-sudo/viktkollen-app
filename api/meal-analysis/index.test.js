import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

function createRequest({ body = {}, method = 'POST', token = 'valid-token' } = {}) {
  const requestBody = JSON.stringify(body)
  const request = Readable.from([requestBody])
  request.body = requestBody
  request.headers = token ? { authorization: `Bearer ${token}` } : {}
  request.method = method
  request.socket = { remoteAddress: '127.0.0.1' }
  return request
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json: vi.fn((body) => {
      response.body = body
      return response
    }),
    setHeader: vi.fn((name, value) => {
      response.headers[name] = value
    }),
    status: vi.fn((statusCode) => {
      response.statusCode = statusCode
      return response
    }),
  }
  return response
}

async function callRoute(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

describe('legacy meal analysis API route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: 'meal-user-a' } }
        : { error: { message: token === 'expired-token' ? 'JWT expired' : 'invalid' } }
    ))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(null)
  })

  it('accepts POST only and sets no-store headers', async () => {
    const response = await callRoute(createRequest({ method: 'GET' }))

    expect(response.statusCode).toBe(405)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(response.headers['Cache-Control']).toContain('no-store')
  })

  it('requires verified Supabase auth before provider calls', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    const missing = await callRoute(createRequest({ body: { image: 'data:image/png;base64,abc' }, token: '' }))
    const expired = await callRoute(createRequest({ body: { image: 'data:image/png;base64,abc' }, token: 'expired-token' }))

    expect(missing.statusCode).toBe(401)
    expect(missing.body.error.code).toBe('AUTH_REQUIRED')
    expect(expired.statusCode).toBe(401)
    expect(expired.body.error.code).toBe('AUTH_EXPIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(missing.body)).not.toMatch(/test-key|Bearer|meal-user-a|data:image/)
  })

  it('fails closed without mock fallback when provider key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: { image: 'data:image/png;base64,abc' } }))

    expect(response.statusCode).toBe(403)
    expect(response.body.ok).toBe(false)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(response.body.analysis).toBeUndefined()
    expect(response.body.source).toBeUndefined()
    expect(response.body.fallbackReason).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(response.headers['Cache-Control']).toContain('no-store')
  })

  it('applies server-side rate limiting after auth', async () => {
    setAiRateLimitAdapterForTests({
      consume: vi.fn(() => ({
        limited: true,
        retryAfterSeconds: 30,
        resetAt: Date.now() + 30000,
      })),
      type: 'test',
    })
    const response = await callRoute(createRequest({ body: { image: 'data:image/png;base64,abc' } }))

    expect(response.statusCode).toBe(429)
    expect(response.body.error.code).toBe('RATE_LIMITED')
    expect(response.headers['Retry-After']).toBe('30')
  })
})

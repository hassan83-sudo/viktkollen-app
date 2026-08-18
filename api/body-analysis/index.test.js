import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler, { bodyAnalysisRouteInternals } from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function multipartBody({ boundary = 'body-boundary', contentType = 'image/png', image = pngBytes } = {}) {
  const parts = ['frontImage', 'sideImage', 'backImage'].map((fieldName) => Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fieldName}.png"\r\nContent-Type: ${contentType}\r\n\r\n`, 'latin1'),
    image,
    Buffer.from('\r\n', 'latin1'),
  ]))

  return Buffer.concat([
    ...parts,
    Buffer.from(`--${boundary}--\r\n`, 'latin1'),
  ])
}

function createRequest({ body, contentType = 'multipart/form-data; boundary=body-boundary', headers = {}, method = 'POST', token = 'valid-token' } = {}) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': contentType,
    ...headers,
  }
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

describe('body analysis API route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: 'body-user-a' } }
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

  it('requires auth before provider calls', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), token: '' }))

    expect(response.statusCode).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|body-user-a|data:image/)
  })

  it('rejects expired auth without provider calls', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), token: 'expired-token' }))

    expect(response.statusCode).toBe(401)
    expect(response.body.error.code).toBe('AUTH_EXPIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects MIME spoofing through file signature validation', () => {
    const error = bodyAnalysisRouteInternals.validateImage({
      contentType: 'image/png',
      data: Buffer.from('not-a-png'),
      size: 9,
    }, 'Bild framifrån')

    expect(error).toContain('filformat')
  })

  it('falls back to clearly marked mock output when provider key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    const response = await callRoute(createRequest({ body: multipartBody() }))

    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('mock')
    expect(response.body.sourceReason).toBe('missing_api_key')
    expect(JSON.stringify(response.body)).not.toMatch(/OPENAI_API_KEY|Bearer|body-user-a|data:image/)
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
    const response = await callRoute(createRequest({ body: multipartBody() }))

    expect(response.statusCode).toBe(429)
    expect(response.body.error.code).toBe('RATE_LIMITED')
    expect(response.headers['Retry-After']).toBe('30')
  })
})

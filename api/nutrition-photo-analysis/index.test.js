import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler, { nutritionPhotoRouteInternals } from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { resetAiRequestDeduperForTests } from '../_shared/aiRequestDeduper.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function multipartBody({ boundary = 'test-boundary', contentType = 'image/png', fieldName = 'image', image = pngBytes } = {}) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="mealType"\r\n\r\nLunch\r\n`, 'latin1'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="meal.png"\r\nContent-Type: ${contentType}\r\n\r\n`, 'latin1'),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
  ])
}

function createRequest({ body, contentType = 'multipart/form-data; boundary=test-boundary', headers = {}, method = 'POST', token = 'valid-token' } = {}) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': contentType,
    'x-viktkollen-client-id': `test-${Math.random()}`,
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

describe('nutrition photo analysis API route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    resetAiRequestDeduperForTests()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: 'photo-user-a' } }
        : { error: { message: token === 'expired-token' ? 'JWT expired' : 'invalid' } }
    ))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
    resetAiRequestDeduperForTests()
  })

  it('accepts POST only', async () => {
    const response = await callRoute(createRequest({ method: 'GET' }))

    expect(response.statusCode).toBe(405)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(response.headers['Cache-Control']).toContain('no-store')
  })

  it('requires auth before reading or sending image data', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), token: '' }))

    expect(response.statusCode).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|photo-user-a|base64/)
  })

  it('rejects invalid and expired auth without provider calls', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    const invalid = await callRoute(createRequest({ body: multipartBody(), token: 'bad-token' }))
    const expired = await callRoute(createRequest({ body: multipartBody(), token: 'expired-token' }))

    expect(invalid.statusCode).toBe(401)
    expect(invalid.body.error.code).toBe('AUTH_INVALID')
    expect(expired.statusCode).toBe(401)
    expect(expired.body.error.code).toBe('AUTH_EXPIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects invalid content type before reading image data', async () => {
    const response = await callRoute(createRequest({ contentType: 'application/json' }))

    expect(response.statusCode).toBe(415)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(JSON.stringify(response.body)).not.toMatch(/base64|OPENAI|stack/)
  })

  it('rejects missing image', async () => {
    const response = await callRoute(createRequest({ body: multipartBody({ fieldName: 'other' }) }))

    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
  })

  it('rejects MIME spoofing through file signature validation', () => {
    const error = nutritionPhotoRouteInternals.validateImage({
      contentType: 'image/png',
      data: Buffer.from('not-a-png'),
      size: 9,
    })

    expect(error.code).toBe('unsupportedFormat')
  })

  it('returns configuration error when provider key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    const response = await callRoute(createRequest({ body: multipartBody() }))

    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
    expect(JSON.stringify(response.body)).not.toMatch(/OPENAI_API_KEY|Bearer|base64/)
  })

  it('validates provider payload and strips unsafe fields', () => {
    const result = nutritionPhotoRouteInternals.validateProviderPayload({
      detectedItems: Array.from({ length: 14 }, (_, index) => ({
        calories: -1,
        name: index === 0 ? '<script>Pizza</script>' : `Mat ${index}`,
        protein: 8,
      })),
      estimatedNutrition: { calories: 500, carbohydrates: 55, fat: 18, protein: 24 },
      safeSummary: 'Se https://example.com <b>test</b>',
    })

    expect(result.ok).toBe(true)
    expect(result.analysis.detectedItems).toHaveLength(12)
    expect(result.analysis.detectedItems[0].calories).toBeNull()
    expect(JSON.stringify(result.analysis)).not.toMatch(/<script|https?:\/\//)
  })

  it('returns validated remote analysis without raw provider response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({
        output_text: JSON.stringify({
          detectedItems: [{ calories: 260, carbohydrates: 32, confidence: 'medium', fat: 10, name: 'Pizza', protein: 12 }],
          estimatedNutrition: { calories: 260, carbohydrates: 32, fat: 10, protein: 12 },
          safeSummary: 'Uppskattad portion.',
        }),
      }),
      ok: true,
    })))

    const response = await callRoute(createRequest({ body: multipartBody() }))

    expect(response.statusCode).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.analysis.providerType).toBe('remote')
    expect(response.body.analysis.detectedItems[0].name).toBe('Pizza')
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|output_text|data:image/)
    expect(response.headers['Cache-Control']).toContain('no-store')
  })

  it('uses separate rate-limit buckets for verified users', async () => {
    setSupabaseAuthVerifierForTests(async (token) => ({ user: { id: token } }))
    setAiRateLimitAdapterForTests({
      consume: vi.fn(() => ({ limited: true, retryAfterSeconds: 12, resetAt: Date.now() + 12000 })),
      type: 'process-local',
    })

    const response = await callRoute(createRequest({ body: multipartBody(), token: 'user-a' }))

    expect(response.statusCode).toBe(429)
    expect(response.body.error.code).toBe('RATE_LIMITED')
    expect(response.body.error.retryAfterSeconds).toBe(12)
    expect(JSON.stringify(response.body)).not.toMatch(/user-a/)
  })
})

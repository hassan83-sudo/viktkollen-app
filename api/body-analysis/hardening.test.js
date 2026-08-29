import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler, { bodyAnalysisRouteInternals, validateImageFieldNames } from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function imagePart(boundary, fieldName, image = pngBytes, contentType = 'image/png') {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fieldName}.png"\r\nContent-Type: ${contentType}\r\n\r\n`,
      'latin1',
    ),
    image,
    Buffer.from('\r\n', 'latin1'),
  ])
}

function multipartBody({ boundary = 'body-boundary', fieldNames = ['frontImage', 'sideImage', 'backImage'] } = {}) {
  return Buffer.concat([
    ...fieldNames.map((fieldName) => imagePart(boundary, fieldName)),
    Buffer.from(`--${boundary}--\r\n`, 'latin1'),
  ])
}

function createRequest({ body, contentType = 'multipart/form-data; boundary=body-boundary', method = 'POST', token = 'valid-token' } = {}) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': contentType,
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

describe('body analysis API hardening', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: 'body-hardening-user' } }
        : { error: { message: 'invalid' } }
    ))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(null)
  })

  describe('exactly three images', () => {
    it('accepts precisely the three required angles', () => {
      expect(validateImageFieldNames(['frontImage', 'sideImage', 'backImage'])).toBe('')
    })

    it('rejects a fourth image field', () => {
      expect(validateImageFieldNames(['frontImage', 'sideImage', 'backImage', 'extraImage']))
        .toContain('Endast bilderna')
    })

    it('rejects too few images', () => {
      expect(validateImageFieldNames(['frontImage', 'sideImage'])).toContain('exakt tre bilder')
      expect(validateImageFieldNames([])).toContain('exakt tre bilder')
    })

    it('refuses an upload carrying an unexpected extra file', async () => {
      const response = await callRoute(createRequest({
        body: multipartBody({ fieldNames: ['frontImage', 'sideImage', 'backImage', 'bonusImage'] }),
      }))

      expect(response.statusCode).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error.safeMessage).toContain('Endast bilderna')
    })
  })

  describe('production mock policy', () => {
    it('allows the demo fallback outside production', () => {
      expect(bodyAnalysisRouteInternals.isMockFallbackAllowed({ NODE_ENV: 'development' })).toBe(true)
      expect(bodyAnalysisRouteInternals.isMockFallbackAllowed({})).toBe(true)
    })

    it('blocks a silent demo fallback in production', () => {
      expect(bodyAnalysisRouteInternals.isMockFallbackAllowed({ NODE_ENV: 'production' })).toBe(false)
    })

    it('only re-enables the demo fallback through an explicit opt-in', () => {
      expect(bodyAnalysisRouteInternals.isMockFallbackAllowed({
        BODY_ANALYSIS_ALLOW_MOCK: 'true',
        NODE_ENV: 'production',
      })).toBe(true)
    })

    it('fails visibly instead of inventing analysis text in production', async () => {
      process.env.NODE_ENV = 'production'
      delete process.env.OPENAI_API_KEY

      const response = await callRoute(createRequest({ body: multipartBody() }))

      expect(response.statusCode).toBe(503)
      expect(response.body.ok).toBe(false)
      expect(response.body.error.safeMessage).toContain('Inget demoresultat')
      // No fabricated analysis fields leak through.
      expect(response.body.summary).toBeUndefined()
      expect(response.body.source).toBeUndefined()
    })

    it('still tags the demo result as mock when the fallback is allowed', async () => {
      process.env.NODE_ENV = 'development'
      delete process.env.OPENAI_API_KEY

      const response = await callRoute(createRequest({ body: multipartBody() }))

      expect(response.statusCode).toBe(200)
      expect(response.body.source).toBe('mock')
      expect(response.body.sourceReason).toBe('missing_api_key')
    })
  })

  describe('response hygiene', () => {
    it('sets no-store cache headers', async () => {
      const response = await callRoute(createRequest({ method: 'GET' }))
      expect(String(response.headers['Cache-Control'] || '')).toContain('no-store')
    })

    it('requires authentication before doing any work', async () => {
      const response = await callRoute(createRequest({ body: multipartBody(), token: 'bad-token' }))
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      expect(response.body.ok).toBe(false)
    })

    it('keeps image bytes out of the logged output', async () => {
      process.env.NODE_ENV = 'development'
      delete process.env.OPENAI_API_KEY
      const info = vi.spyOn(console, 'info').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await callRoute(createRequest({ body: multipartBody() }))

      const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls])
      expect(logged).not.toContain('data:image')
      expect(logged).not.toContain('base64')
      expect(logged).not.toContain(pngBytes.toString('base64'))
    })
  })
})

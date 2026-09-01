import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { resetAiRequestDeduperForTests } from '../_shared/aiRequestDeduper.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'

const TEST_SECRET = 'a'.repeat(40)
const SHORT_SECRET = 'too-short-secret'
const USER_ID = 'forgotten-items-consent-user'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const otherPngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9])
const requestedItems = [{ id: 'phone', label: 'Mobil' }, { id: 'keys', label: 'Nycklar' }]

function multipartBody({ boundary = 'test-boundary', image = pngBytes, items = requestedItems } = {}) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="items"\r\n\r\n${JSON.stringify(items)}\r\n`, 'latin1'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="frame.png"\r\nContent-Type: image/png\r\n\r\n`, 'latin1'),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
  ])
}

function issueValidForgottenItemsToken(overrides = {}) {
  const imageHash = overrides.imageHash || computeCanonicalImageHash([{ bytes: pngBytes, label: 'image' }])
  return issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    purpose: analysisConsentPurposes.forgottenItemsAnalysis,
    userId: USER_ID,
    ...overrides,
    imageHash,
  })
}

function createRequest({ body, consentToken, contentType = 'multipart/form-data; boundary=test-boundary', method = 'POST', token = 'valid-token' } = {}) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': contentType,
    'x-viktkollen-client-id': `test-${Math.random()}`,
    ...(consentToken ? { 'x-viktkollen-consent-token': consentToken } : {}),
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

describe('forgotten items analysis API - consent token gate', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv, ANALYSIS_CONSENT_SECRET: TEST_SECRET }
    resetAiRequestDeduperForTests()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: USER_ID } }
        : { error: { message: 'invalid' } }
    ))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.useRealTimers()
    vi.unstubAllGlobals()
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
    resetAiRequestDeduperForTests()
  })

  it('blocks a request with no consent token before any AI/network call, even in the test environment', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await callRoute(createRequest({ body: multipartBody() }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks an invalid signature', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await callRoute(createRequest({
      body: multipartBody(),
      consentToken: 'bm90LWEtcmVhbC1wYXlsb2Fk.bm90LWEtcmVhbC1zaWduYXR1cmU',
    }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks a tampered token (payload altered after signing)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const issued = issueValidForgottenItemsToken()
    const [encodedPayload, signature] = issued.token.split('.')
    const tamperedPayload = `${encodedPayload.slice(0, -1)}${encodedPayload.slice(-1) === 'A' ? 'B' : 'A'}`
    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: `${tamperedPayload}.${signature}` }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks a token issued for a different user', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const issued = issueValidForgottenItemsToken({ userId: 'a-different-user' })
    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: issued.token }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks a token whose image hash does not match the uploaded image', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const issued = issueValidForgottenItemsToken({ imageHash: computeCanonicalImageHash([{ bytes: otherPngBytes, label: 'image' }]) })
    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: issued.token }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks a token issued for the wrong purpose (e.g. borrowed from nutrition-photo-analysis)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const issued = issueValidForgottenItemsToken({ purpose: analysisConsentPurposes.nutritionPhotoAnalysis })
    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: issued.token }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks a forged token claiming an unknown purpose (e.g. an eye-recognition-style purpose)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    // issueAnalysisConsentToken itself already refuses to issue for an
    // unknown purpose, so this simulates a forged/garbage token - the
    // route must still reject it independently of where it came from.
    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: 'garbage.garbage' }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects an expired consent token even with a correct signature', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const now = Date.now()
    const issued = issueValidForgottenItemsToken()
    // Re-sign a payload with the same secret but an already-passed
    // expiry, mirroring api/_shared/analysisConsent.test.js's approach to
    // hand-building an expired token without exporting internals.
    const { createHmac } = await import('node:crypto')
    const decodedPayload = JSON.parse(Buffer.from(issued.token.split('.')[0], 'base64url').toString('utf8'))
    const expiredPayload = { ...decodedPayload, exp: now - 1000, iat: now - 2000 }
    const encodedPayload = Buffer.from(JSON.stringify(expiredPayload), 'utf8').toString('base64url')
    const signature = createHmac('sha256', TEST_SECRET).update(encodedPayload).digest('base64url')
    const expiredToken = `${encodedPayload}.${signature}`

    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: expiredToken }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed when ANALYSIS_CONSENT_SECRET is missing on the server, even with an otherwise valid-looking token', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const issued = issueValidForgottenItemsToken()
    process.env = { ...process.env, ANALYSIS_CONSENT_SECRET: '' }

    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: issued.token }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed when ANALYSIS_CONSENT_SECRET is too short/invalid on the server', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const issued = issueValidForgottenItemsToken()
    process.env = { ...process.env, ANALYSIS_CONSENT_SECRET: SHORT_SECRET }

    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: issued.token }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('lets a valid, matching consent token reach the provider step', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })))

    const issued = issueValidForgottenItemsToken()
    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: issued.token }))

    expect(response.body.error?.code).not.toBe('CONSENT_REQUIRED')
    expect(response.statusCode).not.toBe(403)
  })

  it('never logs the consent token or the image hash', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const issued = issueValidForgottenItemsToken()
    await callRoute(createRequest({ body: multipartBody() }))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    await callRoute(createRequest({ body: multipartBody(), consentToken: issued.token }))

    const logged = JSON.stringify([...warnSpy.mock.calls, ...infoSpy.mock.calls])
    expect(logged).not.toContain(issued.token)
    expect(logged).not.toContain(computeCanonicalImageHash([{ bytes: pngBytes, label: 'image' }]))
  })

  it('rejects a request whose consent token was issued for a completely different purpose string that happens to look plausible', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const issued = issueValidForgottenItemsToken({ purpose: analysisConsentPurposes.bodyAnalysis })
    const response = await callRoute(createRequest({ body: multipartBody(), consentToken: issued.token }))

    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('forgotten items analysis API - no persistence/storage side channels', () => {
  it('never imports Supabase Storage, sync, backup or export APIs in the route module source', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8')
    expect(source).not.toMatch(/supabase.*storage/i)
    expect(source).not.toMatch(/\.upload\(/)
    expect(source).not.toMatch(/from\s+['"].*storage.*['"]/i)
  })
})

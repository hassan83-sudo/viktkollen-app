import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'

const TEST_SECRET = 'a'.repeat(40)
const USER_ID = 'meal-consent-user'
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const imageDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`

function createRequest({ body = {}, consentToken, method = 'POST', token = 'valid-token' } = {}) {
  const requestBody = JSON.stringify(body)
  const request = Readable.from([requestBody])
  request.body = requestBody
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(consentToken ? { 'x-viktkollen-consent-token': consentToken } : {}),
  }
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

describe('legacy meal-analysis API - unconditional fail-closed (no UI consent step exists for this flow)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv, ANALYSIS_CONSENT_SECRET: TEST_SECRET }
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: USER_ID } }
        : { error: { message: 'invalid' } }
    ))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
  })

  it('rejects unconditionally in every environment, including test - no purpose in the allowlist covers this legacy route', async () => {
    for (const NODE_ENV of ['development', 'test', 'preview', 'production']) {
      process.env.NODE_ENV = NODE_ENV
      const response = await callRoute(createRequest({ body: { image: imageDataUrl } }))
      expect(response.statusCode).toBe(403)
      expect(response.body.ok).toBe(false)
      expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    }
  })

  it('rejects before any OpenAI/network call - no fetch is ever made', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await callRoute(createRequest({ body: { image: imageDataUrl } }))

    expect(response.statusCode).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cannot be satisfied by a valid consent token issued for a different, allowed purpose', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    for (const purpose of [analysisConsentPurposes.bodyAnalysis, analysisConsentPurposes.nutritionPhotoAnalysis]) {
      const issued = issueAnalysisConsentToken({
        env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
        imageHash: computeCanonicalImageHash([{ bytes: pngBytes, label: 'image' }]),
        purpose,
        userId: USER_ID,
      })
      const response = await callRoute(createRequest({ body: { image: imageDataUrl }, consentToken: issued.token }))
      expect(response.statusCode).toBe(403)
      expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    }

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never returns an analysis result of any kind (real or mock) instead of rejecting', async () => {
    const response = await callRoute(createRequest({ body: { image: imageDataUrl } }))
    expect(response.body.analysis).toBeUndefined()
    expect(response.body.source).toBeUndefined()
  })

  it('rejects even an unauthenticated-looking request the same way authentication normally would, without ever reaching the consent check for image data', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await callRoute(createRequest({ body: { image: imageDataUrl }, token: 'invalid-token' }))

    // Auth still runs first (unchanged), then the unconditional consent
    // rejection would apply regardless - either way, no OpenAI call happens.
    expect(response.statusCode).not.toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

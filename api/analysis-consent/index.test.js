import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, computeCanonicalImageHash, verifyAnalysisConsentToken } from '../_shared/analysisConsent.js'

const TEST_SECRET = 'a'.repeat(40)
const SHORT_SECRET = 'too-short'
const USER_ID = 'consent-endpoint-user'
const imageHash = computeCanonicalImageHash([{ bytes: Buffer.from([1, 2, 3]), label: 'image' }])

function createRequest({ body = {}, method = 'POST', token = 'valid-token' } = {}) {
  return {
    body: JSON.stringify(body),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    method,
    socket: { remoteAddress: '127.0.0.1' },
  }
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

describe('POST /api/analysis-consent - token issuance endpoint', () => {
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
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
  })

  it('rejects non-POST methods', async () => {
    const response = await callRoute(createRequest({ method: 'GET' }))
    expect(response.statusCode).toBe(405)
  })

  it('requires a valid, authenticated Supabase user', async () => {
    const response = await callRoute(createRequest({
      body: { imageHash, purpose: analysisConsentPurposes.bodyAnalysis, uiConsentApproved: true },
      token: 'invalid-token',
    }))
    expect(response.statusCode).not.toBe(200)
    expect(response.body.ok).toBe(false)
  })

  it('requires the explicit uiConsentApproved claim - refuses to issue without it', async () => {
    const response = await callRoute(createRequest({
      body: { imageHash, purpose: analysisConsentPurposes.bodyAnalysis },
    }))
    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('CONSENT_REQUIRED')
  })

  it('rejects a disallowed purpose, including a future eye-recognition purpose and legacy meal-analysis', async () => {
    for (const purpose of ['eye-recognition', 'meal-analysis', 'anything-else']) {
      const response = await callRoute(createRequest({
        body: { imageHash, purpose, uiConsentApproved: true },
      }))
      expect(response.statusCode).toBe(403)
      expect(response.body.error.code).toBe('CONSENT_REQUIRED')
    }
  })

  it('fails closed with a generic server error when the consent secret is missing or too short, in every environment', async () => {
    for (const NODE_ENV of ['development', 'test', 'preview', 'production']) {
      process.env.NODE_ENV = NODE_ENV
      process.env.ANALYSIS_CONSENT_SECRET = ''
      let response = await callRoute(createRequest({
        body: { imageHash, purpose: analysisConsentPurposes.bodyAnalysis, uiConsentApproved: true },
      }))
      expect(response.statusCode).toBe(503)
      expect(response.body.ok).toBe(false)

      process.env.ANALYSIS_CONSENT_SECRET = SHORT_SECRET
      response = await callRoute(createRequest({
        body: { imageHash, purpose: analysisConsentPurposes.bodyAnalysis, uiConsentApproved: true },
      }))
      expect(response.statusCode).toBe(503)
      expect(response.body.ok).toBe(false)
    }
  })

  it('issues a valid, verifiable token for a fully-approved request', async () => {
    const response = await callRoute(createRequest({
      body: { imageHash, purpose: analysisConsentPurposes.bodyAnalysis, uiConsentApproved: true },
    }))

    expect(response.statusCode).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(typeof response.body.token).toBe('string')
    expect(response.body.expiresAt).toBeGreaterThan(Date.now())
    expect(response.body.expiresAt).toBeLessThanOrEqual(Date.now() + 2 * 60 * 1000 + 1000)

    const verified = verifyAnalysisConsentToken({
      env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
      imageEntries: [{ bytes: Buffer.from([1, 2, 3]), label: 'image' }],
      purpose: analysisConsentPurposes.bodyAnalysis,
      token: response.body.token,
      userId: USER_ID,
    })
    expect(verified.ok).toBe(true)
    expect(verified.payload.sub).toBe(USER_ID)
  })

  it('never logs the issued token, the image hash or the consent secret', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await callRoute(createRequest({ body: { imageHash, purpose: 'eye-recognition', uiConsentApproved: true } }))
    const response = await callRoute(createRequest({
      body: { imageHash, purpose: analysisConsentPurposes.bodyAnalysis, uiConsentApproved: true },
    }))

    const logged = JSON.stringify(warnSpy.mock.calls)
    expect(logged).not.toContain(imageHash)
    expect(logged).not.toContain(TEST_SECRET)
    expect(logged).not.toContain(response.body.token)
  })
})

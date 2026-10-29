import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import earHandler from '../ai-ear/interpret/index.js'
import consentHandler from '../analysis-consent/index.js'
import billingUserHandler from '../billing/user/index.js'
import { setAiRateLimitAdapterForTests } from './aiRateLimiter.js'
import { analysisConsentPurposes, computeCanonicalImageHash } from './analysisConsent.js'
import { setBillingAdminServiceForTests } from './billing/admin.js'
import { checkFeatureAccess, featureAccessMode, listFeatureAccess } from './featureAccess.js'
import { setSupabaseAuthVerifierForTests } from './verifySupabaseUser.js'

const ADMIN_ID = 'admin-user'
const USER_ID = 'ordinary-user'

function wavBytes() {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(100, 4)
  header.write('WAVE', 8, 'ascii')
  return Buffer.concat([header, Buffer.alloc(64, 1)])
}

function streamRequest({ body = wavBytes(), contentType = 'audio/wav', token, url = '/api/ai-ear/interpret' } = {}) {
  const request = Readable.from([body])
  request.method = 'POST'
  request.url = url
  request.headers = { authorization: `Bearer ${token}`, 'content-type': contentType, 'x-viktkollen-consent-token': 'any' }
  return request
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json: vi.fn((body) => { response.body = body; return response }),
    setHeader: vi.fn((name, value) => { response.headers[name] = value }),
    status: vi.fn((code) => { response.statusCode = code; return response }),
  }
  return response
}

async function call(handler, request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

describe('funktionsspärr: regel', () => {
  it('släpper bara igenom ett verifierat billing_admin-konto för AI-örat', async () => {
    const lookupAdmin = async (id) => id === ADMIN_ID
    await expect(checkFeatureAccess('aiEar', ADMIN_ID, { env: {}, lookupAdmin })).resolves.toEqual({ allowed: true, reason: 'admin' })
    await expect(checkFeatureAccess('aiEar', USER_ID, { env: {}, lookupAdmin })).resolves.toEqual({ allowed: false, reason: 'not_admin' })
    await expect(checkFeatureAccess('aiEar', '', { env: {}, lookupAdmin })).resolves.toEqual({ allowed: false, reason: 'unverified' })
  })

  it('nekar när rollen inte kan verifieras', async () => {
    const lookupAdmin = async () => { throw new Error('database down') }
    await expect(checkFeatureAccess('aiEar', ADMIN_ID, { env: {}, lookupAdmin })).resolves.toEqual({ allowed: false, reason: 'unverified' })
    await expect(checkFeatureAccess('aiEar', ADMIN_ID, { env: {}, lookupAdmin: async () => 'yes' })).resolves.toMatchObject({ allowed: false })
  })

  it('öppnas bara med exakt FEATURE_ACCESS_AI_EAR=open, och rör inga andra funktioner', async () => {
    expect(featureAccessMode('aiEar', {})).toBe('admin_only')
    expect(featureAccessMode('aiEar', { FEATURE_ACCESS_AI_EAR: 'open' })).toBe('open')
    for (const value of ['OPEN', 'true', '1', 'all', ' ']) expect(featureAccessMode('aiEar', { FEATURE_ACCESS_AI_EAR: value })).toBe('admin_only')
    expect(featureAccessMode('foodScan', {})).toBe('open')
    await expect(listFeatureAccess(USER_ID, { env: {}, lookupAdmin: async () => false })).resolves.toEqual({ aiEar: 'locked' })
    await expect(listFeatureAccess(ADMIN_ID, { env: {}, lookupAdmin: async () => true })).resolves.toEqual({ aiEar: 'allowed' })
  })
})

describe('funktionsspärr: AI-örats servervägar', () => {
  const originalEnv = { ...process.env }
  let rateLimitCalls
  let fetchMock

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ACRCLOUD_ACCESS_KEY: 'key',
      ACRCLOUD_ACCESS_SECRET: 'secret',
      ACRCLOUD_HOST: 'identify-eu-west-1.acrcloud.com',
      AI_EAR_BACKEND_URL: 'https://perch-inference.example.run.app',
      AI_EAR_ENABLED: 'true',
      ANALYSIS_CONSENT_SECRET: 'a'.repeat(40),
    }
    delete process.env.FEATURE_ACCESS_AI_EAR
    rateLimitCalls = []
    setAiRateLimitAdapterForTests({
      consume(entry) {
        rateLimitCalls.push(entry.route)
        return { limited: false, remaining: 10, resetAt: entry.now + entry.windowMs }
      },
      type: 'test',
    })
    setBillingAdminServiceForTests({ hasBillingAdmin: async (id) => id === ADMIN_ID })
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'admin-token') return { user: { id: ADMIN_ID } }
      if (token === 'user-token') return { user: { id: USER_ID } }
      return { error: { message: 'invalid' } }
    })
    fetchMock = vi.fn(async () => { throw new Error('no provider call expected') })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setSupabaseAuthVerifierForTests(null)
    setBillingAdminServiceForTests(null)
    setAiRateLimitAdapterForTests()
  })

  it('nekar ljud- och fågelanalys för vanlig användare före samtycke, rate limit och backend', async () => {
    const response = await call(earHandler, streamRequest({ token: 'user-token' }))
    expect(response.statusCode).toBe(403)
    expect(response.body.error).toMatchObject({ code: 'FEATURE_LOCKED', safeMessage: 'Funktionen är under utveckling.' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rateLimitCalls).toEqual([])
  })

  it('nekar humning för vanlig användare före ACRCloud och rate limit', async () => {
    const response = await call(earHandler, streamRequest({
      contentType: 'multipart/form-data; boundary=x',
      token: 'user-token',
      url: '/api/ai-ear/interpret?__vk_route=humming',
    }))
    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('FEATURE_LOCKED')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rateLimitCalls).toEqual([])
  })

  it('nekar även admin när rollen inte kan verifieras', async () => {
    setBillingAdminServiceForTests({ hasBillingAdmin: async () => { throw new Error('unavailable') } })
    const response = await call(earHandler, streamRequest({ token: 'admin-token' }))
    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('FEATURE_LOCKED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('släpper igenom admin förbi spärren till nästa kontroll', async () => {
    const response = await call(earHandler, streamRequest({ token: 'admin-token' }))
    // Spärren passerad: rate limit räknades och samtyckeskontrollen (falsk token) tog över.
    expect(response.body.error.code).not.toBe('FEATURE_LOCKED')
    expect(rateLimitCalls).toEqual(['aiEar'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('utfärdar inga AI-örat-samtycken till vanlig användare, men rör inte andra funktioners samtycken', async () => {
    const imageHash = computeCanonicalImageHash([{ bytes: Buffer.from([1, 2, 3]), label: 'image' }])
    const request = (purpose, token) => ({
      body: JSON.stringify({ imageHash, purpose, uiConsentApproved: true }),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
    })
    for (const purpose of [analysisConsentPurposes.aiEarInterpret, analysisConsentPurposes.audioHummingRecognition]) {
      const denied = await call(consentHandler, request(purpose, 'user-token'))
      expect(denied.statusCode, purpose).toBe(403)
      expect(denied.body.error.code, purpose).toBe('FEATURE_LOCKED')
      expect(denied.body.token, purpose).toBeUndefined()
      const admin = await call(consentHandler, request(purpose, 'admin-token'))
      expect(admin.statusCode, purpose).toBe(200)
      expect(typeof admin.body.token, purpose).toBe('string')
    }
    const food = await call(consentHandler, request(analysisConsentPurposes.nutritionPhotoAnalysis, 'user-token'))
    expect(food.statusCode).toBe(200)
    expect(typeof food.body.token).toBe('string')
  })

  it('visar samma beslut för appen via /api/billing/capability', async () => {
    const capability = (token) => call(billingUserHandler, {
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      query: {},
      url: '/api/billing/capability',
    })
    expect((await capability('user-token')).body).toMatchObject({ billing_admin: false, features: { aiEar: 'locked' }, ok: true })
    expect((await capability('admin-token')).body).toMatchObject({ billing_admin: true, features: { aiEar: 'allowed' }, ok: true })
  })
})

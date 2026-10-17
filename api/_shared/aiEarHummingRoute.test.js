import { createHmac } from 'node:crypto'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from '../ai-ear/interpret/index.js'
import { buildAcrCloudSignature, callAcrCloud, isAcrCloudHost } from './aiEarHummingRoute.js'
import { setAiRateLimitAdapterForTests } from './aiRateLimiter.js'
import { setBillingAdminServiceForTests } from './billing/admin.js'
import { setSupabaseAuthVerifierForTests } from './verifySupabaseUser.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from './analysisConsent.js'

const TEST_SECRET = 'test-analysis-consent-secret-32-plus'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const ACCESS_KEY = 'owner-access-key'
const ACCESS_SECRET = 'owner-access-secret-not-for-clients'
const HOST = 'identify-eu-west-1.acrcloud.com'

function audioBytes() {
  return Buffer.from('RIFF-humming-clip')
}

function consentFor(audio, { purpose = analysisConsentPurposes.audioHummingRecognition, userId = OWNER_ID, label = 'audio' } = {}) {
  const issued = issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    imageHash: computeCanonicalImageHash([{ bytes: audio, label }]),
    purpose,
    userId,
  })
  expect(issued.ok).toBe(true)
  return issued.token
}

async function encodeAudio(audio) {
  const form = new FormData()
  form.append('audio', new Blob([audio], { type: 'audio/wav' }), 'ai-ear-clip.wav')
  const encoded = new Response(form)
  return {
    body: Buffer.from(await encoded.arrayBuffer()),
    contentType: encoded.headers.get('content-type'),
  }
}

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    json: vi.fn(function json(body) { this.body = body; return this }),
    setHeader: vi.fn(function setHeader(name, value) { this.headers[name] = value }),
    status: vi.fn(function status(code) { this.statusCode = code; return this }),
  }
}

async function callRoute({ audio = audioBytes(), method = 'POST', token = 'owner-token', userId = OWNER_ID, withConsent = true, consent } = {}) {
  const encoded = await encodeAudio(audio)
  const request = Readable.from([encoded.body])
  request.method = method
  request.url = '/api/ai-ear/interpret?__vk_route=humming'
  request.headers = {
    'content-type': encoded.contentType,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(withConsent ? { 'x-viktkollen-consent-token': consent || consentFor(audio, { userId }) } : {}),
  }
  const response = createResponse()
  await handler(request, response)
  return response
}

describe('ACRCloud humming route', () => {
  const originalEnv = { ...process.env }
  let providerCalls

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ACRCLOUD_ACCESS_KEY: ACCESS_KEY,
      ACRCLOUD_ACCESS_SECRET: ACCESS_SECRET,
      ACRCLOUD_HOST: HOST,
      ANALYSIS_CONSENT_SECRET: TEST_SECRET,
    }
    providerCalls = []
    setAiRateLimitAdapterForTests({
      consume(entry) {
        providerCalls.push(entry)
        return { limited: false, remaining: 19, resetAt: entry.now + entry.windowMs }
      },
      type: 'test',
    })
    setBillingAdminServiceForTests({ hasBillingAdmin: async (userId) => userId === OWNER_ID })
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'owner-token') return { user: { id: OWNER_ID } }
      if (token === 'other-token') return { user: { id: OTHER_ID } }
      return { error: { message: 'invalid' } }
    })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setSupabaseAuthVerifierForTests(null)
    setBillingAdminServiceForTests(null)
    setAiRateLimitAdapterForTests()
  })

  it('accepts only ACRCloud hosts', () => {
    expect(isAcrCloudHost(HOST)).toBe(true)
    expect(isAcrCloudHost('identify-ap-southeast-1.acrcloud.com')).toBe(true)
    expect(isAcrCloudHost('evil.com')).toBe(false)
    expect(isAcrCloudHost('acrcloud.com.evil.com')).toBe(false)
    expect(isAcrCloudHost('')).toBe(false)
  })

  it('signs the Identify request and does not return the secret', () => {
    const timestamp = 1700000000
    const signature = buildAcrCloudSignature({ accessKey: ACCESS_KEY, accessSecret: ACCESS_SECRET, timestamp })
    const expected = createHmac('sha1', ACCESS_SECRET)
      .update(`POST\n/v1/identify\n${ACCESS_KEY}\naudio\n1\n${timestamp}`, 'utf8')
      .digest('base64')
    expect(signature).toBe(expected)
    expect(signature).not.toContain(ACCESS_SECRET)
  })

  it('blocks a signed-in customer before configuration or ACRCloud', async () => {
    delete process.env.ACRCLOUD_HOST
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await callRoute({ token: 'other-token', userId: OTHER_ID })
    expect(response.statusCode).toBe(403)
    expect(response.body.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(providerCalls).toHaveLength(0)
    expect(JSON.stringify(response.body)).not.toContain(ACCESS_SECRET)
  })

  it('requires login', async () => {
    const response = await callRoute({ token: '', withConsent: false })
    expect(response.statusCode).toBe(401)
    expect(response.body.ok).toBe(false)
  })

  it('keeps the owner behind consent and a separate burst limit, with no monthly window', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ metadata: { humming: [{ artists: [{ name: 'Artist' }], score: 0.91, title: 'Låt' }] }, status: { code: 0 } }),
      ok: true,
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const audio = audioBytes()
    const response = await callRoute({ audio })
    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({
      matched: true,
      ok: true,
      result: { artist: 'Artist', title: 'Låt' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://${HOST}/v1/identify`)
    expect(providerCalls).toHaveLength(1)
    expect(providerCalls[0].route).toBe('aiEarHumming')
    expect(providerCalls[0].key.startsWith('aiEarHumming:')).toBe(true)
    expect(providerCalls[0].windowMs).toBe(10 * 60 * 1000)
    expect(providerCalls[0].limit).toBe(20)
    const logged = console.info.mock.calls.map((entry) => JSON.stringify(entry)).join('\n')
    expect(logged).not.toContain(ACCESS_SECRET)
    expect(logged).not.toContain(ACCESS_KEY)
    expect(JSON.stringify(response.body)).not.toContain(ACCESS_SECRET)
  })

  it('rejects a missing, wrong-purpose or wrong-audio consent before ACRCloud', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const audio = audioBytes()
    const missing = await callRoute({ audio, withConsent: false })
    const wrongPurpose = await callRoute({
      audio,
      consent: consentFor(audio, { purpose: analysisConsentPurposes.aiEarInterpret }),
    })
    const wrongAudio = await callRoute({
      audio,
      consent: consentFor(Buffer.from('other-clip')),
    })
    expect(missing.statusCode).toBe(403)
    expect(wrongPurpose.statusCode).toBe(403)
    expect(wrongAudio.statusCode).toBe(403)
    expect(missing.body.error.code).toBe('CONSENT_REQUIRED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rate-limits the owner and does not call ACRCloud', async () => {
    setAiRateLimitAdapterForTests({
      consume() {
        return { limited: true, resetAt: Date.now() + 5000, retryAfterSeconds: 5 }
      },
      type: 'test',
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await callRoute()
    expect(response.statusCode).toBe(429)
    expect(response.body.error.code).toBe('RATE_LIMITED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats no recognition as a normal miss and hides credential failures', async () => {
    const miss = await callAcrCloud({ contentType: 'audio/wav', data: audioBytes(), size: audioBytes().length }, {
      fetchImpl: vi.fn(async () => ({ json: async () => ({ status: { code: 1001 } }), ok: true, status: 200 })),
    })
    expect(miss).toEqual({ matched: false })

    await expect(callAcrCloud({ contentType: 'audio/wav', data: audioBytes(), size: 4 }, {
      fetchImpl: vi.fn(async () => ({ json: async () => ({ status: { code: 3001, msg: ACCESS_SECRET } }), ok: true, status: 200 })),
    })).rejects.toMatchObject({ code: 'serverConfiguration' })

    process.env.ACRCLOUD_HOST = 'evil.example'
    await expect(callAcrCloud({ contentType: 'audio/wav', data: audioBytes(), size: 4 }, {
      fetchImpl: vi.fn(),
    })).rejects.toMatchObject({ code: 'serverConfiguration' })
  })

  it('logs only the ACRCloud status code for 3001 and 3014, never credentials', async () => {
    for (const code of [3001, 3014]) {
      console.warn.mockClear()
      await expect(callAcrCloud({ contentType: 'audio/wav', data: audioBytes(), size: 4 }, {
        fetchImpl: vi.fn(async () => ({ json: async () => ({ status: { code, msg: `${ACCESS_KEY} ${ACCESS_SECRET}` } }), ok: true, status: 200 })),
      })).rejects.toMatchObject({ code: 'serverConfiguration' })
      expect(console.warn).toHaveBeenCalledWith('[api/ai-ear-humming-recognition] ACRCloud rejected credentials', { acrStatus: code })
      const logged = JSON.stringify(console.warn.mock.calls)
      expect(logged).not.toContain(ACCESS_KEY)
      expect(logged).not.toContain(ACCESS_SECRET)
      expect(logged).not.toMatch(/signature|length/i)
    }
  })

  it('trims surrounding whitespace and newlines from the three ACRCloud variables', async () => {
    process.env.ACRCLOUD_HOST = ` ${HOST}\n`
    process.env.ACRCLOUD_ACCESS_KEY = `${ACCESS_KEY}\n`
    process.env.ACRCLOUD_ACCESS_SECRET = ` ${ACCESS_SECRET}\r\n`
    const now = 1_760_000_000_000
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ status: { code: 1001 } }), ok: true, status: 200 }))
    await expect(callAcrCloud({ contentType: 'audio/wav', data: audioBytes(), size: 4 }, { fetchImpl, now })).resolves.toEqual({ matched: false })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`https://${HOST}/v1/identify`)
    expect(init.body.get('access_key')).toBe(ACCESS_KEY)
    expect(init.body.get('signature')).toBe(buildAcrCloudSignature({ accessKey: ACCESS_KEY, accessSecret: ACCESS_SECRET, timestamp: Math.floor(now / 1000) }))
  })
})

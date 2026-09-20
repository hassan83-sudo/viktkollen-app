import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler, { buildAcrCloudSignature, callAcrCloud } from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes } from '../_shared/analysisConsent.js'
import { TEST_CONSENT_SECRET, TEST_USER_ID, callRoute, createRequestFactory, describeCommonProviderRouteBehaviour, jsonResult, stubProviderFetch, wavBytes } from '../_shared/aiEarProviderRoute.testkit.js'

const ENV = { ACRCLOUD_ACCESS_KEY: 'acr-key-SECRET-abc', ACRCLOUD_ACCESS_SECRET: 'acr-secret-SECRET-xyz', ACRCLOUD_HOST: 'identify-eu-west-1.acrcloud.com' }
const purpose = analysisConsentPurposes.audioHummingRecognition
const createRequest = createRequestFactory(purpose)
const humming = (entries) => ({ metadata: { humming: entries }, status: { code: 0, msg: 'Success' } })
const entry = (title, artist, score, album = 'An Album') => ({ album: { name: album }, artists: [{ name: artist }], score, title })

describeCommonProviderRouteBehaviour({
  env: ENV,
  handler,
  name: 'ai-ear-humming',
  okProviderResponse: () => humming([entry('Song A', 'Artist A', 0.88)]),
  providerUrlPart: 'acrcloud.com/v1/identify',
  purpose,
  secretValues: [ENV.ACRCLOUD_ACCESS_SECRET, ENV.ACRCLOUD_ACCESS_KEY],
})

describe('ACRCloud humming recognition (Sprint 12A re-integration)', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { ...originalEnv, ...ENV, ANALYSIS_CONSENT_SECRET: TEST_CONSENT_SECRET }
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (token === 'valid-token' ? { user: { id: TEST_USER_ID } } : { error: { message: 'invalid' } }))
    for (const level of ['info', 'warn', 'error']) vi.spyOn(console, level).mockImplementation(() => {})
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setSupabaseAuthVerifierForTests(null)
  })

  it('builds the documented HMAC-SHA1 signature over the six ACRCloud lines', () => {
    const expected = createHmac('sha1', 'the-secret').update('POST\n/v1/identify\nthe-key\naudio\n1\n1700000000', 'utf8').digest('base64')
    expect(buildAcrCloudSignature({ accessKey: 'the-key', accessSecret: 'the-secret', timestamp: 1700000000 })).toBe(expected)
    expect(buildAcrCloudSignature({ accessKey: 'the-key', accessSecret: 'other', timestamp: 1700000000 })).not.toBe(expected)
    expect(buildAcrCloudSignature({ accessKey: 'the-key', accessSecret: 'the-secret', timestamp: 1700000001 })).not.toBe(expected)
  })

  it('sends key, timestamp, signature and sample - but never the secret itself', async () => {
    const audio = { contentType: 'audio/wav', data: wavBytes(), size: wavBytes().length }
    const fetchMock = vi.fn(async () => jsonResult(200, humming([entry('Song A', 'Artist A', 0.88)])))
    await callAcrCloud(audio, { fetchImpl: fetchMock, now: 1700000000000 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://identify-eu-west-1.acrcloud.com/v1/identify')
    expect(init.body.get('access_key')).toBe(ENV.ACRCLOUD_ACCESS_KEY)
    expect(init.body.get('timestamp')).toBe('1700000000')
    expect(init.body.get('signature')).toBe(buildAcrCloudSignature({ accessKey: ENV.ACRCLOUD_ACCESS_KEY, accessSecret: ENV.ACRCLOUD_ACCESS_SECRET, timestamp: 1700000000 }))
    expect(init.body.get('signature_version')).toBe('1')
    expect(init.body.get('data_type')).toBe('audio')
    expect(init.body.get('sample_bytes')).toBe(String(audio.size))
    expect([...init.body.keys()].join(',')).not.toMatch(/secret/i)
    for (const [, value] of init.body.entries()) expect(String(value)).not.toContain(ENV.ACRCLOUD_ACCESS_SECRET)
  })

  it('returns the best candidate and up to two alternatives (multiple candidates)', async () => {
    stubProviderFetch(() => jsonResult(200, humming([entry('Song A', 'Artist A', 0.88), entry('Song B', 'Artist B', 0.71), entry('Song C', 'Artist C', 0.6), entry('Song D', 'Artist D', 0.5)])))
    const response = await callRoute(handler, createRequest())

    expect(response.statusCode).toBe(200)
    expect(response.body.result).toMatchObject({ artist: 'Artist A', details: { album: 'An Album', provider: 'ACRCloud' }, score: 0.88, title: 'Song A' })
    expect(response.body.result.alternatives).toEqual([{ artist: 'Artist B', score: 0.71, title: 'Song B' }, { artist: 'Artist C', score: 0.6, title: 'Song C' }])
  })

  it('handles candidates without artist, album or score without inventing values', async () => {
    stubProviderFetch(() => jsonResult(200, humming([{ title: 'Bare Title' }])))
    const response = await callRoute(handler, createRequest())

    expect(response.body.result).toMatchObject({ artist: null, details: { album: null }, score: null, title: 'Bare Title' })
  })

  it('treats status 1001 and an empty humming list as "no match"', async () => {
    stubProviderFetch(() => jsonResult(200, { status: { code: 1001, msg: 'No result' } }))
    const noResult = await callRoute(handler, createRequest())
    stubProviderFetch(() => jsonResult(200, humming([])))
    const empty = await callRoute(handler, createRequest())

    for (const response of [noResult, empty]) expect(response.body).toMatchObject({ matched: false, ok: true })
  })

  it('maps ACRCloud credential errors (3001/3014) to "not configured" and other codes to a provider error', async () => {
    stubProviderFetch(() => jsonResult(200, { status: { code: 3014, msg: 'Invalid signature' } }))
    const badSignature = await callRoute(handler, createRequest())
    stubProviderFetch(() => jsonResult(200, { status: { code: 3001, msg: 'Invalid access key' } }))
    const badKey = await callRoute(handler, createRequest())
    stubProviderFetch(() => jsonResult(200, { status: { code: 2005, msg: 'Something else' } }))
    const other = await callRoute(handler, createRequest())

    expect(badSignature.statusCode).toBe(503)
    expect(badKey.statusCode).toBe(503)
    expect(other.statusCode).toBe(502)
    expect(JSON.stringify([badSignature.body, badKey.body, other.body])).not.toMatch(/signature|access key|3014|3001/i)
  })

  it('refuses a malformed host value instead of building a request URL from it', async () => {
    process.env.ACRCLOUD_HOST = 'evil.example/path?x=1#'
    const fetchMock = stubProviderFetch(() => jsonResult(200, humming([])))
    const response = await callRoute(handler, createRequest())

    expect(response.statusCode).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

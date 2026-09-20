import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './aiEarMusicRoute.js'
import { setAiRateLimitAdapterForTests } from './aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from './verifySupabaseUser.js'
import { analysisConsentPurposes } from './analysisConsent.js'
import { TEST_CONSENT_SECRET, TEST_USER_ID, callRoute, createRequestFactory, describeCommonProviderRouteBehaviour, jsonResult, stubProviderFetch } from './aiEarProviderRoute.testkit.js'

const TOKEN = 'audd-test-token-SECRET-123'
const purpose = analysisConsentPurposes.audioMusicRecognition
const createRequest = createRequestFactory(purpose)
const success = { result: { album: 'Test Album', artist: 'Test Artist', release_date: '2019-05-17', title: 'Test Song', label: 'x' }, status: 'success' }

describeCommonProviderRouteBehaviour({
  env: { AUDD_API_TOKEN: TOKEN },
  handler,
  name: 'ai-ear-music',
  okProviderResponse: () => success,
  providerUrlPart: 'api.audd.io',
  purpose,
  secretValues: [TOKEN],
})

describe('AudD music recognition (Sprint 12A re-integration)', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { ...originalEnv, ANALYSIS_CONSENT_SECRET: TEST_CONSENT_SECRET, AUDD_API_TOKEN: TOKEN }
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

  it('returns title, artist, album and release year exactly as the provider gave them', async () => {
    const fetchMock = stubProviderFetch(() => jsonResult(200, success))
    const response = await callRoute(handler, createRequest())

    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({ matched: true, ok: true, result: { artist: 'Test Artist', title: 'Test Song', details: { album: 'Test Album', provider: 'AudD', releaseYear: '2019' } } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.audd.io/')
    expect(init.body.get('api_token')).toBe(TOKEN)
    expect(init.body.get('file')).toBeTruthy()
  })

  it('does not invent metadata the provider did not return', async () => {
    stubProviderFetch(() => jsonResult(200, { result: { title: 'Only Title' }, status: 'success' }))
    const response = await callRoute(handler, createRequest())

    expect(response.body.result).toEqual({ artist: null, details: { album: null, provider: 'AudD', releaseYear: null }, title: 'Only Title' })
  })

  it('reports "no match" as a normal successful result', async () => {
    stubProviderFetch(() => jsonResult(200, { result: null, status: 'success' }))
    const response = await callRoute(handler, createRequest())

    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({ matched: false, ok: true })
    expect(response.body.result).toBeUndefined()
  })

  it('treats a provider "error" status as a generic provider failure', async () => {
    stubProviderFetch(() => jsonResult(200, { error: { error_code: 901, error_message: 'no api_token' }, status: 'error' }))
    const response = await callRoute(handler, createRequest())

    expect(response.statusCode).toBe(502)
    expect(JSON.stringify(response.body)).not.toMatch(/901|api_token/)
  })
})

import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes } from '../_shared/analysisConsent.js'
import { TEST_CONSENT_SECRET, TEST_USER_ID, callRoute, consentHeaderFor, jsonResult, multipartBody, stubProviderFetch, wavBytes } from '../_shared/aiEarProviderRoute.testkit.js'

function post(feature, purpose, { audio = wavBytes() } = {}) {
  const request = Readable.from([multipartBody(audio)])
  request.method = 'POST'
  request.url = `/api/ai-ear-providers?feature=${feature}`
  request.headers = { authorization: 'Bearer valid-token', 'content-type': 'multipart/form-data; boundary=testboundary', ...consentHeaderFor(purpose, audio) }
  return request
}

describe('AI-örat provider dispatcher (single Vercel function)', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { ...originalEnv, ANALYSIS_CONSENT_SECRET: TEST_CONSENT_SECRET, AUDD_API_TOKEN: 'audd-x', ACRCLOUD_ACCESS_KEY: 'k', ACRCLOUD_ACCESS_SECRET: 's', ACRCLOUD_HOST: 'h.acrcloud.com', OPENAI_API_KEY: 'sk-x' }
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

  it('routes each feature to its own provider and nothing else', async () => {
    const fetchMock = stubProviderFetch((url) => {
      if (String(url).includes('audd.io')) return jsonResult(200, { result: null, status: 'success' })
      if (String(url).includes('acrcloud')) return jsonResult(200, { status: { code: 1001 } })
      return jsonResult(200, { text: 'hej' })
    })
    const music = await callRoute(handler, post('music', analysisConsentPurposes.audioMusicRecognition))
    const humming = await callRoute(handler, post('humming', analysisConsentPurposes.audioHummingRecognition))
    const speech = await callRoute(handler, post('speech', analysisConsentPurposes.audioLyricsTranscription))

    expect(music.body).toMatchObject({ matched: false, ok: true })
    expect(humming.body).toMatchObject({ matched: false, ok: true })
    expect(speech.body).toMatchObject({ ok: true, transcript: 'hej' })
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining('api.audd.io'),
      expect.stringContaining('acrcloud.com/v1/identify'),
      expect.stringContaining('api.openai.com'),
    ])
  })

  it('keeps consent purposes separate: a music token does not unlock speech-to-text', async () => {
    const fetchMock = stubProviderFetch(() => jsonResult(200, { text: 'hej' }))
    const response = await callRoute(handler, post('speech', analysisConsentPurposes.audioMusicRecognition))

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown or missing feature without touching any provider', async () => {
    const fetchMock = stubProviderFetch(() => jsonResult(200, {}))
    for (const feature of ['', 'vehicles', 'constructor', '__proto__', 'music/../x']) {
      const response = await callRoute(handler, post(feature, analysisConsentPurposes.audioMusicRecognition))
      expect(response.statusCode, feature).toBe(404)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('serves the availability booleans on GET', async () => {
    const request = Readable.from([])
    request.method = 'GET'
    request.url = '/api/ai-ear-providers'
    request.headers = { authorization: 'Bearer valid-token' }
    const response = await callRoute(handler, request)

    expect(response.statusCode).toBe(200)
    expect(response.body.providers).toEqual({ humming: true, music: true, transcription: true })
  })
})

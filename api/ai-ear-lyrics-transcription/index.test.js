import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler, { audioFileName } from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes } from '../_shared/analysisConsent.js'
import { TEST_CONSENT_SECRET, TEST_USER_ID, callRoute, createRequestFactory, describeCommonProviderRouteBehaviour, jsonResult, stubProviderFetch } from '../_shared/aiEarProviderRoute.testkit.js'

const KEY = 'sk-test-openai-SECRET-key-1234567890'
const purpose = analysisConsentPurposes.audioLyricsTranscription
const createRequest = createRequestFactory(purpose)

describeCommonProviderRouteBehaviour({
  env: { OPENAI_API_KEY: KEY },
  handler,
  name: 'ai-ear-lyrics',
  okProviderResponse: () => ({ text: 'bailando bailando' }),
  providerUrlPart: 'api.openai.com/v1/audio/transcriptions',
  purpose,
  secretValues: [KEY],
})

describe('OpenAI speech-to-text "Ord ur en låt" (Sprint 12A re-integration)', () => {
  const originalEnv = { ...process.env }
  let logs
  beforeEach(() => {
    process.env = { ...originalEnv, ANALYSIS_CONSENT_SECRET: TEST_CONSENT_SECRET, OPENAI_API_KEY: KEY }
    delete process.env.AI_EAR_LYRICS_MODEL
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (token === 'valid-token' ? { user: { id: TEST_USER_ID } } : { error: { message: 'invalid' } }))
    logs = []
    for (const level of ['info', 'warn', 'error', 'log']) vi.spyOn(console, level).mockImplementation((...args) => { logs.push(args) })
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setSupabaseAuthVerifierForTests(null)
  })

  it('returns the transcript with the historical model, endpoint and server-side key', async () => {
    const fetchMock = stubProviderFetch(() => jsonResult(200, { languages: [{ code: 'es' }], text: '  bailando bailando  ' }))
    const response = await callRoute(handler, createRequest())

    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({ language: 'es', noSpeech: false, ok: true, transcript: 'bailando bailando' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(init.body.get('model')).toBe('gpt-transcribe')
    expect(init.body.get('response_format')).toBe('json')
    expect(init.body.get('file').name).toBe('ai-ear-lyrics-clip.wav')
  })

  it('reports empty text as "no speech" instead of inventing words', async () => {
    stubProviderFetch(() => jsonResult(200, { text: '   ' }))
    const response = await callRoute(handler, createRequest())

    expect(response.body).toMatchObject({ noSpeech: true, ok: true, transcript: '' })
    stubProviderFetch(() => jsonResult(200, {}))
    expect((await callRoute(handler, createRequest())).body).toMatchObject({ noSpeech: true, transcript: '' })
  })

  it('maps OpenAI 401/403 (our own key) to "not configured" and 429/5xx to a retryable provider error', async () => {
    stubProviderFetch(() => jsonResult(401, { error: { message: 'Incorrect API key provided: sk-...' } }))
    const unauthorized = await callRoute(handler, createRequest())
    stubProviderFetch(() => jsonResult(429, { error: { message: 'rate limit' } }))
    const limited = await callRoute(handler, createRequest())

    expect(unauthorized.statusCode).toBe(503)
    expect(limited.statusCode).toBe(502)
    expect(limited.body.error.retryable).toBe(true)
    expect(JSON.stringify([unauthorized.body, limited.body])).not.toMatch(/Incorrect API key|sk-/)
  })

  it('never logs the transcript - only its length', async () => {
    const secretWords = 'my private words about something sensitive'
    stubProviderFetch(() => jsonResult(200, { text: secretWords }))
    const response = await callRoute(handler, createRequest())

    expect(response.body.transcript).toBe(secretWords)
    const logText = JSON.stringify(logs)
    expect(logText).not.toContain('private words')
    expect(logText).not.toContain('sensitive')
    expect(logText).toContain(`"transcriptLength":${secretWords.length}`)
  })

  it('does not forward the transcript anywhere except the response (only the OpenAI call is made)', async () => {
    const fetchMock = stubProviderFetch(() => jsonResult(200, { text: 'hello' }))
    await callRoute(handler, createRequest())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.openai.com')
  })

  it('names the upload after its real audio type', () => {
    expect(audioFileName('audio/webm;codecs=opus')).toBe('ai-ear-lyrics-clip.webm')
    expect(audioFileName('audio/mp4')).toBe('ai-ear-lyrics-clip.mp4')
    expect(audioFileName('audio/x-wav')).toBe('ai-ear-lyrics-clip.wav')
    expect(audioFileName('')).toBe('ai-ear-lyrics-clip.webm')
  })
})

/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(async () => ({ authorizationHeader: 'Bearer supabase-session-token', ok: true, userScope: 'user-a' })),
  hasSameAiAuthUser: vi.fn(async () => true),
}))

vi.mock('./security/analysisConsentProof.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, requestAnalysisConsentToken: vi.fn(async () => ({ expiresAt: Date.now() + 120000, imageHash: 'h', token: 'consent-token' })) }
})

import { aiEarProviderTimeoutMs, identifyHumming, identifyMusic, loadAiEarProviderStatus, transcribeSpeech } from './aiEarProviders.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './ai/aiAuthTransport.js'
import { requestAnalysisConsentToken } from './security/analysisConsentProof.js'

const wav = new Blob([new Uint8Array(100)], { type: 'audio/wav' })
const respond = (status, body) => async () => ({ json: async () => body, ok: status < 300, status })
const stubFetch = (responder) => { const mock = vi.fn(responder); vi.stubGlobal('fetch', mock); return mock }

const features = [
  ['identifyMusic', identifyMusic, '/api/ai-ear-music-recognition', 'audio-music-recognition', { matched: true, ok: true, result: { artist: 'Artist', details: { album: 'Album', provider: 'AudD', releaseYear: '2019' }, title: 'Song' } }],
  ['identifyHumming', identifyHumming, '/api/ai-ear-humming-recognition', 'audio-humming-recognition', { matched: true, ok: true, result: { alternatives: [{ artist: 'B', score: 0.5, title: 'Other' }], artist: 'Artist', details: { album: 'Album', provider: 'ACRCloud' }, score: 0.9, title: 'Song' } }],
  ['transcribeSpeech', transcribeSpeech, '/api/ai-ear-lyrics-transcription', 'audio-lyrics-transcription', { language: 'sv', noSpeech: false, ok: true, transcript: 'några ord' }],
]

describe('AI-örat third-party feature client (Sprint 12A)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentAiAuthorization.mockResolvedValue({ authorizationHeader: 'Bearer supabase-session-token', ok: true, userScope: 'user-a' })
    hasSameAiAuthUser.mockResolvedValue(true)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe.each(features)('%s', (name, fn, endpoint, purpose, okPayload) => {
    it('never calls the network without explicit approval', async () => {
      const fetchMock = stubFetch(respond(200, okPayload))
      expect(await fn({ wav })).toMatchObject({ ok: false, reason: 'consent_not_approved' })
      expect(await fn({ consentApproved: 'yes', wav })).toMatchObject({ ok: false })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('posts one multipart audio file to its own endpoint with its own consent purpose', async () => {
      const fetchMock = stubFetch(respond(200, okPayload))
      const outcome = await fn({ consentApproved: true, wav })

      expect(outcome.ok).toBe(true)
      expect(requestAnalysisConsentToken).toHaveBeenCalledWith(expect.objectContaining({ consentApproved: true, images: [{ label: 'audio', source: wav }], purpose }))
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe(endpoint)
      expect(init.method).toBe('POST')
      expect(init.body).toBeInstanceOf(FormData)
      expect(init.body.get('audio')).toBeTruthy()
      expect(init.headers.Authorization).toBe('Bearer supabase-session-token')
      expect(init.headers['x-viktkollen-consent-token']).toBe('consent-token')
      expect(Object.keys(init.headers).join(',')).not.toMatch(/google|audd|acr|openai/i)
    })

    it('requires a session, and drops the result when the user changed', async () => {
      getCurrentAiAuthorization.mockResolvedValueOnce({ errorCode: 'AUTH_REQUIRED', ok: false })
      expect(await fn({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'auth_required' })
      stubFetch(respond(200, okPayload))
      hasSameAiAuthUser.mockResolvedValueOnce(false)
      expect(await fn({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'auth_required' })
    })

    it('maps 400 / 413 / 401 / 429 / 503 not-configured / 5xx / timeouts to friendly reasons', async () => {
      const cases = [
        [400, { error: { code: 'INVALID_REQUEST', reason: 'empty_audio' } }, 'invalid_audio'],
        [413, { error: { code: 'REQUEST_TOO_LARGE' } }, 'too_large'],
        [401, { error: { code: 'AUTH_INVALID' } }, 'auth_required'],
        [403, { error: { code: 'CONSENT_REQUIRED' } }, 'consent_required'],
        [429, { error: { code: 'RATE_LIMITED' } }, 'rate_limited'],
        [503, { error: { code: 'PROVIDER_NOT_CONFIGURED' } }, 'not_available'],
        [502, { error: { code: 'PROVIDER_UNAVAILABLE', retryable: true } }, 'service_unavailable'],
        [504, { error: { code: 'PROVIDER_TIMEOUT' } }, 'timeout'],
      ]
      for (const [status, body, reason] of cases) {
        stubFetch(respond(status, { ...body, ok: false }))
        expect(await fn({ consentApproved: true, wav }), `${status}`).toMatchObject({ ok: false, reason })
      }
    })

    it('reports network failure, malformed payloads, abort and client timeout distinctly', async () => {
      stubFetch(async () => { throw new TypeError('Failed to fetch') })
      expect(await fn({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'network', retryable: true })
      stubFetch(respond(200, { ok: true, matched: true, result: {} }))
      if (name !== 'transcribeSpeech') expect(await fn({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'invalid_response' })
      stubFetch(async () => ({ json: async () => { throw new Error('bad json') }, ok: true, status: 200 }))
      expect(await fn({ consentApproved: true, wav })).toMatchObject({ ok: false })

      const controller = new AbortController()
      stubFetch(async (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) }))
      const pending = fn({ consentApproved: true, signal: controller.signal, wav })
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
      controller.abort('userCancel')
      expect(await pending).toMatchObject({ ok: false, reason: 'aborted' })

      vi.useFakeTimers()
      stubFetch(async (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) }))
      const timedOut = fn({ consentApproved: true, wav })
      await vi.advanceTimersByTimeAsync(aiEarProviderTimeoutMs + 10)
      expect(await timedOut).toMatchObject({ ok: false, reason: 'timeout', retryable: true })
    })
  })

  it('music: returns only fields the provider returned and reports "no match" as ok', async () => {
    stubFetch(respond(200, { matched: true, ok: true, result: { artist: 'A', details: { provider: 'AudD' }, title: 'T' } }))
    expect(await identifyMusic({ consentApproved: true, wav })).toEqual({ matched: true, ok: true, result: { album: null, artist: 'A', provider: 'AudD', releaseYear: null, title: 'T' } })
    stubFetch(respond(200, { matched: false, ok: true }))
    expect(await identifyMusic({ consentApproved: true, wav })).toEqual({ matched: false, ok: true })
  })

  it('humming: keeps up to two alternatives and never passes the provider score to the UI', async () => {
    stubFetch(respond(200, { matched: true, ok: true, result: { alternatives: [{ artist: 'B', score: 0.5, title: 'B1' }, { artist: 'C', score: 0.4, title: 'C1' }, { artist: 'D', score: 0.3, title: 'D1' }], artist: 'A', details: { album: 'Al', provider: 'ACRCloud' }, score: 0.93, title: 'A1' } }))
    const outcome = await identifyHumming({ consentApproved: true, wav })

    expect(outcome.result.alternatives).toEqual([{ artist: 'B', title: 'B1' }, { artist: 'C', title: 'C1' }])
    expect(JSON.stringify(outcome)).not.toMatch(/score|0\.93|0\.5/)
  })

  it('transcription: empty text is "no speech"; text is trimmed and length-limited', async () => {
    stubFetch(respond(200, { noSpeech: true, ok: true, transcript: '' }))
    expect(await transcribeSpeech({ consentApproved: true, wav })).toMatchObject({ noSpeech: true, ok: true, transcript: '' })
    stubFetch(respond(200, { language: 'sv', noSpeech: false, ok: true, transcript: `  ${'a'.repeat(3000)}  ` }))
    expect((await transcribeSpeech({ consentApproved: true, wav })).transcript).toHaveLength(2000)
  })

  it('does not include the session, consent token or transcript in returned failure reasons', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    expect(JSON.stringify(await transcribeSpeech({ consentApproved: true, wav }))).not.toMatch(/Bearer|supabase-session-token|consent-token/)
  })

  describe('provider availability', () => {
    it('reads the three booleans and fails closed on every problem', async () => {
      stubFetch(respond(200, { ok: true, providers: { humming: true, music: false, transcription: true } }))
      expect(await loadAiEarProviderStatus()).toEqual({ humming: true, music: false, transcription: true })
      stubFetch(respond(503, { ok: false }))
      expect(await loadAiEarProviderStatus()).toEqual({ humming: false, music: false, transcription: false })
      stubFetch(async () => { throw new TypeError('offline') })
      expect(await loadAiEarProviderStatus()).toEqual({ humming: false, music: false, transcription: false })
      getCurrentAiAuthorization.mockResolvedValueOnce({ ok: false })
      expect(await loadAiEarProviderStatus()).toEqual({ humming: false, music: false, transcription: false })
    })
  })
})

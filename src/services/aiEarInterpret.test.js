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

import { aiEarInterpretTimeoutMs, interpretAiEarAudio, mapAiEarHttpError } from './aiEarInterpret.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './ai/aiAuthTransport.js'
import { requestAnalysisConsentToken } from './security/analysisConsentProof.js'

const wav = new Blob([new Uint8Array(100)], { type: 'audio/wav' })
const okPayload = { ok: true, result: { speciesDisposition: 'withhold', state: 'speech' } }

function stubFetch(responder) {
  const fetchMock = vi.fn(responder)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const respond = (status, body) => async () => ({ json: async () => body, ok: status < 300, status })

describe('AI-örat client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentAiAuthorization.mockResolvedValue({ authorizationHeader: 'Bearer supabase-session-token', ok: true, userScope: 'user-a' })
    hasSameAiAuthUser.mockResolvedValue(true)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('never calls the network without explicit approval', async () => {
    const fetchMock = stubFetch(respond(200, okPayload))
    expect(await interpretAiEarAudio({ wav })).toMatchObject({ ok: false, reason: 'consent_not_approved' })
    expect(await interpretAiEarAudio({ consentApproved: 'yes', wav })).toMatchObject({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the WAV to our own hop with the Supabase session and consent token only', async () => {
    const fetchMock = stubFetch(respond(200, okPayload))
    const outcome = await interpretAiEarAudio({ consentApproved: true, wav })

    expect(outcome).toEqual({ ok: true, result: okPayload.result })
    expect(requestAnalysisConsentToken).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'ai-ear-interpret', consentApproved: true }))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ai-ear/interpret?locale=sv-SE')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(wav)
    expect(init.headers.Authorization).toBe('Bearer supabase-session-token')
    expect(init.headers['Content-Type']).toBe('audio/wav')
    expect(Object.keys(init.headers).join(',')).not.toMatch(/google/i)
  })

  it('reports auth required when there is no session', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ errorCode: 'AUTH_REQUIRED', ok: false })
    const fetchMock = stubFetch(respond(200, okPayload))
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'auth_required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops the result if the signed-in user changed during the call', async () => {
    stubFetch(respond(200, okPayload))
    hasSameAiAuthUser.mockResolvedValue(false)
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'auth_required' })
  })

  it('maps HTTP errors to UI reasons', () => {
    expect(mapAiEarHttpError(400, { error: { reason: 'audio_decode_failed' } }).reason).toBe('invalid_audio')
    expect(mapAiEarHttpError(415, { error: { reason: 'unsupported_media' } }).reason).toBe('unsupported_media')
    expect(mapAiEarHttpError(413, {}).reason).toBe('too_large')
    expect(mapAiEarHttpError(401, {}).reason).toBe('auth_required')
    expect(mapAiEarHttpError(403, { error: { code: 'CONSENT_REQUIRED' } }).reason).toBe('consent_required')
    expect(mapAiEarHttpError(429, {}).reason).toBe('rate_limited')
    expect(mapAiEarHttpError(504, {}).reason).toBe('timeout')
    expect(mapAiEarHttpError(502, { error: { code: 'PROVIDER_UNAVAILABLE' } })).toEqual({ reason: 'service_unavailable', retryable: true })
    // a hop-to-Cloud-Run auth problem surfaces as a generic service error, never as an auth message
    expect(mapAiEarHttpError(403, { error: { code: 'PROVIDER_UNAVAILABLE' } }).reason).toBe('service_unavailable')
  })

  it('returns mapped errors for 400 / 413 / 5xx responses', async () => {
    stubFetch(respond(400, { error: { code: 'INVALID_REQUEST', reason: 'empty_audio' }, ok: false }))
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'invalid_audio' })
    stubFetch(respond(413, { error: { code: 'REQUEST_TOO_LARGE' }, ok: false }))
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'too_large' })
    stubFetch(respond(502, { error: { code: 'PROVIDER_UNAVAILABLE', retryable: true }, ok: false }))
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'service_unavailable', retryable: true })
  })

  it('maps a consent-endpoint network failure to a retryable network error', async () => {
    requestAnalysisConsentToken.mockRejectedValueOnce(new Error('consent_token_network_error'))
    const fetchMock = stubFetch(respond(200, okPayload))
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'network', retryable: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a malformed success payload as invalid_response', async () => {
    stubFetch(respond(200, { ok: true, result: { nostate: true } }))
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'invalid_response' })
    stubFetch(async () => ({ json: async () => { throw new Error('bad json') }, ok: true, status: 200 }))
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false })
  })

  it('reports a network failure and an explicit abort distinctly', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    expect(await interpretAiEarAudio({ consentApproved: true, wav })).toMatchObject({ ok: false, reason: 'network', retryable: true })

    const controller = new AbortController()
    stubFetch(async (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = interpretAiEarAudio({ consentApproved: true, signal: controller.signal, wav })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    controller.abort('userCancel')
    expect(await pending).toMatchObject({ ok: false, reason: 'aborted' })
  })

  it('times out after the configured limit and lets the user retry', async () => {
    vi.useFakeTimers()
    stubFetch(async (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = interpretAiEarAudio({ consentApproved: true, wav })
    await vi.advanceTimersByTimeAsync(aiEarInterpretTimeoutMs + 10)
    expect(await pending).toMatchObject({ ok: false, reason: 'timeout', retryable: true })
  })

  it('does not include audio, tokens or the session in any thrown/returned reason', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    const outcome = await interpretAiEarAudio({ consentApproved: true, wav })
    expect(JSON.stringify(outcome)).not.toMatch(/Bearer|supabase-session-token|consent-token/)
  })
})

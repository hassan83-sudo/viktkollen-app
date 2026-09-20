import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setAiRateLimitAdapterForTests } from './aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from './verifySupabaseUser.js'
import { computeCanonicalImageHash, issueAnalysisConsentToken } from './analysisConsent.js'

export const TEST_CONSENT_SECRET = 'test-analysis-consent-secret-32-plus'
export const TEST_USER_ID = 'ear-provider-user'

export function wavBytes(extra = 128) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(36 + extra, 4); header.write('WAVE', 8, 'ascii')
  return Buffer.concat([header, Buffer.alloc(extra, 7)])
}

export function multipartBody(audio = wavBytes(), { boundary = 'testboundary', contentType = 'audio/wav', field = 'audio', filename = 'clip' } = {}) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`, 'latin1'),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
  ])
}

export function consentHeaderFor(purpose, audio, userId = TEST_USER_ID) {
  const issued = issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_CONSENT_SECRET },
    imageHash: computeCanonicalImageHash([{ bytes: audio, label: 'audio' }]),
    purpose,
    userId,
  })
  expect(issued.ok).toBe(true)
  return { 'x-viktkollen-consent-token': issued.token }
}

export function createRequestFactory(purpose) {
  return function createRequest({ audio = wavBytes(), body, contentType = 'multipart/form-data; boundary=testboundary', headers = {}, method = 'POST', token = 'valid-token', withConsent = true, audioContentType = 'audio/wav' } = {}) {
    const payload = body === undefined ? multipartBody(audio, { contentType: audioContentType }) : body
    const request = Readable.from(payload ? [payload] : [])
    request.method = method
    request.headers = {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': contentType,
      ...(withConsent ? consentHeaderFor(purpose, audio) : {}),
      ...headers,
    }
    return request
  }
}

export function createResponse() {
  const response = {
    body: null, headers: {}, statusCode: 200,
    json: vi.fn((body) => { response.body = body; return response }),
    setHeader: vi.fn((name, value) => { response.headers[name] = value }),
    status: vi.fn((code) => { response.statusCode = code; return response }),
  }
  return response
}

export async function callRoute(handler, request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

export function jsonResult(status, body) {
  return { json: async () => body, ok: status >= 200 && status < 300, status }
}

/** Installs a global fetch mock (provider). Returns the mock so tests can inspect calls. */
export function stubProviderFetch(responder) {
  const fetchMock = vi.fn(async (url, init) => responder(url, init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/**
 * Common behaviour of all three provider routes (Sprint 12A).
 * @param {object} options
 * @param {string} options.name
 * @param {Function} options.handler
 * @param {string} options.purpose
 * @param {Record<string,string>} options.env   provider env making the route "configured"
 * @param {() => object} options.okProviderResponse   a valid provider success payload
 * @param {string[]} options.secretValues  values that must never appear in responses/logs
 */
export function describeCommonProviderRouteBehaviour({ env, handler, name, okProviderResponse, providerUrlPart, purpose, secretValues }) {
  describe(`${name}: common route behaviour`, () => {
    const originalEnv = { ...process.env }
    const createRequest = createRequestFactory(purpose)
    let logs

    beforeEach(() => {
      vi.restoreAllMocks()
      process.env = { ...originalEnv, ...env, ANALYSIS_CONSENT_SECRET: TEST_CONSENT_SECRET }
      setAiRateLimitAdapterForTests()
      setSupabaseAuthVerifierForTests(async (token) => (token === 'valid-token' ? { user: { id: TEST_USER_ID } } : { error: { message: 'invalid' } }))
      logs = []
      for (const level of ['info', 'warn', 'error']) vi.spyOn(console, level).mockImplementation((...args) => { logs.push(args) })
    })
    afterEach(() => {
      process.env = { ...originalEnv }
      vi.unstubAllGlobals()
      setSupabaseAuthVerifierForTests(null)
      setAiRateLimitAdapterForTests()
    })

    it('accepts POST only', async () => {
      const response = await callRoute(handler, createRequest({ method: 'GET' }))
      expect(response.statusCode).toBe(405)
      expect(response.headers['Cache-Control']).toContain('no-store')
    })

    it('requires multipart/form-data', async () => {
      const fetchMock = stubProviderFetch(() => jsonResult(200, okProviderResponse()))
      const response = await callRoute(handler, createRequest({ contentType: 'application/json' }))
      expect(response.statusCode).toBe(415)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('requires an authenticated user before anything is read or sent', async () => {
      const fetchMock = stubProviderFetch(() => jsonResult(200, okProviderResponse()))
      const missing = await callRoute(handler, createRequest({ token: '' }))
      const bad = await callRoute(handler, createRequest({ token: 'not-valid' }))
      expect(missing.statusCode).toBe(401)
      expect(bad.statusCode).toBe(401)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('requires a consent token bound to these exact audio bytes and this purpose', async () => {
      const fetchMock = stubProviderFetch(() => jsonResult(200, okProviderResponse()))
      const missing = await callRoute(handler, createRequest({ withConsent: false }))
      const otherAudio = wavBytes(300)
      const wrongAudio = await callRoute(handler, createRequest({ headers: consentHeaderFor(purpose, otherAudio), withConsent: false }))
      const otherPurpose = purpose === 'audio-music-recognition' ? 'audio-humming-recognition' : 'audio-music-recognition'
      const wrongPurpose = await callRoute(handler, createRequest({ headers: consentHeaderFor(otherPurpose, wavBytes()), withConsent: false }))
      for (const response of [missing, wrongAudio, wrongPurpose]) {
        expect(response.statusCode).toBe(403)
        expect(response.body.error.code).toBe('CONSENT_REQUIRED')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects invalid audio: empty, unsupported type, missing field, oversized, malformed body', async () => {
      const fetchMock = stubProviderFetch(() => jsonResult(200, okProviderResponse()))
      const empty = await callRoute(handler, createRequest({ body: Buffer.alloc(0), withConsent: false }))
      const wrongType = await callRoute(handler, createRequest({ audioContentType: 'application/pdf' }))
      const wrongField = await callRoute(handler, createRequest({ body: multipartBody(wavBytes(), { field: 'file' }) }))
      const huge = await callRoute(handler, createRequest({ audio: Buffer.alloc(5 * 1024 * 1024, 1) }))
      const garbage = await callRoute(handler, createRequest({ body: Buffer.from('not multipart at all'), withConsent: false }))
      expect(empty.statusCode).toBe(400)
      expect(wrongType.statusCode).toBe(415)
      expect(wrongField.statusCode).toBe(400)
      expect(huge.statusCode).toBe(413)
      expect(huge.body.error.code).toBe('REQUEST_TOO_LARGE')
      expect(garbage.statusCode).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
      for (const response of [empty, wrongType, wrongField, huge, garbage]) expect(JSON.stringify(response.body)).not.toMatch(/Traceback|at \w+ \(/)
    })

    it('survives a client that aborts the upload mid-stream', async () => {
      const fetchMock = stubProviderFetch(() => jsonResult(200, okProviderResponse()))
      const request = createRequest()
      request[Symbol.asyncIterator] = () => ({ next: async () => { throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' }) } })
      const response = await callRoute(handler, request)
      expect(response.statusCode).toBe(400)
      expect(response.body.error.code).toBe('REQUEST_ABORTED')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('answers "not configured" (503) without contacting the provider when credentials are missing', async () => {
      for (const key of Object.keys(env)) process.env[key] = ''
      const fetchMock = stubProviderFetch(() => jsonResult(200, okProviderResponse()))
      const response = await callRoute(handler, createRequest())
      expect(response.statusCode).toBe(503)
      expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rate limits per user', async () => {
      stubProviderFetch(() => jsonResult(200, okProviderResponse()))
      const limitEnv = { 'ai-ear-music': 'AI_EAR_MUSIC_RATE_LIMIT_MAX', 'ai-ear-humming': 'AI_EAR_HUMMING_RATE_LIMIT_MAX', 'ai-ear-lyrics': 'AI_EAR_LYRICS_RATE_LIMIT_MAX' }
      process.env[limitEnv[name]] = '1'
      const first = await callRoute(handler, createRequest())
      const second = await callRoute(handler, createRequest())
      expect(first.statusCode).toBe(200)
      expect(second.statusCode).toBe(429)
      expect(second.headers['Retry-After']).toBeTruthy()
    })

    it('maps provider 5xx and network failure to a retryable generic error, and a timeout to 504', async () => {
      stubProviderFetch(() => jsonResult(503, { detail: 'internal provider failure secret-detail' }))
      const serverError = await callRoute(handler, createRequest())
      stubProviderFetch(() => { throw new TypeError('fetch failed secret-detail') })
      const network = await callRoute(handler, createRequest())
      stubProviderFetch(() => { const error = new Error('aborted'); error.name = 'AbortError'; throw error })
      const timeout = await callRoute(handler, createRequest())
      expect(serverError.statusCode).toBe(502)
      expect(serverError.body.error.retryable).toBe(true)
      expect(network.statusCode).toBe(502)
      expect(timeout.statusCode).toBe(504)
      expect(timeout.body.error.code).toBe('PROVIDER_TIMEOUT')
      for (const response of [serverError, network, timeout]) expect(JSON.stringify(response.body)).not.toContain('secret-detail')
    })

    it('rejects a malformed provider response', async () => {
      stubProviderFetch(async () => ({ json: async () => { throw new Error('bad json') }, ok: true, status: 200 }))
      const response = await callRoute(handler, createRequest())
      expect(response.statusCode).toBe(502)
      expect(response.body.error.code).toBe('PROVIDER_INVALID_RESPONSE')
    })

    it('sends only the audio to its own provider and never leaks credentials into responses or logs', async () => {
      const fetchMock = stubProviderFetch(() => jsonResult(200, okProviderResponse()))
      const response = await callRoute(handler, createRequest())
      const failing = stubProviderFetch(() => jsonResult(500, {}))
      const failed = await callRoute(handler, createRequest())
      expect(response.statusCode).toBe(200)
      expect(failed.statusCode).toBe(502)
      expect(fetchMock.mock.calls).toHaveLength(1)
      expect(String(fetchMock.mock.calls[0][0])).toContain(providerUrlPart)
      expect(failing).toHaveBeenCalledTimes(1)
      const everything = JSON.stringify([response.body, failed.body, response.headers, logs])
      for (const secret of secretValues) expect(everything).not.toContain(secret)
      expect(everything).not.toMatch(/Bearer |valid-token/)
    })
  })
}

import { generateKeyPairSync } from 'node:crypto'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { setAiRateLimitAdapterForTests } from '../../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from '../../_shared/analysisConsent.js'
import { clearGoogleIdTokenCacheForTests } from '../../_shared/googleIdToken.js'

const TEST_SECRET = 'test-analysis-consent-secret-32-plus'
const USER_ID = 'ear-user-a'
const BACKEND = 'https://perch-inference.example.run.app'
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
})
const SERVICE_ACCOUNT = JSON.stringify({ client_email: 'ear-hop@example.iam.gserviceaccount.com', private_key: privateKey })
const FAKE_ID_TOKEN = `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.sig`

function wavBytes(extra = 64) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + extra, 4)
  header.write('WAVE', 8, 'ascii')
  return Buffer.concat([header, Buffer.alloc(extra, 1)])
}

function consentHeader(audio) {
  const issued = issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    imageHash: computeCanonicalImageHash([{ bytes: audio, label: 'image' }]),
    purpose: analysisConsentPurposes.aiEarInterpret,
    userId: USER_ID,
  })
  expect(issued.ok).toBe(true)
  return { 'x-viktkollen-consent-token': issued.token }
}

function createRequest({ body = wavBytes(), contentType = 'audio/wav', headers = {}, method = 'POST', token = 'valid-token', url = '/api/ai-ear/interpret', withConsent = true } = {}) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.url = url
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': contentType,
    ...(withConsent && body ? consentHeader(body) : {}),
    ...headers,
  }
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

async function callRoute(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

const backendSuccess = {
  apiVersion: 2,
  errors: [],
  flags: { caveat: false, partialModels: false, provisionalP1Applied: false },
  interpretedResult: {
    reasonCodes: ['SPECIES_EVIDENCE_LEADING'],
    speciesCandidates: [{ ebirdCode: 'eurrob1', label: 'Erithacus rubecula', rank: 1 }],
    speciesDisposition: 'lead',
    state: 'species_candidate',
  },
  modelMetadata: { router: { version: '10v.0' } },
  rawEvidence: { perch: { predictions: [{ label: 'SECRET_RAW', rawScore: 12.3 }] } },
  requestId: 'x',
  signalMetadata: { durationSec: 5, nearSilence: false, tooShort: false, truncated: false },
  timing: { totalMs: 200 },
  userFacing: { body: null, contextLines: [], copyKey: 'species_lead', headline: 'Det låter mest som rödhake (Erithacus rubecula).', locale: 'sv-SE', speciesLines: ['rödhake (Erithacus rubecula)'] },
}

function jsonResponse(status, body) {
  return { json: async () => body, ok: status >= 200 && status < 300, status }
}

function stubFetch({ backend = () => jsonResponse(200, backendSuccess), google = () => jsonResponse(200, { id_token: FAKE_ID_TOKEN }) } = {}) {
  const calls = { backend: [], google: [] }
  const fetchMock = vi.fn(async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      calls.google.push({ init, url })
      return google(url, init)
    }
    calls.backend.push({ init, url })
    return backend(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

describe('AI-örat server-side hop', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = {
      ...originalEnv,
      AI_EAR_BACKEND_URL: BACKEND,
      AI_EAR_ENABLED: 'true',
      AI_EAR_GCP_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
      ANALYSIS_CONSENT_SECRET: TEST_SECRET,
    }
    clearGoogleIdTokenCacheForTests()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (token === 'valid-token' ? { user: { id: USER_ID } } : { error: { message: 'invalid' } }))
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
  })

  it('returns a reduced, validated result for valid audio and calls Cloud Run with a Google ID token', async () => {
    const calls = stubFetch()
    const response = await callRoute(createRequest())

    expect(response.statusCode).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.result.state).toBe('species_candidate')
    expect(response.body.result.speciesDisposition).toBe('lead')
    expect(response.body.result.speciesCandidates).toEqual([{ ebirdCode: 'eurrob1', label: 'Erithacus rubecula', rank: 1 }])
    expect(response.body.result.userFacing.headline).toContain('rödhake')
    expect(response.headers['Cache-Control']).toContain('no-store')

    expect(calls.google).toHaveLength(1)
    expect(calls.google[0].init.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    expect(calls.backend).toHaveLength(1)
    expect(calls.backend[0].url).toBe(`${BACKEND}/v2/interpret`)
    expect(calls.backend[0].init.headers.Authorization).toBe(`Bearer ${FAKE_ID_TOKEN}`)
    const form = calls.backend[0].init.body
    expect(form.get('locale')).toBe('sv-SE')
    expect(form.has('includeRawEvidence')).toBe(false)
  })

  it('never returns raw evidence, scores, timing or model internals', async () => {
    stubFetch()
    const response = await callRoute(createRequest())
    const text = JSON.stringify(response.body)

    expect(text).not.toContain('SECRET_RAW')
    expect(text).not.toContain('rawScore')
    expect(text).not.toContain('rawEvidence')
    expect(text).not.toContain('timing')
    expect(text).not.toContain('sha256')
  })

  it('withholds species for non-bird states even if the backend sent candidates', async () => {
    stubFetch({
      backend: () => jsonResponse(200, {
        ...backendSuccess,
        interpretedResult: { ...backendSuccess.interpretedResult, speciesDisposition: 'withhold', state: 'speech' },
        userFacing: { ...backendSuccess.userFacing, speciesLines: ['rödhake'] },
      }),
    })
    const response = await callRoute(createRequest())

    expect(response.body.result.state).toBe('speech')
    expect(response.body.result.speciesCandidates).toEqual([])
    expect(response.body.result.userFacing.speciesLines).toEqual([])
  })

  it('accepts POST only', async () => {
    const response = await callRoute(createRequest({ method: 'GET' }))
    expect(response.statusCode).toBe(405)
  })

  it('answers "not configured" and touches no network when the server switch is off', async () => {
    process.env.AI_EAR_ENABLED = 'false'
    const calls = stubFetch()
    const response = await callRoute(createRequest())

    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
    expect(calls.google).toHaveLength(0)
    expect(calls.backend).toHaveLength(0)
  })

  it('requires Supabase auth before reading audio or contacting Google/Cloud Run', async () => {
    const calls = stubFetch()
    const response = await callRoute(createRequest({ token: '' }))

    expect(response.statusCode).toBe(401)
    expect(calls.google).toHaveLength(0)
    expect(calls.backend).toHaveLength(0)
  })

  it('rejects a wrong origin', async () => {
    const calls = stubFetch()
    const response = await callRoute(createRequest({ headers: { host: 'viktkollen.app', origin: 'https://evil.example' } }))

    expect(response.statusCode).toBe(403)
    expect(calls.backend).toHaveLength(0)
  })

  it('rejects non-WAV content types and non-WAV bytes (400/415 class) without contacting the backend', async () => {
    const calls = stubFetch()
    const wrongType = await callRoute(createRequest({ contentType: 'application/json' }))
    const notWav = await callRoute(createRequest({ body: Buffer.from('this is definitely not a wav file, just text.....') }))

    expect(wrongType.statusCode).toBe(415)
    expect(notWav.statusCode).toBe(415)
    expect(calls.backend).toHaveLength(0)
  })

  it('rejects an oversized request with 413 before any backend call', async () => {
    process.env.AI_EAR_MAX_BYTES = '1000'
    const calls = stubFetch()
    const response = await callRoute(createRequest({ body: wavBytes(5000) }))

    expect(response.statusCode).toBe(413)
    expect(response.body.error.code).toBe('REQUEST_TOO_LARGE')
    expect(calls.backend).toHaveLength(0)
  })

  it('survives a client that aborts the upload mid-stream (no crash, no backend call)', async () => {
    const calls = stubFetch()
    const request = createRequest()
    request[Symbol.asyncIterator] = () => ({ next: async () => { throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' }) } })
    const response = await callRoute(request)

    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('REQUEST_ABORTED')
    expect(calls.google).toHaveLength(0)
    expect(calls.backend).toHaveLength(0)
  })

  it('requires a consent token bound to these exact audio bytes', async () => {
    const calls = stubFetch()
    const missing = await callRoute(createRequest({ withConsent: false }))
    const other = wavBytes(80)
    const wrongAudio = await callRoute(createRequest({ body: wavBytes(64), headers: consentHeader(other) }))

    expect(missing.statusCode).toBe(403)
    expect(missing.body.error.code).toBe('CONSENT_REQUIRED')
    expect(wrongAudio.statusCode).toBe(403)
    expect(calls.backend).toHaveLength(0)
  })

  it('maps backend 400 to a client-safe reason code', async () => {
    stubFetch({ backend: () => jsonResponse(400, { error: { code: 'audio_decode_failed', message: 'Could not decode the audio file' } }) })
    const response = await callRoute(createRequest())

    expect(response.statusCode).toBe(400)
    expect(response.body.error.reason).toBe('audio_decode_failed')
  })

  it('maps backend 413 to REQUEST_TOO_LARGE', async () => {
    stubFetch({ backend: () => jsonResponse(413, { error: { code: 'upload_too_large' } }) })
    const response = await callRoute(createRequest())

    expect(response.statusCode).toBe(413)
    expect(response.body.error.code).toBe('REQUEST_TOO_LARGE')
  })

  it('maps backend 5xx to a retryable generic error without leaking backend details', async () => {
    stubFetch({ backend: () => jsonResponse(503, { detail: 'internal model path /models/perch.onnx' }) })
    const response = await callRoute(createRequest())

    expect(response.statusCode).toBe(502)
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(response.body.error.retryable).toBe(true)
    expect(JSON.stringify(response.body)).not.toContain('perch.onnx')
  })

  it('maps a backend timeout to 504 PROVIDER_TIMEOUT', async () => {
    stubFetch({ backend: () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error } })
    const response = await callRoute(createRequest())

    expect(response.statusCode).toBe(504)
    expect(response.body.error.code).toBe('PROVIDER_TIMEOUT')
    expect(response.body.error.retryable).toBe(true)
  })

  it('turns Cloud Run 401/403 (our own auth misconfiguration) into a generic error without auth details', async () => {
    stubFetch({ backend: () => jsonResponse(403, { message: 'Forbidden: caller lacks run.invoker' }) })
    const response = await callRoute(createRequest())

    expect(response.statusCode).toBe(502)
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(JSON.stringify(response.body)).not.toMatch(/run\.invoker|Forbidden|Bearer|google/i)
  })

  it('fails generically when the Google credential is missing or Google refuses to mint a token', async () => {
    process.env.AI_EAR_GCP_SERVICE_ACCOUNT_JSON = ''
    let calls = stubFetch()
    const missing = await callRoute(createRequest())
    expect(missing.statusCode).toBe(502)
    expect(calls.backend).toHaveLength(0)

    process.env.AI_EAR_GCP_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT
    clearGoogleIdTokenCacheForTests()
    calls = stubFetch({ google: () => jsonResponse(400, { error: 'invalid_grant', error_description: 'secret detail' }) })
    const refused = await callRoute(createRequest())
    expect(refused.statusCode).toBe(502)
    expect(JSON.stringify(refused.body)).not.toContain('invalid_grant')
    expect(calls.backend).toHaveLength(0)
  })

  it('rejects a malformed backend response with PROVIDER_INVALID_RESPONSE', async () => {
    stubFetch({ backend: () => jsonResponse(200, { apiVersion: 2, interpretedResult: { state: 'definitely_a_bird', speciesDisposition: 'lead' } }) })
    const badState = await callRoute(createRequest())
    stubFetch({ backend: () => jsonResponse(200, 'not an object') })
    const notObject = await callRoute(createRequest())

    expect(badState.statusCode).toBe(502)
    expect(badState.body.error.code).toBe('PROVIDER_INVALID_RESPONSE')
    expect(notObject.body.error.code).toBe('PROVIDER_INVALID_RESPONSE')
  })

  it('rate limits per user', async () => {
    process.env.AI_EAR_RATE_LIMIT_MAX = '1'
    stubFetch()
    const first = await callRoute(createRequest())
    const second = await callRoute(createRequest())

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(429)
    expect(second.headers['Retry-After']).toBeTruthy()
  })

  it('caches the Google ID token across requests', async () => {
    const calls = stubFetch()
    await callRoute(createRequest())
    await callRoute(createRequest())

    expect(calls.google).toHaveLength(1)
    expect(calls.backend).toHaveLength(2)
  })

  it('does not leak secrets, tokens, audio or file names into logs or responses', async () => {
    const logs = []
    console.info.mockImplementation((...args) => logs.push(args))
    console.warn.mockImplementation((...args) => logs.push(args))
    console.error.mockImplementation((...args) => logs.push(args))
    stubFetch({ backend: () => jsonResponse(503, { detail: 'x' }) })
    const ok = await callRoute(createRequest())
    stubFetch()
    const fine = await callRoute(createRequest())

    const everything = JSON.stringify([logs, ok.body, fine.body, ok.headers, fine.headers])
    expect(everything).not.toContain(privateKey.slice(30, 80))
    expect(everything).not.toContain('gserviceaccount')
    expect(everything).not.toContain(FAKE_ID_TOKEN)
    expect(everything).not.toContain('valid-token')
    expect(everything).not.toContain('audio.wav')
    expect(everything).not.toMatch(/Bearer/)
  })
})

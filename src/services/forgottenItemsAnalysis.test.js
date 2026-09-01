/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(async () => ({
    authorizationHeader: 'Bearer forgotten-items-access-token',
    ok: true,
    userScope: 'forgotten-items-user-a',
  })),
  hasSameAiAuthUser: vi.fn(async () => true),
}))

vi.mock('./security/analysisConsentProof.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    requestAnalysisConsentToken: vi.fn(async () => ({
      expiresAt: Date.now() + 120000,
      imageHash: 'test-canonical-hash',
      token: 'test-consent-token',
    })),
  }
})

import { analyzeForgottenItemsPhoto, forgottenItemsAnalysisTimeoutMs } from './forgottenItemsAnalysis.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './ai/aiAuthTransport.js'
import { requestAnalysisConsentToken } from './security/analysisConsentProof.js'

const items = [{ id: 'phone', label: 'Mobil' }, { id: 'keys', label: 'Nycklar' }]

function createCanvas({ blob = new Blob(['frame'], { type: 'image/jpeg' }), fails = false } = {}) {
  return {
    toBlob: (callback) => {
      if (fails) {
        callback(null)
        return
      }
      callback(blob)
    },
  }
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { json: async () => body, ok, status }
}

describe('forgottenItemsAnalysis (client)', () => {
  // jsdom does not always expose 'onLine' as an own property on
  // window.navigator (it can live on the Navigator prototype instead), so
  // capturing/restoring a property descriptor here is unreliable - a
  // missing descriptor silently skipped the afterEach restore entirely,
  // letting the offline test's override leak into every test that ran
  // after it in this file. Setting an explicit own-property value in both
  // beforeEach and afterEach removes that dependency on jsdom's default
  // navigator.onLine shape: every test unconditionally starts and ends
  // with onLine === true, and only the offline test's own body may
  // override it to false for its own duration.
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    getCurrentAiAuthorization.mockResolvedValue({
      authorizationHeader: 'Bearer forgotten-items-access-token',
      ok: true,
      userScope: 'forgotten-items-user-a',
    })
    hasSameAiAuthUser.mockResolvedValue(true)
    requestAnalysisConsentToken.mockResolvedValue({
      expiresAt: Date.now() + 120000,
      imageHash: 'test-canonical-hash',
      token: 'test-consent-token',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  })

  it('never calls the consent-token endpoint or the analysis endpoint without explicit consentApproved === true', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: false, items })

    expect(result).toEqual({ ok: false, reason: 'consent_not_approved' })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(requestAnalysisConsentToken).not.toHaveBeenCalled()
  })

  it('also fails closed for a truthy-but-not-exactly-true consentApproved value', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: 'yes', items })

    expect(result).toEqual({ ok: false, reason: 'consent_not_approved' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('requires at least one valid checklist item', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items: [] })

    expect(result).toEqual({ ok: false, reason: 'items_required' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('drops malformed item entries and fails closed if nothing valid remains', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({
      canvas: createCanvas(),
      consentApproved: true,
      items: [{ id: '', label: '' }, { label: '   ' }],
    })

    expect(result).toEqual({ ok: false, reason: 'items_required' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed when the device is offline, before any network call', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'offline' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed when the frame cannot be captured as a blob', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas({ fails: true }), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'capture_failed' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed when no canvas is supplied at all', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: null, consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'capture_failed' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed when there is no authenticated session, before requesting a consent token', async () => {
    getCurrentAiAuthorization.mockResolvedValueOnce({ errorCode: 'AUTH_REQUIRED', ok: false })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'AUTH_REQUIRED' })
    expect(requestAnalysisConsentToken).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed when the server denies the consent token (missing secret, wrong purpose, etc.)', async () => {
    requestAnalysisConsentToken.mockRejectedValueOnce(new Error('consent_token_denied'))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'consent_token_denied' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('requests the consent token for the forgotten-items-analysis purpose only, then posts to the dedicated endpoint with the token as a header (never body/query)', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({
      ok: true,
      result: { items: [{ id: 'phone', status: 'identified' }, { id: 'keys', status: 'uncertain' }] },
    }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result.ok).toBe(true)
    expect(result.result.items).toEqual([{ id: 'phone', status: 'identified' }, { id: 'keys', status: 'uncertain' }])

    expect(requestAnalysisConsentToken).toHaveBeenCalledWith(expect.objectContaining({
      authorizationHeader: 'Bearer forgotten-items-access-token',
      consentApproved: true,
      purpose: 'forgotten-items-analysis',
    }))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0]
    expect(calledUrl).toBe('/api/forgotten-items-analysis')
    expect(calledOptions.method).toBe('POST')
    expect(calledOptions.headers.Authorization).toBe('Bearer forgotten-items-access-token')
    expect(calledOptions.headers['x-viktkollen-consent-token']).toBe('test-consent-token')
    expect(calledOptions.body).toBeInstanceOf(FormData)
    const formKeys = [...calledOptions.body.keys()]
    expect(formKeys).toEqual(expect.arrayContaining(['items', 'image']))
    expect(JSON.parse(calledOptions.body.get('items'))).toEqual(items)
  })

  it('requires a fresh consent token for every call - it never reuses a previously issued token', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: true, result: { items: [{ id: 'phone', status: 'identified' }] } }))
    vi.stubGlobal('fetch', fetchSpy)
    requestAnalysisConsentToken.mockClear()

    await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items: [items[0]] })
    await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items: [items[0]] })

    expect(requestAnalysisConsentToken).toHaveBeenCalledTimes(2)
  })

  it('discards the result if the authenticated user changed while the request was in flight', async () => {
    hasSameAiAuthUser.mockResolvedValueOnce(false)
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, result: { items: [{ id: 'phone', status: 'identified' }] } })))

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'auth_stale' })
  })

  it('fails closed on a response that cannot be parsed as JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => { throw new Error('not json') },
      ok: true,
      status: 200,
    })))

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'invalid_response' })
  })

  it('fails closed on a non-ok server response, surfacing the safe error code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'PROVIDER_UNAVAILABLE' }, ok: false }, { ok: false, status: 502 })))

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'PROVIDER_UNAVAILABLE' })
  })

  it('fails closed when the server response is missing the expected items array shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, result: {} })))

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'http_200' })
  })

  it('fails closed on a network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network request failed') }))

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'network_error' })
  })

  it('reports an aborted/timed-out request distinctly, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }))

    const result = await analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })

    expect(result).toEqual({ ok: false, reason: 'timeout' })
  })

  it('never throws for any failure path - always resolves to { ok: false, reason }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('something unexpected') }))

    await expect(analyzeForgottenItemsPhoto({ canvas: createCanvas(), consentApproved: true, items })).resolves.toEqual(
      expect.objectContaining({ ok: false }),
    )
  })

  it('uses a bounded client timeout', () => {
    expect(forgottenItemsAnalysisTimeoutMs).toBeGreaterThan(0)
    expect(forgottenItemsAnalysisTimeoutMs).toBeLessThanOrEqual(60000)
  })

  it('never logs to the console anywhere in this module (no canvas/blob/base64/token can leak via logging)', () => {
    const source = readFileSync('src/services/forgottenItemsAnalysis.js', 'utf8')
    expect(source).not.toMatch(/console\.(log|info|warn|error|debug)/)
  })
})



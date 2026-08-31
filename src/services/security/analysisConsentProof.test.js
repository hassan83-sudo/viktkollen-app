import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  analysisConsentPurposes,
  analysisConsentTokenHeaderName,
  computeClientCanonicalImageHash,
  requestAnalysisConsentToken,
  withAnalysisConsentTokenHeader,
} from './analysisConsentProof.js'
import { analysisConsentPurposes as serverAnalysisConsentPurposes, computeCanonicalImageHash } from '../../../api/_shared/analysisConsent.js'

const front = new Uint8Array([1, 2, 3, 4, 5])
const side = new Uint8Array([6, 7, 8])
const back = new Uint8Array([9, 9, 9])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('analysisConsentPurposes', () => {
  it('matches the server allowlist exactly - only body-analysis and nutrition-photo-analysis', () => {
    expect(Object.values(analysisConsentPurposes).sort()).toEqual(Object.values(serverAnalysisConsentPurposes).sort())
  })

  it('has no purpose for legacy meal-analysis or for eye-recognition', () => {
    expect('mealAnalysis' in analysisConsentPurposes).toBe(false)
    expect('eyeRecognition' in analysisConsentPurposes).toBe(false)
    expect(Object.values(analysisConsentPurposes)).not.toContain('meal-analysis')
    expect(Object.values(analysisConsentPurposes)).not.toContain('eye-recognition')
  })
})

describe('computeClientCanonicalImageHash', () => {
  it('matches the server hash for a single unlabelled image', async () => {
    const clientHash = await computeClientCanonicalImageHash(front)
    const serverHash = computeCanonicalImageHash([{ bytes: Buffer.from(front), label: 'image' }])
    expect(clientHash).toBe(serverHash)
  })

  it('matches the server hash for labelled front/side/back images, in the given order', async () => {
    const clientHash = await computeClientCanonicalImageHash([
      { label: 'front', source: front },
      { label: 'side', source: side },
      { label: 'back', source: back },
    ])
    const serverHash = computeCanonicalImageHash([
      { bytes: Buffer.from(front), label: 'front' },
      { bytes: Buffer.from(side), label: 'side' },
      { bytes: Buffer.from(back), label: 'back' },
    ])
    expect(clientHash).toBe(serverHash)
  })

  it('changes when the order of the body images changes', async () => {
    const forward = await computeClientCanonicalImageHash([
      { label: 'front', source: front },
      { label: 'side', source: side },
      { label: 'back', source: back },
    ])
    const reordered = await computeClientCanonicalImageHash([
      { label: 'side', source: side },
      { label: 'front', source: front },
      { label: 'back', source: back },
    ])
    expect(reordered).not.toBe(forward)
  })

  it('hashes a data: URI the same as its decoded raw bytes', async () => {
    const base64 = Buffer.from(front).toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`
    expect(await computeClientCanonicalImageHash(dataUrl)).toBe(await computeClientCanonicalImageHash(front))
  })
})

describe('requestAnalysisConsentToken', () => {
  it('makes no fetch call at all when consentApproved is not exactly true', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    for (const consentApproved of [false, undefined, null, 'true', 1]) {
      await expect(requestAnalysisConsentToken({
        authorizationHeader: 'Bearer token',
        consentApproved,
        images: front,
        purpose: analysisConsentPurposes.bodyAnalysis,
      })).rejects.toThrow()
    }

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('makes no fetch call at all for a disallowed purpose, including a future eye-recognition purpose', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(requestAnalysisConsentToken({
      authorizationHeader: 'Bearer token',
      consentApproved: true,
      images: front,
      purpose: 'eye-recognition',
    })).rejects.toThrow()

    await expect(requestAnalysisConsentToken({
      authorizationHeader: 'Bearer token',
      consentApproved: true,
      images: front,
      purpose: 'meal-analysis',
    })).rejects.toThrow()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts the image hash, purpose and explicit approval claim, and returns the issued token', async () => {
    let capturedUrl
    let capturedInit
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      capturedUrl = url
      capturedInit = init
      return new Response(JSON.stringify({ expiresAt: Date.now() + 1000, ok: true, token: 'issued.token' }), { status: 200 })
    }))

    const result = await requestAnalysisConsentToken({
      authorizationHeader: 'Bearer abc123',
      consentApproved: true,
      images: front,
      purpose: analysisConsentPurposes.bodyAnalysis,
    })

    expect(capturedUrl).toBe('/api/analysis-consent')
    expect(capturedInit.method).toBe('POST')
    expect(capturedInit.headers.Authorization).toBe('Bearer abc123')
    const sentBody = JSON.parse(capturedInit.body)
    expect(sentBody.purpose).toBe(analysisConsentPurposes.bodyAnalysis)
    expect(sentBody.uiConsentApproved).toBe(true)
    expect(sentBody.imageHash).toBe(await computeClientCanonicalImageHash(front))
    expect(result.token).toBe('issued.token')
  })

  it('throws a generic error, without leaking server details, when the server denies the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'CONSENT_REQUIRED' }, ok: false }), { status: 403 })))

    await expect(requestAnalysisConsentToken({
      authorizationHeader: 'Bearer abc123',
      consentApproved: true,
      images: front,
      purpose: analysisConsentPurposes.bodyAnalysis,
    })).rejects.toThrow()
  })
})

describe('withAnalysisConsentTokenHeader', () => {
  it('attaches the token as a dedicated header, not a body/query field', () => {
    const headers = withAnalysisConsentTokenHeader({ Authorization: 'Bearer abc' }, 'the-token')
    expect(headers[analysisConsentTokenHeaderName]).toBe('the-token')
    expect(headers.Authorization).toBe('Bearer abc')
    expect(analysisConsentTokenHeaderName).toBe('x-viktkollen-consent-token')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ai/aiAuthTransport.js', () => ({
  aiAuthErrorCode: {
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    AUTH_STALE: 'AUTH_STALE',
    AUTH_UNAVAILABLE: 'AUTH_UNAVAILABLE',
  },
  getAiAuthSafeMessage: (code) => code === 'AUTH_REQUIRED' ? 'Logga in för att använda remote AI.' : 'Sessionen ändrades under AI-anropet. Försök igen.',
  getCurrentAiAuthorization: vi.fn(async () => ({
    authorizationHeader: 'Bearer photo-access-token',
    ok: true,
    userScope: 'photo-user-a',
  })),
  hasSameAiAuthUser: vi.fn(async () => true),
}))

import { analyzeNutritionPhoto, nutritionPhotoAnalysisTimeoutMs } from './nutritionPhotoAnalysisProvider.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './ai/aiAuthTransport.js'

describe('nutritionPhotoAnalysisProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns mock analysis without remote network', async () => {
    const result = await analyzeNutritionPhoto({ mealType: 'Lunch' }, { analysisDate: '2026-07-31', providerType: 'mock' })

    expect(result.ok).toBe(true)
    expect(result.analysis.provider.type).toBe('mock')
    expect(result.analysis.safeSummary).toContain('Lokal')
  })

  it('does not present mock as remote provider when offline', async () => {
    const result = await analyzeNutritionPhoto({ mealType: 'Lunch' }, { analysisDate: '2026-07-31', offline: true, providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.analysis).toBeNull()
    expect(result.providerType).toBe('remote')
    expect(result.warning).toContain('offline')
    expect(JSON.stringify(result)).not.toMatch(/session|token|Bearer|OPENAI_API_KEY|base64|data:image/)
  })

  it('posts remote analysis to the secure server route as multipart form data', async () => {
    const blob = new Blob(['image'], { type: 'image/png' })
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        analysis: {
          components: [
            {
              category: 'protein',
              confidence: 'high',
              name: 'Friterad kyckling',
              nutritionEstimate: {
                calories: { confidence: 'medium', max: 320, midpoint: 240, min: 190 },
                fatG: { confidence: 'medium', max: 14, midpoint: 9, min: 6 },
                proteinG: { confidence: 'medium', max: 18, midpoint: 12, min: 8 },
              },
              portionEstimate: { confidence: 'medium', gramsMax: 180, gramsMin: 100 },
              visualEvidence: 'Panerad yta.',
            },
          ],
          detectedItems: [{ calories: 240, carbohydrates: 30, confidence: 'medium', fat: 9, name: 'Pizza', protein: 12 }],
          estimatedNutrition: {
            calories: { confidence: 'medium', max: 320, midpoint: 240, min: 190 },
            carbsG: { confidence: 'medium', max: 38, midpoint: 30, min: 22 },
            fatG: { confidence: 'medium', max: 14, midpoint: 9, min: 6 },
            proteinG: { confidence: 'medium', max: 18, midpoint: 12, min: 8 },
          },
          portionEstimate: { confidence: 'medium', description: 'En bit', gramsMax: 180, gramsMin: 100 },
          providerType: 'remote',
          safeSummary: 'Remote uppskattning.',
        },
        ok: true,
      }),
      ok: true,
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeNutritionPhoto({ mealType: 'Lunch', preprocessedImage: blob }, { analysisDate: '2026-07-31', providerType: 'remote' })

    expect(result.ok).toBe(true)
    expect(result.analysis.provider.type).toBe('remote')
    expect(result.debug).toEqual(expect.objectContaining({
      authPresent: true,
      clientAttemptId: expect.stringMatching(/^photo-attempt-/),
      finalProviderType: 'remote',
      normalizationSucceeded: true,
      providerAttempted: true,
      providerSucceeded: true,
      requestStarted: true,
      responseStatus: 200,
    }))
    expect(result.analysis.components[0].name).toBe('Friterad kyckling')
    expect(result.analysis.estimatedNutrition.calories.midpoint).toBe(240)
    expect(result.analysis.safeSummary).not.toContain('Lokal uppskattning')
    expect(result.analysis.portionEstimate.description).toBe('En bit')
    expect(fetchMock).toHaveBeenCalledWith('/api/nutrition-photo-analysis', expect.objectContaining({
      body: expect.any(FormData),
      headers: expect.objectContaining({
        Authorization: 'Bearer photo-access-token',
        'x-viktkollen-request-id': expect.stringMatching(/^photo-attempt-/),
      }),
      method: 'POST',
    }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toMatch(/base64|data:image/)
    expect([...fetchMock.mock.calls[0][1].body.entries()].map(([key]) => key)).not.toContain('Authorization')
  })

  it('uses a client timeout longer than the 45s server nutrition timeout', () => {
    expect(nutritionPhotoAnalysisTimeoutMs).toBeGreaterThan(45000)
  })

  it('accepts a server response after the previous 12s client timeout', async () => {
    vi.useFakeTimers()
    const blob = new Blob(['image'], { type: 'image/png' })
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          analysis: {
            detectedItems: [{ calories: 240, carbohydrates: 30, confidence: 'medium', fat: 9, name: 'Pizza', protein: 12 }],
            estimatedNutrition: {
              calories: { confidence: 'medium', max: 320, midpoint: 240, min: 190 },
              carbsG: { confidence: 'medium', max: 38, midpoint: 30, min: 22 },
              fatG: { confidence: 'medium', max: 14, midpoint: 9, min: 6 },
              proteinG: { confidence: 'medium', max: 18, midpoint: 12, min: 8 },
            },
            providerType: 'remote',
            safeSummary: 'Remote uppskattning.',
          },
          ok: true,
        }),
        ok: true,
        status: 200,
      }), 20000)
    })))

    const resultPromise = analyzeNutritionPhoto({ mealType: 'Lunch', preprocessedImage: blob }, { providerType: 'remote' })
    await vi.advanceTimersByTimeAsync(20000)
    const result = await resultPromise

    expect(result.ok).toBe(true)
    expect(result.debug).toEqual(expect.objectContaining({
      clientTimeoutMs: nutritionPhotoAnalysisTimeoutMs,
      providerSucceeded: true,
      responseStatus: 200,
    }))
  })

  it('lets a server 504 after 45s reach the client without client abort', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve({
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: { code: 'PROVIDER_TIMEOUT', retryable: true }, ok: false }),
        ok: false,
        status: 504,
      }), 46000)
    })))

    const resultPromise = analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote' })
    await vi.advanceTimersByTimeAsync(46000)
    const result = await resultPromise

    expect(result.ok).toBe(false)
    expect(result.aborted).not.toBe(true)
    expect(result.debug).toEqual(expect.objectContaining({
      fallbackReason: 'PROVIDER_TIMEOUT',
      clientTimeoutMs: nutritionPhotoAnalysisTimeoutMs,
      providerAttempted: true,
      responseStatus: 504,
    }))
    expect(result.warning).toContain('för lång tid')
  })

  it('surfaces rate limit without automatic local fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ error: { code: 'rateLimit', retryable: true }, ok: false }),
      ok: false,
      status: 429,
    })))

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.analysis).toBeNull()
    expect(result.providerType).toBe('remote')
    expect(result.warning).toContain('För många')
  })

  it('surfaces provider or network failure without leaving the caller waiting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Network request failed')
    }))

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.analysis).toBeNull()
    expect(result.providerType).toBe('remote')
    expect(result.warning).toContain('kunde inte nå servern')
    expect(JSON.stringify(result)).not.toContain('Lokal uppskattning')
  })

  it('surfaces remote server failure without automatic local fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: { code: 'PROVIDER_UNAVAILABLE', retryable: true }, ok: false }),
      ok: false,
      status: 500,
    })))

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.analysis).toBeNull()
    expect(result.providerType).toBe('remote')
    expect(result.debug).toEqual(expect.objectContaining({
      fallbackUsed: false,
      providerAttempted: true,
      providerSucceeded: false,
      requestStarted: true,
    }))
    expect(result.warning).toContain('tillfälligt otillgänglig')
    expect(JSON.stringify(result)).not.toContain('Lokal uppskattning')
  })

  it('keeps HTTP 502 provider failures distinct from aborted requests', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: { code: 'PROVIDER_UNAVAILABLE', retryable: true }, ok: false }),
      ok: false,
      status: 502,
    })))

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.aborted).not.toBe(true)
    expect(result.debug).toEqual(expect.objectContaining({
      fallbackReason: 'PROVIDER_UNAVAILABLE',
      providerAttempted: true,
      requestStarted: true,
      responseStatus: 502,
    }))
    expect(result.warning).toContain('tillfälligt otillgänglig')
  })

  it('surfaces missing remote route without automatic local fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ error: { code: 'notFound', retryable: false }, ok: false }),
      ok: false,
      status: 404,
    })))

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.analysis).toBeNull()
    expect(result.providerType).toBe('remote')
    expect(result.warning).toContain('Remote AI-routen hittades inte')
    expect(JSON.stringify(result)).not.toContain('Lokal uppskattning')
  })

  it('surfaces missing remote image payload as a user-facing warning', async () => {
    const result = await analyzeNutritionPhoto({}, { providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.analysis).toBeNull()
    expect(result.warning).toContain('Bild saknas')
  })

  it('does not call the photo route when session is missing', async () => {
    getCurrentAiAuthorization.mockResolvedValueOnce({
      errorCode: 'AUTH_REQUIRED',
      ok: false,
      warning: 'Logga in för att använda remote AI.',
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('AUTH_REQUIRED')
    expect(result.debug).toEqual(expect.objectContaining({
      apiErrorCode: 'AUTH_REQUIRED',
      authPresent: false,
      fallbackUsed: false,
      providerAttempted: false,
      requestStarted: false,
    }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/photo-access-token|Bearer|Lokal uppskattning/)
  })

  it('ignores remote result after user switch', async () => {
    hasSameAiAuthUser.mockResolvedValueOnce(false)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ analysis: {}, ok: true }),
      ok: true,
      status: 200,
    })))

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('AUTH_STALE')
    expect(result.stale).toBe(true)
  })

  it('marks aborted remote analysis without retrying', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote', signal: controller.signal })

    expect(result.ok).toBe(false)
    expect(result.aborted).toBe(true)
    expect(result.analysis).toBeNull()
  })

  it('reports client timeout as the abort source', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })))

    const resultPromise = analyzeNutritionPhoto(
      { preprocessedImage: new Blob(['image']) },
      { providerType: 'remote', timeoutMs: 100 },
    )
    await vi.advanceTimersByTimeAsync(100)
    const result = await resultPromise

    expect(result.ok).toBe(false)
    expect(result.aborted).toBe(true)
    expect(result.debug).toEqual(expect.objectContaining({
      abortSource: 'clientTimeout',
      clientTimeoutMs: 100,
      fallbackReason: 'client_timeout',
    }))
  })

  it('reports upstream component cleanup as the abort source', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
      const rejectAbort = () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      }
      if (options.signal.aborted) {
        rejectAbort()
        return
      }
      options.signal.addEventListener('abort', () => {
        rejectAbort()
      })
    })))

    const resultPromise = analyzeNutritionPhoto(
      { preprocessedImage: new Blob(['image']) },
      { providerType: 'remote', signal: controller.signal },
    )
    controller.abort('componentCleanup')
    const result = await resultPromise

    expect(result.ok).toBe(false)
    expect(result.aborted).toBe(true)
    expect(result.debug).toEqual(expect.objectContaining({
      abortSource: 'componentCleanup',
      fallbackReason: 'aborted',
    }))
  })
})

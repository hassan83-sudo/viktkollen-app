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

import { analyzeNutritionPhoto } from './nutritionPhotoAnalysisProvider.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './ai/aiAuthTransport.js'

describe('nutritionPhotoAnalysisProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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
    expect(JSON.stringify(result)).not.toMatch(/auth|session|token|base64/)
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
    expect(result.analysis.components[0].name).toBe('Friterad kyckling')
    expect(result.analysis.estimatedNutrition.calories.midpoint).toBe(240)
    expect(result.analysis.safeSummary).not.toContain('Lokal uppskattning')
    expect(result.analysis.portionEstimate.description).toBe('En bit')
    expect(fetchMock).toHaveBeenCalledWith('/api/nutrition-photo-analysis', expect.objectContaining({
      body: expect.any(FormData),
      headers: expect.objectContaining({
        Authorization: 'Bearer photo-access-token',
      }),
      method: 'POST',
    }))
    expect(JSON.stringify(result)).not.toMatch(/base64|data:image/)
    expect([...fetchMock.mock.calls[0][1].body.entries()].map(([key]) => key)).not.toContain('Authorization')
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
    expect(result.warning).toContain('Remote bildanalys kunde inte slutföras')
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
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/photo-access-token|Bearer/)
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
})

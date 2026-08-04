import { afterEach, describe, expect, it, vi } from 'vitest'

import { analyzeNutritionPhoto } from './nutritionPhotoAnalysisProvider.js'

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
          detectedItems: [{ calories: 240, carbohydrates: 30, confidence: 'medium', fat: 9, name: 'Pizza', protein: 12 }],
          estimatedNutrition: { calories: 240, carbs: 30, fat: 9, protein: 12 },
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
    expect(fetchMock).toHaveBeenCalledWith('/api/nutrition-photo-analysis', expect.objectContaining({
      body: expect.any(FormData),
      method: 'POST',
    }))
    expect(JSON.stringify(result)).not.toMatch(/base64|data:image/)
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

  it('marks aborted remote analysis without retrying', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await analyzeNutritionPhoto({ preprocessedImage: new Blob(['image']) }, { providerType: 'remote', signal: controller.signal })

    expect(result.ok).toBe(false)
    expect(result.aborted).toBe(true)
    expect(result.analysis).toBeNull()
  })
})

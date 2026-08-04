import { describe, expect, it } from 'vitest'

import { analyzeNutritionPhoto } from './nutritionPhotoAnalysisProvider.js'

describe('nutritionPhotoAnalysisProvider', () => {
  it('returns mock analysis without remote network', async () => {
    const result = await analyzeNutritionPhoto({ mealType: 'Lunch' }, { analysisDate: '2026-07-31', providerType: 'mock' })

    expect(result.ok).toBe(true)
    expect(result.analysis.provider.type).toBe('mock')
    expect(result.analysis.safeSummary).toContain('Lokal')
  })

  it('uses safe offline fallback for remote provider', async () => {
    const result = await analyzeNutritionPhoto({ mealType: 'Lunch' }, { analysisDate: '2026-07-31', offline: true, providerType: 'remote' })

    expect(result.ok).toBe(false)
    expect(result.providerType).toBe('mock')
    expect(result.warning).toContain('offline')
    expect(JSON.stringify(result)).not.toMatch(/auth|session|token|base64/)
  })
})

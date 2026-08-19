import { describe, expect, it } from 'vitest'

import {
  buildNutritionPhotoTrendSummary,
  normalizeAnalysisQuality,
  normalizeEstimatedIngredients,
  normalizeEstimatedNutrition,
  normalizePortionEstimate,
  normalizeUncertainIngredients,
  nutritionMidpointsFromEstimate,
} from './nutritionPhotoEstimates.js'

describe('nutritionPhotoEstimates', () => {
  it('normalizes explicit nutrition ranges without exact-only output', () => {
    const estimate = normalizeEstimatedNutrition({
      calories: { confidence: 'medium', max: 640, midpoint: 520, min: 430 },
      carbsG: { confidence: 'low', max: 75, midpoint: 58, min: 42 },
      fatG: { confidence: 'low', max: 28, midpoint: 18, min: 10 },
      fiberG: { confidence: 'low', max: 10, midpoint: 6, min: 3 },
      proteinG: { confidence: 'medium', max: 44, midpoint: 34, min: 25 },
    })

    expect(estimate.calories).toMatchObject({ confidence: 'medium', max: 640, midpoint: 520, min: 430 })
    expect(estimate.proteinG).toMatchObject({ confidence: 'medium', midpoint: 34 })
    expect(nutritionMidpointsFromEstimate(estimate)).toMatchObject({ calories: 520, protein: 34 })
  })

  it('converts legacy exact values into cautious ranges for backwards compatibility', () => {
    const estimate = normalizeEstimatedNutrition({ calories: 500, carbs: 60, fat: 18, protein: 32 }, { confidence: 'medium' })

    expect(estimate.calories.min).toBeLessThan(500)
    expect(estimate.calories.max).toBeGreaterThan(500)
    expect(estimate.proteinG.confidence).toBe('medium')
    expect(estimate.fiberG).toBeNull()
  })

  it('drops invalid or negative estimate values', () => {
    const estimate = normalizeEstimatedNutrition({
      calories: { max: -20, min: -80 },
      proteinG: Number.NaN,
    })

    expect(estimate.calories).toBeNull()
    expect(estimate.proteinG).toBeNull()
  })

  it('normalizes portion, ingredient uncertainty and quality metadata', () => {
    const portion = normalizePortionEstimate({ confidence: 'low', description: 'Tallrik', gramsMax: 650, gramsMin: 360 })
    const ingredients = normalizeEstimatedIngredients([
      { confidence: 'medium', estimatedAmount: 'ca 120-180 g', name: 'Pasta', notes: 'Synlig bas.' },
      '<script>Sås</script>',
    ])
    const uncertain = normalizeUncertainIngredients([{ name: 'Olja', reason: 'Kan vara dold.' }], { ingredients })
    const quality = normalizeAnalysisQuality({ confidence: 'low', limitations: ['En bild räcker inte för exakt portion.'] })

    expect(portion).toMatchObject({ gramsMax: 650, gramsMin: 360 })
    expect(ingredients[1].name).toBe('scriptSås/script')
    expect(uncertain[0]).toMatchObject({ name: 'Olja' })
    expect(quality.limitations[0]).toContain('En bild')
  })

  it('builds cautious trend signals without adding a dashboard dependency', () => {
    const summary = buildNutritionPhotoTrendSummary([
      {
        mealType: 'Lunch',
        photoAnalysis: {
          confidence: 'medium',
          provenance: 'user_confirmed',
          source: 'photoAnalysis',
          uncertainIngredients: [{ name: 'Sås' }],
        },
        protein: 31,
      },
    ])

    expect(summary.photoMealCount).toBe(1)
    expect(summary.proteinRichCount).toBe(1)
    expect(summary.correctionFrequency).toBe(1)
    expect(summary.commonUncertaintyFactor).toBe('Sås')
  })
})

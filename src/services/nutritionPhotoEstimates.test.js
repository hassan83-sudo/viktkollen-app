import { describe, expect, it } from 'vitest'

import {
  buildNutritionPhotoTrendSummary,
  calculateTotalsFromComponents,
  compareNutritionRanges,
  normalizeAnalysisQuality,
  normalizeEstimatedIngredients,
  normalizeEstimatedNutrition,
  normalizePhotoAnalysisImageQuality,
  normalizePhotoComponents,
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

  it('normalizes component-based photo analysis with confidence, portion and nutrition ranges', () => {
    const components = normalizePhotoComponents([
      {
        category: 'protein',
        confidence: 'high',
        cookingMethods: ['fried', 'breaded'],
        name: 'Friterad kyckling',
        nutritionEstimate: {
          calories: { confidence: 'medium', max: 380, midpoint: 310, min: 250 },
          fatG: { confidence: 'medium', max: 22, midpoint: 16, min: 10 },
          proteinG: { confidence: 'medium', max: 36, midpoint: 28, min: 22 },
        },
        portionEstimate: { confidence: 'medium', gramsMax: 150, gramsMin: 100 },
        visualEvidence: 'Panerad yta.',
      },
      {
        category: 'carbohydrate',
        confidence: 'high',
        name: 'French fries',
        nutritionEstimate: {
          calories: { confidence: 'medium', max: 520, midpoint: 430, min: 340 },
          carbsG: { confidence: 'medium', max: 70, midpoint: 55, min: 42 },
          fatG: { confidence: 'medium', max: 25, midpoint: 18, min: 12 },
        },
        portionEstimate: { confidence: 'medium', gramsMax: 180, gramsMin: 120 },
      },
      {
        alternatives: ['vitlökssås', 'majonnäsbaserad dressing'],
        category: 'sauce',
        confidence: 'medium',
        name: 'Sås eller dressing',
        uncertainty: 'low',
      },
    ])

    expect(components).toHaveLength(3)
    expect(components[0]).toMatchObject({ category: 'protein', confidence: 'high' })
    expect(components[0].portionEstimate).toMatchObject({ gramsMax: 150, gramsMin: 100 })
    expect(components[0].cookingMethods).toContain('fried')
    expect(components[2].alternatives).toHaveLength(2)
  })

  it('aggregates component nutrition ranges and detects large total mismatches', () => {
    const components = normalizePhotoComponents([
      {
        category: 'protein',
        name: 'Kyckling',
        nutritionEstimate: {
          calories: { max: 320, midpoint: 260, min: 210 },
          proteinG: { max: 35, midpoint: 28, min: 22 },
        },
      },
      {
        category: 'carbohydrate',
        name: 'Pommes',
        nutritionEstimate: {
          calories: { max: 500, midpoint: 410, min: 330 },
          carbsG: { max: 68, midpoint: 52, min: 40 },
        },
      },
    ])
    const totals = calculateTotalsFromComponents(components)

    expect(totals.calories).toMatchObject({ min: 540, max: 820 })
    expect(compareNutritionRanges({ calories: { min: 250, midpoint: 300, max: 360 } }, totals).isConsistent).toBe(false)
    expect(normalizePhotoAnalysisImageQuality('poor')).toBe('poor')
  })

  it('merges obvious duplicate components without merging different foods aggressively', () => {
    const components = normalizePhotoComponents([
      { category: 'carbohydrate', confidence: 'medium', name: 'Pommes frites', portionEstimate: { gramsMax: 100, gramsMin: 80 } },
      { category: 'carbohydrate', confidence: 'high', name: 'French fries', portionEstimate: { gramsMax: 70, gramsMin: 50 } },
      { category: 'vegetables', confidence: 'high', name: 'Sallad', portionEstimate: { gramsMax: 60, gramsMin: 30 } },
    ])

    expect(components).toHaveLength(2)
    expect(components.find((item) => item.name === 'Pommes frites').confidence).toBe('high')
    expect(components.find((item) => item.name === 'Sallad')).toBeTruthy()
  })
})

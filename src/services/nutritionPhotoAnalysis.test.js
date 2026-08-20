import { describe, expect, it } from 'vitest'

import {
  buildPhotoAnalysisUsageSummary,
  commitPhotoAnalysisMeal,
  createPhotoAnalysisReviewDraft,
  detectPhotoMealDuplicate,
  normalizeNutritionPhotoAnalysis,
  validateNutritionPhotoAnalysis,
} from './nutritionPhotoAnalysis.js'

const analysisDate = '2026-07-31'

function rawAnalysis(overrides = {}) {
  return {
    analysisDate,
    detectedItems: [
      { calories: 260, carbohydrates: 20, confidence: 'medium', estimatedAmount: 150, fat: 8, name: 'Kyckling', protein: 32, unit: 'g' },
      { calories: 210, carbohydrates: 45, confidence: 'low', estimatedAmount: 160, fat: 1, name: 'Ris', protein: 4, unit: 'g' },
    ],
    estimatedNutrition: { calories: 470, carbs: 65, fat: 9, protein: 36 },
    provider: { type: 'mock' },
    safeSummary: 'Uppskattad tallrik med protein och kolhydratkälla.',
    ...overrides,
  }
}

describe('nutritionPhotoAnalysis model', () => {
  it('normalizes valid analysis without image data', () => {
    const analysis = normalizeNutritionPhotoAnalysis({ ...rawAnalysis(), image: 'data:image/png;base64,abc', extra: '<script>x</script>' }, { analysisDate })

    expect(analysis.analysisId).toMatch(/^photo-analysis-/)
    expect(analysis.detectedItems).toHaveLength(2)
    expect(analysis.estimatedNutrition.proteinG).toMatchObject({
      confidence: 'medium',
      midpoint: 36,
    })
    expect(analysis.nutrition.protein).toBe(36)
    expect(analysis.portionEstimate.description).toBe('Okänd portion')
    expect(JSON.stringify(analysis)).not.toMatch(/base64|data:image|<script/)
  })

  it('keeps nutrition estimates as defensive ranges and drops impossible precision', () => {
    const analysis = normalizeNutritionPhotoAnalysis(rawAnalysis({
      estimatedNutrition: {
        calories: { confidence: 'medium', max: 620, midpoint: 520, min: 420 },
        carbsG: { confidence: 'medium', max: 70, midpoint: 55, min: 40 },
        fatG: { confidence: 'low', max: 30, midpoint: 20, min: 12 },
        fiberG: null,
        proteinG: { confidence: 'medium', max: 42, midpoint: 32, min: 24 },
      },
      portionEstimate: { confidence: 'low', description: 'Skål eller tallrik', gramsMax: 520, gramsMin: 330 },
      uncertainIngredients: [{ name: 'Olja', reason: 'Kan vara dold i tillagningen.' }],
    }), { analysisDate })

    expect(analysis.estimatedNutrition.calories).toMatchObject({ max: 620, midpoint: 520, min: 420 })
    expect(analysis.estimatedNutrition.fiberG).toBeNull()
    expect(analysis.portionEstimate).toMatchObject({ gramsMax: 520, gramsMin: 330 })
    expect(analysis.uncertainIngredients[0].name).toBe('Olja')
  })

  it('rejects insufficient analysis and unsafe payloads', () => {
    const analysis = normalizeNutritionPhotoAnalysis(rawAnalysis({ detectedItems: [], confidence: 'insufficient' }), { analysisDate })
    const validation = validateNutritionPhotoAnalysis(analysis)

    expect(validation.ok).toBe(false)
    expect(validation.errors.join(' ')).toContain('Minst en ingrediens')
  })

  it('creates review draft and commits an actual meal with minimal metadata', () => {
    const analysis = normalizeNutritionPhotoAnalysis(rawAnalysis(), { analysisDate })
    const draft = createPhotoAnalysisReviewDraft(analysis, { analysisDate, mealType: 'Lunch', time: '12:30' })
    const result = commitPhotoAnalysisMeal(draft, [], { now: '2026-07-31T12:30:00.000Z' })

    expect(result.ok).toBe(true)
    expect(result.meal.source).toBe('Fotoanalys')
    expect(result.meal.photoAnalysis).toMatchObject({
      analysisId: analysis.analysisId,
      dataSources: ['aiEstimate'],
      itemCount: 2,
      provenance: 'ai_estimated',
      providerType: 'mock',
      reviewCompleted: true,
      schemaVersion: 3,
      source: 'photoAnalysis',
    })
    expect(result.meal.photoAnalysis.estimatedNutrition.proteinG.midpoint).toBe(36)
    expect(JSON.stringify(result.meal)).not.toMatch(/base64|blob:|data:image/)
  })

  it('blocks exact and likely duplicates unless manually allowed', () => {
    const analysis = normalizeNutritionPhotoAnalysis(rawAnalysis(), { analysisDate })
    const draft = createPhotoAnalysisReviewDraft(analysis, { analysisDate, mealType: 'Lunch', time: '12:30' })
    const saved = commitPhotoAnalysisMeal(draft, [], { now: '2026-07-31T12:30:00.000Z' }).meal

    expect(detectPhotoMealDuplicate(draft, [saved]).status).toBe('exactDuplicate')
    expect(commitPhotoAnalysisMeal(draft, [saved]).ok).toBe(false)

    const similar = { ...draft, analysis: { ...draft.analysis, analysisId: 'other' } }
    expect(detectPhotoMealDuplicate(similar, [saved]).status).toMatch(/Duplicate/)
  })

  it('summarizes photo analysis usage from meals only', () => {
    const analysis = normalizeNutritionPhotoAnalysis(rawAnalysis({ confidence: 'low' }), { analysisDate })
    const draft = createPhotoAnalysisReviewDraft(analysis, { analysisDate, mealType: 'Lunch', time: '12:30' })
    const meal = commitPhotoAnalysisMeal({ ...draft, userEdited: true }, [], { now: '2026-07-31T12:30:00.000Z' }).meal
    const summary = buildPhotoAnalysisUsageSummary([meal], { end: analysisDate, start: analysisDate })

    expect(summary.photoMealCount).toBe(1)
    expect(summary.editedCount).toBe(1)
    expect(summary.lowConfidenceCount).toBe(1)
    expect(summary.providerCounts.mock).toBe(1)
    expect(summary.dataSourceCounts.aiEstimate).toBe(1)
    expect(summary.cautiousPatterns.correctionFrequency).toBe(1)
  })

  it('keeps V3 remote components through normalization, review and save as ai_estimated until user confirmation', () => {
    const analysis = normalizeNutritionPhotoAnalysis({
      analysisDate,
      components: [
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
          visualEvidence: 'Panerad/friterad yta.',
        },
        {
          category: 'carbohydrate',
          confidence: 'high',
          name: 'Pommes frites',
          nutritionEstimate: {
            calories: { confidence: 'medium', max: 520, midpoint: 430, min: 340 },
            carbsG: { confidence: 'medium', max: 70, midpoint: 55, min: 42 },
            fatG: { confidence: 'medium', max: 25, midpoint: 18, min: 12 },
          },
          portionEstimate: { confidence: 'medium', gramsMax: 180, gramsMin: 120 },
        },
        {
          category: 'vegetables',
          confidence: 'high',
          name: 'Gurka och tomat',
          nutritionEstimate: {
            calories: { confidence: 'medium', max: 35, midpoint: 22, min: 12 },
            carbsG: { confidence: 'medium', max: 7, midpoint: 4, min: 2 },
            fiberG: { confidence: 'medium', max: 3, midpoint: 1.5, min: 0.5 },
          },
          portionEstimate: { confidence: 'medium', gramsMax: 60, gramsMin: 30 },
        },
        {
          alternatives: ['vitlökssås', 'majonnäsbaserad dressing'],
          category: 'sauce',
          confidence: 'medium',
          name: 'Sås eller dressing',
          nutritionEstimate: {
            calories: { confidence: 'low', max: 180, midpoint: 105, min: 50 },
            fatG: { confidence: 'low', max: 18, midpoint: 10, min: 4 },
          },
          portionEstimate: { confidence: 'low', gramsMax: 40, gramsMin: 20 },
          uncertainty: { confidence: 'low', reason: 'Exakt typ och mängd syns inte säkert.' },
        },
      ],
      confidence: 'medium',
      imageQuality: 'usable',
      mealTotals: {
        calories: { confidence: 'medium', max: 1115, midpoint: 867, min: 652 },
        carbsG: { confidence: 'medium', max: 77, midpoint: 59, min: 44 },
        fatG: { confidence: 'medium', max: 65, midpoint: 44, min: 26 },
        proteinG: { confidence: 'medium', max: 36, midpoint: 28, min: 22 },
      },
      provider: { type: 'remote' },
      safeSummary: 'Remote komponentanalys.',
    }, { analysisDate })
    const draft = createPhotoAnalysisReviewDraft(analysis, { analysisDate, mealType: 'Lunch', time: '12:30' })
    const saved = commitPhotoAnalysisMeal(draft, [], { now: '2026-07-31T12:31:00.000Z' }).meal

    expect(analysis.components).toHaveLength(4)
    expect(analysis.detectedItems.map((item) => item.name)).toContain('Pommes frites')
    expect(analysis.mealTotals.calories.midpoint).toBe(867)
    expect(draft.components).toHaveLength(4)
    expect(saved.photoAnalysis.components).toHaveLength(4)
    expect(saved.photoAnalysis.imageQuality).toBe('usable')
    expect(saved.photoAnalysis.provenance).toBe('ai_estimated')
    expect(JSON.stringify(saved)).not.toMatch(/data:image|base64/)
  })

  it('recalculates meal totals from components when provider totals are inconsistent', () => {
    const analysis = normalizeNutritionPhotoAnalysis({
      analysisDate,
      components: [
        {
          category: 'carbohydrate',
          confidence: 'high',
          name: 'Pommes frites',
          nutritionEstimate: {
            calories: { max: 520, midpoint: 430, min: 340 },
            carbsG: { max: 70, midpoint: 55, min: 42 },
            fatG: { max: 25, midpoint: 18, min: 12 },
            proteinG: { max: 7, midpoint: 5, min: 3 },
          },
        },
      ],
      confidence: 'medium',
      mealTotals: {
        calories: { max: 180, midpoint: 150, min: 120 },
        carbsG: { max: 20, midpoint: 15, min: 10 },
        fatG: { max: 3, midpoint: 2, min: 1 },
        proteinG: { max: 3, midpoint: 2, min: 1 },
      },
    }, { analysisDate })

    expect(analysis.totalsValidation.isConsistent).toBe(false)
    expect(analysis.estimatedNutrition.calories.midpoint).toBe(430)
    expect(analysis.analysisQuality.limitations.join(' ')).toContain('komponentintervall')
  })
})

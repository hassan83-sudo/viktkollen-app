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
    expect(analysis.estimatedNutrition.protein).toBe(36)
    expect(JSON.stringify(analysis)).not.toMatch(/base64|data:image|<script/)
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
      providerType: 'mock',
      reviewCompleted: true,
      source: 'photoAnalysis',
    })
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
  })
})

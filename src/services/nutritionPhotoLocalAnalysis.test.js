import { describe, expect, it } from 'vitest'

import {
  commitPhotoAnalysisMeal,
  createPhotoAnalysisReviewDraft,
  validatePhotoAnalysisReviewDraft,
} from './nutritionPhotoAnalysis.js'
import { createLocalNutritionPhotoEstimate } from './nutritionPhotoLocalAnalysis.js'

describe('nutritionPhotoLocalAnalysis', () => {
  it('creates a local fallback result from selected image metadata', () => {
    const result = createLocalNutritionPhotoEstimate({
      imageMetadata: {
        dimensions: '1200x900',
        fileType: 'image/jpeg',
        sizeBytes: 1_200_000,
      },
      mealType: 'Lunch',
    }, { analysisDate: '2026-08-19' })

    expect(result.provider.type).toBe('local')
    expect(result.provider.label).toBe('Lokal uppskattning')
    expect(result.safeSummary).toContain('Lokal uppskattning')
    expect(result.confidence.level).toBe('low')
    expect(result.detectedItems).toHaveLength(1)
    expect(result.estimatedNutrition.calories.min).toBeLessThan(result.estimatedNutrition.calories.max)
    expect(result.limitations.join(' ')).toContain('inte remote AI-analys')
    expect(JSON.stringify(result)).not.toMatch(/data:image|base64|auth|session/)
  })

  it('keeps local fallback defensive instead of exact nutrition', () => {
    const result = createLocalNutritionPhotoEstimate({
      imageMetadata: { dimensions: '4000x3000', sizeBytes: 4_000_000 },
      mealType: 'Middag',
    }, { analysisDate: '2026-08-19' })

    expect(result.analysisQuality.confidence).toBe('low')
    expect(result.limitations.join(' ')).toContain('lokal fallback')
    expect(result.warnings.join(' ')).toContain('Låg confidence')
    expect(result.portionEstimate.gramsMin).toBeLessThan(result.portionEstimate.gramsMax)
  })

  it('supports selected image to local analysis to review to saved meal flow', () => {
    const analysis = createLocalNutritionPhotoEstimate({
      imageMetadata: { dimensions: '1200x900', fileType: 'image/jpeg', sizeBytes: 1_200_000 },
      mealType: 'Lunch',
    }, { analysisDate: '2026-08-19' })
    const draft = createPhotoAnalysisReviewDraft(analysis, {
      analysisDate: '2026-08-19',
      mealType: 'Lunch',
      time: '12:30',
    })
    const validation = validatePhotoAnalysisReviewDraft(draft)
    const saveResult = commitPhotoAnalysisMeal(draft, [], {
      now: '2026-08-19T12:31:00.000Z',
    })

    expect(validation.ok).toBe(true)
    expect(saveResult.ok).toBe(true)
    expect(saveResult.meal.photoAnalysis.providerType).toBe('local')
    expect(saveResult.meal.photoAnalysis.provenance).toBe('ai_estimated')
    expect(saveResult.meal.photoAnalysis.reviewCompleted).toBe(true)
    expect(saveResult.meal.source).toBe('Fotoanalys')
    expect(JSON.stringify(saveResult.meal)).not.toMatch(/data:image|base64|auth|session/)
  })
})

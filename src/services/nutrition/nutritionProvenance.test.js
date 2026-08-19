import { describe, expect, it } from 'vitest'

import {
  describeMealProvenanceSummary,
  getMealProvenance,
  summarizeMealProvenance,
} from './nutritionProvenance.js'
import { createMealFromTemplate } from './mealTemplates.js'

describe('nutrition provenance', () => {
  it('keeps manual meal nutrition user-entered', () => {
    expect(getMealProvenance({
      calories: 540,
      id: 'manual',
      name: 'Lunch',
      nutritionSource: 'manual',
      protein: 42,
      source: 'Manuell',
    })).toMatchObject({
      isAiEstimated: false,
      isUserVerified: true,
      nutritionProvenance: 'user_entered',
      sourceCategory: 'manual',
    })
  })

  it('marks unedited photo meals as AI-estimated', () => {
    expect(getMealProvenance({
      calories: 610,
      name: 'Foto: kyckling',
      nutritionSource: 'manual',
      photoAnalysis: {
        provenance: 'ai_estimate',
        source: 'photoAnalysis',
        userEdited: false,
      },
      source: 'Fotoanalys',
    })).toMatchObject({
      isAiEstimated: true,
      isUserVerified: false,
      nutritionProvenance: 'ai_estimated',
      sourceCategory: 'photo_analysis',
    })
  })

  it('marks edited photo meals as user-confirmed AI estimates', () => {
    expect(getMealProvenance({
      calories: 580,
      photoAnalysis: {
        provenance: 'user_confirmed',
        source: 'photoAnalysis',
        userEdited: true,
      },
      source: 'Fotoanalys',
    })).toMatchObject({
      isAiEstimated: false,
      isUserVerified: true,
      nutritionProvenance: 'user_confirmed',
      sourceCategory: 'photo_analysis',
    })
  })

  it('marks meals created from templates as derived rather than hand-entered', () => {
    const meal = createMealFromTemplate({
      id: 'template-1',
      mealType: 'Lunch',
      name: 'Standardlunch',
      nutritionOverride: { calories: 500, carbs: 55, fat: 12, protein: 40 },
      text: 'Kyckling och ris',
    }, {
      date: '2026-08-19',
      time: '12:15',
    }, '2026-08-19T12:15:00.000Z')

    expect(getMealProvenance(meal)).toMatchObject({
      isUserVerified: false,
      nutritionProvenance: 'derived',
      sourceCategory: 'template',
    })
  })

  it('keeps quick add copies as quick add without turning photo estimates into confirmed nutrition', () => {
    expect(getMealProvenance({
      calories: 420,
      nutritionProvenance: 'user_entered',
      sourceCategory: 'quick_add',
    })).toMatchObject({
      isUserVerified: true,
      nutritionProvenance: 'user_entered',
      sourceCategory: 'quick_add',
    })

    expect(getMealProvenance({
      calories: 420,
      photoAnalysis: { provenance: 'ai_estimate', source: 'photoAnalysis' },
      sourceCategory: 'quick_add',
    })).toMatchObject({
      isAiEstimated: true,
      nutritionProvenance: 'ai_estimated',
      sourceCategory: 'photo_analysis',
    })
  })

  it('summarizes mixed meal provenance without inventing confidence', () => {
    const summary = summarizeMealProvenance([
      { calories: 400, nutritionSource: 'manual', source: 'Manuell' },
      { calories: 500, photoAnalysis: { provenance: 'ai_estimate', source: 'photoAnalysis' }, source: 'Fotoanalys' },
      { source: 'Manuell' },
    ])

    expect(summary).toMatchObject({
      aiEstimatedMealCount: 1,
      missingNutritionMealCount: 1,
      totalMealCount: 3,
      userEnteredMealCount: 1,
      userVerifiedMealCount: 1,
    })
    expect(describeMealProvenanceSummary(summary)).toContain('1 av 3')
    expect(describeMealProvenanceSummary(summary)).toContain('1 bygger på AI-estimat')
  })
})

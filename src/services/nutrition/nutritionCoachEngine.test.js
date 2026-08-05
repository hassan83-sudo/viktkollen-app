import { describe, expect, it } from 'vitest'
import {
  buildMinimalNutritionCoachAiContext,
  buildNutritionCoachModel,
  scoreMealQuality,
} from './nutritionCoachEngine.js'

const meals = [
  {
    calories: 520,
    carbs: 55,
    date: '2026-07-31',
    fat: 12,
    fiber: 7,
    id: 'breakfast',
    name: 'Havregryn med kvarg och blåbär',
    protein: 32,
    time: '08:00',
    type: 'Frukost',
  },
  {
    calories: 900,
    carbs: 95,
    date: '2026-07-31',
    fat: 38,
    fiber: 2,
    id: 'dinner',
    name: 'Pizza och läsk',
    protein: 22,
    time: '19:00',
    type: 'Middag',
  },
  {
    calories: 600,
    carbs: 62,
    date: '2026-07-30',
    fat: 14,
    fiber: 6,
    id: 'lunch-yesterday',
    name: 'Kyckling ris broccoli',
    protein: 42,
    time: '12:00',
    type: 'Lunch',
    photoAnalysis: { confidence: 'medium', source: 'photoAnalysis', providerType: 'local', userEdited: true },
  },
]

describe('nutritionCoachEngine', () => {
  it('scores logged meals from 0 to 100 and explains each component', () => {
    const balanced = scoreMealQuality(meals[0], { proteinGoalPerMeal: 25 })
    const processed = scoreMealQuality(meals[1], { proteinGoalPerMeal: 25 })

    expect(balanced.score).toBeGreaterThan(processed.score)
    expect(balanced.score).toBeLessThanOrEqual(100)
    expect(processed.components.processedFood.explanation).toMatch(/snabbmat|processad/i)
    expect(Object.keys(balanced.components)).toEqual([
      'balance',
      'fiber',
      'healthyFats',
      'processedFood',
      'protein',
      'sugar',
      'vegetables',
    ])
  })

  it('builds daily timeline with missing meals and nutrition gaps', () => {
    const model = buildNutritionCoachModel({
      meals,
      nutritionGoals: { fiber: 30, protein: 120 },
    }, { analysisDate: '2026-07-31' })

    expect(model.dailyTimeline.byType.find((entry) => entry.type === 'Lunch')?.missing).toBe(true)
    expect(model.gaps.join(' ')).toMatch(/Lunch|Fiber|Protein/i)
    expect(model.dailyScore).toBeGreaterThan(0)
    expect(model.weeklyScore).toBeGreaterThan(0)
  })

  it('uses preferences for smart food suggestions and keeps AI context aggregated', () => {
    const model = buildNutritionCoachModel({
      dietaryPreferences: {
        avoidedFoods: ['ägg'],
        preferredFoods: ['kvarg'],
      },
      meals,
      nutritionGoals: { fiber: 30, protein: 120 },
    }, { analysisDate: '2026-07-31' })
    const aiContext = buildMinimalNutritionCoachAiContext(model)

    expect(model.suggestions[0].name.toLocaleLowerCase('sv-SE')).toContain('kvarg')
    expect(model.suggestions.map((item) => item.name).join(' ')).not.toContain('Ägg')
    expect(aiContext).toMatchObject({
      confidenceScore: expect.any(Number),
      mealCategories: expect.any(Array),
      scannerMeals: 1,
    })
    expect(JSON.stringify(aiContext)).not.toMatch(/Havregryn|Pizza|raw|image|base64/)
  })
})

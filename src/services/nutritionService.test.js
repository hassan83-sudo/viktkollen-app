import { describe, expect, it } from 'vitest'

import {
  exportNutritionData,
  parseNutritionImport,
  summarizeWeek,
} from './nutritionService.js'

describe('nutrition service V2 portability and weekly provenance', () => {
  it('exports and imports meals, goals, favorites, templates, recipes and dietary preferences', () => {
    const payload = exportNutritionData({
      dietaryPreferences: {
        avoidedFoods: ['jordnötter', 'fläsk'],
        dietType: 'vegetarian',
      },
      favorites: [{ calories: 250, id: 'fav-1', name: 'Keso', protein: 28 }],
      goals: { calories: 2200, protein: 140 },
      mealTemplates: [{
        id: 'template-1',
        mealType: 'Lunch',
        name: 'Lunchmall',
        nutritionOverride: { calories: 500, protein: 40 },
        text: 'Kyckling och ris',
      }],
      meals: [{ calories: 500, date: '2026-08-19', id: 'meal-1', name: 'Lunch', protein: 40, source: 'Manuell' }],
      recipes: [{
        id: 'recipe-1',
        ingredients: ['200 g tofu'],
        name: 'Tofubowl',
        servings: 2,
      }],
    })
    const parsed = parseNutritionImport(payload)

    expect(parsed.ok).toBe(true)
    expect(parsed.summary).toMatchObject({
      favoriteCount: 1,
      mealCount: 1,
      mealTemplateCount: 1,
      recipeCount: 1,
    })
    expect(parsed.dietaryPreferences.avoidedFoods).toContain('jordnötter')
    expect(parsed.mealTemplates[0].name).toBe('Lunchmall')
    expect(parsed.recipes[0].name).toBe('Tofubowl')
  })

  it('keeps old nutrition exports backward compatible', () => {
    const parsed = parseNutritionImport({
      data: {
        favoriteMeals: [],
        goals: { protein: 120 },
        meals: [],
      },
      format: 'viktkollen-nutrition',
    })

    expect(parsed.ok).toBe(true)
    expect(parsed.mealTemplates).toEqual([])
    expect(parsed.recipes).toEqual([])
    expect(parsed.dietaryPreferences).toBeTruthy()
  })

  it('reports average user-verified calories separately from AI-estimated meals', () => {
    const week = summarizeWeek([
      { calories: 500, date: '2026-08-17', id: 'manual', name: 'Lunch', nutritionSource: 'manual', protein: 40, source: 'Manuell' },
      { calories: 900, date: '2026-08-17', id: 'photo', name: 'Foto', photoAnalysis: { provenance: 'ai_estimate', source: 'photoAnalysis' }, protein: 35, source: 'Fotoanalys' },
      { calories: 700, date: '2026-08-18', id: 'confirmed', name: 'Bekräftad', nutritionProvenance: 'user_confirmed', protein: 45, source: 'Fotoanalys' },
    ], '2026-08-17')

    expect(week.averageCalories).toBe(1050)
    expect(week.averageUserVerifiedCalories).toBe(600)
    expect(week.provenance.aiEstimatedMealCount).toBe(1)
    expect(week.provenance.userVerifiedMealCount).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'

import {
  atwaterKcal,
  checkMealPlausibility,
  checkPer100Consistency,
  checkPortionPlausibility,
  portionGuideFor,
  sumIngredientNutrition,
} from './nutritionPhotoPlausibility.js'
import { applyPhotoIngredientPatch } from './nutritionPhotoIngredientMatching.js'

describe('portion plausibility', () => {
  it('picks portion guides from the food name before the category', () => {
    expect(portionGuideFor({ category: 'unknown', name: 'Bearnaisesås' }).key).toBe('sauce')
    expect(portionGuideFor({ category: 'sauce', name: 'Ostsås' }).key).toBe('sauce')
    expect(portionGuideFor({ category: 'carbohydrate', name: 'Kokt ris' }).key).toBe('starch')
    expect(portionGuideFor({ category: 'fat', name: 'Smör' }).key).toBe('fat')
    expect(portionGuideFor({ category: 'protein', name: 'Kycklingfilé' }).key).toBe('protein')
    expect(portionGuideFor({ category: 'unknown', name: 'Köttsoppa' }).key).toBe('dish')
  })

  it('keeps plausible grams unchanged', () => {
    expect(checkPortionPlausibility({ category: 'protein', gramsMax: 180, gramsMin: 140, name: 'Kyckling' }))
      .toEqual({ flags: [], gramsMax: 180, gramsMin: 140 })
    // Stora men möjliga portioner ändras inte.
    expect(checkPortionPlausibility({ category: 'carbohydrate', gramsMax: 450, gramsMin: 350, name: 'Pasta' }).flags).toEqual([])
  })

  it('caps implausibly large portions to the hard limit and flags them', () => {
    expect(checkPortionPlausibility({ category: 'sauce', gramsMax: 600, gramsMin: 400, name: 'Gräddsås' }))
      .toEqual({ flags: ['portion_capped'], gramsMax: 250, gramsMin: 150 })
    expect(checkPortionPlausibility({ category: 'fat', gramsMax: 90, gramsMin: 40, name: 'Smör' }))
      .toEqual({ flags: ['portion_capped'], gramsMax: 60, gramsMin: 40 })
  })

  it('uses a typical portion when grams are missing, but never for unknown food', () => {
    expect(checkPortionPlausibility({ category: 'carbohydrate', gramsMax: null, gramsMin: null, name: 'Ris' }))
      .toEqual({ flags: ['portion_typical'], gramsMax: 300, gramsMin: 100 })
    expect(checkPortionPlausibility({ category: 'unknown', gramsMax: null, gramsMin: null, name: 'Okänd komponent' }))
      .toEqual({ flags: [], gramsMax: null, gramsMin: null })
  })
})

describe('nutrition plausibility per 100 g', () => {
  it('accepts consistent values unchanged', () => {
    const per100 = { calories: 151, carbs: 0, fat: 3.1, protein: 30.5 }
    expect(atwaterKcal(per100)).toBeCloseTo(149.9, 1)
    expect(checkPer100Consistency(per100, { category: 'protein' })).toEqual({ flags: [], per100 })
  })

  it('recomputes energy that contradicts the macros', () => {
    const result = checkPer100Consistency({ calories: 450, carbs: 28, fat: 0.4, protein: 2.6 }, { category: 'carbohydrate' })
    expect(result.flags).toEqual(['energy_recomputed'])
    expect(result.per100.calories).toBe(126)
  })

  it('scales impossible macro sums down to 100 g per 100 g', () => {
    const result = checkPer100Consistency({ calories: 900, carbs: 80, fat: 60, protein: 20 }, { category: 'unknown' })
    expect(result.flags).toContain('macros_scaled')
    expect(result.per100.protein + result.per100.carbs + result.per100.fat).toBeLessThanOrEqual(100.1)
    expect(result.per100.calories).toBeLessThanOrEqual(900)
  })

  it('flags unusually energy-dense vegetables unless fried or baked', () => {
    expect(checkPer100Consistency({ calories: 300, carbs: 30, fat: 18, protein: 3 }, { category: 'vegetables', cookingMethods: [] }).flags)
      .toContain('energy_unusual')
    expect(checkPer100Consistency({ calories: 300, carbs: 30, fat: 18, protein: 3 }, { category: 'vegetables', cookingMethods: ['fried'] }).flags)
      .not.toContain('energy_unusual')
  })

  it('returns null when there is no AI estimate instead of inventing one', () => {
    expect(checkPer100Consistency(null)).toEqual({ flags: [], per100: null })
  })
})

describe('meal plausibility', () => {
  const items = [
    { calories: 212, carbohydrates: 0, fat: 4.3, protein: 42.7 },
    { calories: 238, carbohydrates: 51.5, fat: 0.7, protein: 4.7 },
    { calories: 61, carbohydrates: 2.4, fat: 5.4, protein: 0.8, selected: false },
  ]

  it('totals are exactly the sum of the selected ingredients', () => {
    expect(sumIngredientNutrition(items)).toEqual({ calories: 450, carbs: 51.5, fat: 5, protein: 47.4 })
  })

  it('flags implausibly high meal energy without changing it', () => {
    const big = checkMealPlausibility([{ calories: 1800 }, { calories: 900 }])
    expect(big.totals.calories).toBe(2700)
    expect(big.notes).toHaveLength(1)
    expect(checkMealPlausibility(items).notes).toEqual([])
  })
})

describe('user corrections are never overridden by plausibility checks', () => {
  it('keeps a user-entered amount above the hard limit and recomputes from per 100 g', () => {
    const sauce = {
      calories: 84, carbohydrates: 3.6, dataSource: 'aiEstimate', estimatedAmount: 60, fat: 7.2, name: 'Gräddsås',
      per100: { calories: 140, carbs: 6, fat: 12, protein: 2 }, protein: 1.2, unit: 'g',
    }
    const patched = applyPhotoIngredientPatch(sauce, { estimatedAmount: 400, userEdited: true })
    expect(patched.estimatedAmount).toBe(400)
    expect(patched.calories).toBe(560)
  })
})

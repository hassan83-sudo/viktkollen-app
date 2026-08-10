import { describe, expect, it } from 'vitest'
import { buildDailyMealPlannerModel } from './dailyMealPlanner.js'

describe('dailyMealPlanner', () => {
  it('builds a four meal fallback plan from nutrition goals', () => {
    const model = buildDailyMealPlannerModel({
      date: '2026-08-10',
      nutritionGoals: { calories: 2100, protein: 130 },
    })

    expect(model.meals.map((meal) => meal.mealType)).toEqual(['Frukost', 'Lunch', 'Middag', 'Mellanmål'])
    expect(model.summary.calories).toBeGreaterThan(1500)
    expect(model.summary.protein).toBeGreaterThan(100)
    expect(model.shoppingGroups.length).toBeGreaterThan(0)
  })

  it('uses local meal history as planner candidates when available', () => {
    const model = buildDailyMealPlannerModel({
      date: '2026-08-10',
      meals: [
        { calories: 520, carbs: 45, date: '2026-08-09', fat: 12, id: 'm1', mealType: 'Lunch', name: 'Historisk kyckling', protein: 42, text: 'kyckling, ris, grönsaker' },
      ],
      nutritionGoals: { calories: 2000, protein: 120 },
    })

    expect(model.generatedFromHistory).toBe(true)
    expect(model.meals).toHaveLength(4)
    expect(model.shoppingGroups.flatMap((group) => group.items).length).toBeGreaterThan(0)
  })
})

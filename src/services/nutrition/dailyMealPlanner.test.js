import { describe, expect, it } from 'vitest'
import {
  buildDailyMealPlannerModel,
  buildDailyMealPlannerSaveState,
  buildWeeklyShoppingGroups,
  saveDailyMealPlanToWeek,
  updateWeeklyShoppingListFromPlan,
} from './dailyMealPlanner.js'
import { getMealPlanWeek } from './nutritionEngine.js'

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

  it('saves and replaces the selected day in existing weekly meal plans', () => {
    const date = '2026-08-10'
    const model = buildDailyMealPlannerModel({ date, nutritionGoals: { calories: 2100, protein: 130 } })
    const first = saveDailyMealPlanToWeek({ date, model, now: '2026-08-10T08:00:00.000Z' })
    const replaced = saveDailyMealPlanToWeek({
      date,
      mealPlans: first.plans,
      model,
      mode: 'replace',
      now: '2026-08-10T09:00:00.000Z',
    })
    const dayMeals = getMealPlanWeek(replaced.plans, replaced.weekStart).days[date]

    expect(dayMeals).toHaveLength(4)
    expect(dayMeals.every((meal) => meal.sourceId === `ai-daily-plan-${date}`)).toBe(true)
  })

  it('can keep existing meals by appending and builds weekly shopping groups', () => {
    const date = '2026-08-10'
    const model = buildDailyMealPlannerModel({ date, nutritionGoals: { calories: 2100, protein: 130 } })
    const first = saveDailyMealPlanToWeek({ date, model, now: '2026-08-10T08:00:00.000Z' })
    const appended = saveDailyMealPlanToWeek({
      date,
      mealPlans: first.plans,
      model,
      mode: 'append',
      now: '2026-08-10T09:00:00.000Z',
    })
    const groups = buildWeeklyShoppingGroups({ week: appended.week })
    const shopping = updateWeeklyShoppingListFromPlan({ week: appended.week })
    const state = buildDailyMealPlannerSaveState({
      date,
      mealPlans: appended.plans,
      nutritionGoals: { calories: 2100, protein: 130 },
    })

    expect(appended.week.days[date]).toHaveLength(8)
    expect(groups.flatMap((group) => group.items).length).toBeGreaterThan(0)
    expect(shopping.list.items.length).toBeGreaterThan(0)
    expect(state.saved).toBe(true)
    expect(state.weekTotals.calories).toBeGreaterThan(0)
    expect(state.weekTotals.protein).toBeGreaterThan(0)
  })
})

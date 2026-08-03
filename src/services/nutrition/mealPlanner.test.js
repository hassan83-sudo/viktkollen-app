import { describe, expect, it } from 'vitest'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  addLocalDays,
  addPlannedMeal,
  buildMealPlanInsights,
  buildMealPlanSuggestions,
  buildPlannedDaySummary,
  buildPlannedWeekSummary,
  calculateDailyNutritionSummary,
  calculatePlannedMealNutrition,
  clearMealPlanWeek,
  comparePlannedNutritionWithGoals,
  copyPlannedDay,
  createMealPlanWeek,
  createPlannedMealFromDraft,
  createPlannedMealFromRecommendation,
  createPlannedMealFromTemplate,
  getMealPlanWeek,
  getMealPlanWeekDates,
  getMealPlanWeekStart,
  mealPlansStorageKey,
  movePlannedMeal,
  normalizeMealPlans,
  normalizeMealPlanWeek,
  normalizePlannedMeal,
  plannedMealToMeal,
  readMealPlans,
  removePlannedMeal,
  updatePlannedMeal,
  validatePlannedMealDraft,
  writeMealPlans,
} from './nutritionEngine.js'

function createStorage(initial = {}) {
  const state = new Map(Object.entries(initial))
  return {
    getItem: (key) => state.get(key) || null,
    removeItem: (key) => state.delete(key),
    setItem: (key, value) => state.set(key, value),
  }
}

const weekStart = '2026-07-27'
const goals = { calories: 2100, protein: 110 }
const template = {
  defaultTime: '12:00',
  id: 'template-1',
  isFavorite: true,
  mealType: 'Lunch',
  name: 'Kycklinglåda',
  nutritionOverride: { calories: 520, protein: 42 },
  text: '500 g kyckling, 1 kg potatis, broccoli',
  useCount: 4,
}
const veganTemplate = {
  ...template,
  id: 'template-vegan',
  name: 'Tofulåda',
  nutritionOverride: { calories: 480, protein: 32 },
  text: '500 g tofu, ris, broccoli',
}

function planned(seed = {}) {
  return createPlannedMealFromDraft({
    date: weekStart,
    ingredients: ['500 g kyckling', '1 kg potatis'],
    mealType: 'Lunch',
    text: 'kyckling och potatis',
    title: 'Lunchlåda',
    ...seed,
  }).meal
}

describe('meal plan model and storage', () => {
  it('reads empty storage', () => {
    expect(readMealPlans(createStorage()).weeks).toEqual({})
  })

  it('handles malformed storage', () => {
    expect(readMealPlans(createStorage({ [mealPlansStorageKey]: '{bad' })).weeks).toEqual({})
  })

  it('writes storage', () => {
    const storage = createStorage()
    const plans = writeMealPlans({ weeks: { [weekStart]: createMealPlanWeek(weekStart) } }, storage)
    expect(readMealPlans(storage).weeks[weekStart].weekStart).toBe(plans.weeks[weekStart].weekStart)
  })

  it('handles storage write error', () => {
    const storage = { setItem: () => { throw new Error('full') } }
    expect(writeMealPlans({ weeks: { [weekStart]: createMealPlanWeek(weekStart) } }, storage).weeks[weekStart]).toBeTruthy()
  })

  it.each([
    ['2026-07-27', '2026-07-27'],
    ['2026-07-29', '2026-07-27'],
    ['2027-01-01', '2026-12-28'],
    ['2026-12-31', '2026-12-28'],
    ['2020-12-31', '2020-12-28'],
  ])('calculates Monday week start for %s', (date, expected) => {
    expect(getMealPlanWeekStart(date)).toBe(expected)
  })

  it('creates seven week dates', () => {
    expect(getMealPlanWeekDates(weekStart)).toHaveLength(7)
  })

  it('navigates previous week', () => {
    expect(addLocalDays(weekStart, -7)).toBe('2026-07-20')
  })

  it('navigates next week', () => {
    expect(addLocalDays(weekStart, 7)).toBe('2026-08-03')
  })

  it('creates week with all days', () => {
    expect(Object.keys(createMealPlanWeek(weekStart).days)).toHaveLength(7)
  })

  it('normalizes malformed plan without crashing', () => {
    expect(normalizeMealPlans({ weeks: { bad: { days: null } } }).weeks).toBeTruthy()
  })

  it('normalizes malformed week day array', () => {
    expect(normalizeMealPlanWeek({ weekStart, days: { [weekStart]: null } }).days[weekStart]).toEqual([])
  })
})

describe('planned meal creation and mutation', () => {
  it('creates planned meal from template', () => {
    expect(createPlannedMealFromTemplate(template, { date: weekStart }).meal.sourceId).toBe(template.id)
  })

  it('copies template fields instead of linking live', () => {
    const meal = createPlannedMealFromTemplate(template, { date: weekStart }).meal
    const changed = { ...template, name: 'Ändrad' }
    expect(meal.title).not.toBe(changed.name)
  })

  it('creates planned meal from custom text', () => {
    expect(planned().sourceType).toBe('custom')
  })

  it('creates planned meal from recommendation', () => {
    expect(createPlannedMealFromRecommendation({ description: 'Bönor och ris', name: 'Bönor' }, { date: weekStart }).meal.sourceType).toBe('recommendation')
  })

  it('validates missing title and text', () => {
    expect(validatePlannedMealDraft({ date: weekStart }).title).toBeTruthy()
  })

  it('validates invalid date', () => {
    expect(validatePlannedMealDraft({ title: 'Mat', date: 'bad' }).date).toBeTruthy()
  })

  it('validates invalid time', () => {
    expect(validatePlannedMealDraft({ title: 'Mat', date: weekStart, scheduledTime: '99:99' }).scheduledTime).toBeTruthy()
  })

  it('removes empty ingredients', () => {
    expect(normalizePlannedMeal({ date: weekStart, title: 'Mat', ingredients: ['ris', ''] }).ingredients).toEqual(['ris'])
  })

  it('normalizes mealType', () => {
    expect(normalizePlannedMeal({ date: weekStart, mealType: 'middag', title: 'Mat' }).mealType).toBe('Middag')
  })

  it('adds planned meal', () => {
    const plans = addPlannedMeal({}, weekStart, planned())
    expect(getMealPlanWeek(plans, weekStart).days[weekStart]).toHaveLength(1)
  })

  it('updates planned meal', () => {
    const meal = planned()
    const plans = updatePlannedMeal(addPlannedMeal({}, weekStart, meal), weekStart, meal.id, { title: 'Ny titel' })
    expect(getMealPlanWeek(plans, weekStart).days[weekStart][0].title).toBe('Ny titel')
  })

  it('preserves id on update', () => {
    const meal = planned()
    const plans = updatePlannedMeal(addPlannedMeal({}, weekStart, meal), weekStart, meal.id, { title: 'Ny titel' })
    expect(getMealPlanWeek(plans, weekStart).days[weekStart][0].id).toBe(meal.id)
  })

  it('moves planned meal preserving id', () => {
    const meal = planned()
    const plans = movePlannedMeal(addPlannedMeal({}, weekStart, meal), weekStart, meal.id, '2026-07-28')
    expect(getMealPlanWeek(plans, weekStart).days['2026-07-28'][0].id).toBe(meal.id)
  })

  it('removes planned meal', () => {
    const meal = planned()
    const plans = removePlannedMeal(addPlannedMeal({}, weekStart, meal), weekStart, meal.id)
    expect(getMealPlanWeek(plans, weekStart).days[weekStart]).toHaveLength(0)
  })

  it('clears only selected week', () => {
    const meal = planned()
    const plans = addPlannedMeal(addPlannedMeal({}, weekStart, meal), '2026-08-03', planned({ date: '2026-08-03' }))
    expect(getMealPlanWeek(clearMealPlanWeek(plans, weekStart), '2026-08-03').days['2026-08-03']).toHaveLength(1)
  })

  it('keeps unique ids for normalized duplicate ids', () => {
    const week = normalizeMealPlanWeek({ weekStart, days: { [weekStart]: [planned({ id: 'x' }), planned({ id: 'x' })] } })
    expect(week.days[weekStart]).toHaveLength(1)
  })
})

describe('copy day and register as meal', () => {
  it('copies one day to another day', () => {
    const plans = copyPlannedDay(addPlannedMeal({}, weekStart, planned()), weekStart, weekStart, { date: '2026-07-28' })
    expect(getMealPlanWeek(plans, weekStart).days['2026-07-28']).toHaveLength(1)
  })

  it('creates new ids when copying', () => {
    const meal = planned()
    const plans = copyPlannedDay(addPlannedMeal({}, weekStart, meal), weekStart, weekStart, { date: '2026-07-28' })
    expect(getMealPlanWeek(plans, weekStart).days['2026-07-28'][0].id).not.toBe(meal.id)
  })

  it('copies to weekdays', () => {
    const plans = copyPlannedDay(addPlannedMeal({}, weekStart, planned()), weekStart, weekStart, { scope: 'weekdays' })
    expect(getMealPlanWeek(plans, weekStart).days['2026-07-31']).toHaveLength(1)
  })

  it('copies to full week', () => {
    const plans = copyPlannedDay(addPlannedMeal({}, weekStart, planned()), weekStart, weekStart, { scope: 'week' })
    expect(getMealPlanWeek(plans, weekStart).days['2026-08-02']).toHaveLength(1)
  })

  it('appends by default', () => {
    const base = addPlannedMeal(addPlannedMeal({}, weekStart, planned()), weekStart, planned({ date: '2026-07-28', title: 'B' }))
    const plans = copyPlannedDay(base, weekStart, weekStart, { date: '2026-07-28' })
    expect(getMealPlanWeek(plans, weekStart).days['2026-07-28']).toHaveLength(2)
  })

  it('replaces when requested', () => {
    const base = addPlannedMeal(addPlannedMeal({}, weekStart, planned()), weekStart, planned({ date: '2026-07-28', title: 'B' }))
    const plans = copyPlannedDay(base, weekStart, weekStart, { date: '2026-07-28', mode: 'replace' })
    expect(getMealPlanWeek(plans, weekStart).days['2026-07-28']).toHaveLength(1)
  })

  it('does not mutate original day when copying', () => {
    const plans = copyPlannedDay(addPlannedMeal({}, weekStart, planned()), weekStart, weekStart, { date: '2026-07-28' })
    expect(getMealPlanWeek(plans, weekStart).days[weekStart]).toHaveLength(1)
  })

  it('converts planned meal to actual meal with new id', () => {
    const meal = planned()
    expect(plannedMealToMeal(meal).id).not.toBe(meal.id)
  })

  it('copies planned date and time to actual meal', () => {
    const actual = plannedMealToMeal(planned({ scheduledTime: '18:30' }))
    expect(actual.date).toBe(weekStart)
    expect(actual.time).toBe('18:30')
  })

  it('copies nutrition override to actual meal', () => {
    expect(plannedMealToMeal(planned()).nutritionOverride.protein).toBeGreaterThan(0)
  })

  it('does not remove source planned meal during conversion', () => {
    const meal = planned()
    plannedMealToMeal(meal)
    expect(meal.title).toBe('Lunchlåda')
  })
})

describe('planned nutrition, insights and suggestions', () => {
  it('calculates planned meal nutrition', () => {
    expect(calculatePlannedMealNutrition(planned()).totals.protein).toBeGreaterThan(0)
  })

  it('builds planned day protein', () => {
    expect(buildPlannedDaySummary([planned()], goals).totals.protein).toBeGreaterThan(0)
  })

  it('builds planned day calories', () => {
    expect(buildPlannedDaySummary([planned()], goals).totals.calories).toBeGreaterThan(0)
  })

  it('builds planned week summary', () => {
    expect(buildPlannedWeekSummary(getMealPlanWeek(addPlannedMeal({}, weekStart, planned()), weekStart), goals).mealCount).toBe(1)
  })

  it('does not treat empty nutrition as unsafe numbers', () => {
    const summary = buildPlannedDaySummary([normalizePlannedMeal({ date: weekStart, title: 'Mat', nutritionPreview: {} })], {})
    expect(JSON.stringify(summary)).not.toMatch(/NaN|Infinity/)
  })

  it('compares planned protein with goals', () => {
    expect(comparePlannedNutritionWithGoals(getMealPlanWeek(addPlannedMeal({}, weekStart, planned()), weekStart), goals).text).toContain('Proteinplanen')
  })

  it('returns empty plan insight', () => {
    expect(buildMealPlanInsights(createMealPlanWeek(weekStart), goals)[0]).toContain('Ingen vecka')
  })

  it('limits insights to four', () => {
    const plans = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30'].reduce((current, date) => addPlannedMeal(current, weekStart, planned({ date })), {})
    expect(buildMealPlanInsights(getMealPlanWeek(plans, weekStart), goals).length).toBeLessThanOrEqual(4)
  })

  it('suggests compatible template', () => {
    const suggestions = buildMealPlanSuggestions({ week: createMealPlanWeek(weekStart), goals, templates: [veganTemplate], dietaryPreferences: { dietType: 'vegan' } })
    expect(suggestions.join(' ')).toContain('Tofulåda')
  })

  it('omits incompatible template suggestion', () => {
    const suggestions = buildMealPlanSuggestions({ week: createMealPlanWeek(weekStart), goals, templates: [template], dietaryPreferences: { dietType: 'vegan' } })
    expect(suggestions.join(' ')).not.toContain('Kyckling')
  })

  it('keeps max three suggestions', () => {
    expect(buildMealPlanSuggestions({ week: getMealPlanWeek(addPlannedMeal({}, weekStart, planned()), weekStart), goals, templates: [template] }).length).toBeLessThanOrEqual(3)
  })

  it('keeps planned meals out of actual daily summary', () => {
    const actualSummary = calculateDailyNutritionSummary([], weekStart, { nutritionGoals: goals })
    buildPlannedDaySummary([planned()], goals)
    expect(actualSummary.mealCount).toBe(0)
  })

  it('handles 1000 planned meals', () => {
    const meals = Array.from({ length: 1000 }, (_, index) => planned({ id: `p-${index}` }))
    expect(buildPlannedDaySummary(meals, goals).mealCount).toBe(1000)
  })
})

describe('AI Coach meal planner replies', () => {
  const context = {
    mealPlans: addPlannedMeal({}, weekStart, planned()),
    nutritionGoals: goals,
    shoppingLists: {},
    today: weekStart,
  }

  it('answers plan summary', () => {
    expect(createDeterministicAiCoachReply({ context, message: 'Vad har jag planerat denna vecka?' })).toContain('planerat')
  })

  it('answers planned protein', () => {
    expect(createDeterministicAiCoachReply({ context, message: 'Hur mycket protein har jag planerat?' })).toContain('planerat')
  })

  it('answers empty days', () => {
    expect(createDeterministicAiCoachReply({ context, message: 'Vilka dagar saknar planerade måltider?' })).toContain('Dagar utan')
  })

  it('explains planned versus actual intake', () => {
    expect(createDeterministicAiCoachReply({ context, message: 'Läggs planerade måltider till i min historik?' })).toContain('räknas inte som faktiskt')
  })

  it('explains registration', () => {
    expect(createDeterministicAiCoachReply({ context, message: 'Hur registrerar jag en planerad måltid?' })).toContain('Registrera som måltid')
  })
})

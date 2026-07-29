import { describe, expect, it, vi } from 'vitest'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  applyGeneratedPlanToMealPlans,
  buildMealGeneratorCandidates,
  buildGeneratedMealPlanSummary,
  buildSelectionReason,
  describeGeneratedMealPlan,
  generateDayMealPlan,
  generateMealPlan,
  generateWeekMealPlan,
  generatedMealPlansStorageKey,
  generatedMealTypes,
  generatedPlanToMealPlanWeek,
  generatedPlanToShoppingList,
  getLatestGeneratedMealPlan,
  listGeneratedPlanRecipeNames,
  mealGeneratorInternals,
  normalizeGeneratedMealPlan,
  normalizeGeneratedMealPlans,
  readGeneratedMealPlans,
  saveGeneratedMealPlan,
  writeGeneratedMealPlans,
} from './nutritionEngine.js'

function createStorage(seed = {}) {
  const data = new Map(Object.entries(seed))

  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    removeItem: vi.fn((key) => data.delete(key)),
    setItem: vi.fn((key, value) => data.set(key, value)),
  }
}

const recipes = [
  {
    category: 'Frukost',
    favorite: true,
    id: 'recipe-breakfast',
    ingredients: ['2 ägg', '40 g havregryn'],
    name: 'Äggfrukost',
    servings: 1,
    tags: ['proteinrik'],
  },
  {
    category: 'Lunch',
    favorite: false,
    id: 'recipe-chicken',
    ingredients: ['200 g kyckling', '150 g ris', '100 g broccoli'],
    name: 'Kycklingris',
    servings: 1,
    tags: ['proteinrik'],
  },
  {
    category: 'Lunch',
    favorite: true,
    id: 'recipe-tuna',
    ingredients: ['150 g tonfisk', '200 g potatis', '100 g gurka'],
    name: 'Tonfisklunch',
    servings: 1,
    tags: ['proteinrik'],
  },
  {
    category: 'Middag',
    favorite: true,
    id: 'recipe-salmon',
    ingredients: ['180 g lax', '250 g potatis', '100 g broccoli'],
    name: 'Laxmiddag',
    servings: 1,
    tags: ['favorit'],
  },
  {
    category: 'Middag',
    favorite: false,
    id: 'recipe-beef',
    ingredients: ['180 g nötkött', '200 g potatis', '100 g morötter'],
    name: 'Biffmiddag',
    servings: 1,
    tags: ['proteinrik'],
  },
  {
    category: 'Mellanmål',
    favorite: false,
    id: 'recipe-snack',
    ingredients: ['200 g kvarg', '1 banan'],
    name: 'Kvargmål',
    servings: 1,
    tags: ['snabbt'],
  },
  {
    category: 'Lunch',
    favorite: true,
    id: 'recipe-burger',
    ingredients: ['2 hamburgare', '150 g pommes'],
    name: 'Burgerlunch',
    servings: 1,
    tags: ['helg'],
  },
]

const templates = [
  {
    defaultTime: '08:00',
    id: 'template-breakfast',
    isFavorite: true,
    mealType: 'Frukost',
    name: 'Mallfrukost',
    nutritionOverride: { calories: 350, carbs: 35, fat: 10, protein: 25 },
    text: 'kvarg och havregryn',
  },
  {
    defaultTime: '12:00',
    id: 'template-lunch',
    mealType: 'Lunch',
    name: 'Mallunch',
    nutritionOverride: { calories: 520, carbs: 55, fat: 12, protein: 35 },
    text: 'kyckling och ris',
  },
  {
    defaultTime: '18:00',
    id: 'template-dinner',
    mealType: 'Middag',
    name: 'Mallmiddag',
    nutritionOverride: { calories: 620, carbs: 60, fat: 18, protein: 38 },
    text: 'lax och potatis',
  },
  {
    defaultTime: '15:00',
    id: 'template-snack',
    mealType: 'Mellanmål',
    name: 'Mallmellanmål',
    nutritionOverride: { calories: 220, carbs: 20, fat: 4, protein: 24 },
    text: 'keso och banan',
  },
]

const goals = { calories: 2100, protein: 130 }
const now = '2026-02-01T10:00:00.000Z'

function weekPlan(options = {}) {
  return generateWeekMealPlan({
    date: '2026-02-03',
    dietaryPreferences: {},
    nutritionGoals: goals,
    now,
    recipes,
    templates,
    ...options,
  })
}

function dayPlan(options = {}) {
  return generateDayMealPlan({
    date: '2026-02-03',
    dietaryPreferences: {},
    nutritionGoals: goals,
    now,
    recipes,
    templates,
    ...options,
  })
}

describe('AI Meal Generator service', () => {
  it('uses the requested storage key', () => {
    expect(generatedMealPlansStorageKey).toBe('viktkollen.generatedMealPlans')
  })

  it('defines the four generated meal types', () => {
    expect(generatedMealTypes).toEqual(['Frukost', 'Lunch', 'Middag', 'Mellanmål'])
  })

  it('generates a day plan', () => {
    const plan = dayPlan()

    expect(plan.mode).toBe('day')
    expect(plan.days).toHaveLength(1)
    expect(plan.days[0].meals).toHaveLength(4)
  })

  it('generates a week plan', () => {
    const plan = weekPlan()

    expect(plan.mode).toBe('week')
    expect(plan.days).toHaveLength(7)
    expect(plan.summary.mealCount).toBe(28)
  })

  it.each(['Frukost', 'Lunch', 'Middag', 'Mellanmål'])('includes %s in a day', (mealType) => {
    expect(dayPlan().days[0].meals.map((meal) => meal.mealType)).toContain(mealType)
  })

  it('calculates day nutrition', () => {
    const totals = dayPlan().days[0].totals

    expect(totals.protein).toBeGreaterThan(80)
    expect(totals.calories).toBeGreaterThan(800)
    expect(totals.carbs).toBeGreaterThan(0)
    expect(totals.fat).toBeGreaterThan(0)
  })

  it('calculates week nutrition', () => {
    const summary = weekPlan().summary

    expect(summary.totals.protein).toBeGreaterThan(summary.averageProtein)
    expect(summary.totals.calories).toBeGreaterThan(summary.averageCalories)
    expect(summary.dayCount).toBe(7)
  })

  it('creates deterministic plans for the same inputs', () => {
    expect(weekPlan().days.map((day) => day.meals.map((meal) => meal.title))).toEqual(weekPlan().days.map((day) => day.meals.map((meal) => meal.title)))
  })
})

describe('AI Meal Generator priority algorithm', () => {
  it('prioritizes favorite breakfast recipe', () => {
    expect(dayPlan().days[0].meals.find((meal) => meal.mealType === 'Frukost').title).toBe('Äggfrukost')
  })

  it('prioritizes favorite dinner recipe', () => {
    expect(dayPlan().days[0].meals.find((meal) => meal.mealType === 'Middag').title).toBe('Laxmiddag')
  })

  it('uses recipes before templates when recipes exist', () => {
    expect(dayPlan().days[0].meals.every((meal) => meal.sourceType === 'recipe')).toBe(true)
  })

  it('uses templates as fallback when recipes are missing', () => {
    const plan = dayPlan({ recipes: [] })

    expect(plan.days[0].meals.every((meal) => meal.sourceType === 'template')).toBe(true)
  })

  it('still creates a full day from templates', () => {
    expect(dayPlan({ recipes: [] }).days[0].meals).toHaveLength(4)
  })

  it('prefers compatible recipes over incompatible favorites when possible', () => {
    const plan = dayPlan({ dietaryPreferences: { dietType: 'vegetarian' } })
    const titles = plan.days[0].meals.map((meal) => meal.title)

    expect(titles).not.toContain('Burgerlunch')
    expect(titles).not.toContain('Kycklingris')
  })

  it('uses compatible templates if recipes are incompatible', () => {
    const plan = dayPlan({
      dietaryPreferences: { avoidedFoods: ['kyckling', 'lax', 'ägg', 'tonfisk', 'nötkött', 'kvarg'] },
      recipes,
    })

    expect(plan.days[0].meals.length).toBeGreaterThan(0)
  })

  it('scores protein-rich candidates for protein goals', () => {
    const lunch = dayPlan({ nutritionGoals: { protein: 180, calories: 2400 } }).days[0].meals.find((meal) => meal.mealType === 'Lunch')

    expect(lunch.nutritionPreview.protein).toBeGreaterThan(25)
  })

  it('considers calorie goals in candidate scoring', () => {
    const plan = dayPlan({ nutritionGoals: { calories: 1500, protein: 100 } })

    expect(plan.summary.averageCalories).toBeGreaterThan(0)
  })

  it('adds selection reasons', () => {
    expect(dayPlan().days[0].meals[0].selectionReason.length).toBeGreaterThan(5)
  })

  it.each([
    ['favorite reason', { favorite: true, compatible: true, nutrition: { protein: 30 }, mealType: 'Lunch', sourceType: 'recipe' }, 'favorit'],
    ['compatible reason', { favorite: false, compatible: true, nutrition: { protein: 10 }, mealType: 'Lunch', sourceType: 'recipe' }, 'matchar matval'],
    ['protein reason', { favorite: false, compatible: false, nutrition: { protein: 30 }, mealType: 'Lunch', sourceType: 'recipe' }, 'hjälper proteinmålet'],
    ['fallback reason', { favorite: false, compatible: false, nutrition: { protein: 5 }, mealType: 'Annat', sourceType: 'template' }, 'fallback'],
  ])('builds %s', (_, candidate, expected) => {
    expect(buildSelectionReason(candidate, 'Lunch')).toContain(expected)
  })
})

describe('AI Meal Generator variation', () => {
  it('avoids the same recipe in consecutive slots', () => {
    const meals = weekPlan().days.flatMap((day) => day.meals)
    const repeated = meals.some((meal, index) => index > 0 && meal.sourceId === meals[index - 1].sourceId)

    expect(repeated).toBe(false)
  })

  it('avoids identical lunches several days in a row', () => {
    const lunches = weekPlan().days.map((day) => day.meals.find((meal) => meal.mealType === 'Lunch')?.sourceId)

    expect(lunches.some((id, index) => index > 0 && id === lunches[index - 1])).toBe(false)
  })

  it('avoids identical dinners several days in a row', () => {
    const dinners = weekPlan().days.map((day) => day.meals.find((meal) => meal.mealType === 'Middag')?.sourceId)

    expect(dinners.some((id, index) => index > 0 && id === dinners[index - 1])).toBe(false)
  })

  it('tracks used recipes across the week', () => {
    const sourceIds = weekPlan().days.flatMap((day) => day.meals.map((meal) => meal.sourceId))
    const uniqueCount = new Set(sourceIds).size

    expect(uniqueCount).toBeGreaterThan(3)
  })

  it('falls back gracefully when variation is impossible', () => {
    const plan = generateWeekMealPlan({ date: '2026-02-03', recipes: [recipes[0]], templates: [], nutritionGoals: goals, now })

    expect(plan.summary.mealCount).toBe(28)
  })
})

describe('AI Meal Generator candidates and summaries', () => {
  it('builds recipe and template candidates', () => {
    const candidates = buildMealGeneratorCandidates({ recipes, templates })

    expect(candidates.some((candidate) => candidate.sourceType === 'recipe')).toBe(true)
    expect(candidates.some((candidate) => candidate.sourceType === 'template')).toBe(true)
  })

  it('marks compatible candidates', () => {
    const candidates = buildMealGeneratorCandidates({ dietaryPreferences: { dietType: 'vegetarian' }, recipes, templates })

    expect(candidates.some((candidate) => candidate.compatible)).toBe(true)
  })

  it('marks favorite candidates', () => {
    expect(buildMealGeneratorCandidates({ recipes, templates }).some((candidate) => candidate.favorite)).toBe(true)
  })

  it('normalizes candidate meal types', () => {
    expect(mealGeneratorInternals.candidateMealType({ category: 'Frukost' })).toBe('Frukost')
  })

  it('puts unknown candidate meal types in Annat', () => {
    expect(mealGeneratorInternals.candidateMealType({ category: 'Brunch' })).toBe('Annat')
  })

  it('builds candidate text with ingredients', () => {
    expect(mealGeneratorInternals.candidateText(recipes[1])).toContain('kyckling')
  })

  it('summarizes generated days', () => {
    expect(buildGeneratedMealPlanSummary(dayPlan().days).mealCount).toBe(4)
  })

  it('returns zero summary for empty days', () => {
    expect(buildGeneratedMealPlanSummary([]).totals.protein).toBe(0)
  })

  it('describes generated plan with goals', () => {
    expect(describeGeneratedMealPlan(dayPlan(), goals)).toContain('protein')
  })

  it('describes missing plan safely', () => {
    expect(describeGeneratedMealPlan(null)).toContain('Ingen')
  })
})

describe('AI Meal Generator planner and shopping integration', () => {
  it('converts generated plan to a meal plan week', () => {
    const week = generatedPlanToMealPlanWeek(weekPlan())

    expect(Object.values(week.days).flat()).toHaveLength(28)
  })

  it('applies generated plan to meal plans', () => {
    const plans = applyGeneratedPlanToMealPlans(dayPlan(), {}, { mode: 'replace', now })

    expect(Object.values(plans.weeks).flatMap((week) => Object.values(week.days).flat())).toHaveLength(4)
  })

  it('appends generated plan when requested', () => {
    const plan = dayPlan()
    const first = applyGeneratedPlanToMealPlans(plan, {}, { mode: 'replace', now })
    const second = applyGeneratedPlanToMealPlans(plan, first, { mode: 'append', now })

    expect(Object.values(second.weeks).flatMap((week) => Object.values(week.days).flat())).toHaveLength(8)
  })

  it('creates shopping list from generated plan', () => {
    const list = generatedPlanToShoppingList(dayPlan(), {}, { now })

    expect(list.items.length).toBeGreaterThan(0)
  })

  it('keeps previous manual shopping items', () => {
    const current = { weeks: { '2026-02-02': { weekStart: '2026-02-02', items: [{ id: 'manual', manual: true, name: 'kaffe' }] } } }
    const list = generatedPlanToShoppingList(weekPlan(), current, { now })

    expect(list.items.map((item) => item.name)).toContain('kaffe')
  })

  it('lists selected recipe names', () => {
    expect(listGeneratedPlanRecipeNames(dayPlan())).toContain('Äggfrukost')
  })
})

describe('AI Meal Generator localStorage', () => {
  it('reads empty history without storage', () => {
    expect(readGeneratedMealPlans(null).history).toEqual([])
  })

  it('reads malformed storage safely', () => {
    expect(readGeneratedMealPlans(createStorage({ [generatedMealPlansStorageKey]: '{bad' })).history).toEqual([])
  })

  it('writes generated history', () => {
    const storage = createStorage()
    const history = writeGeneratedMealPlans({ history: [dayPlan()] }, storage)

    expect(history.history).toHaveLength(1)
    expect(storage.setItem).toHaveBeenCalledWith(generatedMealPlansStorageKey, expect.stringContaining('generated-meal-plan'))
  })

  it('survives storage write errors', () => {
    const storage = { setItem: vi.fn(() => { throw new Error('full') }) }

    expect(writeGeneratedMealPlans({ history: [dayPlan()] }, storage).history).toHaveLength(1)
  })

  it('saves latest generated plan', () => {
    const history = saveGeneratedMealPlan(dayPlan(), { history: [] }, createStorage())

    expect(history.latestPlanId).toBe(history.history[0].id)
  })

  it('returns latest generated plan', () => {
    const first = dayPlan({ now: '2026-02-01T10:00:00.000Z' })
    const second = dayPlan({ now: '2026-02-02T10:00:00.000Z' })

    expect(getLatestGeneratedMealPlan({ history: [second, first], latestPlanId: first.id }).id).toBe(first.id)
  })

  it('normalizes array history shape', () => {
    expect(normalizeGeneratedMealPlans([dayPlan()]).history).toHaveLength(1)
  })

  it('drops invalid generated plans', () => {
    expect(normalizeGeneratedMealPlans({ history: [null, {}] }).history).toEqual([])
  })
})

describe('AI Meal Generator error handling', () => {
  it('normalizes invalid single plan to null', () => {
    expect(normalizeGeneratedMealPlan(null)).toBeNull()
  })

  it('handles empty recipes and templates', () => {
    expect(generateMealPlan({ recipes: [], templates: [], now }).summary.mealCount).toBe(0)
  })

  it('does not expose unsafe numeric values', () => {
    const plan = generateDayMealPlan({ recipes: [{ ...recipes[0], servings: 0 }], templates: [], now })

    expect(JSON.stringify(plan)).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('handles invalid planner conversion input', () => {
    expect(Object.keys(generatedPlanToMealPlanWeek(null).days)).toHaveLength(7)
  })

  it('handles invalid apply input', () => {
    expect(applyGeneratedPlanToMealPlans(null, {}).weeks).toEqual({})
  })
})

describe('AI Meal Generator detailed regression coverage', () => {
  it.each([
    ['plan id', (plan) => plan.id.startsWith('generated-meal-plan')],
    ['plan version', (plan) => plan.version === 1],
    ['plan date', (plan) => plan.date === '2026-02-03'],
    ['plan week start', (plan) => plan.weekStart === '2026-02-02'],
    ['created at', (plan) => plan.createdAt === now],
    ['summary day count', (plan) => plan.summary.dayCount === 1],
    ['summary meal count', (plan) => plan.summary.mealCount === 4],
    ['summary calories', (plan) => plan.summary.totals.calories > 0],
    ['summary protein', (plan) => plan.summary.totals.protein > 0],
    ['summary carbs', (plan) => plan.summary.totals.carbs > 0],
    ['summary fat', (plan) => plan.summary.totals.fat > 0],
    ['day date', (plan) => plan.days[0].date === '2026-02-03'],
    ['day totals', (plan) => plan.days[0].totals.protein > 0],
    ['first meal id', (plan) => plan.days[0].meals[0].id.length > 5],
    ['first meal source id', (plan) => plan.days[0].meals[0].sourceId.length > 5],
    ['first meal source kind', (plan) => plan.days[0].meals[0].sourceKind === 'recipe'],
    ['first meal time', (plan) => plan.days[0].meals[0].scheduledTime === '08:00'],
    ['lunch time', (plan) => plan.days[0].meals.find((meal) => meal.mealType === 'Lunch').scheduledTime === '12:00'],
    ['dinner time', (plan) => plan.days[0].meals.find((meal) => meal.mealType === 'Middag').scheduledTime === '18:00'],
    ['snack time', (plan) => plan.days[0].meals.find((meal) => meal.mealType === 'Mellanmål').scheduledTime === '15:00'],
  ])('keeps %s stable', (_, assertion) => {
    expect(assertion(dayPlan())).toBe(true)
  })

  it.each([
    ['Frukost', 'Äggfrukost'],
    ['Lunch', 'Tonfisklunch'],
    ['Middag', 'Laxmiddag'],
    ['Mellanmål', 'Kvargmål'],
  ])('selects expected %s', (mealType, expectedTitle) => {
    expect(dayPlan().days[0].meals.find((meal) => meal.mealType === mealType).title).toBe(expectedTitle)
  })

  it.each([
    ['Frukost', 'Mallfrukost'],
    ['Lunch', 'Mallunch'],
    ['Middag', 'Mallmiddag'],
    ['Mellanmål', 'Mallmellanmål'],
  ])('falls back to template for %s', (mealType, expectedTitle) => {
    expect(dayPlan({ recipes: [] }).days[0].meals.find((meal) => meal.mealType === mealType).title).toBe(expectedTitle)
  })

  it.each([
    ['protein goal text', goals, '130 g'],
    ['calorie goal text', goals, /2\s*100 kcal/],
    ['without protein goal', { calories: 2100 }, 'protein per dag'],
    ['without calorie goal', { protein: 130 }, 'kcal per dag'],
  ])('describes %s', (_, inputGoals, expected) => {
    const text = describeGeneratedMealPlan(dayPlan(), inputGoals)

    if (expected instanceof RegExp) expect(text).toMatch(expected)
    else expect(text).toContain(expected)
  })

  it.each([
    ['storage keeps latest fallback', { history: [dayPlan()], latestPlanId: 'missing' }, (history) => history.latestPlanId === history.history[0].id],
    ['storage keeps explicit latest', { history: [dayPlan()], latestPlanId: dayPlan().id }, (history) => history.history.length === 1],
    ['history capped at 30', { history: Array.from({ length: 35 }, (_, index) => dayPlan({ now: `2026-02-${String((index % 20) + 1).padStart(2, '0')}T10:00:00.000Z` })) }, (history) => history.history.length === 30],
    ['array storage supported', [dayPlan()], (history) => history.history.length === 1],
    ['empty object storage', {}, (history) => history.history.length === 0],
  ])('normalizes %s', (_, input, assertion) => {
    expect(assertion(normalizeGeneratedMealPlans(input))).toBe(true)
  })

  it.each([
    ['shopping has protein item', () => generatedPlanToShoppingList(dayPlan(), {}, { now }).items.some((item) => item.name.includes('ägg') || item.name.includes('kyckling'))],
    ['shopping has carb item', () => generatedPlanToShoppingList(dayPlan(), {}, { now }).items.some((item) => item.name.includes('ris') || item.name.includes('potatis'))],
    ['shopping has category', () => generatedPlanToShoppingList(dayPlan(), {}, { now }).items.some((item) => item.category.length > 0)],
    ['planner week summary compatible', () => buildGeneratedMealPlanSummary(generatedPlanToMealPlanWeek(dayPlan()).days?.['2026-02-03'] || []).mealCount === 0],
    ['weekly planner summary available', () => buildGeneratedMealPlanSummary(weekPlan().days).dayCount === 7],
  ])('supports %s', (_, assertion) => {
    expect(assertion()).toBe(true)
  })
})

describe('AI Meal Generator AI Coach integration', () => {
  function coach(message, plan = weekPlan()) {
    return createDeterministicAiCoachReply({
      context: {
        latestGeneratedMealPlan: plan,
        nutritionGoals: goals,
      },
      message,
    })
  }

  it.each([
    ['Vad är dagens AI-plan?', 'AI-plan'],
    ['Vad är veckans AI-plan?', 'AI-plan'],
    ['Hur mycket protein i planen?', 'protein'],
    ['Hur många kalorier i planen?', 'kcal'],
    ['Hur följer planen målen?', 'måltider'],
    ['Vilka recept valdes?', 'Recept som valdes'],
    ['Varför valdes receptet?', 'valdes eftersom'],
  ])('answers "%s"', (message, expected) => {
    expect(coach(message)).toContain(expected)
  })

  it('handles missing generated plan', () => {
    expect(coach('Vad är dagens AI-plan?', null)).toContain('ingen AI-genererad')
  })

  it('does not confuse recipe library questions with generated plan questions', () => {
    expect(coach('Vilka favoritrecept har jag?')).not.toContain('AI-planen')
  })

  it.each([
    ['Berätta om AI-planen', 'AI-plan'],
    ['Berätta om AI-meny', 'AI-plan'],
    ['Vad innehåller den ai genererad plan?', 'AI-plan'],
    ['Kalorier i AI-planen', 'kcal'],
    ['Protein i AI-planen', 'protein'],
    ['Följer AI-planen målen?', 'måltider'],
    ['Hur följer planen målen?', 'måltider'],
    ['Vilka recept valdes i AI-planen?', 'Recept som valdes'],
    ['Varför valdes första receptet?', 'valdes eftersom'],
    ['Varför valdes den?', 'valdes eftersom'],
  ])('handles wording "%s"', (message, expected) => {
    expect(coach(message)).toContain(expected)
  })
})

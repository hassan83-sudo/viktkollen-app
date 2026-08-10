import {
  buildPlannedDaySummary,
  buildPlannedWeekSummary,
  buildShoppingListFromMealPlan,
  categorizeShoppingListItems,
  generateDayMealPlan,
  generatedMealTypes,
  generatedPlanToShoppingList,
  getMealPlanWeek,
  getMealPlanWeekStart,
  normalizeNutritionGoals,
  updateShoppingListFromMealPlan,
  writeMealPlans,
  writeShoppingLists,
} from './nutritionEngine.js'

const defaultMealTemplates = [
  {
    ingredients: ['havregryn', 'ägg', 'kvarg', 'bär'],
    mealType: 'Frukost',
    name: 'Havregrynsgröt med ägg och kvarg',
    nutrition: { calories: 520, carbs: 55, fat: 16, protein: 38 },
  },
  {
    ingredients: ['kyckling', 'ris', 'grönsaker', 'olja'],
    mealType: 'Lunch',
    name: 'Kyckling med ris och grönsaker',
    nutrition: { calories: 650, carbs: 72, fat: 18, protein: 48 },
  },
  {
    ingredients: ['lax', 'potatis', 'grönsaker', 'yoghurt'],
    mealType: 'Middag',
    name: 'Lax med potatis och grönsaker',
    nutrition: { calories: 620, carbs: 50, fat: 24, protein: 42 },
  },
  {
    ingredients: ['kvarg', 'banan', 'nötter'],
    mealType: 'Mellanmål',
    name: 'Kvarg med banan och nötter',
    nutrition: { calories: 310, carbs: 32, fat: 9, protein: 27 },
  },
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeNumber(value) {
  const number = Number(value)

  return Number.isFinite(number) && number >= 0 ? number : 0
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function scaleNutrition(nutrition, calorieScale, proteinScale) {
  return {
    calories: Math.round(safeNumber(nutrition.calories) * calorieScale),
    carbs: Math.round(safeNumber(nutrition.carbs) * calorieScale),
    fat: Math.round(safeNumber(nutrition.fat) * calorieScale),
    protein: Math.round(safeNumber(nutrition.protein) * proteinScale),
  }
}

function makeDefaultTemplates(goals = {}) {
  const calorieTarget = safeNumber(goals.calories)
  const proteinTarget = safeNumber(goals.protein)
  const baseCalories = defaultMealTemplates.reduce((sum, meal) => sum + meal.nutrition.calories, 0)
  const baseProtein = defaultMealTemplates.reduce((sum, meal) => sum + meal.nutrition.protein, 0)
  const calorieScale = calorieTarget ? Math.max(0.75, Math.min(1.25, calorieTarget / baseCalories)) : 1
  const proteinScale = proteinTarget ? Math.max(0.85, Math.min(1.25, proteinTarget / baseProtein)) : 1

  return defaultMealTemplates.map((meal) => ({
    id: `daily-default-${meal.mealType}`,
    isFavorite: meal.mealType === 'Lunch',
    mealType: meal.mealType,
    name: meal.name,
    nutritionOverride: scaleNutrition(meal.nutrition, calorieScale, proteinScale),
    text: meal.ingredients.join(', '),
  }))
}

function historyTemplates(meals = []) {
  return safeArray(meals)
    .filter((meal) => meal?.planned !== true && meal?.status !== 'planned')
    .slice(-12)
    .map((meal, index) => ({
      id: `daily-history-${meal.id || index}`,
      isFavorite: index > 7,
      mealType: meal.mealType || meal.type || 'Automatiskt',
      name: meal.name || meal.title || meal.text || 'Tidigare måltid',
      nutritionOverride: {
        calories: safeNumber(meal.calories ?? meal.nutritionOverride?.calories),
        carbs: safeNumber(meal.carbs ?? meal.nutritionOverride?.carbs),
        fat: safeNumber(meal.fat ?? meal.nutritionOverride?.fat),
        protein: safeNumber(meal.protein ?? meal.nutritionOverride?.protein),
      },
      text: meal.text || meal.description || meal.name || meal.title || '',
    }))
}

function normalizeDashboardMeal(meal = {}, fallbackType = '') {
  const nutrition = meal.nutritionPreview || meal.nutritionOverride || {}

  return {
    carbs: safeNumber(nutrition.carbs),
    calories: safeNumber(nutrition.calories),
    fat: safeNumber(nutrition.fat),
    id: meal.id || `${fallbackType}-${meal.title}`,
    ingredients: safeArray(meal.ingredients).length ? meal.ingredients : String(meal.text || '').split(',').map((item) => item.trim()).filter(Boolean),
    mealType: meal.mealType || fallbackType,
    name: meal.title || meal.name || 'Planerad måltid',
    protein: safeNumber(nutrition.protein),
  }
}

function fillMissingMealTypes(meals = [], goals = {}) {
  const existingTypes = new Set(meals.map((meal) => meal.mealType))
  const fallbackTemplates = makeDefaultTemplates(goals)

  return [
    ...meals,
    ...generatedMealTypes
      .filter((mealType) => !existingTypes.has(mealType))
      .map((mealType) => {
        const template = fallbackTemplates.find((item) => item.mealType === mealType)

        return normalizeDashboardMeal({
          id: template.id,
          mealType,
          nutritionPreview: template.nutritionOverride,
          text: template.text,
          title: template.name,
        }, mealType)
      }),
  ].sort((first, second) => generatedMealTypes.indexOf(first.mealType) - generatedMealTypes.indexOf(second.mealType))
}

function summarizeMeals(meals = []) {
  return meals.reduce(
    (sum, meal) => ({
      calories: round(sum.calories + meal.calories),
      carbs: round(sum.carbs + meal.carbs),
      fat: round(sum.fat + meal.fat),
      protein: round(sum.protein + meal.protein),
    }),
    { calories: 0, carbs: 0, fat: 0, protein: 0 },
  )
}

function buildShoppingGroups(plan) {
  const list = generatedPlanToShoppingList(plan, {}, { now: plan.createdAt })
  const fallbackItems = plan.days
    .flatMap((day) => day.meals)
    .flatMap((meal) => safeArray(meal.ingredients).length
      ? meal.ingredients.map((name) => ({ name }))
      : String(meal.text || '').split(',').map((name) => ({ name: name.trim() })))
    .filter((item) => item.name)
  const items = list.items.length ? list.items : fallbackItems

  return categorizeShoppingListItems(items)
}

function dashboardMealToPlannedMeal(meal, date, now = new Date().toISOString()) {
  return {
    createdAt: now,
    date,
    id: `ai-daily-${date}-${meal.mealType}-${now}`.replace(/[^\w-]/g, '-'),
    ingredients: meal.ingredients,
    mealType: meal.mealType,
    notes: 'Sparad från AI Meal Planner.',
    nutritionPreview: {
      calories: meal.calories,
      carbs: meal.carbs,
      fat: meal.fat,
      protein: meal.protein,
    },
    scheduledTime: meal.mealType === 'Frukost'
      ? '08:00'
      : meal.mealType === 'Lunch'
        ? '12:00'
        : meal.mealType === 'Middag'
          ? '18:00'
          : '15:00',
    sourceId: `ai-daily-plan-${date}`,
    sourceType: 'custom',
    text: meal.ingredients.join(', '),
    title: meal.name,
    updatedAt: now,
  }
}

function replaceDay(week, date, meals) {
  return {
    ...week,
    days: {
      ...week.days,
      [date]: meals,
    },
  }
}

function appendDay(week, date, meals) {
  return {
    ...week,
    days: {
      ...week.days,
      [date]: [...(week.days[date] || []), ...meals],
    },
  }
}

export function saveDailyMealPlanToWeek({
  date,
  mealPlans = {},
  model,
  mode = 'replace',
  now = new Date().toISOString(),
} = {}) {
  const weekStart = getMealPlanWeekStart(date)
  const week = getMealPlanWeek(mealPlans, weekStart)
  const plannedMeals = safeArray(model?.meals).map((meal) => dashboardMealToPlannedMeal(meal, date, now))
  const nextWeek = mode === 'append'
    ? appendDay(week, date, plannedMeals)
    : replaceDay(week, date, plannedMeals)
  const savedPlans = writeMealPlans({
    ...mealPlans,
    weeks: {
      ...(mealPlans.weeks || {}),
      [weekStart]: nextWeek,
    },
  })

  return {
    plans: savedPlans,
    week: getMealPlanWeek(savedPlans, weekStart),
    weekStart,
  }
}

export function updateWeeklyShoppingListFromPlan({
  shoppingLists = {},
  week,
  now = new Date().toISOString(),
} = {}) {
  const result = updateShoppingListFromMealPlan(shoppingLists, week, now)
  const lists = writeShoppingLists(result.lists)

  return {
    ...result,
    groups: categorizeShoppingListItems(result.list.items),
    lists,
  }
}

export function buildWeeklyShoppingGroups({ shoppingLists = {}, week } = {}) {
  const weekStart = week?.weekStart || getMealPlanWeekStart()
  const previous = shoppingLists.weeks?.[weekStart] || null
  const list = buildShoppingListFromMealPlan(week, previous)

  return categorizeShoppingListItems(list.items)
}

export function buildDailyMealPlannerSaveState({ date, mealPlans = {}, nutritionGoals = {} } = {}) {
  const weekStart = getMealPlanWeekStart(date)
  const week = getMealPlanWeek(mealPlans, weekStart)
  const dayMeals = week.days[date] || []
  const savedSourceId = `ai-daily-plan-${date}`
  const daySummary = buildPlannedDaySummary(dayMeals, nutritionGoals)
  const weekSummary = buildPlannedWeekSummary(week, nutritionGoals)
  const weekTotals = weekSummary.days.reduce(
    (sum, day) => ({
      calories: round(sum.calories + safeNumber(day.totals?.calories)),
      protein: round(sum.protein + safeNumber(day.totals?.protein)),
    }),
    { calories: 0, protein: 0 },
  )

  return {
    dayHasPlan: dayMeals.length > 0,
    daySummary,
    saved: dayMeals.some((meal) => meal.sourceId === savedSourceId),
    week,
    weekStart,
    weekSummary,
    weekTotals,
  }
}

export function buildDailyMealPlannerModel({
  date,
  dietaryPreferences = {},
  meals = [],
  nutritionGoals = {},
  recipes = [],
  templates = [],
  variant = 0,
} = {}) {
  const goals = normalizeNutritionGoals(nutritionGoals)
  const fallbackTemplates = makeDefaultTemplates(goals)
  const plan = generateDayMealPlan({
    date,
    dietaryPreferences,
    nutritionGoals: goals,
    recipes,
    templates: [
      ...safeArray(templates),
      ...historyTemplates(meals),
      ...fallbackTemplates.slice(variant % fallbackTemplates.length),
      ...fallbackTemplates.slice(0, variant % fallbackTemplates.length),
    ],
  })
  const generatedMeals = plan.days[0]?.meals.map((meal) => normalizeDashboardMeal(meal, meal.mealType)) || []
  const dashboardMeals = fillMissingMealTypes(generatedMeals, goals)
  const dashboardPlan = {
    ...plan,
    days: [{
      date: plan.date,
      meals: dashboardMeals.map((meal) => ({
        id: meal.id,
        ingredients: meal.ingredients,
        mealType: meal.mealType,
        nutritionPreview: {
          calories: meal.calories,
          carbs: meal.carbs,
          fat: meal.fat,
          protein: meal.protein,
        },
        text: meal.ingredients.join(', '),
        title: meal.name,
      })),
      totals: summarizeMeals(dashboardMeals),
    }],
  }

  return {
    dashboardPlan,
    generatedFromHistory: safeArray(meals).length > 0 || safeArray(recipes).length > 0 || safeArray(templates).length > 0,
    meals: dashboardMeals,
    shoppingGroups: buildShoppingGroups(dashboardPlan),
    summary: dashboardPlan.days[0].totals,
  }
}

import {
  categorizeShoppingListItems,
  generateDayMealPlan,
  generatedMealTypes,
  generatedPlanToShoppingList,
  normalizeNutritionGoals,
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
    generatedFromHistory: safeArray(meals).length > 0 || safeArray(recipes).length > 0 || safeArray(templates).length > 0,
    meals: dashboardMeals,
    shoppingGroups: buildShoppingGroups(dashboardPlan),
    summary: dashboardPlan.days[0].totals,
  }
}

import { filterTemplatesByDietaryPreferences } from './dietaryPreferences.js'
import { normalizeMealTemplate, normalizeMealTemplates } from './mealTemplates.js'
import {
  addPlannedMeal,
  createMealPlanWeek,
  createPlannedMealFromTemplate,
  getLocalDateString,
  getMealPlanWeekDates,
  getMealPlanWeekStart,
  normalizeMealPlans,
  normalizeMealPlanWeek,
} from './mealPlanner.js'
import {
  calculateRecipeNutrition,
  filterRecipesByDietaryPreferences,
  normalizeRecipes,
  recipeToPlannedMeal,
} from './recipeService.js'
import { buildShoppingListFromMealPlan, getShoppingList, normalizeShoppingLists } from './shoppingList.js'
import { normalizeNutritionGoals } from './nutritionGoals.js'

export const generatedMealPlansStorageKey = 'viktkollen.generatedMealPlans'
export const generatedMealPlanVersion = 1
export const generatedMealTypes = ['Frukost', 'Lunch', 'Middag', 'Mellanmål']

const defaultMealTimes = {
  Frukost: '08:00',
  Lunch: '12:00',
  Middag: '18:00',
  Mellanmål: '15:00',
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function normalizeText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function createId(prefix = 'generated-meal-plan', seed = Date.now()) {
  return `${prefix}-${seed}-${Math.random().toString(36).slice(2, 8)}`
}

function safeNumber(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function sumNutrition(meals = []) {
  return meals.reduce(
    (total, meal) => ({
      calories: round(total.calories + safeNumber(meal.nutritionPreview?.calories)),
      carbs: round(total.carbs + safeNumber(meal.nutritionPreview?.carbs)),
      fat: round(total.fat + safeNumber(meal.nutritionPreview?.fat)),
      protein: round(total.protein + safeNumber(meal.nutritionPreview?.protein)),
    }),
    { calories: 0, carbs: 0, fat: 0, protein: 0 },
  )
}

function candidateMealType(source = {}) {
  const type = normalizeText(source.category || source.mealType || source.type)

  return generatedMealTypes.includes(type) ? type : 'Annat'
}

function candidateText(source = {}) {
  return [
    source.name,
    source.description,
    source.text,
    source.category,
    source.mealType,
    ...(Array.isArray(source.tags) ? source.tags : []),
    ...(Array.isArray(source.ingredients) ? source.ingredients.map((ingredient) => ingredient.name || ingredient).filter(Boolean) : []),
  ].join(' ')
}

function templateNutrition(template) {
  const normalized = normalizeMealTemplate(template)
  if (!normalized) return { calories: 0, carbs: 0, fat: 0, protein: 0 }

  return {
    calories: safeNumber(normalized.nutritionOverride.calories),
    carbs: safeNumber(normalized.nutritionOverride.carbs),
    fat: safeNumber(normalized.nutritionOverride.fat),
    protein: safeNumber(normalized.nutritionOverride.protein),
  }
}

export function buildMealGeneratorCandidates({ dietaryPreferences = {}, recipes = [], templates = [] } = {}) {
  const normalizedRecipes = normalizeRecipes(recipes)
  const compatibleRecipeIds = new Set(filterRecipesByDietaryPreferences(normalizedRecipes, dietaryPreferences).map((recipe) => recipe.id))
  const normalizedTemplates = normalizeMealTemplates(templates)
  const compatibleTemplateIds = new Set(filterTemplatesByDietaryPreferences(normalizedTemplates, dietaryPreferences).map((template) => template.id))

  return [
    ...normalizedRecipes.map((recipe) => {
      const nutrition = calculateRecipeNutrition(recipe).perServing

      return {
        compatible: compatibleRecipeIds.has(recipe.id),
        favorite: recipe.favorite,
        id: recipe.id,
        mealType: candidateMealType(recipe),
        nutrition,
        source: recipe,
        sourceType: 'recipe',
        text: candidateText(recipe),
        title: recipe.name,
      }
    }),
    ...normalizedTemplates.map((template) => ({
      compatible: compatibleTemplateIds.has(template.id),
      favorite: template.isFavorite,
      id: template.id,
      mealType: candidateMealType(template),
      nutrition: templateNutrition(template),
      source: template,
      sourceType: 'template',
      text: candidateText(template),
      title: template.name,
    })),
  ]
}

function selectCandidate(candidates, mealType, state, goals = {}) {
  const typeMatches = candidates.filter((candidate) => candidate.mealType === mealType)
  const source = typeMatches.length ? typeMatches : candidates
  const compatibleSource = source.filter((candidate) => candidate.compatible)
  const scoringSource = compatibleSource.length ? compatibleSource : source
  const targetProtein = generatedMealTypes.includes(mealType) && safeNumber(goals.protein)
    ? safeNumber(goals.protein) / generatedMealTypes.length
    : 0
  const targetCalories = generatedMealTypes.includes(mealType) && safeNumber(goals.calories)
    ? safeNumber(goals.calories) / generatedMealTypes.length
    : 0

  return [...scoringSource]
    .map((candidate, index) => {
      const repeatedPrevious = state.previousSourceId === candidate.id
      const repeatedLunchDinner = ['Lunch', 'Middag'].includes(mealType) && state.lastByMealType[mealType] === candidate.id
      const usedCount = state.usedCounts.get(candidate.id) || 0
      const proteinGap = targetProtein ? Math.abs(safeNumber(candidate.nutrition.protein) - targetProtein) : 0
      const calorieGap = targetCalories ? Math.abs(safeNumber(candidate.nutrition.calories) - targetCalories) : 0
      const score =
        (candidate.sourceType === 'recipe' ? 60 : 30) +
        (candidate.favorite ? 35 : 0) +
        (candidate.compatible ? 25 : -35) +
        (candidate.mealType === mealType ? 20 : 0) +
        Math.min(safeNumber(candidate.nutrition.protein), 45) * 0.8 -
        proteinGap * 0.25 -
        calorieGap * 0.03 -
        usedCount * 14 -
        (repeatedPrevious ? 120 : 0) -
        (repeatedLunchDinner ? 90 : 0) -
        index * 0.01

      return { candidate, score }
    })
    .sort((first, second) => second.score - first.score || first.candidate.title.localeCompare(second.candidate.title, 'sv-SE'))[0]?.candidate || null
}

function candidateToPlannedMeal(candidate, date, mealType, now) {
  if (!candidate) return null

  const options = {
    date,
    scheduledTime: defaultMealTimes[mealType],
  }
  const result = candidate.sourceType === 'recipe'
    ? recipeToPlannedMeal(candidate.source, { ...options, now })
    : createPlannedMealFromTemplate(candidate.source, options, now)
  const meal = result.meal
  if (!meal) return null

  return {
    ...meal,
    mealType,
    notes: candidate.sourceType === 'recipe'
      ? `AI-generatorn valde receptet: ${buildSelectionReason(candidate, mealType)}`
      : `AI-generatorn använde mall som fallback: ${buildSelectionReason(candidate, mealType)}`,
    scheduledTime: defaultMealTimes[mealType],
  }
}

export function buildSelectionReason(candidate, mealType) {
  if (!candidate) return 'ingen kandidat kunde väljas'

  const parts = []
  if (candidate.favorite) parts.push('favorit')
  if (candidate.compatible) parts.push('matchar matval')
  if (safeNumber(candidate.nutrition.protein) >= 20) parts.push('hjälper proteinmålet')
  if (candidate.mealType === mealType) parts.push(`passar ${mealType.toLocaleLowerCase('sv-SE')}`)
  if (!parts.length) parts.push(candidate.sourceType === 'template' ? 'fallback från måltidsmall' : 'variation i planen')

  return parts.join(', ')
}

function buildGeneratedDay(date, candidates, state, goals, now) {
  const meals = generatedMealTypes.map((mealType) => {
    const candidate = selectCandidate(candidates, mealType, state, goals)
    const meal = candidateToPlannedMeal(candidate, date, mealType, now)
    if (!candidate || !meal) return null

    state.previousSourceId = candidate.id
    state.usedCounts.set(candidate.id, (state.usedCounts.get(candidate.id) || 0) + 1)
    if (['Lunch', 'Middag'].includes(mealType)) state.lastByMealType[mealType] = candidate.id

    return {
      ...meal,
      selectionReason: buildSelectionReason(candidate, mealType),
      sourceKind: candidate.sourceType,
    }
  }).filter(Boolean)
  const totals = sumNutrition(meals)

  return {
    date,
    meals,
    totals,
  }
}

export function buildGeneratedMealPlanSummary(days = []) {
  const plannedDays = (Array.isArray(days) ? days : []).filter((day) => day.meals?.length)
  const totals = plannedDays.reduce(
    (sum, day) => ({
      calories: round(sum.calories + safeNumber(day.totals?.calories)),
      carbs: round(sum.carbs + safeNumber(day.totals?.carbs)),
      fat: round(sum.fat + safeNumber(day.totals?.fat)),
      protein: round(sum.protein + safeNumber(day.totals?.protein)),
    }),
    { calories: 0, carbs: 0, fat: 0, protein: 0 },
  )

  return {
    averageCalories: plannedDays.length ? round(totals.calories / plannedDays.length) : 0,
    averageProtein: plannedDays.length ? round(totals.protein / plannedDays.length) : 0,
    dayCount: plannedDays.length,
    mealCount: plannedDays.reduce((sum, day) => sum + day.meals.length, 0),
    totals,
  }
}

export function generateMealPlan(options = {}) {
  const mode = options.mode === 'week' ? 'week' : 'day'
  const now = options.now || new Date().toISOString()
  const date = options.date || getLocalDateString()
  const weekStart = getMealPlanWeekStart(date)
  const goals = normalizeNutritionGoals(options.nutritionGoals)
  const candidates = buildMealGeneratorCandidates(options)
  const dates = mode === 'week' ? getMealPlanWeekDates(weekStart) : [date]
  const state = {
    lastByMealType: {},
    previousSourceId: '',
    usedCounts: new Map(),
  }
  const days = dates.map((dayDate) => buildGeneratedDay(dayDate, candidates, state, goals, now))
  const summary = buildGeneratedMealPlanSummary(days)

  return normalizeGeneratedMealPlan({
    createdAt: now,
    date,
    days,
    id: createId('generated-meal-plan', now),
    mode,
    summary,
    weekStart,
  })
}

export function generateDayMealPlan(options = {}) {
  return generateMealPlan({ ...options, mode: 'day' })
}

export function generateWeekMealPlan(options = {}) {
  return generateMealPlan({ ...options, mode: 'week' })
}

export function normalizeGeneratedMealPlan(plan = {}) {
  if (!isObject(plan)) return null
  if (!plan.id && !Array.isArray(plan.days)) return null

  const now = new Date().toISOString()
  const mode = plan.mode === 'week' ? 'week' : 'day'
  const date = normalizeText(plan.date) || getLocalDateString()
  const weekStart = getMealPlanWeekStart(plan.weekStart || date)
  const days = (Array.isArray(plan.days) ? plan.days : [])
    .map((day) => {
      const dayDate = normalizeText(day?.date) || date
      const meals = (Array.isArray(day?.meals) ? day.meals : []).filter(Boolean)

      return {
        date: dayDate,
        meals,
        totals: sumNutrition(meals),
      }
    })
    .filter((day) => day.meals.length)
  const createdAt = new Date(plan.createdAt || now)

  return {
    createdAt: Number.isNaN(createdAt.getTime()) ? now : createdAt.toISOString(),
    date,
    days,
    id: normalizeText(plan.id, 120) || createId('generated-meal-plan', now),
    mode,
    summary: buildGeneratedMealPlanSummary(days),
    version: generatedMealPlanVersion,
    weekStart,
  }
}

export function normalizeGeneratedMealPlans(value = {}) {
  const sourceHistory = Array.isArray(value?.history) ? value.history : Array.isArray(value) ? value : []
  const history = sourceHistory.map(normalizeGeneratedMealPlan).filter(Boolean).slice(0, 30)
  const latestPlanId = normalizeText(value?.latestPlanId)
  const fallbackLatest = history[0]?.id || ''

  return {
    history,
    latestPlanId: history.some((plan) => plan.id === latestPlanId) ? latestPlanId : fallbackLatest,
    version: generatedMealPlanVersion,
  }
}

export function readGeneratedMealPlans(storage) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return normalizeGeneratedMealPlans()

  try {
    return normalizeGeneratedMealPlans(JSON.parse(resolvedStorage.getItem(generatedMealPlansStorageKey) || '{}'))
  } catch {
    return normalizeGeneratedMealPlans()
  }
}

export function writeGeneratedMealPlans(plans, storage) {
  const normalized = normalizeGeneratedMealPlans(plans)
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return normalized

  try {
    resolvedStorage.setItem(generatedMealPlansStorageKey, JSON.stringify(normalized))
  } catch {
    return normalized
  }

  return normalized
}

export function saveGeneratedMealPlan(plan, history = readGeneratedMealPlans(), storage) {
  const normalizedPlan = normalizeGeneratedMealPlan(plan)
  const normalizedHistory = normalizeGeneratedMealPlans(history)
  if (!normalizedPlan) return normalizedHistory

  return writeGeneratedMealPlans({
    history: [normalizedPlan, ...normalizedHistory.history.filter((entry) => entry.id !== normalizedPlan.id)],
    latestPlanId: normalizedPlan.id,
  }, storage)
}

export function getLatestGeneratedMealPlan(history = {}) {
  const normalized = normalizeGeneratedMealPlans(history)

  return normalized.history.find((plan) => plan.id === normalized.latestPlanId) || normalized.history[0] || null
}

export function generatedPlanToMealPlanWeek(plan = {}) {
  const normalized = normalizeGeneratedMealPlan(plan)
  if (!normalized) return createMealPlanWeek()

  return normalizeMealPlanWeek({
    days: Object.fromEntries(getMealPlanWeekDates(normalized.weekStart).map((date) => [
      date,
      normalized.days.find((day) => day.date === date)?.meals || [],
    ])),
    weekStart: normalized.weekStart,
  }, normalized.weekStart)
}

export function applyGeneratedPlanToMealPlans(plan = {}, mealPlans = {}, options = {}) {
  const normalizedPlan = normalizeGeneratedMealPlan(plan)
  if (!normalizedPlan) return normalizeMealPlans(mealPlans)

  const weekStart = options.weekStart || normalizedPlan.weekStart
  let nextPlans = options.mode === 'replace'
    ? normalizeMealPlans({
      ...normalizeMealPlans(mealPlans),
      weeks: {
        ...normalizeMealPlans(mealPlans).weeks,
        [weekStart]: createMealPlanWeek(weekStart, options.now || new Date().toISOString()),
      },
    })
    : normalizeMealPlans(mealPlans)

  normalizedPlan.days.flatMap((day) => day.meals).forEach((meal, index) => {
    const nextMeal = options.mode === 'append'
      ? { ...meal, id: `${meal.id}-copy-${index}-${String(options.now || Date.now()).replace(/[^\w-]/g, '')}` }
      : meal

    nextPlans = addPlannedMeal(nextPlans, weekStart, nextMeal, options.now || new Date().toISOString())
  })

  return nextPlans
}

export function generatedPlanToShoppingList(plan = {}, shoppingLists = {}, options = {}) {
  const week = generatedPlanToMealPlanWeek(plan)
  const normalizedLists = normalizeShoppingLists(shoppingLists)
  const previous = getShoppingList(normalizedLists, week.weekStart)

  return buildShoppingListFromMealPlan(week, previous, options.now || new Date().toISOString())
}

export function describeGeneratedMealPlan(plan = {}, goals = {}) {
  const normalized = normalizeGeneratedMealPlan(plan)
  if (!normalized) return 'Ingen AI-genererad plan finns ännu.'

  const summary = normalized.summary
  const normalizedGoals = normalizeNutritionGoals(goals)
  const proteinGoal = safeNumber(normalizedGoals.protein)
  const calorieGoal = safeNumber(normalizedGoals.calories)
  const proteinText = proteinGoal
    ? `Snittet är ${Math.round(summary.averageProtein).toLocaleString('sv-SE')} g protein per dag mot målet ${proteinGoal.toLocaleString('sv-SE')} g.`
    : `Snittet är ${Math.round(summary.averageProtein).toLocaleString('sv-SE')} g protein per dag.`
  const calorieText = calorieGoal
    ? `Kalorierna ligger runt ${Math.round(summary.averageCalories).toLocaleString('sv-SE')} kcal per dag mot målet ${calorieGoal.toLocaleString('sv-SE')} kcal.`
    : `Kalorierna ligger runt ${Math.round(summary.averageCalories).toLocaleString('sv-SE')} kcal per dag.`

  return `${normalized.mode === 'week' ? 'Veckans' : 'Dagens'} AI-plan har ${summary.mealCount} måltider. ${proteinText} ${calorieText}`
}

export function listGeneratedPlanRecipeNames(plan = {}) {
  const normalized = normalizeGeneratedMealPlan(plan)
  if (!normalized) return []

  return [...new Set(normalized.days
    .flatMap((day) => day.meals)
    .filter((meal) => meal.sourceType === 'recipe')
    .map((meal) => meal.title))]
}

export const mealGeneratorInternals = {
  buildGeneratedDay,
  candidateMealType,
  candidateText,
  selectCandidate,
  sumNutrition,
}

import {
  getEffectiveMealNutrition,
  parseCorrectionNumber,
  validateMealEditDraft,
} from './nutrition/mealCorrections.js'
import {
  createUpdatedNutritionGoals,
  makeNutritionGoalProgress,
  normalizeNutritionGoals as normalizeNutritionGoalsModel,
  validateNutritionGoals as validateNutritionGoalsModel,
} from './nutrition/nutritionGoals.js'
import {
  addLocalDays,
  getLocalDateString,
  parseDateValue,
} from './localDate.js'

export const mealTypes = ['Frukost', 'Lunch', 'Middag', 'Mellanmål', 'Dryck', 'Annat']
export const mealSources = ['Manuell', 'Fotoanalys', 'Snabbval', 'Importerad']

const nutritionExportVersion = 1

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

export function getTodayDateString(date = new Date()) {
  return getLocalDateString(date)
}

export function getCurrentTimeString(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function addDays(dateString, amount) {
  const date = addLocalDays(parseDate(dateString) || new Date(), amount)

  return getTodayDateString(date)
}

export function parseDate(value) {
  if (!value) {
    return null
  }

  return parseDateValue(value)
}

export function parseNutritionNumber(value, fallback = null) {
  if (value === '' || value === null || value === undefined) {
    return fallback
  }

  const parsed = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''))

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return Math.min(parsed, 100000)
}

function normalizeMealType(value) {
  const text = String(value || '').trim()
  const match = mealTypes.find(
    (type) => type.toLocaleLowerCase('sv-SE') === text.toLocaleLowerCase('sv-SE'),
  )

  return match || 'Annat'
}

function normalizeMealSource(value) {
  const text = String(value || '').trim()
  const match = mealSources.find(
    (source) => source.toLocaleLowerCase('sv-SE') === text.toLocaleLowerCase('sv-SE'),
  )

  return match || 'Manuell'
}

export function createStableMealId(seed = Date.now()) {
  return `meal-${seed}-${Math.random().toString(36).slice(2, 8)}`
}

function splitIsoDateTime(value) {
  const date = parseDate(value)

  return {
    date: date ? getTodayDateString(date) : getTodayDateString(),
    time: date ? getCurrentTimeString(date) : getCurrentTimeString(),
  }
}

export function normalizeMeal(entry, options = {}) {
  if (!isObject(entry)) {
    return null
  }

  const fallbackDateTime = splitIsoDateTime(entry.createdAt || entry.date || Date.now())
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || ''))
    ? entry.date
    : fallbackDateTime.date
  const time = /^\d{2}:\d{2}$/.test(String(entry.time || ''))
    ? entry.time
    : fallbackDateTime.time
  const now = new Date().toISOString()
  const description =
    typeof entry.description === 'string'
      ? entry.description
      : typeof entry.text === 'string'
        ? entry.text
        : ''
  const name =
    typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim()
      : description.split(',')[0]?.trim() || 'Måltid'

  const nutritionOverride = ['calories', 'protein', 'carbs', 'fat'].reduce((result, field) => {
    const parsed = parseCorrectionNumber(entry.nutritionOverride?.[field])

    if (parsed !== null) {
      result[field] = parsed
    }

    return result
  }, {})
  const hasOverride = Object.keys(nutritionOverride).length > 0

  return {
    ...entry,
    calories: parseNutritionNumber(entry.calories),
    carbs: parseNutritionNumber(entry.carbs ?? entry.carbohydrates),
    createdAt: parseDate(entry.createdAt)?.toISOString() || now,
    date,
    description,
    fat: parseNutritionNumber(entry.fat),
    fiber: parseNutritionNumber(entry.fiber),
    id: String(entry.id || createStableMealId(entry.createdAt || Date.now())),
    name,
    note: typeof entry.note === 'string' ? entry.note : '',
    correctionNote: typeof entry.correctionNote === 'string' ? entry.correctionNote.trim() : '',
    mealType: entry.mealType || entry.type || '',
    nutritionOverride,
    nutritionSource: hasOverride ? 'manual' : entry.nutritionSource || 'automatic',
    portionCount: parseNutritionNumber(entry.portionCount, 1) || 1,
    portionSize: typeof entry.portionSize === 'string' ? entry.portionSize : '',
    protein: parseNutritionNumber(entry.protein),
    source: normalizeMealSource(options.source || entry.source),
    text: description,
    time,
    type: normalizeMealType(entry.type || entry.mealType),
    updatedAt: parseDate(entry.updatedAt)?.toISOString() || now,
  }
}

export function normalizeMeals(meals) {
  const seen = new Set()

  return (Array.isArray(meals) ? meals : [])
    .map(normalizeMeal)
    .filter(Boolean)
    .filter((meal) => {
      if (seen.has(meal.id)) {
        return false
      }

      seen.add(meal.id)
      return true
    })
    .sort(compareMealsNewestFirst)
}

export function getEmptyMeal(date = getTodayDateString(), time = getCurrentTimeString()) {
  return {
    calories: '',
    carbs: '',
    date,
    description: '',
    fat: '',
    fiber: '',
    id: '',
    name: '',
    note: '',
    portionCount: 1,
    portionSize: '',
    protein: '',
    source: 'Manuell',
    time,
    type: 'Lunch',
  }
}

export function validateMealDraft(draft) {
  const errors = {}
  const numericFields = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'portionCount']

  if (!draft.date || !parseDate(draft.date)) {
    errors.date = 'Välj ett giltigt datum.'
  }

  if (!/^\d{2}:\d{2}$/.test(String(draft.time || ''))) {
    errors.time = 'Välj en giltig tid.'
  }

  if (!String(draft.name || '').trim() && !String(draft.description || '').trim()) {
    errors.name = 'Ange namn eller beskrivning.'
  }

  numericFields.forEach((field) => {
    if (draft[field] !== '' && draft[field] !== null && draft[field] !== undefined && parseCorrectionNumber(draft[field]) === null) {
      errors[field] = String(draft[field]).trim().startsWith('-')
        ? 'Värdet får inte vara negativt.'
        : 'Ange ett giltigt tal eller lämna tomt.'
    }
  })

  if (parseNutritionNumber(draft.portionCount, 1) === 0) {
    errors.portionCount = 'Antal portioner behöver vara minst 1.'
  }

  return errors
}

export function mealDraftToMeal(draft, existingMeal = null) {
  const now = new Date().toISOString()
  const editValidation = validateMealEditDraft({
    ...draft,
    nutritionOverride: draft.nutritionOverride || {
      calories: draft.calories,
      carbs: draft.carbs,
      fat: draft.fat,
      protein: draft.protein,
    },
  })

  if (Object.keys(editValidation).length > 0) {
    return null
  }

  const nutritionOverride = ['calories', 'protein', 'carbs', 'fat'].reduce((result, field) => {
    const parsed = parseCorrectionNumber(draft.nutritionOverride?.[field] ?? draft[field])

    if (parsed !== null) {
      result[field] = parsed
    }

    return result
  }, {})

  return normalizeMeal({
    ...existingMeal,
    ...draft,
    createdAt: existingMeal?.createdAt || now,
    id: existingMeal?.id || draft.id || createStableMealId(now),
    source: draft.source || existingMeal?.source || 'Manuell',
    nutritionOverride,
    nutritionSource: Object.keys(nutritionOverride).length > 0 ? 'manual' : 'automatic',
    updatedAt: now,
  })
}

export function upsertMeal(meals, meal) {
  const normalizedMeal = normalizeMeal(meal)

  if (!normalizedMeal) {
    return normalizeMeals(meals)
  }

  return normalizeMeals([
    normalizedMeal,
    ...normalizeMeals(meals).filter((entry) => entry.id !== normalizedMeal.id),
  ])
}

export function copyMealToDate(meal, date, time = getCurrentTimeString()) {
  return normalizeMeal({
    ...meal,
    createdAt: new Date().toISOString(),
    date,
    id: createStableMealId(),
    source: meal.source || 'Manuell',
    time,
    updatedAt: new Date().toISOString(),
  })
}

export function compareMealsNewestFirst(first, second) {
  return `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`)
}

function sumField(meals, field) {
  return meals.reduce((sum, meal) => sum + (getEffectiveMealNutrition(meal).totals[field] || 0), 0)
}

function getMealsForDate(meals, date) {
  return normalizeMeals(meals).filter((meal) => meal.date === date)
}

export function makeLegacyGoalProgress(value, goal) {
  const target = parseNutritionNumber(goal)

  if (target === null || target === 0) {
    return {
      label: 'Mål saknas',
      percent: null,
      status: 'missing',
    }
  }

  const percent = Math.round((value / target) * 100)

  return {
    label:
      percent < 85
        ? 'Under mål'
        : percent <= 115
          ? 'Nära eller uppnått'
          : 'Över mål',
    percent,
    status: percent < 85 ? 'under' : percent <= 115 ? 'near' : 'over',
  }
}

export function normalizeNutritionGoals(goals = {}) {
  return normalizeNutritionGoalsModel(goals)
}

export function validateNutritionGoals(goals) {
  return validateNutritionGoalsModel(goals)
}

export { createUpdatedNutritionGoals }

export function validateLegacyNutritionGoals(goals) {
  const errors = {}

  Object.entries(goals).forEach(([key, value]) => {
    if (key === 'updatedAt' || value === '' || value === null || value === undefined) {
      return
    }

    if (parseNutritionNumber(value) === null) {
      errors[key] = 'Ange ett positivt tal eller lämna tomt.'
    }
  })

  return errors
}

export function summarizeDay(meals, date, goals = {}) {
  const dayMeals = getMealsForDate(meals, date)
  const normalizedGoals = normalizeNutritionGoals(goals)
  const totals = {
    calories: sumField(dayMeals, 'calories'),
    carbs: sumField(dayMeals, 'carbs'),
    fat: sumField(dayMeals, 'fat'),
    fiber: sumField(dayMeals, 'fiber'),
    protein: sumField(dayMeals, 'protein'),
  }
  const byType = mealTypes.map((type) => ({
    count: dayMeals.filter((meal) => meal.type === type).length,
    type,
  }))
  const largestMeal = [...dayMeals].sort(
    (first, second) => (getEffectiveMealNutrition(second).totals.calories || 0) - (getEffectiveMealNutrition(first).totals.calories || 0),
  )[0]
  const highestProteinMeal = [...dayMeals].sort(
    (first, second) => (getEffectiveMealNutrition(second).totals.protein || 0) - (getEffectiveMealNutrition(first).totals.protein || 0),
  )[0]

  return {
    byType,
    date,
    goals: normalizedGoals,
    largestMeal: largestMeal || null,
    mealCount: dayMeals.length,
    meals: dayMeals,
    progress: {
      calories: makeNutritionGoalProgress(totals.calories, normalizedGoals.calories, 'kcal', 'Kalorier'),
      carbs: makeNutritionGoalProgress(totals.carbs, normalizedGoals.carbs, 'g', 'Kolhydrater'),
      fat: makeNutritionGoalProgress(totals.fat, normalizedGoals.fat, 'g', 'Fett'),
      fiber: makeNutritionGoalProgress(totals.fiber, normalizedGoals.fiber, 'g', 'Fibrer'),
      protein: makeNutritionGoalProgress(totals.protein, normalizedGoals.protein, 'g', 'Protein'),
    },
    totals,
    highestProteinMeal: highestProteinMeal || null,
  }
}

export function getWeekStart(dateString) {
  const date = parseDate(dateString) || new Date()
  const day = date.getDay() || 7

  date.setDate(date.getDate() - day + 1)

  return getTodayDateString(date)
}

export function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

export function summarizeWeek(meals, weekStart, goals = {}) {
  const dates = getWeekDates(weekStart)
  const summaries = dates.map((date) => summarizeDay(meals, date, goals))
  const registeredDays = summaries.filter((summary) => summary.mealCount > 0)
  const dayCount = registeredDays.length
  const totalMeals = registeredDays.reduce((sum, summary) => sum + summary.mealCount, 0)

  function averageDaily(field) {
    return dayCount
      ? registeredDays.reduce((sum, summary) => sum + summary.totals[field], 0) / dayCount
      : null
  }

  function bestBy(selector) {
    return registeredDays.sort((first, second) => selector(second) - selector(first))[0] || null
  }

  return {
    averageCalories: averageDaily('calories'),
    averageFiber: averageDaily('fiber'),
    averageProtein: averageDaily('protein'),
    calorieGoalDays: registeredDays.filter((summary) => summary.progress.calories.status === 'near').length,
    dates,
    highestProteinDay: bestBy((summary) => summary.totals.protein)?.date || 'Saknas',
    mostConsistentDay:
      registeredDays.find((summary) => summary.progress.calories.status === 'near')?.date ||
      registeredDays[0]?.date ||
      'Saknas',
    mostLoggedDay: bestBy((summary) => summary.mealCount)?.date || 'Saknas',
    proteinGoalDays: registeredDays.filter((summary) => summary.progress.protein.status === 'near').length,
    fiberGoalDays: registeredDays.filter((summary) => summary.progress.fiber.status === 'near').length,
    registeredDays: dayCount,
    totalMeals,
  }
}

export function buildNutritionInsights({ goals, meals, weekStart }) {
  const week = summarizeWeek(meals, weekStart, goals)
  const previousWeek = summarizeWeek(meals, addDays(weekStart, -7), goals)
  const insights = []

  if (week.registeredDays < 2) {
    insights.push({
      basis: `${week.registeredDays} registrerade dagar denna vecka.`,
      priority: 100,
      text: 'Det finns för lite kostdata för säkra mönster ännu. Logga några fler dagar för tydligare analys.',
    })
  }

  if (goals.protein && week.proteinGoalDays < Math.max(1, Math.ceil(week.registeredDays / 2))) {
    insights.push({
      basis: `${week.proteinGoalDays} dagar nådde proteinmålet.`,
      priority: 90,
      text: 'Protein ligger ofta under målet. Ett enkelt nästa steg är en tydligare proteinkälla i en måltid.',
    })
  }

  if (goals.fiber && week.fiberGoalDays < Math.max(1, Math.ceil(week.registeredDays / 2))) {
    insights.push({
      basis: `${week.fiberGoalDays} dagar nådde fibermålet.`,
      priority: 80,
      text: 'Fibermålet nås sällan. Frukt, grönsaker, bönor eller fullkorn kan hjälpa utan att göra dagen krånglig.',
    })
  }

  if (week.registeredDays >= 4) {
    insights.push({
      basis: `${week.registeredDays} registrerade dagar.`,
      priority: 70,
      text: 'Du har en stabil registrering den här veckan. Det gör coachens analyser mer användbara.',
    })
  }

  if (week.averageProtein && previousWeek.averageProtein && week.averageProtein > previousWeek.averageProtein + 5) {
    insights.push({
      basis: `Protein ökade från ${Math.round(previousWeek.averageProtein)} g till ${Math.round(week.averageProtein)} g i snitt.`,
      priority: 75,
      text: 'Proteinnivån ser förbättrad ut jämfört med föregående vecka.',
    })
  }

  return insights
    .sort((first, second) => second.priority - first.priority)
    .slice(0, 4)
}

export function normalizeFavoriteMeal(entry) {
  const meal = normalizeMeal(entry)

  if (!meal) {
    return null
  }

  return {
    ...meal,
    id: String(entry.favoriteId || entry.id || createStableMealId()),
    source: 'Snabbval',
  }
}

export function normalizeFavoriteMeals(favorites) {
  return (Array.isArray(favorites) ? favorites : [])
    .map(normalizeFavoriteMeal)
    .filter(Boolean)
}

export function favoriteToMeal(favorite, date, time) {
  return normalizeMeal({
    ...favorite,
    createdAt: new Date().toISOString(),
    date,
    id: createStableMealId(),
    source: 'Snabbval',
    time,
    updatedAt: new Date().toISOString(),
  })
}

export function exportNutritionData({ favorites, goals, meals }) {
  return {
    app: 'Viktkollen',
    exportedAt: new Date().toISOString(),
    feature: 'Kostdata',
    format: 'viktkollen-nutrition',
    version: nutritionExportVersion,
    data: {
      favoriteMeals: normalizeFavoriteMeals(favorites),
      goals: normalizeNutritionGoals(goals),
      meals: normalizeMeals(meals),
    },
  }
}

export function parseNutritionImport(payload) {
  if (!isObject(payload) || payload.format !== 'viktkollen-nutrition') {
    return {
      ok: false,
      reason: 'Filen är inte en giltig Viktkollen kostexport.',
    }
  }

  const meals = normalizeMeals(payload.data?.meals || [])
  const favoriteMeals = normalizeFavoriteMeals(payload.data?.favoriteMeals || [])
  const goals = normalizeNutritionGoals(payload.data?.goals || {})

  return {
    favoriteMeals,
    goals,
    hasGoals: Object.values(goals).some(Boolean),
    meals,
    ok: true,
    summary: {
      favoriteCount: favoriteMeals.length,
      hasGoals: Object.values(goals).some(Boolean),
      mealCount: meals.length,
    },
  }
}

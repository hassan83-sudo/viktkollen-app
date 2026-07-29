import { getEffectiveMealNutrition, normalizeMealRecord } from './mealCorrections.js'
import { sumMealNutrition } from './nutritionCalculator.js'

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getMealDate(meal) {
  const rawDate = String(meal?.date || '')

  if (rawDate.includes('T')) {
    const parsed = parseDate(rawDate)

    return parsed ? getLocalDateString(parsed) : ''
  }

  const dateText = rawDate.slice(0, 10)

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return dateText
  }

  const fallback = parseDate(meal?.createdAt || meal?.timestamp)

  return fallback ? getLocalDateString(fallback) : ''
}

function getMealText(meal) {
  return [
    meal?.name,
    meal?.description,
    meal?.text,
    meal?.title,
    meal?.note,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function getMealClockTime(meal) {
  const time = String(meal?.time || '').trim()

  if (/^\d{2}:\d{2}$/.test(time)) return time

  const dateWithTime = String(meal?.date || '').includes('T') ? meal.date : null
  const parsed = parseDate(dateWithTime || meal?.createdAt || meal?.timestamp)

  if (!parsed) return ''

  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
}

function getMinutes(time) {
  if (!/^\d{2}:\d{2}$/.test(time)) return null

  const [hours, minutes] = time.split(':').map(Number)

  return hours * 60 + minutes
}

function inferMealTypeFromTime(time) {
  const minutes = getMinutes(time)

  if (!Number.isFinite(minutes)) return null
  if (minutes < 5 * 60) return 'nattmål'
  if (minutes < 10 * 60) return 'frukost'
  if (minutes < 11 * 60) return 'mellanmål'
  if (minutes < 14 * 60) return 'lunch'
  if (minutes < 17 * 60) return 'mellanmål'
  if (minutes < 21 * 60) return 'middag'

  return 'kvällsmål'
}

function getMealKey(meal, index) {
  return String(meal?.id || `${getMealDate(meal)}-${getMealClockTime(meal)}-${getMealText(meal)}-${index}`)
}

function getLoggedNutrition(meal) {
  const protein = Number(meal?.protein)
  const calories = Number(meal?.calories)
  const carbs = Number(meal?.carbs ?? meal?.carbohydrates)
  const fat = Number(meal?.fat)
  const fiber = Number(meal?.fiber)

  if (![protein, calories, carbs, fat, fiber].some(Number.isFinite)) {
    return null
  }

  return {
    calories: Number.isFinite(calories) ? calories : 0,
    carbs: Number.isFinite(carbs) ? carbs : 0,
    fat: Number.isFinite(fat) ? fat : 0,
    fiber: Number.isFinite(fiber) ? fiber : 0,
    protein: Number.isFinite(protein) ? protein : 0,
  }
}

export function buildMealTimeline(meals = [], date = getLocalDateString(), options = {}) {
  const seen = new Set()
  const safeMeals = Array.isArray(meals) ? meals : []
  const entries = []

  safeMeals.forEach((meal, index) => {
    const mealDate = getMealDate(meal)
    const id = getMealKey(meal, index)

    if (!mealDate || mealDate !== date || seen.has(id)) {
      return
    }

    seen.add(id)

    const text = getMealText(meal)
    const time = getMealClockTime(meal)
    const normalizedRecord = normalizeMealRecord(meal)
    const effective = getEffectiveMealNutrition(meal, {
      proteinGoal: options.proteinGoal,
    })
    const analysis = effective.analysis
    const loggedNutrition = getLoggedNutrition(meal)
    const totals = effective.source !== 'automatic' || analysis.items.length
      ? effective.totals
      : loggedNutrition || effective.totals
    const manualMealType = normalizedRecord?.mealType && !['Automatiskt', 'Annat'].includes(normalizedRecord.mealType)
      ? normalizedRecord.mealType.toLocaleLowerCase('sv-SE')
      : null
    const inferredMealType = manualMealType || analysis.mealType || (time ? inferMealTypeFromTime(time) : null)

    entries.push({
      analysis,
      date: mealDate,
      effectiveNutrition: effective,
      id,
      index,
      meal,
      mealType: inferredMealType,
      minutes: getMinutes(time),
      text,
      time,
      totals,
    })
  })

  const sorted = entries.sort((first, second) => {
    const firstMinutes = Number.isFinite(first.minutes) ? first.minutes : 12 * 60 + first.index
    const secondMinutes = Number.isFinite(second.minutes) ? second.minutes : 12 * 60 + second.index

    return firstMinutes - secondMinutes
  })

  const totals = sumMealNutrition(sorted.map((entry) => ({
    nutrition: entry.totals,
  })))

  return {
    date,
    entries: sorted,
    mealCount: sorted.length,
    totals,
  }
}

export const mealTimelineInternals = {
  getLocalDateString,
  getMealClockTime,
  getMealDate,
  inferMealTypeFromTime,
}

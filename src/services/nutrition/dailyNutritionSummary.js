import { getEffectiveMealNutrition } from './mealCorrections.js'
import {
  formatApproxCalories,
  formatApproxGrams,
  sumMealNutrition,
} from './nutritionCalculator.js'
import { parseProteinGoal } from './nutritionGoals.js'

function parseNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/)
  const parsed = match ? Number(match[0]) : NaN

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
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

  const fallback = parseDate(meal?.createdAt || meal?.time || meal?.timestamp)

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

function getMealKey(meal, index) {
  return String(meal?.id || `${getMealDate(meal)}-${getMealText(meal)}-${meal?.time || index}`)
}

function getProfileGoals(profile = {}, nutritionGoals = {}) {
  const proteinGoal = parseProteinGoal(nutritionGoals.protein ?? profile.proteinGoal)
  const caloriesGoal = parseNumber(nutritionGoals.calories ?? profile.caloriesGoal ?? profile.calorieGoal)

  return {
    caloriesGoal,
    proteinGoal,
  }
}

function getLoggedNutrition(meal) {
  const protein = parseNumber(meal?.protein)
  const calories = parseNumber(meal?.calories)
  const carbs = parseNumber(meal?.carbs ?? meal?.carbohydrates)
  const fat = parseNumber(meal?.fat)

  if (!protein && !calories && !carbs && !fat) {
    return null
  }

  return {
    calories: calories || 0,
    carbs: carbs || 0,
    fat: fat || 0,
    protein: protein || 0,
  }
}

export function calculateDailyNutritionSummary(meals = [], date = getLocalDateString(), profile = {}) {
  const today = date || getLocalDateString()
  const seen = new Set()
  const analyses = []
  const unknownFoods = []
  const safeMeals = Array.isArray(meals) ? meals : []

  safeMeals.forEach((meal, index) => {
    const mealDate = getMealDate(meal)
    const key = getMealKey(meal, index)

    if (!mealDate || mealDate !== today || mealDate > today || seen.has(key)) {
      return
    }

    seen.add(key)

    const text = getMealText(meal)
    const effective = getEffectiveMealNutrition(meal, {
      proteinGoal: profile.nutritionGoals?.protein ?? profile.proteinGoal,
    })
    const analysis = effective.analysis
    const loggedNutrition = getLoggedNutrition(meal)
    const totals = effective.source !== 'automatic' || analysis.items.length
      ? effective.totals
      : loggedNutrition || effective.totals
    const partiallyAnalyzed = analysis.unknownFoods.length > 0

    unknownFoods.push(...analysis.unknownFoods)
    analyses.push({
      analysis,
      date: mealDate,
      effectiveNutrition: effective,
      id: key,
      meal,
      partiallyAnalyzed,
      text,
      totals,
    })
  })

  const totals = sumMealNutrition(analyses.map((entry) => ({
    nutrition: entry.totals,
  })))
  const goals = getProfileGoals(profile, profile.nutritionGoals || {})
  const proteinRemaining = goals.proteinGoal
    ? Math.max(0, Math.round(goals.proteinGoal.target - totals.protein))
    : null
  const proteinPercent = goals.proteinGoal
    ? Math.min(999, Math.round((totals.protein / goals.proteinGoal.target) * 100))
    : null
  const caloriesRemaining = Number.isFinite(goals.caloriesGoal)
    ? Math.max(0, Math.round(goals.caloriesGoal - totals.calories))
    : null

  return {
    analyzedMeals: analyses,
    caloriesGoal: goals.caloriesGoal,
    caloriesRemaining,
    date: today,
    mealCount: analyses.length,
    partiallyAnalyzedMealCount: analyses.filter((entry) => entry.partiallyAnalyzed).length,
    proteinGoal: goals.proteinGoal,
    proteinPercent,
    proteinRemaining,
    text: {
      calories: formatApproxCalories(totals.calories),
      protein: formatApproxGrams(totals.protein),
    },
    totals,
    unknownFoods: [...new Set(unknownFoods)],
  }
}

export const dailyNutritionInternals = {
  getLocalDateString,
  getMealDate,
}

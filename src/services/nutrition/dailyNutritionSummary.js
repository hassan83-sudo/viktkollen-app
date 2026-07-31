import { getEffectiveMealNutrition } from './mealCorrections.js'
import { buildNutritionDataQualitySummary, buildMealsNeedingReview } from './nutritionConfidence.js'
import {
  formatApproxCalories,
  formatApproxGrams,
  sumMealNutrition,
} from './nutritionCalculator.js'
import { normalizeNutritionGoals, parseProteinGoal } from './nutritionGoals.js'
import {
  filterActualMealsForDate,
  getLocalMealDateString,
  getMealLocalDate,
} from './mealDateUtils.js'

const getLocalDateString = getLocalMealDateString
const getMealDate = getMealLocalDate

function parseNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/)
  const parsed = match ? Number(match[0]) : NaN

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
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
  const normalizedGoals = normalizeNutritionGoals(nutritionGoals)
  const proteinGoal = parseProteinGoal(normalizedGoals.protein ?? profile.proteinGoal)
  const caloriesGoal = parseNumber(normalizedGoals.calories ?? profile.caloriesGoal ?? profile.calorieGoal)

  return {
    caloriesGoal,
    carbsGoal: normalizedGoals.carbs,
    fatGoal: normalizedGoals.fat,
    fiberGoal: normalizedGoals.fiber,
    proteinGoal,
  }
}

function getLoggedNutrition(meal) {
  const protein = parseNumber(meal?.protein)
  const calories = parseNumber(meal?.calories)
  const carbs = parseNumber(meal?.carbs ?? meal?.carbohydrates)
  const fat = parseNumber(meal?.fat)
  const fiber = parseNumber(meal?.fiber)

  if (!protein && !calories && !carbs && !fat && !fiber) {
    return null
  }

  return {
    calories: calories || 0,
    carbs: carbs || 0,
    fat: fat || 0,
    fiber: fiber || 0,
    protein: protein || 0,
  }
}

export function calculateDailyNutritionSummary(meals = [], date = getLocalDateString(), profile = {}) {
  const today = date || getLocalDateString()
  const seen = new Set()
  const analyses = []
  const unknownFoods = []
  const safeMeals = filterActualMealsForDate(meals, today)

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
  const quality = buildNutritionDataQualitySummary(analyses)
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
    carbsGoal: goals.carbsGoal,
    date: today,
    fatGoal: goals.fatGoal,
    fiberGoal: goals.fiberGoal,
    mealCount: analyses.length,
    partiallyAnalyzedMealCount: analyses.filter((entry) => entry.partiallyAnalyzed).length,
    proteinGoal: goals.proteinGoal,
    proteinPercent,
    proteinRemaining,
    quality,
    reviewMeals: buildMealsNeedingReview(analyses),
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

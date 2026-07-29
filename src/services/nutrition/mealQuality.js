import { getEffectiveMealNutrition, normalizeMealRecord } from './mealCorrections.js'
import { buildMealsNeedingReview, buildNutritionDataQualitySummary } from './nutritionConfidence.js'

function normalizeQualityEntry(meal, index, options = {}) {
  const record = normalizeMealRecord(meal)

  if (!record) return null

  const effectiveNutrition = getEffectiveMealNutrition(record, options)

  return {
    confidence: effectiveNutrition.confidence,
    date: record.date,
    effectiveNutrition,
    id: record.id || `meal-${index}`,
    meal: record,
    text: record.text || record.name || 'Måltid utan text',
    time: record.time,
  }
}

export function buildMealQualityEntries(meals = [], options = {}) {
  const seen = new Set()

  return (Array.isArray(meals) ? meals : [])
    .map((meal, index) => normalizeQualityEntry(meal, index, options))
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry.id)) return false
      seen.add(entry.id)
      return true
    })
}

export function buildMealQualityReviewModel(meals = [], options = {}) {
  const entries = buildMealQualityEntries(meals, options)

  return {
    entries,
    quality: buildNutritionDataQualitySummary(entries),
    reviewMeals: buildMealsNeedingReview(entries, { limit: options.limit || 5 }),
  }
}

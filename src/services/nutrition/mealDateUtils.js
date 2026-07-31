import {
  getEntryLocalDate,
  getLocalDateString,
  isEntryOnLocalDate,
  parseDateValue,
} from '../localDate.js'

export function parseMealDateValue(value) {
  return parseDateValue(value)
}

export function getLocalMealDateString(date = new Date()) {
  return getLocalDateString(date)
}

export function getMealLocalDate(meal) {
  return getEntryLocalDate(meal)
}

export function isPlannedMealRecord(meal = {}) {
  if (!meal || typeof meal !== 'object') {
    return false
  }

  return Boolean(
    meal.isPlanned ||
      meal.planned === true ||
      meal.status === 'planned' ||
      meal.mealPlanId ||
      meal.planId ||
      String(meal.id || '').startsWith('planned-meal'),
  )
}

export function filterActualMealsForDate(meals = [], date = getLocalMealDateString()) {
  const targetDate = date || getLocalMealDateString()

  return (Array.isArray(meals) ? meals : []).filter((meal) =>
    !isPlannedMealRecord(meal) && isEntryOnLocalDate(meal, targetDate),
  )
}

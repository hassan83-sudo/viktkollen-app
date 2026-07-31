export function parseMealDateValue(value) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

export function getLocalMealDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function getMealLocalDate(meal) {
  const rawDate = String(meal?.date || '')

  if (rawDate.includes('T')) {
    const parsed = parseMealDateValue(rawDate)

    return parsed ? getLocalMealDateString(parsed) : ''
  }

  const dateText = rawDate.slice(0, 10)

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return dateText
  }

  const fallback = parseMealDateValue(meal?.createdAt || meal?.timestamp || meal?.time)

  return fallback ? getLocalMealDateString(fallback) : ''
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
    !isPlannedMealRecord(meal) && getMealLocalDate(meal) === targetDate,
  )
}

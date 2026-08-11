import { calculateAiHealthScore } from '../dashboardService.js'
import { getEntryLocalDate } from '../localDate.js'
import { addDays, getTodayDateString, summarizeDay } from '../nutritionService.js'

export function isFiniteValue(value) {
  if (value === null || value === undefined || value === '') return false

  return Number.isFinite(Number(value))
}

function getDateLabel(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00`))
}

function getLatestWeightByDate(dailyWeights = []) {
  return new Map(
    (Array.isArray(dailyWeights) ? dailyWeights : [])
      .filter((entry) => entry?.date && isFiniteValue(entry.value))
      .map((entry) => [entry.date, Number(entry.value)]),
  )
}

function getCheckInByDate(entries = [], fallbackCheckIn = {}, todayDate = '') {
  const map = new Map(
    (Array.isArray(entries) ? entries : [])
      .filter(Boolean)
      .map((entry) => [getEntryLocalDate(entry), entry])
      .filter(([date]) => date),
  )

  if (todayDate && fallbackCheckIn && typeof fallbackCheckIn === 'object') {
    map.set(todayDate, {
      ...fallbackCheckIn,
      date: fallbackCheckIn.date || todayDate,
    })
  }

  return map
}

function getAverage(values) {
  const finiteValues = values.filter(isFiniteValue).map(Number)

  if (!finiteValues.length) return null

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
}

function getCoverage(days, key) {
  return days.filter((day) => isFiniteValue(day[key])).length
}

export function buildWeeklyProgress({
  checkIn,
  foods,
  healthSnapshot,
  meals,
  nutritionGoals,
  selectedDate,
}) {
  const endDate = healthSnapshot?.date || selectedDate || getTodayDateString()
  const dates = Array.from({ length: 7 }, (_, index) => addDays(endDate, index - 6))
  const weightsByDate = getLatestWeightByDate(healthSnapshot?.weight?.dailyWeights)
  const checkInsByDate = getCheckInByDate(
    healthSnapshot?.checkIn?.dailyEntries,
    checkIn,
    healthSnapshot?.date,
  )

  const days = dates.map((date) => {
    const nutrition = summarizeDay(meals, date, nutritionGoals)
    const dayMeals = nutrition.meals || []
    const dayCheckIn = checkInsByDate.get(date) || null
    const weight = weightsByDate.get(date) ?? null
    const hasHealthSignals = Boolean(dayCheckIn || dayMeals.length || weight !== null)
    const healthScore = hasHealthSignals
      ? calculateAiHealthScore({
        checkIn: dayCheckIn || {},
        foods: date === healthSnapshot?.date ? foods : [],
        meals: dayMeals,
        weights: (healthSnapshot?.weight?.dailyWeights || [])
          .filter((entry) => entry.date <= date),
      }).score
      : null
    const proteinGoal = Number(nutrition.goals?.protein)

    return {
      calories: dayMeals.length && isFiniteValue(nutrition.totals?.calories)
        ? Number(nutrition.totals.calories)
        : null,
      date,
      healthScore,
      label: getDateLabel(date),
      protein: dayMeals.length && isFiniteValue(nutrition.totals?.protein)
        ? Number(nutrition.totals.protein)
        : null,
      proteinGoalReached:
        Number.isFinite(proteinGoal) &&
        proteinGoal > 0 &&
        Number(nutrition.totals?.protein || 0) >= proteinGoal,
      steps: isFiniteValue(dayCheckIn?.steps) ? Number(dayCheckIn.steps) : null,
      weight,
    }
  })
  const weights = days.map((day) => day.weight).filter(isFiniteValue).map(Number)
  const weightTrend = weights.length >= 2
    ? Number((weights.at(-1) - weights[0]).toFixed(1))
    : null

  return {
    averageHealthScore: getAverage(days.map((day) => day.healthScore)),
    averageSteps: getAverage(days.map((day) => day.steps)),
    coverage: {
      calories: getCoverage(days, 'calories'),
      healthScore: getCoverage(days, 'healthScore'),
      protein: getCoverage(days, 'protein'),
      steps: getCoverage(days, 'steps'),
      weight: getCoverage(days, 'weight'),
    },
    days,
    proteinGoalDays: days.filter((day) => day.proteinGoalReached).length,
    weightTrend,
  }
}

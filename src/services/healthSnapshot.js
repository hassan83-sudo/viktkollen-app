import { normalizeCheckInMetrics } from './checkInNormalization.js'
import {
  getUnifiedWeightFacts,
  getWeightStats,
  normalizeDailyWeightEntries,
} from './healthCalculations.js'
import {
  formatCalories,
  formatGrams,
  formatSteps,
  formatWeight,
  formatWeightChange,
} from './healthFormatting.js'
import {
  getEntryLocalDate,
  getEntrySortTime,
  getLocalDateRange,
  getLocalDateString,
  isLocalDateInRange,
  latestEntryPerLocalDate,
  parseLocalDate,
} from './localDate.js'
import { calculateDailyNutritionSummary } from './nutrition/dailyNutritionSummary.js'
import {
  filterActualMealsForDate,
  getMealLocalDate,
  isPlannedMealRecord,
} from './nutrition/mealDateUtils.js'
import { normalizeNutritionGoals } from './nutrition/nutritionGoals.js'
import { analyzeWeights } from './progressService.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function normalizeMealText(meal = {}) {
  return [
    meal.name,
    meal.title,
    meal.description,
    meal.text,
    meal.note,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('sv-SE')
}

function getMealTime(meal = {}) {
  return String(meal.time || meal.createdAt || meal.updatedAt || '').trim()
}

export function getHealthSnapshotMealKey(meal = {}) {
  if (meal.id) return `id:${String(meal.id)}`

  return [
    'fallback',
    getMealLocalDate(meal),
    getMealTime(meal),
    normalizeMealText(meal),
    meal.source || meal.type || meal.mealType || '',
  ].join('|')
}

export function mergeActualMealEntries(mealSources = []) {
  const seen = new Set()
  const result = []

  mealSources.flatMap(safeArray).forEach((meal) => {
    if (!meal || typeof meal !== 'object' || isPlannedMealRecord(meal)) return

    const key = getHealthSnapshotMealKey(meal)
    if (seen.has(key)) return

    seen.add(key)
    result.push({ ...meal })
  })

  return result
}

function normalizeTodayCheckIns({ checkIn = {}, checkIns = [], today }) {
  const todayDate = getLocalDateString(today)
  const single = checkIn && typeof checkIn === 'object' && Object.keys(checkIn).length
    ? [{ ...checkIn, date: checkIn.date || todayDate }]
    : []
  const entries = [...safeArray(checkIns), ...single]
    .filter((entry) => {
      const date = getEntryLocalDate(entry)

      return date && date <= todayDate
    })

  const dailyEntries = latestEntryPerLocalDate(entries).map(({ entry }) => entry)
  const latestToday = dailyEntries
    .filter((entry) => getEntryLocalDate(entry) === todayDate)
    .sort((first, second) => getEntrySortTime(second) - getEntrySortTime(first))[0] || null
  const metrics = normalizeCheckInMetrics(latestToday || {})

  return {
    dailyEntries,
    latestToday,
    metrics,
  }
}

function getPeriodWeightChange(dailyWeights, range) {
  const entries = safeArray(dailyWeights).filter((entry) => isLocalDateInRange(entry.date, range))
  const first = entries[0] || null
  const latest = entries.at(-1) || null

  return first && latest ? Number((latest.value - first.value).toFixed(1)) : null
}

function buildWeightSnapshot({ profile, today, weights }) {
  const todayDate = getLocalDateString(today)
  const dailyWeights = normalizeDailyWeightEntries(weights, { today: parseLocalDate(todayDate) || today })
  const weightStats = getWeightStats(dailyWeights, { startWeight: profile?.startWeight })
  const facts = getUnifiedWeightFacts({
    currentWeight: weightStats.current,
    profile,
    startWeight: weightStats.first,
    weights: dailyWeights,
  })
  const analysis = analyzeWeights(dailyWeights, profile)
  const sevenDays = getLocalDateRange(7, today)
  const thirtyDays = getLocalDateRange(30, today)
  const change7 = getPeriodWeightChange(dailyWeights, sevenDays)
  const change30 = getPeriodWeightChange(dailyWeights, thirtyDays)

  return {
    analysis,
    change30,
    change7,
    current: facts.latestWeight,
    dailyWeights,
    display: {
      change30: change30 === null ? 'Saknas' : formatWeightChange(change30, { showPlus: true }),
      change7: change7 === null ? 'Saknas' : formatWeightChange(change7, { showPlus: true }),
      current: formatWeight(facts.latestWeight, { fallback: 'Saknas' }),
      goal: formatWeight(facts.goalWeight, { fallback: 'Saknas' }),
      goalRemaining: facts.goalRemaining === null ? 'Saknas' : formatWeight(Math.abs(facts.goalRemaining), { fallback: 'Saknas' }),
      start: formatWeight(facts.startWeight, { fallback: 'Saknas' }),
      totalChange: facts.weightChange === null ? 'Saknas' : formatWeightChange(facts.weightChange, { showPlus: true }),
      weeklyRate: analysis.weeklyRate === null ? 'Saknas' : formatWeightChange(analysis.weeklyRate, { showPlus: true }),
    },
    facts,
    goal: facts.goalWeight,
    goalProgress: facts.goalProgress,
    start: facts.startWeight,
    totalChange: facts.weightChange,
    trend: facts.trend,
    weeklyRate: analysis.weeklyRate,
  }
}

function buildNutritionSnapshot({ mealHistory, meals, nutritionGoals, profile, today }) {
  const todayDate = getLocalDateString(today)
  const actualMeals = mergeActualMealEntries([meals, mealHistory])
  const mealsToday = filterActualMealsForDate(actualMeals, todayDate)
  const goals = normalizeNutritionGoals(nutritionGoals)
  const summary = calculateDailyNutritionSummary(actualMeals, todayDate, {
    ...profile,
    nutritionGoals: goals,
  })
  const totals = summary.totals || {}

  return {
    actualMeals,
    caloriesToday: totals.calories || 0,
    display: {
      caloriesToday: formatCalories(totals.calories || 0),
      fiberToday: formatGrams(totals.fiber || 0),
      mealCountToday: `${summary.mealCount || 0}`,
      proteinToday: formatGrams(totals.protein || 0),
    },
    fiberToday: totals.fiber || 0,
    goals,
    mealsToday,
    mealCountToday: summary.mealCount || 0,
    progress: summary.progress || {},
    proteinToday: totals.protein || 0,
    summary,
  }
}

function buildCheckInSnapshot({ checkIn, checkIns, today }) {
  const normalized = normalizeTodayCheckIns({ checkIn, checkIns, today })
  const metrics = normalized.metrics

  return {
    dailyEntries: normalized.dailyEntries,
    display: {
      energy: metrics.energy.displayLabel,
      mood: metrics.mood.displayLabel,
      sleep: metrics.sleepLabel,
      steps: metrics.steps === null ? 'Saknas' : formatSteps(metrics.steps),
      workout: metrics.workout.displayLabel,
    },
    energy: metrics.energy.value,
    latestToday: normalized.latestToday,
    mood: metrics.mood.displayLabel === 'Saknas' ? '' : metrics.mood.displayLabel,
    metrics,
    sleep: metrics.sleep,
    steps: metrics.steps,
    workout: metrics.workout,
  }
}

export function buildHealthSnapshot(data = {}) {
  const today = parseLocalDate(getLocalDateString(data.today || new Date())) || new Date()
  const date = getLocalDateString(today)
  const profile = data.profile && typeof data.profile === 'object' ? { ...data.profile } : {}
  const weight = buildWeightSnapshot({ profile, today, weights: safeArray(data.weights) })
  const nutrition = buildNutritionSnapshot({
    mealHistory: data.mealHistory,
    meals: data.meals,
    nutritionGoals: data.nutritionGoals,
    profile,
    today,
  })
  const checkIn = buildCheckInSnapshot({
    checkIn: data.checkIn,
    checkIns: data.checkIns,
    today,
  })

  return {
    availability: {
      checkInToday: Boolean(checkIn.latestToday),
      mealsToday: nutrition.mealCountToday > 0,
      nutritionGoals: Object.values(nutrition.goals || {}).some((value) => Number.isFinite(value) || Boolean(value?.target)),
      weight: weight.current !== null,
      weightGoal: weight.goal !== null,
    },
    checkIn,
    date,
    display: {
      caloriesToday: nutrition.display.caloriesToday,
      currentWeight: weight.display.current,
      energy: checkIn.display.energy,
      fiberToday: nutrition.display.fiberToday,
      mood: checkIn.display.mood,
      proteinToday: nutrition.display.proteinToday,
      sleep: checkIn.display.sleep,
      steps: checkIn.display.steps,
      totalWeightChange: weight.display.totalChange,
    },
    nutrition,
    periods: {
      sevenDays: {
        ...getLocalDateRange(7, today),
        weightChange: weight.change7,
        weightChangeLabel: weight.display.change7,
      },
      thirtyDays: {
        ...getLocalDateRange(30, today),
        weightChange: weight.change30,
        weightChangeLabel: weight.display.change30,
      },
    },
    weight,
  }
}

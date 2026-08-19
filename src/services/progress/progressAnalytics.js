import { formatKg, getUnifiedWeightFacts, getWeightStats } from '../healthCalculations.js'
import { normalizeNegativeZero } from '../healthFormatting.js'
import {
  buildPlannedWeekSummary,
  getMealPlanWeek,
  getMealPlanWeekStart,
  normalizeGeneratedMealPlans,
  normalizeMealPlans,
  normalizeNutritionGoals,
} from '../nutrition/nutritionEngine.js'
import { normalizeMeals } from '../nutritionService.js'
import { formatSleepDuration, normalizeCheckInMetrics } from '../checkInNormalization.js'
import {
  addLocalDays,
  getEntryLocalDate,
  getEntrySortTime as getLocalEntrySortTime,
  getLocalCalendarDayDiff,
  getLocalDateRange,
  getLocalDateString,
  isLocalDateInRange,
  parseDateValue,
  parseLocalDate,
} from '../localDate.js'
import { forecastGoalProgress, normalizeForecastWeights } from './progressForecast.js'

export const progressPeriods = [
  { days: 7, id: '7d', label: '7 dagar' },
  { days: 30, id: '30d', label: '30 dagar' },
  { days: 90, id: '90d', label: '3 månader' },
  { days: 180, id: '180d', label: '6 månader' },
  { days: 365, id: '365d', label: '1 år' },
  { days: null, id: 'all', label: 'Alla' },
]

function safeNumber(value, fallback = null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback

  const parsed = Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function round(value, digits = 1) {
  const factor = 10 ** digits

  return Math.round((value + Number.EPSILON) * factor) / factor
}

function normalizePeriod(period = '30d') {
  return progressPeriods.find((entry) => entry.id === period) || progressPeriods[1]
}

export function getProgressPeriodRange(period = '30d', today = new Date()) {
  const selected = normalizePeriod(period)
  const range = getLocalDateRange(selected.days, parseDateValue(today) || new Date())
  const start = range.start ? parseLocalDate(range.start) : null
  const previousEnd = selected.days ? addLocalDays(start, -1) : null
  const previousStart = selected.days ? addLocalDays(previousEnd, -selected.days + 1) : null

  return {
    days: selected.days,
    end: range.end,
    id: selected.id,
    label: selected.label,
    previousEnd: previousEnd ? getLocalDateString(previousEnd) : '',
    previousStart: previousStart ? getLocalDateString(previousStart) : '',
    start: range.start,
  }
}

function isInRange(dateString, range) {
  return isLocalDateInRange(dateString, range)
}

function normalizeProgressWeights(weights = [], today = new Date()) {
  return normalizeForecastWeights(weights, today)
}

function confidenceFromCoverage(score) {
  if (score >= 75) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

function qualityLabel(level) {
  if (level === 'high') return 'Bra'
  if (level === 'medium') return 'Medel'
  return 'Begränsad'
}

function bestLoggingStreak(entries = []) {
  const dates = [...new Set(entries.map((entry) => entry.date))].sort()
  if (!dates.length) return 0

  let best = 1
  let current = 1
  for (let index = 1; index < dates.length; index += 1) {
    const previous = parseLocalDate(dates[index - 1])
    const expectedNext = previous ? getLocalDateString(addLocalDays(previous, 1)) : ''

    if (expectedNext === dates[index]) current += 1
    else current = 1
    best = Math.max(best, current)
  }

  return best
}

function analyzeWeightProgress(weights = [], profile = {}, range, today = new Date()) {
  const normalized = normalizeProgressWeights(weights, today)
  const periodWeights = normalized.filter((entry) => isInRange(entry.date, range))
  const first = periodWeights[0] || null
  const latest = periodWeights.at(-1) || null
  const periodChangeKg = first && latest ? round(latest.value - first.value) : null
  const percentChange = first && periodChangeKg !== null ? round((periodChangeKg / first.value) * 100, 1) : null
  const daysBetween = first && latest ? Math.max(1, getLocalCalendarDayDiff(first.date, latest.date) || 0) : 0
  const weeklyAverageChange = periodChangeKg !== null && periodWeights.length >= 2 && daysBetween >= 7
    ? round((periodChangeKg / daysBetween) * 7, 2)
    : null
  const totalStats = getWeightStats(normalized.map((entry) => ({ date: entry.date, value: entry.value })))
  const totalStart = totalStats.weights[0]?.value ?? null
  const unified = getUnifiedWeightFacts({
    currentWeight: totalStats.current,
    profile,
    startWeight: totalStart,
    weights: normalized.map((entry) => ({ date: entry.date, value: entry.value })),
  })
  const totalChangeKg = unified.weightChange

  return {
    bestLoggingStreak: bestLoggingStreak(periodWeights),
    changeKg: periodChangeKg,
    currentWeight: unified.latestWeight,
    firstWeight: first?.value ?? null,
    goalRemaining: unified.goalRemaining,
    goalWeight: unified.goalWeight,
    latestWeight: latest?.value ?? null,
    percentChange,
    periodChangeKg,
    registrationCount: periodWeights.length,
    sourceLabel: 'Endast uppmätt vikt',
    startWeight: unified.startWeight,
    totalChangeKg,
    totalTrendDirection: totalChangeKg === null ? 'insufficient' : totalChangeKg < -0.1 ? 'down' : totalChangeKg > 0.1 ? 'up' : 'stable',
    trendDirection: periodChangeKg === null ? 'insufficient' : periodChangeKg < -0.1 ? 'down' : periodChangeKg > 0.1 ? 'up' : 'stable',
    weeklyAverageChange,
    weights: periodWeights,
  }
}

function groupMealsByDate(meals = [], range) {
  const days = new Map()
  normalizeMeals(meals).forEach((meal) => {
    if (!isInRange(meal.date, range)) return
    if (!days.has(meal.date)) days.set(meal.date, [])
    days.get(meal.date).push(meal)
  })

  return days
}

function sumMealField(meals, field) {
  return meals.reduce((sum, meal) => sum + Math.max(0, safeNumber(meal[field], 0) || 0), 0)
}

function isUserConfirmedMeal(meal) {
  const provenance = meal?.photoAnalysis?.provenance || meal?.nutritionProvenance || meal?.nutritionSource || meal?.source

  if (meal?.photoAnalysis?.source === 'photoAnalysis') {
    return meal.photoAnalysis.provenance === 'user_confirmed' || meal.photoAnalysis.userEdited === true
  }

  return !['ai_estimate', 'ai_estimated'].includes(String(provenance || '').toLocaleLowerCase('sv-SE'))
}

function analyzeNutritionProgress(meals = [], nutritionGoals = {}, range) {
  const goals = normalizeNutritionGoals(nutritionGoals)
  const mealsByDate = groupMealsByDate(meals, range)
  const normalizedMeals = [...mealsByDate.values()].flat()
  const userConfirmedMeals = normalizedMeals.filter(isUserConfirmedMeal)
  const aiEstimatedMeals = normalizedMeals.filter((meal) => !isUserConfirmedMeal(meal))
  const days = [...mealsByDate.entries()].map(([date, dayMeals]) => {
    const totals = {
      calories: sumMealField(dayMeals, 'calories'),
      carbs: sumMealField(dayMeals, 'carbs'),
      fat: sumMealField(dayMeals, 'fat'),
      protein: sumMealField(dayMeals, 'protein'),
    }

    return {
      calorieGoalReached: goals.calories ? totals.calories > 0 && totals.calories <= goals.calories : false,
      date,
      mealCount: dayMeals.length,
      meals: dayMeals,
      proteinGoalReached: goals.protein ? totals.protein >= goals.protein : false,
      totals,
    }
  })
  const loggedDayCount = days.length
  const totals = days.reduce((sum, day) => ({
    calories: sum.calories + day.totals.calories,
    carbs: sum.carbs + day.totals.carbs,
    fat: sum.fat + day.totals.fat,
    protein: sum.protein + day.totals.protein,
  }), { calories: 0, carbs: 0, fat: 0, protein: 0 })
  const mealTypes = new Map()
  days.flatMap((day) => day.meals).forEach((meal) => {
    const type = meal.type || meal.mealType || 'Annat'
    mealTypes.set(type, (mealTypes.get(type) || 0) + 1)
  })
  const mostCommonMealType = [...mealTypes.entries()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], 'sv-SE'))[0]?.[0] || ''

  return {
    averageCalories: loggedDayCount ? round(totals.calories / loggedDayCount) : 0,
    averageProtein: loggedDayCount ? round(totals.protein / loggedDayCount) : 0,
    aiEstimatedMealCount: aiEstimatedMeals.length,
    calorieGoalDays: days.filter((day) => day.calorieGoalReached).length,
    calorieGoalPercent: loggedDayCount && goals.calories ? Math.round((days.filter((day) => day.calorieGoalReached).length / loggedDayCount) * 100) : 0,
    days,
    goalComparison: {
      caloriesGoal: goals.calories || null,
      proteinGoal: goals.protein || null,
    },
    loggedDayCount,
    mealCount: days.reduce((sum, day) => sum + day.mealCount, 0),
    mostCommonMealType,
    proteinGoalDays: days.filter((day) => day.proteinGoalReached).length,
    proteinGoalPercent: loggedDayCount && goals.protein ? Math.round((days.filter((day) => day.proteinGoalReached).length / loggedDayCount) * 100) : 0,
    userConfirmedMealCount: userConfirmedMeals.length,
    totals,
  }
}

function normalizeCheckIns(checkIn = {}, checkIns = [], range) {
  const entries = Array.isArray(checkIns) ? checkIns : []
  const single = checkIn && typeof checkIn === 'object' && Object.keys(checkIn).length
    ? [{ ...checkIn, date: checkIn.date || range.end }]
    : []
  const seen = new Set()

  return [...entries, ...single]
    .map((entry) => {
      const metrics = normalizeCheckInMetrics(entry)

      return {
        date: getEntryLocalDate(entry),
        energy: metrics.energy.value,
        energyLabel: metrics.energy.displayLabel,
        energyLevel: metrics.energy.level,
        mood: metrics.mood.displayLabel === 'Saknas' ? '' : metrics.mood.displayLabel,
        moodKey: metrics.mood.key,
        moodScore: metrics.mood.score,
        sleep: metrics.sleep,
        sleepLabel: metrics.sleepLabel,
        sleepLevel: metrics.sleepLevel,
        steps: metrics.steps,
        stepsLabel: metrics.stepsLabel,
        training: metrics.workout.displayLabel,
        workout: metrics.workout.completed,
        sortTime: getLocalEntrySortTime(entry),
      }
    })
    .filter((entry) => entry.date && isInRange(entry.date, range))
    .sort((first, second) => second.sortTime - first.sortTime)
    .filter((entry) => {
      if (seen.has(entry.date)) return false
      seen.add(entry.date)
      return true
    })
}

function analyzeHabitProgress({ checkIn = {}, checkIns = [], foods = [], range }) {
  const entries = normalizeCheckIns(checkIn, checkIns, range)
  const energyValues = entries.map((entry) => entry.energy).filter(Number.isFinite)
  const sleepValues = entries.map((entry) => entry.sleep).filter(Number.isFinite)
  const stepValues = entries.map((entry) => entry.steps).filter(Number.isFinite)
  const moods = new Map()
  const trainings = new Map()
  const chronologicalEntries = [...entries].sort((first, second) => first.sortTime - second.sortTime)
  entries.forEach((entry) => {
    if (entry.mood) moods.set(entry.mood, (moods.get(entry.mood) || 0) + 1)
    if (entry.workout && entry.training) trainings.set(entry.training, (trainings.get(entry.training) || 0) + 1)
  })
  const activeHabits = (Array.isArray(foods) ? foods : []).filter(Boolean)
  const completedHabits = activeHabits.filter((habit) => habit.done).length
  const averageEnergy = energyValues.length ? round(energyValues.reduce((sum, value) => sum + value, 0) / energyValues.length, 1) : null
  const averageSleep = sleepValues.length ? round(sleepValues.reduce((sum, value) => sum + value, 0) / sleepValues.length, 1) : null
  const totalSteps = stepValues.reduce((sum, value) => sum + value, 0)

  return {
    activeHabits: activeHabits.length,
    averageEnergy,
    averageEnergyLabel: averageEnergy === null ? 'Saknas' : `${averageEnergy.toLocaleString('sv-SE')} av 10`,
    averageMood: [...moods.entries()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], 'sv-SE'))[0]?.[0] || '',
    averageSleep,
    averageSleepLabel: averageSleep === null ? 'Saknas' : formatSleepDuration(averageSleep),
    averageSteps: stepValues.length ? Math.round(stepValues.reduce((sum, value) => sum + value, 0) / stepValues.length) : null,
    bestStreak: bestLoggingStreak(entries),
    checkInCount: entries.length,
    completedHabits,
    currentStreak: bestLoggingStreak(entries.filter((entry) => entry.date >= (range.start || '0000-00-00'))),
    entries,
    moodTrend: chronologicalEntries.map((entry) => entry.moodScore).filter(Number.isFinite),
    sleepTrend: chronologicalEntries.map((entry) => entry.sleep).filter(Number.isFinite),
    stepTrend: chronologicalEntries.map((entry) => entry.steps).filter(Number.isFinite),
    stepDays: stepValues.length,
    totalSteps,
    trainingDays: entries.filter((entry) => entry.workout).length,
    trainingForm: [...trainings.entries()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], 'sv-SE'))[0]?.[0] || '',
  }
}

function getMeasurementIntervalMidpoint(value) {
  if (!value || typeof value !== 'object') return null
  const min = safeNumber(value.minCm)
  const max = safeNumber(value.maxCm)
  if (min === null || max === null || max < min) return null
  return round((min + max) / 2, 1)
}

function formatEstimatedWeightRange(estimate) {
  const min = safeNumber(estimate?.minKg)
  const max = safeNumber(estimate?.maxKg)

  if (min === null || max === null || max < min) return 'Saknas'
  return `${min.toLocaleString('sv-SE')}–${max.toLocaleString('sv-SE')} kg`
}

function getBodyScanDate(analysis) {
  const date = parseDateValue(analysis?.createdAt || analysis?.date || analysis?.result?.generatedAt)
  return date ? getLocalDateString(date) : ''
}

function normalizeBodyScanHistory(history = [], range) {
  return (Array.isArray(history) ? history : [])
    .map((analysis) => {
      const result = analysis?.result || {}
      const date = getBodyScanDate(analysis)
      const scanInput = result.scanInput || analysis?.scanInput || {}
      return {
        confidence: result.estimatedWeight?.confidence || 'low',
        date,
        estimatedMeasurements: result.estimatedMeasurements || {},
        estimatedWeight: result.estimatedWeight || null,
        id: String(analysis?.id || analysis?.createdAt || date),
        imageCount: Number(scanInput.imageCount || scanInput.images || 0) || 0,
        source: result.source || 'unknown',
        summary: result.summary || result.observation || 'AI-kroppsanalys sparad.',
        viewCount: Array.isArray(scanInput.views) ? scanInput.views.length : 0,
      }
    })
    .filter((analysis) => analysis.date && isInRange(analysis.date, range))
    .sort((first, second) => second.date.localeCompare(first.date))
}

function compareBodyScanMeasurements(latest, previous) {
  if (!latest || !previous) return 'Gör en ny kroppsscanning för jämförelse.'

  const latestWaist = getMeasurementIntervalMidpoint(latest.estimatedMeasurements?.waist)
  const previousWaist = getMeasurementIntervalMidpoint(previous.estimatedMeasurements?.waist)

  if (latestWaist === null || previousWaist === null) {
    return 'Måttintervall saknas för en tydlig scan-jämförelse.'
  }

  const delta = round(latestWaist - previousWaist, 1)
  if (Math.abs(delta) < 0.5) return 'Midjeintervallet verkar ungefär oförändrat jämfört med föregående scan.'
  return delta < 0
    ? 'Midjeintervallet är något lägre än vid föregående scan.'
    : 'Midjeintervallet är något högre än vid föregående scan.'
}

function analyzeBodyScanProgress(history = [], range) {
  const scans = normalizeBodyScanHistory(history, range)
  const latest = scans[0] || null
  const previous = scans[1] || null

  return {
    comparisonText: compareBodyScanMeasurements(latest, previous),
    hasComparison: scans.length >= 2,
    latest,
    latestEstimatedWeightLabel: formatEstimatedWeightRange(latest?.estimatedWeight),
    scanCount: scans.length,
    scans,
  }
}

function buildDataQuality({ bodyScan, habits, nutrition, period, weight }) {
  const expectedDays = period.days || Math.max(weight.registrationCount, nutrition.loggedDayCount, habits.checkInCount, 1)
  const weightScore = expectedDays ? Math.min(1, weight.registrationCount / Math.min(expectedDays, 8)) : 0
  const nutritionScore = expectedDays ? Math.min(1, nutrition.loggedDayCount / Math.min(expectedDays, 10)) : 0
  const checkInScore = expectedDays ? Math.min(1, habits.checkInCount / Math.min(expectedDays, 10)) : 0
  const aiPenalty = nutrition.mealCount
    ? Math.min(20, Math.round((nutrition.aiEstimatedMealCount / nutrition.mealCount) * 20))
    : 0
  const score = Math.max(0, Math.min(100, Math.round(
    (weightScore * 35) +
    (nutritionScore * 25) +
    (checkInScore * 25) +
    (bodyScan.scanCount ? 15 : 0) -
    aiPenalty,
  )))
  const level = confidenceFromCoverage(score)

  return {
    confidence: level,
    label: qualityLabel(level),
    score,
    signals: [
      `${weight.registrationCount} uppmätta viktdagar`,
      `${nutrition.loggedDayCount} dagar med måltider`,
      `${habits.checkInCount} check-ins`,
      nutrition.aiEstimatedMealCount
        ? `${nutrition.aiEstimatedMealCount} AI-estimerade måltider hålls markerade`
        : 'Ingen AI-estimerad nutrition i perioden',
      bodyScan.scanCount
        ? `${bodyScan.scanCount} kroppsscanningar som separat AI-underlag`
        : 'Ingen kroppsscanning i perioden',
    ],
  }
}

function analyzePlanningProgress({ generatedMealPlans = {}, mealPlans = {}, nutritionGoals = {}, range }) {
  const plans = normalizeMealPlans(mealPlans)
  const currentWeek = getMealPlanWeek(plans, getMealPlanWeekStart(range.end))
  const plannedWeekSummary = buildPlannedWeekSummary(currentWeek, nutritionGoals)
  const generated = normalizeGeneratedMealPlans(generatedMealPlans)
  const latestGeneratedPlan = generated.history[0] || null

  return {
    generatedPlanCount: generated.history.length,
    latestGeneratedPlan,
    plannedMealCount: plannedWeekSummary.mealCount,
    plannedNutrition: plannedWeekSummary,
    plannedWeekStart: currentWeek.weekStart,
  }
}

function comparePeriods(current, previous) {
  if (!previous) return { hasComparison: false }

  const previousHasData =
    previous.weight.registrationCount > 0 ||
    previous.nutrition.mealCount > 0 ||
    previous.habits.checkInCount > 0

  if (!previousHasData) {
    return { hasComparison: false, reason: 'Föregående period saknar jämförbar data.' }
  }

  return {
    calorieGoalPercentDelta: current.nutrition.calorieGoalPercent - previous.nutrition.calorieGoalPercent,
    checkInDelta: current.habits.checkInCount - previous.habits.checkInCount,
    hasComparison: true,
    mealCountDelta: current.nutrition.mealCount - previous.nutrition.mealCount,
    proteinGoalPercentDelta: current.nutrition.proteinGoalPercent - previous.nutrition.proteinGoalPercent,
    stepAverageDelta:
      current.habits.averageSteps !== null && previous.habits.averageSteps !== null
        ? round(current.habits.averageSteps - previous.habits.averageSteps)
        : null,
    trainingDaysDelta: current.habits.trainingDays - previous.habits.trainingDays,
    weightChangeDelta:
      current.weight.changeKg !== null && previous.weight.changeKg !== null
        ? round(current.weight.changeKg - previous.weight.changeKg)
        : null,
  }
}

function buildProgressInsights(analysis) {
  const insights = []

  if (analysis.weight.registrationCount < 2) {
    insights.push({ tone: 'neutral', text: 'Mer viktdata behövs för en säker trend.' })
  } else if (analysis.weight.trendDirection === 'down' && Number.isFinite(analysis.weight.goalRemaining) && analysis.weight.goalRemaining > 0) {
    insights.push({ tone: 'positive', text: 'Vikten rör sig mot målet under vald period.' })
  } else if (analysis.weight.trendDirection === 'stable') {
    insights.push({ tone: 'neutral', text: 'Vikten är relativt stabil under vald period.' })
  }

  if (analysis.nutrition.proteinGoalPercent >= 70) {
    insights.push({ tone: 'positive', text: 'Proteinmålet nås ofta när mat är loggad.' })
  } else if (analysis.nutrition.loggedDayCount > 0) {
    insights.push({ tone: 'neutral', text: 'Proteinmålet kan behöva mer planering i perioden.' })
  }

  if (analysis.planning.plannedMealCount === 0) {
    insights.push({ tone: 'neutral', text: 'Planerade måltider saknas för aktuell vecka.' })
  } else if (analysis.planning.plannedMealCount > analysis.nutrition.mealCount) {
    insights.push({ tone: 'neutral', text: 'Planerad nutrition är tydligt separerad från faktiskt intag.' })
  }

  if (analysis.comparison.hasComparison && analysis.comparison.trainingDaysDelta > 0) {
    insights.push({ tone: 'positive', text: 'Träningsfrekvensen har ökat jämfört med föregående period.' })
  }

  if (analysis.forecast.confidence === 'insufficient') {
    insights.push({ tone: 'neutral', text: 'Målprognosen behöver mer regelbunden viktlogg.' })
  }

  return insights.slice(0, 5)
}

function buildCoreAnalysis(data = {}, range) {
  const snapshot = data.healthSnapshot || null
  const weights = snapshot?.weight?.dailyWeights || data.weights
  const meals = snapshot?.nutrition?.actualMeals || data.meals
  const checkIn = snapshot?.checkIn?.latestToday || data.checkIn
  const checkIns = snapshot?.checkIn?.dailyEntries || data.checkIns
  const nutritionGoals = snapshot?.nutrition?.goals || data.nutritionGoals
  const weight = analyzeWeightProgress(weights, data.profile, range, data.today)
  const nutrition = analyzeNutritionProgress(meals, nutritionGoals, range)
  const habits = analyzeHabitProgress({
    checkIn,
    checkIns,
    foods: data.foods,
    range,
  })
  const planning = analyzePlanningProgress({
    generatedMealPlans: data.generatedMealPlans,
    mealPlans: data.mealPlans,
    nutritionGoals,
    range,
  })
  const forecast = forecastGoalProgress({
    currentWeight: weight.currentWeight,
    goalWeight: weight.goalWeight,
    today: data.today,
    weights,
  })
  const bodyScan = analyzeBodyScanProgress(data.bodyAnalysisHistory, range)
  const dataQuality = buildDataQuality({ bodyScan, habits, nutrition, period: range, weight })

  return {
    bodyScan,
    dataQuality,
    forecast,
    habits,
    nutrition,
    period: range,
    planning,
    weeklySummary: data.weeklyReportData?.summary || '',
    weight,
  }
}

export function buildProgressDashboardAnalytics(data = {}, options = {}) {
  const today = options.today || data.today || new Date()
  const dataWithToday = { ...data, today }
  const range = getProgressPeriodRange(options.period || data.period || '30d', today)
  const current = buildCoreAnalysis(dataWithToday, range)
  const previousRange = range.days
    ? {
      ...range,
      end: range.previousEnd,
      start: range.previousStart,
    }
    : null
  const previous = previousRange ? buildCoreAnalysis(dataWithToday, previousRange) : null
  const comparison = comparePeriods(current, previous)
  const analysis = {
    ...current,
    comparison,
  }

  return {
    ...analysis,
    insights: buildProgressInsights(analysis),
  }
}

export function formatProgressChange(value) {
  const number = normalizeNegativeZero(value, 1)
  if (number === null) return 'Saknas'
  if (Math.abs(value) < 0.05) return 'Oförändrat'

  return value < 0 ? `${formatKg(Math.abs(value))} ned` : `${formatKg(value)} upp`
}

export const progressAnalyticsInternals = {
  analyzeHabitProgress,
  analyzeNutritionProgress,
  analyzePlanningProgress,
  analyzeWeightProgress,
  bestLoggingStreak,
  comparePeriods,
  isInRange,
  normalizeCheckIns,
  normalizeProgressWeights,
  round,
}

import {
  calculateProteinNeed,
  formatKg,
  getUnifiedWeightFacts,
  getWeightStats,
  parseWeightValue,
} from './healthCalculations.js'
import { calculateDailyNutritionSummary } from './nutrition/dailyNutritionSummary.js'
import {
  filterActualMealsForDate,
  getLocalMealDateString,
} from './nutrition/mealDateUtils.js'
import { normalizeCheckInMetrics } from './checkInNormalization.js'
import { analyzeWeights } from './progressService.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function safeNumber(value, fallback = null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }

  const parsed = Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, ''))

  return Number.isFinite(parsed) ? parsed : fallback
}

function getDate(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = getDate(value)

  return date ? date.toLocaleDateString('sv-SE') : 'Tidpunkt saknas'
}

function formatInteger(value, fallback = 'Saknas') {
  const number = safeNumber(value)

  return number === null ? fallback : Math.round(number).toLocaleString('sv-SE')
}

function formatPercent(value, fallback = 'Saknas') {
  const number = safeNumber(value)

  return number === null
    ? fallback
    : `${number.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}%`
}

function average(values) {
  const numbers = values.map((value) => safeNumber(value)).filter((value) => value !== null)

  return numbers.length
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : null
}

function getRecentEntries(entries, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  return safeArray(entries).filter((entry) => {
    const date = getDate(entry?.date || entry?.createdAt)

    return date && date.getTime() >= cutoff
  })
}

function getProteinScore(status) {
  const text = safeText(status).toLocaleLowerCase('sv-SE')

  if (text.includes('hög')) {
    return 3
  }

  if (text.includes('medel') || text.includes('bra')) {
    return 2
  }

  if (text.includes('låg')) {
    return 1
  }

  return null
}

function getProteinLabel(score) {
  if (score === null) {
    return 'Saknas'
  }

  if (score >= 2.5) {
    return 'Högt'
  }

  if (score >= 1.6) {
    return 'Medel'
  }

  return 'Lågt'
}

function getMealCalories(entry) {
  return safeNumber(entry?.analysis?.calories ?? entry?.calories)
}

function getMealProtein(entry) {
  return safeNumber(entry?.analysis?.protein ?? entry?.protein)
}

function getMealProteinStatus(entry) {
  return entry?.analysis?.proteinStatus ?? entry?.proteinStatus
}

function formatNutritionValue(value, unit, fallback = 'Saknas') {
  const number = safeNumber(value)

  return number === null ? fallback : `${Math.round(number)} ${unit}`
}

function getLastActivityDate({ checkIn, mealHistory, meals, weights }) {
  const dates = [
    ...safeArray(weights).map((entry) => entry.date),
    ...safeArray(mealHistory).map((entry) => entry.createdAt || entry.date),
    ...safeArray(meals).map((entry) => entry.date || entry.createdAt),
    checkIn?.updatedAt,
  ]
    .map(getDate)
    .filter(Boolean)
    .sort((first, second) => second - first)

  return dates[0] || null
}

function getMilestones(weightContext) {
  const progress = weightContext.goalProgress

  if (!progress) {
    return {
      latest: 'Sätt startvikt, nuvarande vikt och målvikt för milstolpar.',
      next: 'Nästa milstolpe visas när målet är komplett.',
    }
  }

  if (progress.totalDistance === 0) {
    return {
      latest: 'Start och mål är samma vikt.',
      next: 'Inga mellanliggande milstolpar behövs.',
    }
  }

  const latest = progress.passedMilestones.at(-1)
  const next = progress.nextMilestone

  return {
    latest: latest ? `${formatKg(latest.weight)} passerad` : 'Första milstolpen väntar.',
    next: next ? `${formatKg(next.weight)} är nästa.` : `Målet ${formatKg(weightContext.goalWeight)} är nått.`,
  }
}

function estimateGoalDate(weightContext) {
  if (weightContext.goalWeight === null || weightContext.currentWeight === null) {
    return 'Sätt en målvikt och logga vikt för att få en prognos.'
  }

  if (weightContext.remainingKg === null) {
    return 'För lite data för en tillförlitlig prognos.'
  }

  const remaining = Math.abs(weightContext.remainingKg)
  const history = weightContext.history || []

  if (remaining <= 0.1) {
    return 'Målet är nått.'
  }

  if (history.length < 6 || weightContext.recentChange === null) {
    return 'Mer viktdata behövs för en tillförlitlig prognos.'
  }

  const weeklyRate = Math.abs(weightContext.recentChange)

  if (weeklyRate < 0.1) {
    return 'Trenden är för stabil för en prognos.'
  }

  const weeks = Math.ceil(remaining / weeklyRate)
  const date = new Date()

  date.setDate(date.getDate() + weeks * 7)

  return date.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
}

function buildCoachProfile({ checkIn, profile, weights }) {
  const weightContext = getUnifiedWeightFacts({
    currentWeight: weights.at(-1)?.value,
    profile,
    weights,
  })
  const proteinNeed = calculateProteinNeed(weightContext.currentWeight)
  const metrics = normalizeCheckInMetrics(checkIn)

  return {
    activityLevel: safeText(profile?.activity || profile?.activityLevel, 'Inte angiven'),
    age: safeNumber(profile?.age),
    currentWeight: weightContext.currentWeight,
    gender: safeText(profile?.gender || profile?.sex, 'Inte angivet'),
    goalWeight: weightContext.goalWeight,
    height: safeNumber(profile?.height),
    name: safeText(profile?.name, 'du'),
    proteinTarget:
      proteinNeed === null
        ? 'Saknas'
        : `${proteinNeed.lower}-${proteinNeed.upper} g/dag`,
    startWeight: weightContext.startWeight,
    todaySteps: metrics.steps,
    weightContext,
  }
}

function buildDailyAnalysis({
  checkIn,
  mealHistory,
  meals,
  nutritionGoals,
  nutritionSummary,
  profile,
  today,
  weights,
}) {
  const todayDate = today || nutritionSummary?.date || getLocalMealDateString()
  const allMeals = [...safeArray(mealHistory), ...safeArray(meals)]
  const todayMeals = filterActualMealsForDate(allMeals, todayDate)
  const weightStats = getWeightStats(weights, { startWeight: profile?.startWeight })
  const summary = nutritionSummary?.date === todayDate
    ? nutritionSummary
    : calculateDailyNutritionSummary(allMeals, todayDate, { nutritionGoals })
  const hasNutritionSummary = summary && typeof summary === 'object'
  const calories = hasNutritionSummary
    ? safeNumber(summary.totals?.calories)
    : average(todayMeals.map(getMealCalories))
  const protein = hasNutritionSummary
    ? safeNumber(summary.totals?.protein)
    : average(todayMeals.map(getMealProtein))
  const fiber = hasNutritionSummary ? safeNumber(summary.totals?.fiber) : null
  const mealCount = hasNutritionSummary ? safeNumber(summary.mealCount, 0) : todayMeals.length
  const proteinStatuses = todayMeals.map(getMealProteinStatus).map(getProteinScore).filter(Boolean)
  const proteinGoal = safeNumber(nutritionGoals?.protein)
  const proteinStatus = proteinGoal && protein !== null
    ? protein >= proteinGoal * 0.85
      ? 'Bra'
      : 'Lågt'
    : getProteinLabel(proteinStatuses.length ? average(proteinStatuses) : null)
  const metrics = normalizeCheckInMetrics(checkIn)
  const steps = metrics.steps
  const energy = metrics.energy.value
  const sleep = metrics.sleep
  const mood = metrics.mood.displayLabel === 'Saknas' ? 'Ej loggat' : metrics.mood.displayLabel
  const workout = metrics.workout
  const summaryParts = [
    weightStats.trend !== 'För lite data' ? `vikttrenden är ${weightStats.trend.toLocaleLowerCase('sv-SE')}` : '',
    steps !== null ? `${formatInteger(steps)} steg` : '',
    mealCount > 0 ? `${mealCount} loggade måltider` : '',
    proteinStatus !== 'Saknas' ? `protein ser ${proteinStatus.toLocaleLowerCase('sv-SE')} ut` : '',
    energy !== null ? `energi ${energy}/10` : '',
  ].filter(Boolean)

  return {
    caloriesLabel:
      calories === null
        ? 'Saknas'
        : hasNutritionSummary
          ? `${Math.round(calories)} kcal idag`
          : `${Math.round(calories)} kcal i snitt per loggad måltid`,
    fiberLabel: formatNutritionValue(fiber, 'g'),
    mealCount,
    nutritionGoalLabel:
      safeNumber(nutritionGoals?.calories) ||
      safeNumber(nutritionGoals?.protein) ||
      safeNumber(nutritionGoals?.fiber)
        ? 'Lokala kostmål finns'
        : 'Kostmål saknas',
    mood,
    proteinLabel:
      protein === null
        ? proteinStatus
        : hasNutritionSummary
          ? `${Math.round(protein)} g idag`
          : `${Math.round(protein)} g i snitt`,
    proteinStatus,
    sleepLabel: sleep === null ? 'Saknas' : `${sleep} timmar`,
    steps,
    stepsLabel: formatInteger(steps),
    summary:
      summaryParts.length > 0
        ? `Dagens bild: ${summaryParts.join(', ')}.`
        : 'Dagens analys blir tydligare när du loggar vikt, mat eller check-in.',
    trainingLabel: workout.completed ? workout.displayLabel : 'Ingen träning markerad',
    weightTrend: weightStats.trend,
  }
}

function buildWeeklySummary({ checkIn, mealHistory, meals, profile, weeklyNutrition, weights }) {
  const weightAnalysis = analyzeWeights(weights, profile)
  const weekMeals = getRecentEntries([...safeArray(mealHistory), ...safeArray(meals)], 7)
  const weightChange = weightAnalysis.change7
  const proteinAverage = safeNumber(weeklyNutrition?.averageProtein) ?? average(weekMeals.map(getMealProtein))
  const calorieAverage = safeNumber(weeklyNutrition?.averageCalories)
  const fiberAverage = safeNumber(weeklyNutrition?.averageFiber)
  const proteinScore = average(weekMeals.map(getMealProteinStatus).map(getProteinScore))
  const metrics = normalizeCheckInMetrics(checkIn)
  const steps = metrics.steps
  const checkInCount = checkIn && Object.keys(checkIn).length > 0 ? 1 : 0
  const trainingDays = metrics.workout.completed ? 1 : 0
  const bestDay =
    weightAnalysis.latest || weekMeals.length > 0
      ? formatDate(weightAnalysis.latest?.date || weekMeals.at(-1)?.date || weekMeals.at(-1)?.createdAt)
      : 'Saknas'
  const hardestDay =
    metrics.energy.value !== null && metrics.energy.value <= 3
      ? 'Dagen med låg energi'
      : 'Ingen tydlig svår dag hittad'

  return {
    bestDay,
    checkInCount,
    conclusion:
      weightChange === null
        ? 'Coachens slutsats: fortsätt samla data så blir veckomönstret skarpare.'
        : weightChange < 0
          ? 'Coachens slutsats: veckan rör sig åt rätt håll, behåll de enkla vanorna.'
          : weightChange > 0
            ? 'Coachens slutsats: gör nästa vecka lugnare och mer förutsägbar, utan hård kompensation.'
            : 'Coachens slutsats: stabilitet är också data. Välj ett litet tryck framåt.',
    hardestDay,
    proteinAverageLabel:
      proteinAverage === null
        ? getProteinLabel(proteinScore)
        : `${Math.round(proteinAverage)} g`,
    calorieAverageLabel: calorieAverage === null ? 'Saknas' : `${Math.round(calorieAverage)} kcal`,
    fiberAverageLabel: fiberAverage === null ? 'Saknas' : `${Math.round(fiberAverage)} g`,
    registeredNutritionDays: weeklyNutrition?.registeredDays ?? null,
    stepsAverageLabel: steps === null ? 'Saknas' : formatInteger(steps),
    trainingDays,
    weightChangeLabel: weightChange === null ? 'Saknas' : formatKg(weightChange),
  }
}

function buildGoalCenter(coachProfile) {
  const weightContext = coachProfile.weightContext
  const milestones = getMilestones(weightContext)

  return {
    estimatedGoalDate: estimateGoalDate(weightContext),
    latestMilestone: milestones.latest,
    nextMilestone: milestones.next,
    percentRemainingLabel:
      weightContext.percentRemaining === null
        ? 'Saknas'
        : `${formatPercent(weightContext.percentRemaining)} kvar`,
    remainingKgLabel:
      weightContext.goalRemaining === null
        ? 'Saknas'
        : `${formatKg(Math.abs(weightContext.goalRemaining))} kvar`,
  }
}

function getMotivationKind({ checkIn, dailyAnalysis, weights }) {
  const lastActivity = getLastActivityDate({
    checkIn,
    mealHistory: [],
    meals: [],
    weights,
  })
  const daysAbsent = lastActivity
    ? Math.floor((Date.now() - lastActivity.getTime()) / (24 * 60 * 60 * 1000))
    : 99

  if (daysAbsent >= 3) {
    return 'absence'
  }

  if (dailyAnalysis.weightTrend === 'Nedåt') {
    return 'down'
  }

  if (dailyAnalysis.weightTrend === 'Uppåt') {
    return 'up'
  }

  return 'stable'
}

function buildMotivation({ checkIn, dailyAnalysis, previousReports, profile, weights }) {
  const name = safeText(profile?.name, 'Du')
  const kind = getMotivationKind({ checkIn, dailyAnalysis, weights })
  const personalBest =
    weights.length > 0 &&
    weights.at(-1)?.value === Math.min(...weights.map((entry) => parseWeightValue(entry.value)).filter(Boolean))
  const messages = {
    absence: `${name}, kom tillbaka mjukt. En enda check-in räcker för att starta om rytmen.`,
    down: `${name}, vikten rör sig nedåt. Fortsätt med det som är lättast att upprepa.`,
    stable: `${name}, stabil vikt är inte ett misslyckande. Lägg fokus på steg, protein och sömn i dag.`,
    up: `${name}, en uppgång är feedback, inte dom. Gör nästa måltid enkel och logga nästa vikt utan stress.`,
  }
  const recentMessages = safeArray(previousReports).slice(0, 4).map((report) => report.motivation?.message)
  let message = personalBest
    ? `${name}, nytt personbästa i viktloggen. Stanna upp och gör nästa steg lika enkelt.`
    : messages[kind]

  if (recentMessages.includes(message)) {
    message =
      kind === 'down'
        ? 'Dagens påminnelse: upprepa basen, inte perfektionen.'
        : 'Dagens fokus: välj en sak som gör kvällen lättare.'
  }

  return {
    kind: personalBest ? 'personalBest' : kind,
    message,
  }
}

function buildProgressSummary({
  bodyMeasurementAnalysis,
  bodyMeasurements,
  progressAnalysis,
  progressInsights,
  progressProjection,
}) {
  const analysis = progressAnalysis || {}
  const projection = progressProjection || {}
  const measurements = safeArray(bodyMeasurements)
  const measurementAnalysis = bodyMeasurementAnalysis || {}

  return {
    bodyMeasurementLabel:
      measurementAnalysis.trackedTypes || measurements.length
        ? `${measurementAnalysis.trackedTypes || 0} mått följs`
        : 'Inga kroppsmått ännu',
    insightLabel: safeArray(progressInsights)[0]?.text || 'Fler registreringar ger tydligare framstegsinsikter.',
    projectionLabel: projection.estimatedGoalDate || 'För lite data',
    registrationLabel:
      analysis.registrationDays === undefined
        ? 'Saknas'
        : `${analysis.registrationDays} registrerade viktdagar`,
    trendLabel: analysis.trend || 'För lite data',
    weightChangeLabel:
      analysis.change7 === null || analysis.change7 === undefined
        ? 'Saknas'
        : `${analysis.change7 > 0 ? '+' : ''}${formatKg(analysis.change7)}`,
  }
}

export function createAiCoachV2Report(data = {}) {
  const profile = data.profile || {}
  const weights = safeArray(data.weights)
  const mealHistory = safeArray(data.mealHistory)
  const meals = safeArray(data.meals)
  const checkIn = data.checkIn || {}
  const nutritionGoals = data.nutritionGoals || {}
  const nutritionInsights = safeArray(data.nutritionInsights)
  const nutritionSummary = data.nutritionSummary || null
  const weeklyNutrition = data.weeklyNutrition || null
  const progressSummary = buildProgressSummary({
    bodyMeasurementAnalysis: data.bodyMeasurementAnalysis,
    bodyMeasurements: data.bodyMeasurements,
    progressAnalysis: data.progressAnalysis,
    progressInsights: data.progressInsights,
    progressProjection: data.progressProjection,
  })
  const coachProfile = buildCoachProfile({ checkIn, profile, weights })
  const dailyAnalysis = buildDailyAnalysis({
    checkIn,
    mealHistory,
    meals,
    nutritionGoals,
    nutritionSummary,
    profile,
    today: data.today,
    weights,
  })
  const weeklySummary = buildWeeklySummary({ checkIn, mealHistory, meals, profile, weeklyNutrition, weights })
  const goalCenter = buildGoalCenter(coachProfile)
  const motivation = buildMotivation({
    checkIn,
    dailyAnalysis,
    previousReports: data.previousReports,
    profile,
    weights,
  })

  return {
    coachConclusion: `${coachProfile.name}, ${dailyAnalysis.summary} ${weeklySummary.conclusion}`,
    coachProfile,
    createdAt: new Date().toISOString(),
    dailyAnalysis,
    goalCenter,
    id: `coach-report-${Date.now()}`,
    motivation,
    nutritionInsights,
    progressSummary,
    weeklySummary,
  }
}

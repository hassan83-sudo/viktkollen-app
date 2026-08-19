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
import {
  formatCalories,
  formatGrams,
  formatPercentage,
  formatSteps,
  parseDisplayNumber,
} from './healthFormatting.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import { describeMealProvenanceSummary, summarizeMealProvenance } from './nutrition/nutritionProvenance.js'
import { analyzeWeights } from './progressService.js'
import { buildRoutineCoachContext } from './routines/dailyRoutinePlan.js'

export const coachRecommendationSchemaVersion = 2

const validRecommendationCategories = new Set([
  'activity',
  'consistency',
  'general',
  'goal',
  'logging',
  'nutrition',
  'protein',
  'recovery',
  'weight',
])
const validPriorities = new Set(['low', 'medium', 'high'])
const validConfidence = new Set(['low', 'medium', 'high'])
const unsafeCoachPattern = /diagnos|läkemedel|medicin|svält|straff|förbjud|måste gå ner|crash|extrem|garanterat|exakt kroppsfett/i

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function safeNumber(value, fallback = null) {
  return parseDisplayNumber(value, fallback)
}

function getDate(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = getDate(value)

  return date ? date.toLocaleDateString('sv-SE') : 'Tidpunkt saknas'
}

function formatPercent(value, fallback = 'Saknas') {
  return formatPercentage(value, { fallback, maximumFractionDigits: 1 })
}

function average(values) {
  const numbers = values.map((value) => safeNumber(value)).filter((value) => value !== null)

  return numbers.length
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : null
}

function clampText(value, fallback = '', maxLength = 180) {
  const text = safeText(value, fallback).replace(/\s+/g, ' ').trim()

  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text
}

function makeEvidence(text, provenance = 'derived') {
  return {
    provenance,
    text: clampText(text, '', 140),
  }
}

function normalizePriority(value, fallback = 'medium') {
  return validPriorities.has(value) ? value : fallback
}

function normalizeConfidence(value, fallback = 'medium') {
  return validConfidence.has(value) ? value : fallback
}

function normalizeCategory(value, fallback = 'general') {
  return validRecommendationCategories.has(value) ? value : fallback
}

function getRecommendationKey(recommendation = {}) {
  return [
    recommendation.category,
    recommendation.title,
    recommendation.action,
  ]
    .map((value) => safeText(value).toLocaleLowerCase('sv-SE'))
    .join('|')
}

function getRecentRecommendationKeys(previousReports = []) {
  return new Set(
    safeArray(previousReports)
      .slice(0, 5)
      .flatMap((report) => safeArray(report.recommendations))
      .map(getRecommendationKey),
  )
}

export function normalizeCoachRecommendation(recommendation = {}, options = {}) {
  const category = normalizeCategory(recommendation.category)
  const title = clampText(recommendation.title, 'Nästa steg', 72)
  const action = clampText(recommendation.action, '', 180)
  const reasoningSummary = clampText(recommendation.reasoningSummary, 'Bygger på din senaste registrerade data.', 180)
  const evidence = safeArray(recommendation.evidence)
    .map((item) => (typeof item === 'string' ? makeEvidence(item) : makeEvidence(item.text, item.provenance)))
    .filter((item) => item.text)
    .slice(0, 3)

  if (!action || unsafeCoachPattern.test(`${title} ${action} ${reasoningSummary}`)) {
    return null
  }

  return {
    action,
    category,
    confidence: normalizeConfidence(recommendation.confidence, options.defaultConfidence || 'medium'),
    createdAt: recommendation.createdAt || options.now || new Date().toISOString(),
    evidence,
    feedback: recommendation.feedback || null,
    id: safeText(recommendation.id) || `coach-rec-${category}-${Math.abs(getRecommendationKey({ action, category, title }).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0))}`,
    priority: normalizePriority(recommendation.priority),
    reasoningSummary,
    schemaVersion: coachRecommendationSchemaVersion,
    title,
  }
}

export function normalizeCoachRecommendations(recommendations = [], options = {}) {
  const seen = new Set()

  return safeArray(recommendations)
    .map((recommendation) => normalizeCoachRecommendation(recommendation, options))
    .filter(Boolean)
    .filter((recommendation) => {
      const key = getRecommendationKey(recommendation)

      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 4)
}

function buildContextQuality({ bodyAnalysisHistory = [], checkIn, goals, meals = [], nutritionGoals = {}, weights = [] }) {
  const measuredWeightDays = safeArray(weights).length
  const mealDays = new Set(safeArray(meals).map((meal) => meal.date || meal.createdAt?.slice?.(0, 10)).filter(Boolean)).size
  const hasCheckIn = checkIn && Object.keys(checkIn).length > 0
  const goalCount = [
    Number.isFinite(safeNumber(goals?.goalWeight)),
    Number.isFinite(safeNumber(nutritionGoals?.calories)),
    Number.isFinite(safeNumber(nutritionGoals?.protein)),
  ].filter(Boolean).length
  const score =
    Math.min(measuredWeightDays, 6) * 8 +
    Math.min(mealDays, 7) * 6 +
    (hasCheckIn ? 18 : 0) +
    goalCount * 8 +
    (safeArray(bodyAnalysisHistory).length ? 6 : 0)
  const level = score >= 75 ? 'high' : score >= 42 ? 'medium' : 'low'
  const missing = [
    measuredWeightDays < 2 ? 'fler uppmätta vikter' : '',
    mealDays < 2 ? 'fler loggade måltidsdagar' : '',
    !hasCheckIn ? 'dagens check-in' : '',
    goalCount === 0 ? 'mål' : '',
  ].filter(Boolean)

  return {
    level,
    missing,
    score: Math.max(0, Math.min(100, score)),
    summary:
      level === 'high'
        ? 'Bra underlag'
        : level === 'medium'
          ? 'Medelstarkt underlag'
          : 'Begränsat underlag',
  }
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
  if (unit === 'kcal') return formatCalories(value, { fallback })
  return formatGrams(value, { fallback, unit })
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
  const fiber = hasNutritionSummary ? safeNumber(summary.totals?.fiber, 0) : null
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
  const mood = metrics.mood.displayLabel === 'Saknas' ? 'Ej loggat' : metrics.mood.displayLabel
  const workout = metrics.workout
  const summaryParts = [
    weightStats.trend !== 'För lite data' ? `vikttrenden är ${weightStats.trend.toLocaleLowerCase('sv-SE')}` : '',
    steps !== null ? formatSteps(steps) : '',
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
    sleepLabel: metrics.sleepLabel,
    steps,
    stepsLabel: metrics.stepsLabel,
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
    stepsAverageLabel: metrics.stepsLabel,
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

function buildCoachContextV2({
  bodyAnalysisHistory,
  checkIn,
  coachProfile,
  dailyAnalysis,
  meals,
  nutritionGoals,
  snapshot,
  weeklySummary,
  weights,
  routineContext,
}) {
  const bodyScan = snapshot.weight.provenance?.latestBodyScanEstimate || null
  const contextQuality = buildContextQuality({
    bodyAnalysisHistory,
    checkIn,
    goals: { goalWeight: coachProfile.goalWeight },
    meals,
    nutritionGoals,
    weights,
  })
  const mealProvenance = summarizeMealProvenance(filterActualMealsForDate(meals, snapshot.date))

  return {
    activity: {
      activityGoal: null,
      steps: dailyAnalysis.steps,
      stepsLabel: dailyAnalysis.stepsLabel,
      training: dailyAnalysis.trainingLabel,
    },
    bodyScan: bodyScan
      ? {
        confidence: bodyScan.confidence,
        date: bodyScan.date,
        estimatedWeight: {
          maxKg: bodyScan.maxKg,
          minKg: bodyScan.minKg,
          provenance: 'ai_estimated',
        },
      }
      : {
        estimatedWeight: null,
        provenance: 'missing',
      },
    checkIn: {
      energy: normalizeCheckInMetrics(checkIn).energy.value,
      mood: dailyAnalysis.mood,
      movementCompleted: dailyAnalysis.trainingLabel !== 'Ingen träning markerad',
      provenance: checkIn && Object.keys(checkIn).length ? 'user_entered' : 'missing',
    },
    contextQuality,
    goals: {
      calorieGoal: safeNumber(nutritionGoals?.calories),
      goalWeight: coachProfile.goalWeight,
      proteinGoal: safeNumber(nutritionGoals?.protein),
      provenance: 'user_entered',
    },
    nutrition: {
      calorieLabel: dailyAnalysis.caloriesLabel,
      confidence: contextQuality.level,
      mealCountToday: dailyAnalysis.mealCount,
      provenance: mealProvenance,
      provenanceSummary: describeMealProvenanceSummary(mealProvenance),
      proteinLabel: dailyAnalysis.proteinLabel,
      recentMeals: safeArray(meals).slice(-5).map((meal) => meal.name || meal.text || meal.type || 'Måltid'),
      source: 'estimated_or_user_entered',
    },
    profile: {
      activityLevel: coachProfile.activityLevel,
      age: coachProfile.age,
      height: coachProfile.height,
    },
    provenance: {
      bodyScanWeight: bodyScan ? 'ai_estimated' : 'missing',
      calories: 'ai_estimated',
      checkIn: checkIn && Object.keys(checkIn).length ? 'user_entered' : 'missing',
      goals: 'user_entered',
      protein: 'ai_estimated',
      trend: weights.length >= 2 ? 'derived' : 'missing',
      weight: coachProfile.currentWeight === null ? 'missing' : 'measured',
    },
    routines: routineContext,
    weight: {
      latestMeasuredWeight: coachProfile.currentWeight,
      measuredHistoryDays: weights.length,
      targetProgress: coachProfile.weightContext.goalProgress,
      trend: weeklySummary.weightChangeLabel,
    },
  }
}

function makeRecommendation(seed, options = {}) {
  return normalizeCoachRecommendation(seed, options)
}

function buildDailyRecommendations({
  bodyAnalysisHistory,
  coachProfile,
  contextQuality,
  dailyAnalysis,
  previousReports,
  routineContext,
  snapshot,
  weeklySummary,
}) {
  const recommendations = []
  const recentKeys = getRecentRecommendationKeys(previousReports)
  const proteinGoal = safeNumber(snapshot.nutrition.goals?.protein)
  const proteinToday = safeNumber(snapshot.nutrition.proteinToday)
  const metrics = snapshot.checkIn.metrics || normalizeCheckInMetrics(snapshot.checkIn.latestToday || {})

  if (proteinGoal && proteinToday !== null && proteinToday < proteinGoal * 0.75) {
    recommendations.push(makeRecommendation({
      action: 'Lägg till en enkel proteinkälla i nästa måltid, till exempel ägg, kvarg, tofu, bönor eller fisk.',
      category: 'protein',
      confidence: dailyAnalysis.mealCount > 0 ? 'medium' : 'low',
      evidence: [
        makeEvidence(`Protein idag: ${Math.round(proteinToday)} g av mål ${Math.round(proteinGoal)} g.`, 'ai_estimated'),
        makeEvidence(`${dailyAnalysis.mealCount} måltider är loggade idag.`, 'user_entered'),
      ],
      priority: 'high',
      reasoningSummary: 'Protein ligger under dagens mål och nästa måltid är ett konkret tillfälle att jämna ut dagen.',
      title: 'Stärk nästa måltid',
    }))
  }

  if (metrics.steps !== null && metrics.steps < 6000) {
    recommendations.push(makeRecommendation({
      action: 'Ta en kort promenad på 10-20 minuter när det passar idag.',
      category: 'activity',
      confidence: 'medium',
      evidence: [makeEvidence(`Senaste check-in visar ${metrics.steps.toLocaleString('sv-SE')} steg.`, 'user_entered')],
      priority: metrics.steps < 3000 ? 'high' : 'medium',
      reasoningSummary: 'Aktiviteten ligger lågt hittills och en kort promenad är ett litet, mätbart nästa steg.',
      title: 'Få in vardagsrörelse',
    }))
  }

  if (metrics.energy.value !== null && metrics.energy.value <= 4) {
    recommendations.push(makeRecommendation({
      action: 'Gör kvällen enklare: vanlig måltid, vatten och en lugn nedvarvning före sömn.',
      category: 'recovery',
      confidence: 'medium',
      evidence: [makeEvidence(`Energi i senaste check-in: ${metrics.energy.value}/10.`, 'user_entered')],
      priority: 'medium',
      reasoningSummary: 'Låg energi gör hårda planer mindre hållbara; ett mjukt nästa steg är mer realistiskt.',
      title: 'Prioritera återhämtning',
    }))
  }

  if (coachProfile.goalWeight !== null && coachProfile.currentWeight !== null && snapshot.weight.dailyWeights.length >= 2) {
    recommendations.push(makeRecommendation({
      action: 'Följ veckosnittet och välj en vana att upprepa innan du ändrar planen.',
      category: 'goal',
      confidence: snapshot.weight.dailyWeights.length >= 6 ? 'medium' : 'low',
      evidence: [
        makeEvidence(`Senaste uppmätta vikt: ${formatKg(coachProfile.currentWeight)}.`, 'measured'),
        makeEvidence(`Målvikt: ${formatKg(coachProfile.goalWeight)}.`, 'user_entered'),
        makeEvidence(`Veckoförändring: ${weeklySummary.weightChangeLabel}.`, 'derived'),
      ],
      priority: 'medium',
      reasoningSummary: 'Målrådet bygger på uppmätt vikt och trend, inte på kroppsscannerns AI-estimat.',
      title: 'Håll målspåret lugnt',
    }))
  }

  if (contextQuality.level === 'low') {
    recommendations.push(makeRecommendation({
      action: `Samla mer underlag: ${contextQuality.missing.slice(0, 2).join(' och ') || 'en vikt eller check-in'}.`,
      category: 'logging',
      confidence: 'high',
      evidence: [makeEvidence(contextQuality.summary, 'derived')],
      priority: 'high',
      reasoningSummary: 'När underlaget är tunt blir bättre datainsamling mer värdefullt än fler gissningar.',
      title: 'Förbättra underlaget',
    }))
  }

  if (routineContext?.today?.total > 0 && routineContext.today.done < routineContext.today.total && routineContext.today.pending > 0) {
    recommendations.push(makeRecommendation({
      action: 'Välj en kvarvarande punkt i dagens plan och gör den så liten att den passar nuläget.',
      category: 'consistency',
      confidence: 'medium',
      evidence: [
        makeEvidence(`Dagens plan: ${routineContext.today.done}/${routineContext.today.total} klara.`, 'derived'),
        makeEvidence(`Väntande punkter: ${routineContext.today.pending}.`, 'missing'),
      ],
      priority: 'medium',
      reasoningSummary: 'Rutindata används som lätt stöd för nästa steg, inte som betyg på prestationen.',
      title: 'Gör dagens plan lättare',
    }))
  }

  const bodyEstimate = snapshot.weight.provenance?.latestBodyScanEstimate
  if (bodyEstimate && bodyAnalysisHistory.length > 0) {
    recommendations.push(makeRecommendation({
      action: 'Använd kroppsscanningen som stöd för bildjämförelse, men låt vågen eller manuell vikt vara viktkällan.',
      category: 'weight',
      confidence: bodyEstimate.confidence || 'low',
      evidence: [
        makeEvidence(`Body Scan uppskattade ${bodyEstimate.minKg}-${bodyEstimate.maxKg} kg.`, 'ai_estimated'),
        makeEvidence(coachProfile.currentWeight === null ? 'Senast uppmätt vikt saknas.' : `Senast uppmätt vikt är ${formatKg(coachProfile.currentWeight)}.`, coachProfile.currentWeight === null ? 'missing' : 'measured'),
      ],
      priority: 'low',
      reasoningSummary: 'Kroppsscanning är sekundärt underlag och ska inte blandas ihop med faktisk vägning.',
      title: 'Tolka Body Scan försiktigt',
    }))
  }

  const normalized = normalizeCoachRecommendations(recommendations)
  const fresh = normalized.filter((recommendation) => !recentKeys.has(getRecommendationKey(recommendation)))
  const sorted = (fresh.length ? fresh : normalized).sort((first, second) => {
    const priorityScore = { high: 3, medium: 2, low: 1 }

    return priorityScore[second.priority] - priorityScore[first.priority]
  })

  return sorted.slice(0, 3)
}

function compareWithPreviousWeek({ currentMeals, previousMeals, currentCheckIns, previousCheckIns, currentWeights, previousWeights }) {
  const currentMealDays = new Set(currentMeals.map((meal) => meal.date || meal.createdAt?.slice?.(0, 10)).filter(Boolean)).size
  const previousMealDays = new Set(previousMeals.map((meal) => meal.date || meal.createdAt?.slice?.(0, 10)).filter(Boolean)).size
  const currentCheckInDays = new Set(currentCheckIns.map((entry) => entry.date || entry.createdAt?.slice?.(0, 10)).filter(Boolean)).size
  const previousCheckInDays = new Set(previousCheckIns.map((entry) => entry.date || entry.createdAt?.slice?.(0, 10)).filter(Boolean)).size
  const currentWeightChange = currentWeights.length >= 2 ? Number((currentWeights.at(-1).value - currentWeights[0].value).toFixed(1)) : null
  const previousWeightChange = previousWeights.length >= 2 ? Number((previousWeights.at(-1).value - previousWeights[0].value).toFixed(1)) : null

  return {
    checkInDaysDelta: currentCheckInDays - previousCheckInDays,
    comparisonAvailable: previousMealDays + previousCheckInDays + previousWeights.length > 0,
    mealDaysDelta: currentMealDays - previousMealDays,
    summary:
      previousMealDays + previousCheckInDays + previousWeights.length > 0
        ? `${currentMealDays - previousMealDays >= 0 ? 'Fler eller lika många' : 'Färre'} måltidsdagar och ${currentCheckInDays - previousCheckInDays >= 0 ? 'fler eller lika många' : 'färre'} check-ins än veckan innan.`
        : 'Förra veckan har för lite data för en rättvis jämförelse.',
    weightChangeDelta:
      currentWeightChange !== null && previousWeightChange !== null
        ? Number((currentWeightChange - previousWeightChange).toFixed(1))
        : null,
  }
}

function buildWeeklyReportV2({ bodyAnalysisHistory, recommendations, snapshot, weights }) {
  const anchorDate = getDate(snapshot.date) || new Date()
  const anchorTime = anchorDate.getTime()
  const currentWeekStart = anchorTime - 7 * 24 * 60 * 60 * 1000
  const previousWeekStart = anchorTime - 14 * 24 * 60 * 60 * 1000
  const latestBody = safeArray(bodyAnalysisHistory)[0] || null
  const currentMeals = safeArray(snapshot.nutrition.actualMeals).filter((meal) => {
    const date = getDate(meal.date || meal.createdAt)

    return date && date.getTime() >= currentWeekStart && date.getTime() <= anchorTime
  })
  const previousMeals = safeArray(snapshot.nutrition.actualMeals).filter((meal) => {
    const date = getDate(meal.date || meal.createdAt)

    return date && date.getTime() >= previousWeekStart && date.getTime() < currentWeekStart
  })
  const currentWeights = safeArray(weights).slice(-7)
  const previousWeights = safeArray(weights).slice(-14, -7)
  const currentCheckIns = safeArray(snapshot.checkIn.dailyEntries).slice(-7)
  const previousCheckIns = safeArray(snapshot.checkIn.dailyEntries).slice(-14, -7)
  const comparison = compareWithPreviousWeek({
    currentCheckIns,
    currentMeals,
    currentWeights,
    previousCheckIns,
    previousMeals,
    previousWeights,
  })
  const strengths = [
    currentMeals.length > 0 ? `Du loggade ${currentMeals.length} måltider den senaste veckan.` : '',
    snapshot.weight.dailyWeights.length >= 2 ? `Vikttrenden bygger på ${snapshot.weight.dailyWeights.length} uppmätta viktdagar.` : '',
    snapshot.checkIn.dailyEntries.length > 0 ? `Du har ${snapshot.checkIn.dailyEntries.length} check-ins i underlaget.` : '',
  ].filter(Boolean).slice(0, 3)
  const focus = recommendations
    .filter((recommendation) => recommendation.priority !== 'low')
    .map((recommendation) => recommendation.action)
    .slice(0, 3)

  return {
    activity: {
      steps: snapshot.checkIn.display.steps,
      training: snapshot.checkIn.workout?.displayLabel || 'Saknas',
    },
    bodyScan: latestBody
      ? {
        date: latestBody.createdAt || latestBody.date || null,
        summary: latestBody.result?.summary || 'Kroppsscanning finns som sekundärt underlag.',
        weightEstimate: snapshot.weight.provenance?.latestBodyScanEstimate || null,
      }
      : null,
    checkIn: {
      energy: snapshot.checkIn.display.energy,
      mood: snapshot.checkIn.display.mood,
    },
    focus: focus.length ? focus : ['Logga en vikt, en måltid och en check-in för bättre nästa rapport.'],
    nextWeek: recommendations[0]?.action || 'Välj en liten vana att upprepa nästa vecka.',
    previousWeekComparison: comparison,
    quality: snapshot.weight.provenance?.status === 'missing' && currentMeals.length === 0 ? 'low' : currentMeals.length >= 3 ? 'high' : 'medium',
    strengths: strengths.length ? strengths : ['Inga tydliga styrkor visas utan faktisk registrerad data ännu.'],
    summary: 'Veckorapporten bygger på registrerad vikt, måltider, check-ins och separat markerade AI-estimat.',
    weight: {
      latestMeasured: snapshot.weight.current,
      trend: snapshot.weight.trend,
      weeklyChange: snapshot.weight.change7,
    },
  }
}

export function updateCoachRecommendationFeedback(report = {}, recommendationId, feedbackValue, options = {}) {
  const allowed = feedbackValue === 'helpful' || feedbackValue === 'not_relevant'

  if (!report || !allowed) return report

  const feedback = {
    at: options.now || new Date().toISOString(),
    value: feedbackValue,
  }

  return {
    ...report,
    recommendations: safeArray(report.recommendations).map((recommendation) =>
      recommendation.id === recommendationId
        ? {
          ...recommendation,
          feedback,
          status: feedbackValue === 'not_relevant' ? 'dismissed' : 'helpful',
        }
        : recommendation,
    ),
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
  const snapshot = data.healthSnapshot || buildHealthSnapshot(data)
  const profile = data.profile || {}
  const weights = snapshot.weight.dailyWeights
  const bodyAnalysisHistory = safeArray(data.bodyAnalysisHistory)
  const mealHistory = []
  const meals = snapshot.nutrition.actualMeals
  const checkIn = snapshot.checkIn.latestToday || data.checkIn || {}
  const routineContext = buildRoutineCoachContext({
    goalsHabits: data.goalsHabits,
    reminderState: data.reminderState,
  }, { today: snapshot.date, now: `${snapshot.date}T12:00:00.000Z` })
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
    nutritionSummary: nutritionSummary || snapshot.nutrition.summary,
    profile,
    today: snapshot.date,
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
  const context = buildCoachContextV2({
    bodyAnalysisHistory,
    checkIn,
    coachProfile,
    dailyAnalysis,
    meals,
    nutritionGoals: snapshot.nutrition.goals || nutritionGoals,
    snapshot,
    weeklySummary,
    weights,
    routineContext,
  })
  const recommendations = buildDailyRecommendations({
    bodyAnalysisHistory,
    coachProfile,
    contextQuality: context.contextQuality,
    dailyAnalysis,
    previousReports: data.previousReports,
    routineContext,
    snapshot,
    weeklySummary,
  })
  const weeklyReportV2 = buildWeeklyReportV2({
    bodyAnalysisHistory,
    recommendations,
    snapshot,
    weights,
  })

  return {
    coachConclusion: `${coachProfile.name}, ${dailyAnalysis.summary} ${weeklySummary.conclusion}`,
    coachProfile,
    context,
    contextQuality: context.contextQuality,
    createdAt: new Date().toISOString(),
    dailyAnalysis,
    dailyAdvice: recommendations[0] || null,
    dataQuality: context.contextQuality,
    goalCenter,
    id: `coach-report-${Date.now()}`,
    motivation,
    nextBestAction: recommendations[0]?.action || motivation.message,
    nutritionInsights,
    progressSummary,
    recommendations,
    schemaVersion: coachRecommendationSchemaVersion,
    weeklyReportV2,
    weeklySummary,
  }
}

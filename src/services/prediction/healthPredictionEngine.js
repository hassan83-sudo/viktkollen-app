import { buildInsightsEngine } from '../insights/insightsEngine.js'
import { buildSharedAnalytics } from '../sharedAnalyticsEngine.js'
import { buildNutritionCoachModel } from '../nutrition/nutritionCoachEngine.js'
import { calculateAiHealthScore } from '../dashboardService.js'
import { getEntryLocalDate } from '../localDate.js'
import { createWeightProjection } from '../progressService.js'

export const healthPredictionEngineVersion = 1

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function formatSignedKg(value) {
  if (!Number.isFinite(value)) return 'Saknas'

  const rounded = round(value, 1)
  const prefix = rounded > 0 ? '+' : ''

  return `${prefix}${rounded.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} kg`
}

function safeDateKey(value) {
  return getEntryLocalDate(value) || String(value?.date || value?.createdAt || '').slice(0, 10)
}

function trendLabel(direction) {
  if (direction === 'up') return 'stigande'
  if (direction === 'down') return 'sjunkande'
  if (direction === 'stable') return 'stabil'
  return 'otillräckligt underlag'
}

function predictionConfidence({ coverage = 0, sampleSize = 0, signalCount = 0 }) {
  return Math.round(clamp((coverage * 55) + Math.min(sampleSize, 14) * 2.2 + signalCount * 6, 10, 88))
}

function confidenceLabel(historyDays = 0) {
  if (historyDays >= 60) return 'Hög'
  if (historyDays >= 14) return 'Medel'
  return 'Låg'
}

function uncertaintyText(confidence, sampleSize) {
  if (confidence >= 70) return 'Osäkerheten är måttlig eftersom flera datakällor stödjer signalen.'
  if (sampleSize >= 2) return 'Osäkerheten är högre eftersom underlaget är delvis eller kort.'
  return 'Osäkerheten är hög eftersom det finns för lite historik.'
}

function makePrediction({ category, confidence, contributingFactors = [], direction, explanation, horizon, id, metric, value }) {
  const factors = safeArray(contributingFactors).map((factor) => String(factor || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4)

  return {
    category,
    confidence,
    contributingFactors: factors,
    direction,
    explanation,
    horizon,
    id,
    metric,
    uncertainty: uncertaintyText(confidence, factors.length),
    value: Number.isFinite(value) ? round(value, 1) : null,
  }
}

function makeWeightPrediction(shared, horizon) {
  const weight = shared.weightSummary
  const sampleSize = shared.coverage.weightDays || 0
  const weeklyRate = Number(weight.weeklyAverageChange)
  const projected = Number.isFinite(weeklyRate)
    ? weeklyRate * (horizon === '30d' ? 30 / 7 : 1)
    : null
  const direction = !Number.isFinite(projected)
    ? 'insufficient'
    : Math.abs(projected) <= 0.2
      ? 'stable'
      : projected > 0 ? 'up' : 'down'
  const confidence = predictionConfidence({
    coverage: shared.coverage.ratio,
    sampleSize,
    signalCount: Number.isFinite(projected) ? 2 : 0,
  })

  return makePrediction({
    category: 'weight',
    confidence,
    contributingFactors: [
      weight.weeklyAverageLabel,
      weight.periodChangeLabel,
      weight.dataText,
    ],
    direction,
    explanation: direction === 'insufficient'
      ? `Viktprognosen för ${horizon === '7d' ? '7 dagar' : '30 dagar'} behöver fler representativa dagsvärden.`
      : `Om nuvarande trend fortsätter är viktbanan ${trendLabel(direction)} på ${horizon === '7d' ? '7 dagars' : '30 dagars'} sikt.`,
    horizon,
    id: `weight-${horizon}`,
    metric: 'weightTrend',
    value: projected,
  })
}

function makeScorePrediction({ confidenceBase, current, factors, id, label, metric }) {
  const value = Number(current)
  const direction = !Number.isFinite(value)
    ? 'insufficient'
    : value >= 70 ? 'up' : value >= 45 ? 'stable' : 'down'
  const confidence = predictionConfidence({
    coverage: confidenceBase / 100,
    sampleSize: safeArray(factors).length + 2,
    signalCount: Number.isFinite(value) ? 2 : 0,
  })

  return makePrediction({
    category: metric,
    confidence,
    contributingFactors: factors,
    direction,
    explanation: Number.isFinite(value)
      ? `${label} ser ${trendLabel(direction)} ut utifrån aktuella aggregerade signaler.`
      : `${label} behöver mer data innan en försiktig prognos visas.`,
    horizon: '30d',
    id,
    metric,
    value,
  })
}

function buildWarnings({ actionPlan, insights, nutritionCoach, shared }) {
  const skipped = safeArray(actionPlan.actions).filter((action) => action.status === 'skipped').length
  const warnings = [
    insights.adherence < 45
      ? {
        category: 'adherence',
        confidence: insights.confidence,
        explanation: 'Följsamheten har minskat i de aggregerade signalerna.',
        id: 'declining-adherence',
        severity: 'medium',
        signal: 'declining adherence',
        support: 'Sänk ribban till ett kortare steg i nästa plan.',
      }
      : null,
    skipped >= 3
      ? {
        category: 'actionPlan',
        confidence: actionPlan.confidenceScore,
        explanation: 'Flera plansteg har hoppats över nyligen.',
        id: 'repeated-skipped-actions',
        severity: 'medium',
        signal: 'repeated skipped actions',
        support: 'Välj färre och kortare actions tills rytmen känns rimlig.',
      }
      : null,
    nutritionCoach.dailyTimeline?.mealCount === 0
      ? {
        category: 'nutrition',
        confidence: nutritionCoach.confidenceScore,
        explanation: 'Dagens faktiska måltidslogg är tom.',
        id: 'missing-meals',
        severity: 'low',
        signal: 'missing meals',
        support: 'Logga nästa vanliga måltid eller välj ett enkelt balanserat mål.',
      }
      : null,
    Number.isFinite(shared.activitySummary.averageSteps) && shared.activitySummary.averageSteps < 4000
      ? {
        category: 'activity',
        confidence: shared.coverage.ratio > 0 ? Math.round(shared.coverage.ratio * 100) : 25,
        explanation: 'Stegsnittet är lågt i vald period.',
        id: 'inactivity',
        severity: 'low',
        signal: 'inactivity',
        support: 'En kort promenad räcker som första steg om kroppen känns okej.',
      }
      : null,
    insights.consistency < 45
      ? {
        category: 'consistency',
        confidence: insights.confidence,
        explanation: 'Konsekvenssignalerna är svagare än övriga signaler.',
        id: 'decreasing-consistency',
        severity: 'medium',
        signal: 'decreasing consistency',
        support: 'Välj en enda daglig registrering i stället för flera krav.',
      }
      : null,
  ].filter(Boolean)

  return warnings.slice(0, 5)
}

function buildOpportunities({ insights, shared }) {
  return [
    insights.momentum >= 65
      ? {
        category: 'momentum',
        confidence: insights.confidence,
        explanation: 'Momentum är starkt i de aggregerade signalerna.',
        id: 'positive-momentum',
        nextStep: 'Behåll samma bas och lägg bara till ett litet extra steg.',
        title: 'Momentum finns',
      }
      : null,
    insights.trends?.habitConsistency?.rate >= 60
      ? {
        category: 'habits',
        confidence: insights.confidence,
        explanation: 'Vanorna visar användbar konsekvens.',
        id: 'improving-habits',
        nextStep: 'Fortsätt med samma vana innan du höjer svårigheten.',
        title: 'Vanorna börjar sitta',
      }
      : null,
    insights.trends?.protein?.direction === 'stable'
      ? {
        category: 'nutrition',
        confidence: insights.trends.protein.sampleSize >= 4 ? 70 : 45,
        explanation: 'Proteinintaget är stabilt i perioden.',
        id: 'stable-nutrition',
        nextStep: 'Behåll proteinkällorna och stärk gärna grönsaker/fiber.',
        title: 'Stabil nutrition',
      }
      : null,
    Number.isFinite(shared.weightSummary.goalRemaining) && Math.abs(shared.weightSummary.goalRemaining) <= 3
      ? {
        category: 'milestone',
        confidence: shared.coverage.weightDays >= 2 ? 70 : 45,
        explanation: 'Målet eller nästa viktmilstolpe ligger nära enligt central viktdata.',
        id: 'approaching-milestone',
        nextStep: 'Fortsätt lugnt och undvik extrema justeringar.',
        title: 'Nära milstolpe',
      }
      : null,
    shared.coverage.level === 'good'
      ? {
        category: 'routine',
        confidence: Math.round(shared.coverage.ratio * 100),
        explanation: 'Datatäckningen är tillräckligt jämn för bättre coachning.',
        id: 'consistent-routines',
        nextStep: 'Använd veckans data för ett realistiskt nästa steg.',
        title: 'Konsekventa rutiner',
      }
      : null,
  ].filter(Boolean).slice(0, 5)
}

function latestActionPlan(feedback = {}) {
  return safeArray(feedback.actionPlans)
    .slice()
    .sort((first, second) => String(second.generatedAt || second.updatedAt || '').localeCompare(String(first.generatedAt || first.updatedAt || '')))[0] || null
}

function summarizeActionPlan(feedback = {}) {
  const storedPlan = latestActionPlan(feedback)
  const actions = safeArray(storedPlan?.days).flatMap((day) => safeArray(day.actions))
  const completed = actions.filter((action) => action.status === 'completed').length
  const skipped = actions.filter((action) => action.status === 'skipped').length
  const completionRate = completed + skipped > 0 ? Math.round((completed / (completed + skipped)) * 100) : null

  return {
    actions,
    adaptiveChanges: storedPlan?.adaptiveChange || 'Ingen sparad coachplan ännu.',
    completed,
    completionRate,
    confidenceScore: Math.round(clamp(storedPlan?.confidence, 0.2, 0.85) * 100),
    skipped,
  }
}

function getHistoryDates(input = {}) {
  const dates = [
    ...safeArray(input.weights || input.healthSnapshot?.weight?.dailyWeights).map(safeDateKey),
    ...safeArray(input.meals || input.healthSnapshot?.nutrition?.actualMeals).map(safeDateKey),
    ...safeArray(input.checkIns || input.healthSnapshot?.checkIn?.dailyEntries).map(safeDateKey),
    safeDateKey(input.checkIn),
  ].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))

  return [...new Set(dates)].sort((first, second) => first.localeCompare(second, 'sv-SE'))
}

function buildHealthScoreForecast(input = {}, shared30) {
  const currentScore = calculateAiHealthScore({
    checkIn: input.checkIn,
    foods: input.foods,
    mealHistory: input.healthSnapshot?.nutrition?.actualMeals,
    meals: input.meals,
    weights: input.weights || input.healthSnapshot?.weight?.dailyWeights,
  }).score
  const nutritionLift = Number(shared30.nutritionSummary.proteinGoalPercent) >= 70 ? 2 : 0
  const activityLift = Number(shared30.activitySummary.averageSteps) >= 8000 ? 2 : 0
  const coveragePenalty = shared30.coverage.level === 'missing' ? -4 : shared30.coverage.level === 'partial' ? -1 : 0
  const projected = Number.isFinite(currentScore)
    ? clamp(Math.round(currentScore + nutritionLift + activityLift + coveragePenalty), 0, 100)
    : null

  return {
    current: Number.isFinite(currentScore) ? currentScore : null,
    projected,
  }
}

function trendStatus(value) {
  if (!Number.isFinite(value) || Math.abs(value) <= 0.2) {
    return { color: 'yellow', direction: 'stable', label: 'stabil', symbol: '→' }
  }

  return value < 0
    ? { color: 'green', direction: 'improving', label: 'förbättras', symbol: '↘' }
    : { color: 'red', direction: 'declining', label: 'försämras', symbol: '↗' }
}

function buildInsightCards({ input, shared30 }) {
  const insights = []
  const nutrition = shared30.nutritionSummary
  const activity = shared30.activitySummary
  const checkIns = safeArray(input.checkIns || input.healthSnapshot?.checkIn?.dailyEntries)
  const stepByWeekday = checkIns
    .map((entry) => ({ date: safeDateKey(entry), steps: Number(entry.steps) }))
    .filter((entry) => entry.date && Number.isFinite(entry.steps))
    .reduce((map, entry) => {
      const weekday = new Intl.DateTimeFormat('sv-SE', { weekday: 'long' }).format(new Date(`${entry.date}T12:00:00`))
      const current = map.get(weekday) || { count: 0, steps: 0, weekday }

      map.set(weekday, { ...current, count: current.count + 1, steps: current.steps + entry.steps })
      return map
    }, new Map())
  const bestWeekday = [...stepByWeekday.values()]
    .filter((entry) => entry.count >= 1)
    .sort((first, second) => (second.steps / second.count) - (first.steps / first.count))[0]

  if (nutrition.loggedDays > 0 && Number.isFinite(nutrition.proteinGoalPercent)) {
    insights.push(`Du når proteinmålet ${Math.round(nutrition.proteinGoalPercent).toLocaleString('sv-SE')} % av loggade dagar.`)
  }

  if (bestWeekday) {
    insights.push(`Du går längst på ${bestWeekday.weekday}.`)
  }

  if (Number.isFinite(activity.averageSteps) && activity.averageSteps >= 8000) {
    insights.push(`Health Score får stöd av att ditt stegsnitt ligger över 8000 steg.`)
  }

  if (Number.isFinite(nutrition.proteinGoalPercent) && nutrition.proteinGoalPercent >= 70 && Number.isFinite(shared30.weightSummary.weeklyAverageChange)) {
    insights.push('Vikttrenden kan jämföras bättre eftersom proteinmålet ofta nås i perioden.')
  }

  return insights.slice(0, 4)
}

function buildRecommendation({ healthScoreForecast, shared30 }) {
  const averageSteps = Number(shared30.activitySummary.averageSteps)
  const averageProtein = Number(shared30.nutritionSummary.averageProtein)
  const proteinGoal = Number(shared30.analysis?.nutrition?.goalComparison?.proteinGoal)

  if (Number.isFinite(averageSteps) && averageSteps < 8000) {
    return '+1200 steg idag'
  }

  if (Number.isFinite(proteinGoal) && Number.isFinite(averageProtein) && averageProtein < proteinGoal) {
    return `${Math.ceil(proteinGoal - averageProtein).toLocaleString('sv-SE')} g protein kvar`
  }

  if (shared30.coverage.weightDays < 3) {
    return 'Väg dig imorgon för bättre prognoser.'
  }

  if (Number.isFinite(healthScoreForecast.projected) && healthScoreForecast.projected < 70) {
    return 'En kort check-in idag förbättrar prognosen.'
  }

  return 'Behåll dagens rutin och logga nästa måltid.'
}

function buildDashboardPrediction(input, { historyDays, shared7, shared30 }) {
  const weights = input.weights || input.healthSnapshot?.weight?.dailyWeights || []
  const projection = createWeightProjection(weights, input.profile || {})
  const healthScoreForecast = buildHealthScoreForecast(input, shared30)
  const trend7 = Number(shared7.weightSummary.periodChange)
  const trend30 = Number(shared30.weightSummary.periodChange)
  const kgPerWeek = Number(shared30.weightSummary.weeklyAverageChange)
  const nextWeekWeightChange = Number.isFinite(kgPerWeek) ? round(kgPerWeek, 1) : null
  const status = trendStatus(kgPerWeek)
  const insights = buildInsightCards({ input, shared30 })
  const hasEnoughHistory = historyDays >= 3 || shared30.coverage.ratio > 0

  return {
    confidence: {
      historyDays,
      label: confidenceLabel(historyDays),
    },
    empty: !hasEnoughHistory,
    estimatedGoalDate: projection.estimatedGoalDate,
    healthScoreNextWeek: healthScoreForecast.projected,
    insights,
    kgPerWeek,
    nextWeekWeightChange,
    recommendation: buildRecommendation({ healthScoreForecast, shared30 }),
    text: 'Om nuvarande trend fortsätter visas en försiktig prognos baserad på din lokala historik.',
    trend7,
    trend7Label: formatSignedKg(trend7),
    trend30,
    trend30Label: formatSignedKg(trend30),
    trendStatus: status,
    weightTrendLabel: Number.isFinite(nextWeekWeightChange)
      ? `Om nuvarande trend fortsätter: ${formatSignedKg(nextWeekWeightChange)} nästa vecka.`
      : 'Fler viktvärden behövs för nästa veckas viktprognos.',
  }
}

export function buildHealthPredictionModel(input = {}, options = {}) {
  const analysisDate = options.analysisDate || input.analysisDate || input.today
  const now = options.now || (analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined)
  const shared7 = buildSharedAnalytics(input, { analysisDate, period: '7d' })
  const shared30 = buildSharedAnalytics(input, { analysisDate, period: '30d' })
  const historyDays = getHistoryDates(input).length
  const insights = buildInsightsEngine(input, { analysisDate, now, period: '90d' })
  const actionPlan = summarizeActionPlan(input.adaptiveCoachFeedback)
  const nutritionCoach = buildNutritionCoachModel(input, { analysisDate: shared30.analysisDate, now })
  const completed = actionPlan.completed
  const skipped = actionPlan.skipped
  const completionRate = completed + skipped > 0 ? Math.round((completed / (completed + skipped)) * 100) : null
  const predictions = [
    makeWeightPrediction(shared7, '7d'),
    makeWeightPrediction(shared30, '30d'),
    makeScorePrediction({
      confidenceBase: insights.confidence,
      current: insights.adherence,
      factors: [insights.trends?.reminderCompletion?.text, insights.trends?.coachAcceptance?.text],
      id: 'adherence-30d',
      label: 'Följsamheten',
      metric: 'adherence',
    }),
    makeScorePrediction({
      confidenceBase: nutritionCoach.confidenceScore,
      current: nutritionCoach.weeklyScore,
      factors: [nutritionCoach.gaps?.[0], nutritionCoach.recommendations?.[0]],
      id: 'nutrition-30d',
      label: 'Nutritionstrenden',
      metric: 'nutrition',
    }),
    makeScorePrediction({
      confidenceBase: insights.confidence,
      current: insights.consistency,
      factors: [insights.trends?.habitConsistency?.text, insights.trends?.checkIns?.text],
      id: 'consistency-30d',
      label: 'Konsekvensen',
      metric: 'consistency',
    }),
    makeScorePrediction({
      confidenceBase: actionPlan.confidenceScore,
      current: completionRate,
      factors: [actionPlan.adaptiveChanges, `${completed} klara och ${skipped} hoppade actions`],
      id: 'action-plan-completion-7d',
      label: 'Action-plan completion',
      metric: 'actionPlan',
    }),
  ]
  const warningSignals = buildWarnings({ actionPlan, insights, nutritionCoach, shared: shared30 })
  const opportunities = buildOpportunities({ insights, shared: shared30 })
  const confidence = Math.round(clamp(
    predictions.reduce((sum, item) => sum + item.confidence, 0) / Math.max(predictions.length, 1),
    10,
    90,
  ))

  return {
    actionPlanSummary: {
      completed,
      completionRate,
      skipped,
      text: actionPlan.adaptiveChanges,
    },
    analysisDate: shared30.analysisDate,
    confidence,
    coverage: {
      level: shared30.coverage.level,
      ratio: shared30.coverage.ratio,
      text: shared30.coverage.text,
    },
    dashboard: buildDashboardPrediction(input, { historyDays, shared7, shared30 }),
    modelVersion: healthPredictionEngineVersion,
    opportunities,
    predictions,
    trendGraph: predictions.map((prediction) => ({
      confidence: prediction.confidence,
      id: prediction.id,
      label: prediction.metric,
      value: prediction.value,
    })),
    warningSignals,
  }
}

export function buildMinimalPredictionAiContext(model = {}) {
  return {
    categories: safeArray(model.predictions).map((item) => item.category),
    confidence: model.confidence,
    opportunities: safeArray(model.opportunities).map((item) => item.category),
    predictionCount: safeArray(model.predictions).length,
    warningSignals: safeArray(model.warningSignals).map((item) => item.category),
  }
}

export function buildPredictionReportSummary(input = {}, options = {}) {
  const model = buildHealthPredictionModel(input, options)
  const primary = model.predictions[0]

  return {
    cautionSignals: model.warningSignals,
    confidence: model.confidence,
    opportunities: model.opportunities,
    predictedTrajectory: primary
      ? `${primary.explanation} Confidence ${primary.confidence}%.`
      : 'Prediction visas när det finns mer data.',
    summary: buildMinimalPredictionAiContext(model),
  }
}

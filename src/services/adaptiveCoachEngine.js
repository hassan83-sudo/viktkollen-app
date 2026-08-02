import { buildAiNutritionCoachInsights } from './aiNutritionInsights.js'
import { buildGoalsHabitsLiteSummary } from './goalsHabitsSummary.js'
import { buildSharedAnalytics } from './sharedAnalyticsEngine.js'
import { buildReminderStatus } from './reminders/reminderScheduler.js'

export const adaptiveCoachEngineVersion = 1

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ') : fallback
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function uniqueByArea(items) {
  const seenAreas = new Set()
  const seenTexts = new Set()

  return safeArray(items)
    .filter((item) => item?.text && item?.action)
    .filter((item) => {
      const textKey = `${item.title}:${item.text}:${item.action}`.toLocaleLowerCase('sv-SE')
      if (seenTexts.has(textKey) || seenAreas.has(item.area)) return false
      seenTexts.add(textKey)
      seenAreas.add(item.area)
      return true
    })
}

function isUnsafeAdvice(item) {
  const text = `${item?.title || ''} ${item?.text || ''} ${item?.action || ''}`.toLocaleLowerCase('sv-SE')

  return /diagnos|medicin|svält|extrem|straff|förbjud|hoppa över måltid|måste gå ner/i.test(text)
}

function createRecommendation({ action, area, evidence = [], priority, text, title }) {
  return {
    action: safeText(action),
    area,
    evidence: safeArray(evidence).map((entry) => safeText(entry)).filter(Boolean).slice(0, 3),
    priority,
    text: safeText(text),
    title: safeText(title),
  }
}

function buildWeightRecommendation(shared) {
  const weight = shared.weightSummary
  if (weight.periodChange === null) {
    return createRecommendation({
      action: 'Logga nästa vikt när det passar så trendbilden blir tryggare.',
      area: 'weight',
      evidence: [weight.dataText],
      priority: 72,
      text: 'Vikttrenden har för lite underlag för att vara ett huvudråd.',
      title: 'Bygg tryggare viktunderlag',
    })
  }

  if (weight.weeklyAverageChange !== null && weight.weeklyAverageChange > 0.4) {
    return createRecommendation({
      action: 'Välj ett lugnt nästa steg: en vanlig måltid, lite vardagsrörelse och nästa planerade registrering.',
      area: 'weight',
      evidence: [weight.weeklyAverageLabel, weight.periodChangeLabel],
      priority: 80,
      text: 'Vikten rör sig uppåt i vald period, men underlaget ska tolkas som trenddata och inte som ett misslyckande.',
      title: 'Följ vikttrenden lugnt',
    })
  }

  if (weight.plateau) {
    return createRecommendation({
      action: 'Behåll basrutinen och justera bara en sak åt gången, till exempel protein eller steg.',
      area: 'weight',
      evidence: [weight.plateauText],
      priority: 58,
      text: 'Vikten verkar stabil i perioden.',
      title: 'Stabil period',
    })
  }

  if (weight.periodChange < -0.1) {
    return createRecommendation({
      action: 'Fortsätt med samma hållbara grund och prioritera återhämtning så tempot inte blir extremt.',
      area: 'weight',
      evidence: [weight.periodChangeLabel],
      priority: 52,
      text: 'Vikttrenden går åt rätt håll i vald period.',
      title: 'Fortsätt hållbart',
    })
  }

  return null
}

function buildNutritionRecommendation(shared, nutritionReport) {
  const nutrition = shared.nutritionSummary
  const insightAction = safeArray(nutritionReport.actionPlan)[0]

  if (nutrition.loggedDays < 2) {
    return createRecommendation({
      action: 'Logga två vanliga dagar utan att försöka göra dem perfekta.',
      area: 'nutrition',
      evidence: [nutrition.regularityText],
      priority: 76,
      text: 'Måltidsunderlaget är tunt, så coachen ska inte dra stora slutsatser om kosten ännu.',
      title: 'Tydligare matmönster',
    })
  }

  if (Number.isFinite(nutrition.proteinGoalPercent) && nutrition.proteinGoalPercent < 55) {
    return createRecommendation({
      action: 'Lägg till en enkel proteinkälla i nästa huvudmål, till exempel ägg, kvarg, kyckling eller baljväxter.',
      area: 'nutrition',
      evidence: [nutrition.proteinGoalText],
      priority: 86,
      text: 'Proteinmålet nås inte ofta på loggade dagar.',
      title: 'Stärk proteinbasen',
    })
  }

  if (insightAction) {
    return createRecommendation({
      action: insightAction.nextStep,
      area: 'nutrition',
      evidence: [insightAction.why],
      priority: 62,
      text: 'AI Nutrition Insights har ett konkret matsteg från senaste datan.',
      title: insightAction.title,
    })
  }

  return null
}

function buildActivityRecommendation(shared) {
  const activity = shared.activitySummary

  if (activity.checkInCount < 2) {
    return createRecommendation({
      action: 'Gör en kort check-in idag med energi, steg och humör.',
      area: 'activity',
      evidence: [activity.textAlternative],
      priority: 68,
      text: 'Det finns för få check-ins för att aktivitetsnivån ska tolkas säkert.',
      title: 'Fyll aktivitetsbilden',
    })
  }

  if (Number.isFinite(activity.averageSteps) && activity.averageSteps < 5000) {
    return createRecommendation({
      action: 'Ta en kort promenad eller dela upp stegen i två små block om kroppen känns okej.',
      area: 'activity',
      evidence: [activity.averageStepsLabel],
      priority: 74,
      text: 'Stegsnittet ligger lågt i vald period.',
      title: 'Liten rörelseinsats',
    })
  }

  if (activity.trainingDays > 0) {
    return createRecommendation({
      action: 'Behåll rytmen och planera gärna återhämtning mellan passen.',
      area: 'activity',
      evidence: [`${activity.trainingDays} träningsdagar`],
      priority: 48,
      text: 'Det finns registrerad träning eller medveten rörelse.',
      title: 'Rörelsen fungerar',
    })
  }

  return null
}

function buildGoalsRecommendation(goalsSummary) {
  if (!goalsSummary) return null

  if (goalsSummary.pendingHabits > 0) {
    return createRecommendation({
      action: goalsSummary.nextStep,
      area: 'goals',
      evidence: [goalsSummary.summary],
      priority: 82,
      text: 'Det finns aktiva vanor eller veckofokus som väntar.',
      title: 'Välj veckans minsta vana',
    })
  }

  return createRecommendation({
    action: goalsSummary.nextStep,
    area: 'goals',
    evidence: [goalsSummary.positiveProgress],
    priority: 44,
    text: 'Mål- och vanemotorn har redan ett tydligt fokus.',
    title: 'Följ valt fokus',
  })
}

function buildReminderRecommendation(reminderStatus) {
  if (!reminderStatus || reminderStatus.enabledCount === 0) return null

  if (reminderStatus.dueCount > 0) {
    return createRecommendation({
      action: 'Hantera väntande påminnelser: markera klar, snooza eller hoppa över utan skuld.',
      area: 'reminders',
      evidence: [`${reminderStatus.dueCount} väntar`],
      priority: 70,
      text: 'Det finns påminnelser som väntar just nu.',
      title: 'Städa dagens påminnelser',
    })
  }

  if (reminderStatus.pausedCount > 0) {
    return createRecommendation({
      action: 'Se över pausade påminnelser och återuppta bara de som fortfarande hjälper.',
      area: 'reminders',
      evidence: [`${reminderStatus.pausedCount} pausade`],
      priority: 50,
      text: 'Några påminnelser är pausade.',
      title: 'Se över reminder-rytmen',
    })
  }

  return null
}

function buildConfidence(coverage, recommendations) {
  const ratio = Number(coverage?.ratio) || 0
  const base = coverage?.level === 'good' ? 0.72 : coverage?.level === 'partial' ? 0.46 : 0.18
  const recommendationSignal = Math.min(0.18, recommendations.length * 0.06)
  const value = clamp(base + ratio * 0.18 + recommendationSignal, 0, 0.96)

  return {
    label: value >= 0.7 ? 'Starkt underlag' : value >= 0.4 ? 'Medelstarkt underlag' : 'Begränsat underlag',
    level: value >= 0.7 ? 'high' : value >= 0.4 ? 'medium' : 'low',
    value: Number(value.toFixed(2)),
  }
}

function buildCoverage(shared, nutritionReport) {
  const coverage = shared.coverage || {}
  const sharedBuckets = coverage.bucketCoverage || {}
  const nutritionCoverage = nutritionReport.dataCoverage || {}

  return {
    checkInDays: coverage.checkInDays || nutritionCoverage.checkInDays || 0,
    expectedDataPoints: coverage.expectedDataPoints || coverage.periodDays || 0,
    label: coverage.level === 'good' ? 'Bra datatäckning' : coverage.level === 'partial' ? 'Delvis datatäckning' : 'Begränsad datatäckning',
    level: coverage.level || nutritionCoverage.level || 'missing',
    mealDays: coverage.mealDays || nutritionCoverage.mealDays || 0,
    ratio: Number(coverage.ratio || 0),
    text: coverage.text || 'Mer data gör coachningen tryggare.',
    weightDays: coverage.weightDays || nutritionCoverage.weightDays || 0,
    buckets: {
      checkIns: sharedBuckets.checkIns || 0,
      meals: sharedBuckets.meals || 0,
      weights: sharedBuckets.weights || 0,
    },
  }
}

function pickTodayFocus(recommendations, shared) {
  const primary = recommendations[0]
  if (primary) return primary.action

  if (shared.highlights?.[0]?.text) {
    return 'Fortsätt med det som redan fungerar och gör en enkel check-in senare idag.'
  }

  return 'Börja med en liten registrering: vikt, måltid eller check-in.'
}

function pickWeeklyImprovement(recommendations, shared) {
  const improvement = recommendations.find((item) => ['nutrition', 'activity', 'goals'].includes(item.area))
  if (improvement) return improvement.text

  return shared.attentionItems?.[0]?.text || 'Veckans förbättring blir tydligare när mer data finns.'
}

function buildRiskAreas(shared, recommendations) {
  const risks = [
    shared.coverage?.level !== 'good'
      ? {
        evidence: shared.coverage?.text || 'Datatäckningen är begränsad.',
        level: shared.coverage?.level === 'missing' ? 'high' : 'medium',
        title: 'Datatäckning',
      }
      : null,
    ...recommendations
      .filter((item) => ['weight', 'nutrition', 'activity', 'reminders'].includes(item.area) && item.priority >= 70)
      .map((item) => ({
        evidence: item.text,
        level: item.priority >= 82 ? 'high' : 'medium',
        title: item.title,
      })),
  ].filter(Boolean)

  return uniqueByArea(risks.map((risk) => ({
    action: risk.evidence,
    area: risk.title,
    ...risk,
    text: risk.evidence,
  }))).map((risk) => ({
    evidence: risk.evidence,
    level: risk.level,
    title: risk.title,
  })).slice(0, 3)
}

export function buildAdaptiveCoach(input = {}, options = {}) {
  const analysisDate = options.analysisDate || input.analysisDate || input.today
  const period = options.period || '30d'
  const shared = buildSharedAnalytics(input, { analysisDate, period })
  const nutritionReport = buildAiNutritionCoachInsights(input, { analysisDate: shared.analysisDate })
  const goalsSummary = buildGoalsHabitsLiteSummary(input.goalsHabits)
  const reminderStatus = buildReminderStatus(input.reminderState || {}, { now: options.now || `${shared.analysisDate}T12:00:00.000Z` })
  const candidates = [
    buildNutritionRecommendation(shared, nutritionReport),
    buildGoalsRecommendation(goalsSummary),
    buildWeightRecommendation(shared),
    buildActivityRecommendation(shared),
    buildReminderRecommendation(reminderStatus),
  ]
  const recommendations = uniqueByArea(candidates)
    .filter((item) => !isUnsafeAdvice(item))
    .sort((first, second) => second.priority - first.priority)
    .slice(0, 3)
  const coverage = buildCoverage(shared, nutritionReport)
  const confidence = buildConfidence(coverage, recommendations)
  const positives = safeArray(shared.highlights)
    .filter((item) => item.tone === 'positive')
    .map((item) => ({
      source: item.source || 'sharedAnalytics',
      text: item.text,
      title: item.title,
    }))
    .slice(0, 3)

  return {
    analysisDate: shared.analysisDate,
    confidence,
    coverage,
    modelVersion: adaptiveCoachEngineVersion,
    recommendations,
    riskAreas: buildRiskAreas(shared, recommendations),
    safetyNote: 'Coachen ger allmänt stöd för vanor, kost och aktivitet. Den ställer inga diagnoser och ersätter inte vård.',
    signals: {
      activity: shared.activitySummary,
      goals: goalsSummary,
      nutrition: shared.nutritionSummary,
      reminders: reminderStatus,
      weight: shared.weightSummary,
    },
    sourceStatus: {
      analytics: 'sharedAnalyticsEngine',
      goals: goalsSummary ? 'goalsHabitsSummary' : 'missing',
      nutrition: 'aiNutritionInsights',
      reminders: 'reminderEngineV2',
      weight: 'sharedAnalyticsEngine',
    },
    summary: {
      todayFocus: pickTodayFocus(recommendations, shared),
      weeklyImprovement: pickWeeklyImprovement(recommendations, shared),
      workingWell: positives.length ? positives : [{
        source: 'adaptiveCoachEngine',
        text: 'Coachen väntar på mer historik innan den lyfter ett tydligt framsteg.',
        title: 'Mer underlag behövs',
      }],
    },
  }
}

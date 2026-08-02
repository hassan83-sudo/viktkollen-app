import { normalizeCheckInMetrics } from './checkInNormalization.js'
import { getUnifiedWeightFacts, normalizeDailyWeightEntries } from './healthCalculations.js'
import { formatSteps } from './healthFormatting.js'
import { addLocalDays, getEntryLocalDate, getLocalDateString, getLocalDateRange } from './localDate.js'
import { calculateDailyNutritionSummary } from './nutrition/dailyNutritionSummary.js'
import { filterActualMealsForDate, getMealLocalDate, isPlannedMealRecord } from './nutrition/mealDateUtils.js'
import { normalizeNutritionGoals, parseProteinGoal } from './nutrition/nutritionGoals.js'

export const aiNutritionInsightModelVersion = 2
export const maxPersonalInsightCount = 6
export const maxActionPlanItems = 3

const insightPriorityScore = { high: 3, medium: 2, low: 1 }
const confidenceScore = { high: 3, medium: 2, low: 1 }

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits

  return Math.round((value + Number.EPSILON) * factor) / factor
}

function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return 'saknas'

  return value.toLocaleString('sv-SE', {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(value) ? 0 : Math.min(1, digits),
  })
}

function formatNaturalWeightDirection(change) {
  if (!Number.isFinite(change)) return 'saknas'
  if (change < -0.1) return `${formatNumber(Math.abs(change), 1)} kg ned`
  if (change > 0.1) return `${formatNumber(change, 1)} kg upp`
  return 'oförändrat'
}

function getDateRangeDates(days, analysisDate) {
  const range = getLocalDateRange(days, analysisDate)

  return Array.from({ length: range.days || 0 }, (_, index) =>
    getLocalDateString(addLocalDays(range.start, index)))
}

function getCheckInDate(checkIn) {
  return getEntryLocalDate(checkIn)
}

function makeInsight({
  action,
  category,
  confidence = 'medium',
  dataCompleteness = 'partial',
  dismissible = true,
  evidence = [],
  explanation,
  generatedAt,
  period,
  priority = 'medium',
  safetyCategory = 'standard',
  source = 'deterministic',
  status = 'active',
  summary,
  title,
  type,
}) {
  const stableEvidence = safeArray(evidence)
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4)

  return {
    action: String(action || '').trim(),
    category,
    confidence,
    dataCompleteness,
    dismissible,
    evidence: stableEvidence,
    explanation: String(explanation || summary || '').trim(),
    generatedAt,
    id: `insight-v${aiNutritionInsightModelVersion}:${category}:${type}:${period?.start || 'all'}:${period?.end || 'all'}`,
    period,
    priority,
    safetyCategory,
    source,
    status,
    summary: String(summary || '').trim(),
    title: String(title || '').trim(),
    type,
  }
}

export function dedupePersonalInsights(insights = []) {
  const byKey = new Map()

  safeArray(insights).forEach((insight) => {
    if (!isObject(insight) || !insight.id) return
    const key = `${insight.category}:${insight.type}`
    const existing = byKey.get(key)

    if (
      !existing ||
      insightPriorityScore[insight.priority] > insightPriorityScore[existing.priority] ||
      (
        insightPriorityScore[insight.priority] === insightPriorityScore[existing.priority] &&
        confidenceScore[insight.confidence] > confidenceScore[existing.confidence]
      )
    ) {
      byKey.set(key, insight)
    }
  })

  return [...byKey.values()]
}

export function prioritizePersonalInsights(insights = [], options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : maxPersonalInsightCount
  const deduped = dedupePersonalInsights(insights)
  const positive = deduped
    .filter((insight) => insight.type === 'positive')
    .sort(compareInsightPriority)
  const rest = deduped
    .filter((insight) => insight.type !== 'positive')
    .sort(compareInsightPriority)
  const ordered = positive.length ? [positive[0], ...rest, ...positive.slice(1)] : rest

  return ordered.slice(0, limit)
}

function compareInsightPriority(first, second) {
  return (
    (insightPriorityScore[second.priority] || 0) - (insightPriorityScore[first.priority] || 0) ||
    (confidenceScore[second.confidence] || 0) - (confidenceScore[first.confidence] || 0) ||
    first.category.localeCompare(second.category, 'sv-SE') ||
    first.id.localeCompare(second.id, 'sv-SE')
  )
}

function buildWeightInsights({ analysisDate, generatedAt, period, profile, weights }) {
  const facts = getUnifiedWeightFacts({
    goalWeight: profile?.goalWeight,
    profile,
    weights,
  })
  const dailyWeights = normalizeDailyWeightEntries(weights, { today: analysisDate })

  if (dailyWeights.length < 2) {
    return [makeInsight({
      action: 'Registrera vikt några gånger till, gärna samma tid på dagen.',
      category: 'datakvalitet',
      confidence: 'high',
      dataCompleteness: dailyWeights.length ? 'limited' : 'missing',
      evidence: [`${dailyWeights.length} viktvärde i perioden.`],
      explanation: 'Vikttrend behöver minst två mätningar för att inte bli missvisande.',
      generatedAt,
      period,
      priority: 'medium',
      safetyCategory: 'data_quality',
      summary: 'Det finns för lite viktdata för en trygg trendanalys.',
      title: 'Mer viktdata behövs',
      type: 'data_quality',
    })]
  }

  const change = facts.weightChange
  const goalRemaining = facts.goalRemaining
  const recent = dailyWeights.slice(-4)
  const recentChange = recent.length >= 2 ? round(recent.at(-1).value - recent[0].value) : null
  const insights = []

  if (Number.isFinite(change)) {
    const directionText = change < -0.1
      ? `${formatNaturalWeightDirection(change)} sedan start`
      : change > 0.1
        ? `${formatNaturalWeightDirection(change)} sedan start`
        : 'oförändrat sedan start'

    insights.push(makeInsight({
      action: goalRemaining !== null
        ? 'Fortsätt följa veckotrenden och jämför med målet i små steg.'
        : 'Följ förändringen vecka för vecka istället för enskilda dagar.',
      category: 'vikttrend',
      confidence: dailyWeights.length >= 4 ? 'high' : 'medium',
      dataCompleteness: dailyWeights.length >= 4 ? 'good' : 'partial',
      evidence: [
        `Start: ${formatNumber(facts.startWeight, 1)} kg.`,
        `Nu: ${formatNumber(facts.latestWeight, 1)} kg.`,
        goalRemaining !== null ? `Kvar till mål: ${formatNumber(goalRemaining, 1)} kg.` : '',
      ],
      explanation: 'Beräkningen använder den centrala viktkällan och senaste representativa dagsvikt.',
      generatedAt,
      period,
      priority: Math.abs(change) >= 1 ? 'high' : 'medium',
      summary: `Din vikttrend visar ${directionText}.`,
      title: change < -0.1 ? 'Vikten rör sig mot målet' : change > 0.1 ? 'Vikten har ökat sedan start' : 'Vikten är stabil',
      type: change < -0.1 ? 'positive' : 'trend',
    }))
  }

  if (recentChange !== null && Math.abs(recentChange) <= 0.2 && dailyWeights.length >= 4) {
    insights.push(makeInsight({
      action: 'Välj en liten justering i taget, till exempel protein i frukost eller en extra promenad.',
      category: 'vikttrend',
      confidence: 'medium',
      dataCompleteness: 'good',
      evidence: [`Senaste ${recent.length} viktvärdena skiljer ungefär ${formatNumber(Math.abs(recentChange), 1)} kg.`],
      explanation: 'En platå kan vara normal variation, särskilt över kortare perioder.',
      generatedAt,
      period,
      priority: 'low',
      summary: 'De senaste viktvärdena ser ganska stabila ut.',
      title: 'Möjlig platå eller stabilisering',
      type: 'plateau',
    }))
  }

  return insights
}

function buildNutritionDays({ analysisDate, meals, nutritionGoals }) {
  const dates = getDateRangeDates(7, analysisDate)
  const goals = normalizeNutritionGoals(nutritionGoals)
  const proteinGoal = parseProteinGoal(goals.protein)
  const caloriesGoal = Number.isFinite(goals.calories) ? goals.calories : null

  return dates.map((date) => {
    const dayMeals = filterActualMealsForDate(meals, date)
    const summary = calculateDailyNutritionSummary(dayMeals, date, {
      nutritionGoals: goals,
    })

    return {
      caloriesGoal,
      date,
      hasData: summary.mealCount > 0,
      mealCount: summary.mealCount,
      proteinGoal,
      summary,
      totals: summary.totals,
    }
  })
}

function buildNutritionInsights({ analysisDate, generatedAt, meals, nutritionGoals, period }) {
  const actualMeals = safeArray(meals).filter((meal) => isObject(meal) && !isPlannedMealRecord(meal))
  const days = buildNutritionDays({ analysisDate, meals: actualMeals, nutritionGoals })
  const registeredDays = days.filter((day) => day.hasData)
  const insights = []

  if (registeredDays.length < 2) {
    insights.push(makeInsight({
      action: 'Logga två till tre vanliga dagar så kan coachen hitta tydligare mönster.',
      category: 'datakvalitet',
      confidence: 'high',
      dataCompleteness: registeredDays.length ? 'limited' : 'missing',
      evidence: [`${registeredDays.length} kostdagar registrerade senaste 7 dagarna.`],
      explanation: 'Måltidsmönster behöver flera dagar för att inte bli slumpmässigt.',
      generatedAt,
      period,
      priority: 'high',
      safetyCategory: 'data_quality',
      summary: 'Det finns för lite kostdata för en djup analys.',
      title: 'Mer kostdata ger bättre råd',
      type: 'data_quality',
    }))
    return insights
  }

  const avgProtein = registeredDays.reduce((sum, day) => sum + day.totals.protein, 0) / registeredDays.length
  const proteinGoal = registeredDays.find((day) => day.proteinGoal)?.proteinGoal
  const proteinTarget = proteinGoal?.target
  const avgMeals = registeredDays.reduce((sum, day) => sum + day.mealCount, 0) / registeredDays.length
  const avgCalories = registeredDays.reduce((sum, day) => sum + day.totals.calories, 0) / registeredDays.length
  const caloriesGoal = registeredDays.find((day) => Number.isFinite(day.caloriesGoal))?.caloriesGoal

  if (Number.isFinite(proteinTarget)) {
    const ratio = avgProtein / proteinTarget
    insights.push(makeInsight({
      action: ratio >= 1
        ? 'Behåll proteinankaret i en eller två måltider per dag.'
        : 'Lägg till en enkel proteinkälla i nästa måltid, till exempel ägg, kyckling, kvarg eller tofu.',
      category: 'protein',
      confidence: registeredDays.length >= 4 ? 'high' : 'medium',
      dataCompleteness: registeredDays.length >= 4 ? 'good' : 'partial',
      evidence: [
        `Snitt: cirka ${formatNumber(avgProtein)} g protein per registrerad dag.`,
        `Mål: cirka ${formatNumber(proteinTarget)} g per dag.`,
      ],
      explanation: 'Protein jämförs bara mot registrerade dagar och befintligt proteinmål.',
      generatedAt,
      period,
      priority: ratio >= 1 ? 'medium' : 'high',
      summary: ratio >= 1
        ? 'Du når ungefär ditt proteinmål på registrerade dagar.'
        : 'Proteinintaget ligger under ditt mål på registrerade dagar.',
      title: ratio >= 1 ? 'Proteinmålet ser starkt ut' : 'Protein är bästa nästa fokus',
      type: ratio >= 1 ? 'positive' : 'improvement',
    }))
  }

  if (Number.isFinite(caloriesGoal) && avgCalories > caloriesGoal * 1.25) {
    insights.push(makeInsight({
      action: 'Kontrollera portionsstorlekar och välj gärna protein och grönsaker i nästa måltid.',
      category: 'energiintag',
      confidence: 'medium',
      dataCompleteness: 'partial',
      evidence: [`Snitt: cirka ${formatNumber(avgCalories)} kcal per registrerad dag.`, `Mål: cirka ${formatNumber(caloriesGoal)} kcal.`],
      explanation: 'Det här är en neutral signal från registrerade måltider, inte ett omdöme.',
      generatedAt,
      period,
      priority: 'medium',
      safetyCategory: 'caution',
      summary: 'Registrerade dagar ligger tydligt över kalorimålet.',
      title: 'Energiintaget kan justeras varsamt',
      type: 'improvement',
    }))
  }

  if (avgMeals >= 3) {
    insights.push(makeInsight({
      action: 'Fortsätt med en rytm som gör det lättare att få in protein och grönsaker.',
      category: 'måltidsmönster',
      confidence: 'medium',
      dataCompleteness: 'partial',
      evidence: [`Snitt: ${formatNumber(avgMeals, 1)} måltider per registrerad dag.`],
      explanation: 'Regelbunden loggning gör det enklare att se vad som faktiskt fungerar.',
      generatedAt,
      period,
      priority: 'medium',
      summary: 'Du har ett ganska regelbundet måltidsmönster på registrerade dagar.',
      title: 'Måltidsrytmen ger bra underlag',
      type: 'positive',
    }))
  }

  return insights
}

function buildActivityInsights({ analysisDate, checkIns, generatedAt, period }) {
  const range = getLocalDateRange(7, analysisDate)
  const entries = safeArray(checkIns)
    .filter(isObject)
    .filter((entry) => {
      const date = getCheckInDate(entry)
      return date && date >= range.start && date <= range.end
    })
    .map((entry) => ({ ...normalizeCheckInMetrics(entry), date: getCheckInDate(entry) }))
  const withSteps = entries.filter((entry) => Number.isFinite(entry.stepMetrics.value))
  const withEnergy = entries.filter((entry) => Number.isFinite(entry.energy.value))
  const workoutDays = entries.filter((entry) => entry.workout.completed).length
  const insights = []

  if (withSteps.length >= 2) {
    const avgSteps = Math.round(withSteps.reduce((sum, entry) => sum + entry.stepMetrics.value, 0) / withSteps.length)
    insights.push(makeInsight({
      action: avgSteps >= 7000
        ? 'Behåll promenaderna som bas och lägg till återhämtning när energin är lägre.'
        : 'Testa en kort promenad på 10 minuter efter en måltid två dagar den här veckan.',
      category: 'steg',
      confidence: withSteps.length >= 4 ? 'high' : 'medium',
      dataCompleteness: withSteps.length >= 4 ? 'good' : 'partial',
      evidence: [`Snitt: ${formatSteps(avgSteps)} på ${withSteps.length} registrerade dagar.`],
      explanation: 'Stegdata används som aktivitetsindikator, inte som krav.',
      generatedAt,
      period,
      priority: avgSteps >= 7000 ? 'medium' : 'low',
      summary: avgSteps >= 7000 ? 'Stegnivån är stabilt aktiv.' : 'Det finns utrymme för lite mer vardagsrörelse.',
      title: avgSteps >= 7000 ? 'Bra vardagsaktivitet' : 'Små promenader kan hjälpa rytmen',
      type: avgSteps >= 7000 ? 'positive' : 'improvement',
    }))
  }

  if (workoutDays > 0) {
    insights.push(makeInsight({
      action: 'Planera nästa pass och en vilodag så rytmen blir hållbar.',
      category: 'träning',
      confidence: 'medium',
      dataCompleteness: 'partial',
      evidence: [`${workoutDays} träningsdagar registrerade senaste 7 dagarna.`],
      explanation: 'Träning räknas från normaliserad check-in-data.',
      generatedAt,
      period,
      priority: 'low',
      summary: 'Du har registrerat träning den senaste veckan.',
      title: 'Träningen finns med i veckan',
      type: 'positive',
    }))
  }

  if (withEnergy.length >= 2) {
    const lowEnergyDays = withEnergy.filter((entry) => entry.energy.level === 'low').length
    if (lowEnergyDays >= 2) {
      insights.push(makeInsight({
        action: 'Håll nästa steg litet: regelbunden måltid, vatten och en lugn promenad om det passar.',
        category: 'energi',
        confidence: 'medium',
        dataCompleteness: 'partial',
        evidence: [`${lowEnergyDays} dagar med låg energi i check-in.`],
        explanation: 'Energi tolkas försiktigt och används inte som medicinsk slutsats.',
        generatedAt,
        period,
        priority: 'medium',
        safetyCategory: 'supportive',
        summary: 'Energin har varit lägre flera dagar.',
        title: 'Återhämtning kan få mer plats',
        type: 'support',
      }))
    }
  }

  if (!insights.length) {
    insights.push(makeInsight({
      action: 'Gör en check-in med steg, energi och eventuell träning för att få mer personlig analys.',
      category: 'datakvalitet',
      confidence: 'high',
      dataCompleteness: 'missing',
      evidence: ['För lite aktivitets- eller check-in-data senaste 7 dagarna.'],
      explanation: 'Utan check-ins kan coachen inte se aktivitets- och återhämtningsmönster.',
      generatedAt,
      period,
      priority: 'low',
      safetyCategory: 'data_quality',
      summary: 'Aktivitetsunderlaget är begränsat.',
      title: 'Check-ins skulle förbättra analysen',
      type: 'data_quality',
    }))
  }

  return insights
}

export function buildPersonalInsightActionPlan(insights = []) {
  return prioritizePersonalInsights(insights, { limit: 8 })
    .filter((insight) => insight.action && insight.type !== 'data_quality')
    .slice(0, maxActionPlanItems)
    .map((insight, index) => ({
      id: `action-v${aiNutritionInsightModelVersion}:${insight.id}`,
      insightId: insight.id,
      nextStep: insight.action,
      status: 'suggested',
      timeframe: index === 0 ? 'Idag' : 'Den här veckan',
      title: insight.title,
      why: insight.summary,
    }))
}

export function buildAiNutritionCoachInsights(input = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || input.analysisDate || new Date())
  const generatedAt = options.generatedAt || `${analysisDate}T12:00:00.000Z`
  const period = {
    days: 7,
    end: analysisDate,
    start: getLocalDateRange(7, analysisDate).start,
  }
  const profile = isObject(input.profile) ? input.profile : {}
  const meals = safeArray(input.meals)
  const checkIns = safeArray(input.checkIns?.length ? input.checkIns : input.checkIn ? [input.checkIn] : [])
  const weights = safeArray(input.weights)
  const nutritionGoals = normalizeNutritionGoals(input.nutritionGoals)
  const rawInsights = [
    ...buildWeightInsights({ analysisDate, generatedAt, period, profile, weights }),
    ...buildNutritionInsights({ analysisDate, generatedAt, meals, nutritionGoals, period }),
    ...buildActivityInsights({ analysisDate, checkIns, generatedAt, period }),
  ]
  const insights = prioritizePersonalInsights(applySafetyRules(rawInsights))
  const coverage = buildDataCoverage({ checkIns, meals, weights, period })
  const overview = buildInsightOverview(insights, coverage, analysisDate)

  return {
    actionPlan: buildPersonalInsightActionPlan(insights),
    analysisDate,
    dataCoverage: coverage,
    generatedAt,
    insights,
    modelVersion: aiNutritionInsightModelVersion,
    overview,
  }
}

function applySafetyRules(insights) {
  return safeArray(insights).map((insight) => {
    const unsafeText = `${insight.title} ${insight.summary} ${insight.action}`
    const needsSoftening = /hoppa över|svält|extrem|diagnos|måste träna|förbjud/i.test(unsafeText)

    return {
      ...insight,
      action: needsSoftening
        ? 'Välj ett litet, hållbart steg och kontrollera registreringen om värdena verkar orimliga.'
        : insight.action,
      safetyCategory: needsSoftening ? 'softened' : insight.safetyCategory,
    }
  })
}

function buildDataCoverage({ checkIns, meals, period, weights }) {
  const mealDays = new Set(safeArray(meals)
    .filter((meal) => isObject(meal) && !isPlannedMealRecord(meal))
    .map(getMealLocalDate)
    .filter((date) => date >= period.start && date <= period.end))
  const checkInDays = new Set(safeArray(checkIns)
    .filter(isObject)
    .map(getCheckInDate)
    .filter((date) => date >= period.start && date <= period.end))
  const weightDays = new Set(normalizeDailyWeightEntries(weights, { today: period.end })
    .map((entry) => entry.date)
    .filter((date) => date >= period.start && date <= period.end))

  return {
    checkInDays: checkInDays.size,
    level: mealDays.size >= 4 && weightDays.size >= 2 ? 'good' : mealDays.size || weightDays.size || checkInDays.size ? 'partial' : 'missing',
    mealDays: mealDays.size,
    periodDays: period.days,
    weightDays: weightDays.size,
  }
}

function buildInsightOverview(insights, coverage, analysisDate) {
  const positive = insights.find((insight) => insight.type === 'positive')
  const improvement = insights.find((insight) => ['improvement', 'support', 'trend'].includes(insight.type))
  const next = insights.find((insight) => insight.action)

  return {
    analysisDate,
    dataCompleteness: coverage.level,
    keyImprovement: improvement?.summary || 'När mer data finns kan coachen lyfta ett tydligare förbättringsområde.',
    keyProgress: positive?.summary || 'Coachen väntar på mer registrerad data innan den lyfter fram ett framsteg.',
    nextStep: next?.action || 'Registrera en vanlig dag med mat, vikt eller check-in.',
    summary: insights.length
      ? `Jag hittade ${insights.length} personliga insikter från din senaste data.`
      : 'Det finns ännu för lite data för personliga insikter.',
  }
}

export function buildMinimalInsightAiPayload(report = {}) {
  return {
    actionPlan: safeArray(report.actionPlan).map((item) => ({
      insightId: item.insightId,
      nextStep: item.nextStep,
      timeframe: item.timeframe,
      title: item.title,
    })),
    analysisDate: report.analysisDate,
    dataCoverage: report.dataCoverage,
    insights: safeArray(report.insights).map((insight) => ({
      action: insight.action,
      category: insight.category,
      confidence: insight.confidence,
      evidence: insight.evidence,
      id: insight.id,
      safetyCategory: insight.safetyCategory,
      summary: insight.summary,
      title: insight.title,
      type: insight.type,
    })),
    modelVersion: report.modelVersion,
  }
}

export function validateAiInsightRefinement(refinement = {}, report = {}) {
  if (!isObject(refinement)) return null

  const text = [refinement.summary, refinement.nextStep].filter(Boolean).join(' ')
  const evidenceText = JSON.stringify(buildMinimalInsightAiPayload(report))
  const numberPattern = /\d+(?:[,.]\d+)?/g
  const reportNumbers = new Set((evidenceText.match(numberPattern) || []).map((value) => value.replace(',', '.')))
  const hallucinatedNumber = (text.match(numberPattern) || [])
    .map((value) => value.replace(',', '.'))
    .some((value) => !reportNumbers.has(value))

  if (hallucinatedNumber || /diagnos|medicinering|hoppa över måltider/i.test(text)) {
    return null
  }

  return {
    nextStep: String(refinement.nextStep || report.overview?.nextStep || '').slice(0, 240),
    summary: String(refinement.summary || report.overview?.summary || '').slice(0, 320),
  }
}

export function buildWeeklyPersonalInsightSummary(input = {}, options = {}) {
  const report = buildAiNutritionCoachInsights(input, options)

  return {
    dataCoverage: report.dataCoverage,
    focus: report.overview.nextStep,
    pattern: report.overview.keyImprovement,
    period: report.insights[0]?.period || null,
    progress: report.overview.keyProgress,
    source: 'aiNutritionInsights',
  }
}

export function buildMonthlyPersonalInsightSummary(input = {}, options = {}) {
  const report = buildAiNutritionCoachInsights(input, options)
  const categories = [...new Set(report.insights.map((insight) => insight.category))]

  return {
    categories,
    dataCoverage: report.dataCoverage,
    focus: report.actionPlan.map((item) => item.nextStep).slice(0, 3),
    highlights: report.insights
      .filter((insight) => insight.type === 'positive')
      .map((insight) => insight.summary)
      .slice(0, 3),
    period: report.insights[0]?.period || null,
    source: 'aiNutritionInsights',
  }
}

import { formatKg } from './healthCalculations.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import { formatProgressChange, getProgressPeriodRange, buildProgressDashboardAnalytics } from './progress/progressAnalytics.js'
import { buildGoalsHabitsLiteSummary } from './goalsHabitsSummary.js'
import { buildAiNutritionCoachInsights } from './aiNutritionInsights.js'
import { addLocalDays, getLocalDateString } from './localDate.js'

export const healthDashboardV2ModelVersion = 1
export const healthDashboardPeriods = [
  { days: 7, id: '7d', label: '7 dagar' },
  { days: 30, id: '30d', label: '30 dagar' },
  { days: 90, id: '90d', label: '3 månader' },
  { days: 180, id: '180d', label: '6 månader' },
  { days: 365, id: '365d', label: '12 månader' },
  { days: null, id: 'all', label: 'Hela perioden' },
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function getPeriod(period = '30d') {
  return healthDashboardPeriods.find((entry) => entry.id === period) || healthDashboardPeriods[1]
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'Saknas'
  return `${Math.round(value).toLocaleString('sv-SE')}%`
}

function formatNumber(value, unit = '') {
  if (!Number.isFinite(value)) return 'Saknas'
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`
}

function buildCoverage({ analysis, insightReport, snapshot }) {
  const periodDays = analysis.period.days || Math.max(1, safeArray(analysis.weight.weights).length)
  const mealDays = analysis.nutrition.loggedDayCount
  const weightDays = analysis.weight.registrationCount
  const checkInDays = analysis.habits.checkInCount
  const available = [mealDays > 0, weightDays > 0, checkInDays > 0].filter(Boolean).length

  return {
    checkInDays,
    level: available >= 3 ? 'good' : available > 0 ? 'partial' : 'missing',
    mealDays,
    periodDays,
    text: available >= 3
      ? 'Bra datatäckning för vald period.'
      : available > 0
        ? 'Delvis datatäckning. Fler registreringar gör trenderna tryggare.'
        : 'Börja med vikt, måltid eller check-in för att fylla dashboarden.',
    weightDays,
    insightLevel: insightReport.dataCoverage?.level || snapshot.availability?.level || '',
  }
}

function buildWeightSummary(analysis, snapshot) {
  const weight = analysis.weight
  return {
    changeLabel: formatProgressChange(weight.totalChangeKg),
    currentWeight: weight.currentWeight,
    currentWeightLabel: weight.currentWeight === null ? 'Saknas' : formatKg(weight.currentWeight),
    dataText: weight.registrationCount >= 2 ? `${weight.registrationCount} dagsvärden i perioden.` : 'För få mätningar för en trygg periodtrend.',
    goalRemaining: weight.goalRemaining,
    goalRemainingLabel: weight.goalRemaining === null ? 'Målvikt saknas' : `${formatKg(Math.abs(weight.goalRemaining))} kvar`,
    goalWeight: weight.goalWeight,
    goalWeightLabel: weight.goalWeight === null ? 'Saknas' : formatKg(weight.goalWeight),
    periodChange: weight.periodChangeKg,
    periodChangeLabel: formatProgressChange(weight.periodChangeKg),
    plateau: weight.registrationCount >= 4 && Math.abs(weight.periodChangeKg || 0) <= 0.2,
    startWeight: weight.startWeight,
    startWeightLabel: weight.startWeight === null ? 'Saknas' : formatKg(weight.startWeight),
    trend: weight.trendDirection,
    weeklyAverageChange: weight.weeklyAverageChange,
    weeklyAverageLabel: weight.weeklyAverageChange === null ? 'Saknas' : formatProgressChange(weight.weeklyAverageChange),
    textAlternative: `Start ${weight.startWeight ?? 'saknas'} kg, nu ${weight.currentWeight ?? 'saknas'} kg, period ${formatProgressChange(weight.periodChangeKg)}.`,
    sourceStatus: snapshot.weight?.facts ? 'central_weight_facts' : 'progress_analytics',
  }
}

function buildNutritionSummary(analysis, coverage) {
  const nutrition = analysis.nutrition
  const missingDays = analysis.period.days ? Math.max(0, analysis.period.days - nutrition.loggedDayCount) : 0
  return {
    averageCalories: nutrition.averageCalories,
    averageCaloriesLabel: formatNumber(nutrition.averageCalories, 'kcal'),
    averageProtein: nutrition.averageProtein,
    averageProteinLabel: formatNumber(nutrition.averageProtein, 'g'),
    loggedDays: nutrition.loggedDayCount,
    mealCount: nutrition.mealCount,
    missingDays,
    proteinGoalPercent: nutrition.proteinGoalPercent,
    proteinGoalText: nutrition.goalComparison.proteinGoal
      ? `${formatPercent(nutrition.proteinGoalPercent)} av loggade dagar når proteinmålet.`
      : 'Proteinmål saknas.',
    regularityText: nutrition.loggedDayCount >= 4
      ? 'Måltidsloggen ger ett användbart mönster.'
      : nutrition.loggedDayCount > 0
        ? 'Måltidsdata finns, men fler dagar gör mönstret tydligare.'
        : 'Inga faktiska måltider i vald period.',
    sourceStatus: 'progress_analytics_actual_meals',
    textAlternative: `${nutrition.loggedDayCount} loggade dagar, ${nutrition.mealCount} faktiska måltider, cirka ${nutrition.averageProtein} g protein per loggad dag.`,
    coverage,
  }
}

function buildActivitySummary(analysis) {
  const habits = analysis.habits
  return {
    activeDays: habits.entries.filter((entry) => Number.isFinite(entry.steps) || entry.workout).length,
    averageEnergy: habits.averageEnergy,
    averageEnergyLabel: habits.averageEnergyLabel,
    averageMood: habits.averageMood || 'Saknas',
    averageSteps: habits.averageSteps,
    averageStepsLabel: habits.averageSteps === null ? 'Saknas' : habits.averageSteps.toLocaleString('sv-SE'),
    checkInCount: habits.checkInCount,
    comparisonText: analysis.comparison.hasComparison
      ? `${analysis.comparison.trainingDaysDelta} träningsdagar och ${analysis.comparison.checkInDelta} check-ins jämfört med föregående period.`
      : 'Jämförelse visas när föregående period har tillräcklig data.',
    trainingDays: habits.trainingDays,
    trainingForm: habits.trainingForm || 'Saknas',
    textAlternative: `${habits.checkInCount} check-ins, ${habits.trainingDays} träningsdagar, snittsteg ${habits.averageSteps ?? 'saknas'}.`,
  }
}

function buildInsightSummary(insightReport) {
  const insights = safeArray(insightReport.insights)
  const used = new Set()
  const pick = (predicate) => {
    const insight = insights.find((item) => !used.has(item.id) && predicate(item))
    if (insight) used.add(insight.id)
    return insight || null
  }
  const positive = pick((item) => item.type === 'positive')
  const improvement = pick((item) => ['improvement', 'support', 'trend', 'data_quality'].includes(item.type))
  const next = safeArray(insightReport.actionPlan)[0]

  return {
    coverage: insightReport.dataCoverage,
    improvement: improvement?.summary || 'Mer data gör förbättringsmöjligheten tydligare.',
    nextStep: next?.nextStep || insightReport.overview?.nextStep || 'Registrera vikt, måltid eller check-in.',
    positive: positive?.summary || 'Coachen väntar på mer data innan den lyfter ett framsteg.',
    sourceStatus: 'deterministic_ai_nutrition_insights',
  }
}

function uniqueByText(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.title}:${item.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildHighlights({ activity, goals, insightSummary, nutrition, weight }) {
  return uniqueByText([
    weight.periodChange !== null && weight.periodChange < -0.1
      ? { tone: 'positive', title: 'Vikttrend', text: 'Vikten rör sig nedåt i vald period.' }
      : null,
    nutrition.proteinGoalPercent >= 70
      ? { tone: 'positive', title: 'Protein', text: 'Proteinmålet nås ofta på loggade dagar.' }
      : null,
    activity.trainingDays > 0
      ? { tone: 'positive', title: 'Aktivitet', text: `${activity.trainingDays} träningsdagar finns registrerade.` }
      : null,
    goals?.activeFocus?.length
      ? { tone: 'positive', title: 'Veckofokus', text: goals.activeFocus[0] }
      : null,
    insightSummary.positive
      ? { tone: 'positive', title: 'Personlig insikt', text: insightSummary.positive }
      : null,
  ].filter(Boolean)).slice(0, 4)
}

function buildAttentionItems({ activity, coverage, goals, nutrition, weight }) {
  return uniqueByText([
    weight.periodChange === null
      ? { title: 'Viktdata', text: 'Fler viktmätningar behövs för periodtrend.', action: 'Logga nästa vikt när det passar.' }
      : null,
    nutrition.loggedDays < 2
      ? { title: 'Måltidsdata', text: 'Saknad data betyder inte dåligt resultat.', action: 'Logga två vanliga dagar för tydligare mönster.' }
      : null,
    activity.checkInCount < 2
      ? { title: 'Check-in', text: 'För få check-ins för en rättvis aktivitetsjämförelse.', action: 'Gör en kort check-in idag.' }
      : null,
    goals && goals.pendingHabits > 0
      ? { title: 'Vanor', text: 'Det finns vanor som väntar idag.', action: goals.nextStep || 'Välj en liten vana.' }
      : null,
    coverage.level === 'missing'
      ? { title: 'Datatäckning', text: 'Dashboarden behöver mer underlag.', action: 'Börja med en registrering.' }
      : null,
  ].filter(Boolean)).slice(0, 4)
}

function buildNextActions({ attentionItems, goals, insightSummary }) {
  return uniqueByText([
    goals?.nextStep ? { title: 'Mål & vanor', text: goals.nextStep, href: '#mal-vanor' } : null,
    insightSummary.nextStep ? { title: 'Insikt', text: insightSummary.nextStep, href: '#ai-insights' } : null,
    attentionItems[0] ? { title: attentionItems[0].title, text: attentionItems[0].action, href: '#checkin' } : null,
  ].filter(Boolean)).slice(0, 3)
}

function buildComparisons(analysis) {
  const comparison = analysis.comparison
  if (!comparison.hasComparison) {
    return {
      hasComparison: false,
      text: 'Föregående jämförbar period saknar tillräcklig data.',
    }
  }

  return {
    hasComparison: true,
    mealCountDelta: comparison.mealCountDelta,
    proteinGoalPercentDelta: comparison.proteinGoalPercentDelta,
    text: `${comparison.mealCountDelta} måltider, ${comparison.trainingDaysDelta} träningsdagar och ${comparison.checkInDelta} check-ins jämfört med föregående period.`,
    trainingDaysDelta: comparison.trainingDaysDelta,
    weightChangeDelta: comparison.weightChangeDelta,
  }
}

export function buildHealthDashboardV2Model(data = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || data.today || new Date())
  const selectedPeriod = getPeriod(options.period || data.period || '30d')
  const range = selectedPeriod.id === 'all'
    ? getProgressPeriodRange('all', analysisDate)
    : {
      ...getProgressPeriodRange('30d', analysisDate),
      days: selectedPeriod.days,
      end: analysisDate,
      id: selectedPeriod.id,
      label: selectedPeriod.label,
      previousEnd: selectedPeriod.days ? getLocalDateString(addLocalDays(getLocalDateString(addLocalDays(analysisDate, -selectedPeriod.days + 1)), -1)) : '',
      previousStart: selectedPeriod.days ? getLocalDateString(addLocalDays(analysisDate, -(selectedPeriod.days * 2) + 1)) : '',
      start: selectedPeriod.days ? getLocalDateString(addLocalDays(analysisDate, -selectedPeriod.days + 1)) : '',
    }
  const snapshot = data.healthSnapshot || buildHealthSnapshot({ ...data, today: analysisDate })
  const analysis = buildProgressDashboardAnalytics({
    ...data,
    healthSnapshot: snapshot,
    today: analysisDate,
  }, { period: selectedPeriod.id === '180d' || selectedPeriod.id === '365d' ? 'all' : selectedPeriod.id, today: analysisDate })
  const insightReport = buildAiNutritionCoachInsights(data, { analysisDate })
  const coverage = buildCoverage({ analysis, insightReport, snapshot })
  const weightSummary = buildWeightSummary(analysis, snapshot)
  const nutritionSummary = buildNutritionSummary(analysis, coverage)
  const activitySummary = buildActivitySummary(analysis)
  const goalsSummary = buildGoalsHabitsLiteSummary(data.goalsHabits)
  const insightSummary = buildInsightSummary(insightReport)
  const highlights = buildHighlights({ activity: activitySummary, goals: goalsSummary, insightSummary, nutrition: nutritionSummary, weight: weightSummary })
  const attentionItems = buildAttentionItems({ activity: activitySummary, coverage, goals: goalsSummary, nutrition: nutritionSummary, weight: weightSummary })
  const nextActions = buildNextActions({ attentionItems, goals: goalsSummary, insightSummary })
  const comparisons = buildComparisons(analysis)

  return {
    activitySummary,
    analysisDate,
    attentionItems,
    checkInSummary: {
      energyLabel: activitySummary.averageEnergyLabel,
      mood: activitySummary.averageMood,
      text: activitySummary.textAlternative,
    },
    comparisons,
    dataCoverage: coverage,
    display: {
      title: 'Health Dashboard',
      subtitle: `${selectedPeriod.label} till ${analysisDate}`,
    },
    goalsSummary,
    habitsSummary: goalsSummary,
    insightsSummary: insightSummary,
    modelVersion: healthDashboardV2ModelVersion,
    nextActions,
    nutritionSummary,
    period: range,
    periods: healthDashboardPeriods,
    progressHighlights: highlights,
    selectedPeriod,
    sourceStatus: {
      aiInsights: insightSummary.sourceStatus,
      nutrition: nutritionSummary.sourceStatus,
      weight: weightSummary.sourceStatus,
    },
    weightSummary,
  }
}

export const healthDashboardV2Internals = {
  buildActivitySummary,
  buildAttentionItems,
  buildComparisons,
  buildCoverage,
  buildHighlights,
  buildInsightSummary,
  buildNextActions,
  buildNutritionSummary,
  buildWeightSummary,
  getPeriod,
}

import { formatKg } from './healthCalculations.js'
import { formatProgressChange } from './progress/progressAnalytics.js'
import { buildAiNutritionCoachInsights } from './aiNutritionInsights.js'
import { getEntryLocalDate, getLocalDateString } from './localDate.js'
import {
  buildTrendSeries,
  collectAvailableDates,
  compareMetricPeriods,
  healthDashboardPeriodDefinitions,
} from './healthDashboardPeriodEngine.js'
import { buildSharedAnalytics } from './sharedAnalyticsEngine.js'
import { buildPhotoAnalysisUsageSummary } from './nutritionPhotoAnalysis.js'
import { buildInsightsEngine } from './insights/insightsEngine.js'
import { buildAchievementSummary } from './achievements/achievementEngine.js'

export const healthDashboardV2ModelVersion = 2
export const healthDashboardPeriods = healthDashboardPeriodDefinitions

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
  const periodDays = analysis.period.calendarDays || analysis.period.days || Math.max(1, safeArray(analysis.weight.weights).length)
  const mealDays = analysis.nutrition.loggedDayCount
  const weightDays = analysis.weight.registrationCount
  const checkInDays = analysis.habits.checkInCount
  const available = [mealDays > 0, weightDays > 0, checkInDays > 0].filter(Boolean).length

  return {
    checkInDays,
    expectedDataPoints: analysis.period.expectedDataPoints || periodDays,
    level: available >= 3 ? 'good' : available > 0 ? 'partial' : 'missing',
    mealDays,
    periodDays,
    ratio: periodDays ? Number(((mealDays + weightDays + checkInDays) / (periodDays * 3)).toFixed(2)) : 0,
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
  const longRangeMode = analysis.period.bucketStrategy === 'week' || analysis.period.bucketStrategy === 'month'
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
    plateauText: weight.registrationCount >= 4 && Math.abs(weight.periodChangeKg || 0) <= 0.2
      ? 'Vikten är relativt stabil i vald period.'
      : 'Platåbedömning visas först när datan räcker.',
    startWeight: weight.startWeight,
    startWeightLabel: weight.startWeight === null ? 'Saknas' : formatKg(weight.startWeight),
    trend: weight.trendDirection,
    trendGranularity: longRangeMode ? `Visar ${analysis.period.bucketStrategy === 'month' ? 'månadssnitt' : 'veckosnitt'} för längre period.` : 'Visar dagsvärden för kort period.',
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
  const periodTone = weight.trendGranularity?.includes('månad') ? 'Årsöversikt' : weight.trendGranularity?.includes('vecko') ? 'Långsiktigt mönster' : 'Aktuell konsekvens'
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
    { tone: 'neutral', title: periodTone, text: weight.trendGranularity },
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
    coverage.level === 'partial' && coverage.periodDays >= 180
      ? { title: 'Lång period', text: 'Längre perioder kan ha luckor utan att det betyder något negativt.', action: 'Titta på vilka veckor eller månader som faktiskt har data.' }
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
    items: [
      compareMetricPeriods({
        currentCoverage: analysis.nutrition.loggedDayCount / Math.max(analysis.period.calendarDays || analysis.period.days || 1, 1),
        currentValue: analysis.nutrition.mealCount,
        label: 'Måltider',
        previousCoverage: 1,
        previousValue: analysis.nutrition.mealCount - comparison.mealCountDelta,
        unit: 'måltider',
      }),
      compareMetricPeriods({
        currentCoverage: analysis.habits.checkInCount / Math.max(analysis.period.calendarDays || analysis.period.days || 1, 1),
        currentValue: analysis.habits.trainingDays,
        label: 'Träning',
        previousCoverage: 1,
        previousValue: analysis.habits.trainingDays - comparison.trainingDaysDelta,
        unit: 'dagar',
      }),
    ],
    mealCountDelta: comparison.mealCountDelta,
    proteinGoalPercentDelta: comparison.proteinGoalPercentDelta,
    text: `${comparison.mealCountDelta} måltider, ${comparison.trainingDaysDelta} träningsdagar och ${comparison.checkInDelta} check-ins jämfört med föregående period.`,
    trainingDaysDelta: comparison.trainingDaysDelta,
    weightChangeDelta: comparison.weightChangeDelta,
  }
}

function getMealDate(meal) {
  return getEntryLocalDate(meal) || getLocalDateString(meal?.date || meal?.createdAt)
}

function buildTrendSeriesSummary(analysis) {
  const period = analysis.period
  const weightEntries = safeArray(analysis.weight.weights).map((entry) => ({
    date: entry.date,
    value: entry.value,
  }))
  const nutritionDays = safeArray(analysis.nutrition.days).map((day) => ({
    calories: day.totals?.calories,
    date: day.date,
    mealCount: day.mealCount,
    protein: day.totals?.protein,
  }))
  const habitEntries = safeArray(analysis.habits.entries)

  return {
    activity: [
      buildTrendSeries({
        aggregation: 'average',
        entries: habitEntries,
        getDate: (entry) => entry.date,
        getValue: (entry) => entry.steps,
        id: 'steps',
        label: 'Steg',
        period,
        unit: 'steg',
      }),
      buildTrendSeries({
        aggregation: 'average',
        entries: habitEntries,
        getDate: (entry) => entry.date,
        getValue: (entry) => entry.energy,
        id: 'energy',
        label: 'Energi',
        period,
        unit: 'av 10',
      }),
    ],
    nutrition: [
      buildTrendSeries({
        aggregation: 'average',
        entries: nutritionDays,
        getDate: (entry) => entry.date,
        getValue: (entry) => entry.calories,
        id: 'calories',
        label: 'Energi från mat',
        period,
        unit: 'kcal',
      }),
      buildTrendSeries({
        aggregation: 'average',
        entries: nutritionDays,
        getDate: (entry) => entry.date,
        getValue: (entry) => entry.protein,
        id: 'protein',
        label: 'Protein',
        period,
        unit: 'g',
      }),
    ],
    weight: buildTrendSeries({
      aggregation: 'average',
      entries: weightEntries,
      getDate: (entry) => entry.date,
      getValue: (entry) => entry.value,
      id: 'weight',
      label: 'Vikt',
      period,
      unit: 'kg',
    }),
  }
}

export function buildHealthDashboardV2Model(data = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || data.today || new Date())
  const insightReport = buildAiNutritionCoachInsights(data, { analysisDate })
  const shared = buildSharedAnalytics(data, {
    analysisDate,
    period: options.period || data.period || '30d',
  })
  const model = shared.dashboardModel
  const insightSummary = buildInsightSummary(insightReport)
  const photoAnalysisSummary = buildPhotoAnalysisUsageSummary(shared.analysis.nutrition?.meals || data.meals || [], shared.period)
  const insights = buildInsightsEngine(data, { analysisDate, period: options.period || data.period || '30d' })
  const achievements = buildAchievementSummary(data, { analysisDate })

  return {
    ...model,
    exportSummary: {
      ...model.exportSummary,
      highlights: [
        ...model.exportSummary.highlights,
        insightSummary.positive,
      ].filter(Boolean).slice(0, 5),
    },
    insightsSummary: insightSummary,
    longTermInsights: {
      consistency: insights.consistency,
      momentum: insights.momentum,
      score: insights.score,
    },
    achievements,
    modelVersion: healthDashboardV2ModelVersion,
    photoAnalysisSummary,
    nextActions: buildNextActions({
      attentionItems: model.attentionItems,
      goals: model.goalsSummary,
      insightSummary,
    }),
    progressHighlights: uniqueByText([
      ...model.progressHighlights,
      insightSummary.positive
        ? { tone: 'positive', title: 'Personlig insikt', text: insightSummary.positive }
        : null,
    ].filter(Boolean)).slice(0, 5),
    sourceStatus: {
      ...model.sourceStatus,
      aiInsights: insightSummary.sourceStatus,
    },
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
  buildTrendSeriesSummary,
  buildWeightSummary,
  collectAvailableDates,
  getMealDate,
  getPeriod,
}

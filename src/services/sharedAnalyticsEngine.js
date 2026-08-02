import { buildGoalsHabitsLiteSummary } from './goalsHabitsSummary.js'
import { formatKg } from './healthCalculations.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import {
  buildHealthDashboardPeriod,
  buildTrendSeries,
  compareMetricPeriods,
  healthDashboardPeriodDefinitions,
} from './healthDashboardPeriodEngine.js'
import { getLocalDateString } from './localDate.js'
import { buildProgressDashboardAnalytics, formatProgressChange } from './progress/progressAnalytics.js'

export const sharedAnalyticsEngineVersion = 2
export const sharedAnalyticsPeriods = healthDashboardPeriodDefinitions

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeNumber(value, fallback = null) {
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits

  return Math.round((value + Number.EPSILON) * factor) / factor
}

function formatNumber(value, unit = '') {
  if (!Number.isFinite(value)) return 'Saknas'
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`
}

function buildCoverage(analysis) {
  const periodDays = analysis.period.calendarDays || analysis.period.days || 1
  const mealDays = analysis.nutrition.loggedDayCount
  const weightDays = analysis.weight.registrationCount
  const checkInDays = analysis.habits.checkInCount
  const signalCount = [mealDays > 0, weightDays > 0, checkInDays > 0].filter(Boolean).length
  const ratio = round((mealDays + weightDays + checkInDays) / Math.max(periodDays * 3, 1), 2) || 0

  return {
    bucketCoverage: {
      checkIns: checkInDays,
      meals: mealDays,
      weights: weightDays,
    },
    checkInDays,
    confidence: signalCount >= 3 && ratio >= 0.25 ? 'medium' : signalCount > 0 ? 'low' : 'missing',
    expectedDataPoints: analysis.period.expectedDataPoints || periodDays,
    level: signalCount >= 3 ? 'good' : signalCount > 0 ? 'partial' : 'missing',
    mealDays,
    periodDays,
    ratio,
    text: signalCount >= 3
      ? 'Bra datatäckning för vald period.'
      : signalCount > 0
        ? 'Delvis datatäckning. Fler registreringar gör trenderna tryggare.'
        : 'Börja med vikt, måltid eller check-in för att fylla analysen.',
    weightDays,
  }
}

function buildWeightSummary(analysis) {
  const weight = analysis.weight

  return {
    bestLoggingStreak: weight.bestLoggingStreak,
    changeLabel: formatProgressChange(weight.totalChangeKg),
    currentWeight: weight.currentWeight,
    currentWeightLabel: weight.currentWeight === null ? 'Saknas' : formatKg(weight.currentWeight),
    dataText: weight.registrationCount >= 2 ? `${weight.registrationCount} dagsvärden i perioden.` : 'För få mätningar för en trygg periodtrend.',
    firstWeight: weight.firstWeight,
    goalRemaining: weight.goalRemaining,
    goalRemainingLabel: weight.goalRemaining === null ? 'Målvikt saknas' : `${formatKg(Math.abs(weight.goalRemaining))} kvar`,
    goalWeight: weight.goalWeight,
    goalWeightLabel: weight.goalWeight === null ? 'Saknas' : formatKg(weight.goalWeight),
    latestWeight: weight.latestWeight,
    periodChange: weight.periodChangeKg,
    periodChangeLabel: formatProgressChange(weight.periodChangeKg),
    plateau: weight.registrationCount >= 4 && Math.abs(weight.periodChangeKg || 0) <= 0.2,
    plateauText: weight.registrationCount >= 4 && Math.abs(weight.periodChangeKg || 0) <= 0.2
      ? 'Vikten är relativt stabil i vald period.'
      : 'Platåbedömning visas först när datan räcker.',
    startWeight: weight.startWeight,
    startWeightLabel: weight.startWeight === null ? 'Saknas' : formatKg(weight.startWeight),
    textAlternative: `Start ${weight.startWeight ?? 'saknas'} kg, nu ${weight.currentWeight ?? 'saknas'} kg, period ${formatProgressChange(weight.periodChangeKg)}.`,
    totalChange: weight.totalChangeKg,
    trend: weight.trendDirection,
    trendGranularity: analysis.period.bucketStrategy === 'month'
      ? 'Visar månadssnitt för längre period.'
      : analysis.period.bucketStrategy === 'week'
        ? 'Visar veckosnitt för längre period.'
        : 'Visar dagsvärden för kort period.',
    weeklyAverageChange: weight.weeklyAverageChange,
    weeklyAverageLabel: weight.weeklyAverageChange === null ? 'Saknas' : formatProgressChange(weight.weeklyAverageChange),
  }
}

function buildNutritionSummary(analysis) {
  const nutrition = analysis.nutrition

  return {
    averageCalories: nutrition.averageCalories,
    averageCaloriesLabel: formatNumber(nutrition.averageCalories, 'kcal'),
    averageProtein: nutrition.averageProtein,
    averageProteinLabel: formatNumber(nutrition.averageProtein, 'g'),
    calorieGoalPercent: nutrition.calorieGoalPercent,
    loggedDays: nutrition.loggedDayCount,
    mealCount: nutrition.mealCount,
    mostCommonMealType: nutrition.mostCommonMealType,
    proteinGoalPercent: nutrition.proteinGoalPercent,
    proteinGoalText: nutrition.goalComparison.proteinGoal
      ? `${Math.round(nutrition.proteinGoalPercent).toLocaleString('sv-SE')}% av loggade dagar når proteinmålet.`
      : 'Proteinmål saknas.',
    regularityText: nutrition.loggedDayCount >= 4
      ? 'Måltidsloggen ger ett användbart mönster.'
      : nutrition.loggedDayCount > 0
        ? 'Måltidsdata finns, men fler dagar gör mönstret tydligare.'
        : 'Inga faktiska måltider i vald period.',
    textAlternative: `${nutrition.loggedDayCount} loggade dagar, ${nutrition.mealCount} faktiska måltider, cirka ${nutrition.averageProtein} g protein per loggad dag.`,
    totals: nutrition.totals,
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
    textAlternative: `${habits.checkInCount} check-ins, ${habits.trainingDays} träningsdagar, snittsteg ${habits.averageSteps ?? 'saknas'}.`,
    trainingDays: habits.trainingDays,
    trainingForm: habits.trainingForm || 'Saknas',
  }
}

function buildTrendSeriesSummary(analysis) {
  const period = analysis.period
  const nutritionDays = safeArray(analysis.nutrition.days).map((day) => ({
    calories: safeNumber(day.totals?.calories),
    date: day.date,
    mealCount: day.mealCount,
    protein: safeNumber(day.totals?.protein),
  }))
  const habitEntries = safeArray(analysis.habits.entries)

  return {
    activity: [
      buildTrendSeries({
        entries: habitEntries,
        getDate: (entry) => entry.date,
        getValue: (entry) => entry.steps,
        id: 'steps',
        label: 'Steg',
        period,
        unit: 'steg',
      }),
      buildTrendSeries({
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
        entries: nutritionDays,
        getDate: (entry) => entry.date,
        getValue: (entry) => entry.calories,
        id: 'calories',
        label: 'Energi från mat',
        period,
        unit: 'kcal',
      }),
      buildTrendSeries({
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
      entries: safeArray(analysis.weight.weights),
      getDate: (entry) => entry.date,
      getValue: (entry) => entry.value,
      id: 'weight',
      label: 'Vikt',
      period,
      unit: 'kg',
    }),
  }
}

function uniqueByText(items) {
  const seen = new Set()
  return safeArray(items).filter((item) => {
    const key = `${item.title}:${item.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildHighlights({ activity, goals, nutrition, period, weight }) {
  const periodTone = period.bucketStrategy === 'month' ? 'Årsöversikt' : period.bucketStrategy === 'week' ? 'Långsiktigt mönster' : 'Aktuell konsekvens'

  return uniqueByText([
    weight.periodChange !== null && weight.periodChange < -0.1
      ? { source: 'sharedAnalytics', tone: 'positive', title: 'Vikttrend', text: 'Vikten rör sig nedåt i vald period.' }
      : null,
    nutrition.proteinGoalPercent >= 70
      ? { source: 'sharedAnalytics', tone: 'positive', title: 'Protein', text: 'Proteinmålet nås ofta på loggade dagar.' }
      : null,
    activity.trainingDays > 0
      ? { source: 'sharedAnalytics', tone: 'positive', title: 'Aktivitet', text: `${activity.trainingDays} träningsdagar finns registrerade.` }
      : null,
    goals?.activeFocus?.length
      ? { source: 'sharedAnalytics', tone: 'positive', title: 'Veckofokus', text: goals.activeFocus[0] }
      : null,
    { source: 'sharedAnalytics', tone: 'neutral', title: periodTone, text: weight.trendGranularity },
  ].filter(Boolean)).slice(0, 5)
}

function buildAttentionItems({ activity, coverage, goals, nutrition, weight }) {
  return uniqueByText([
    weight.periodChange === null
      ? { source: 'sharedAnalytics', title: 'Viktdata', text: 'Fler viktmätningar behövs för periodtrend.', action: 'Logga nästa vikt när det passar.' }
      : null,
    nutrition.loggedDays < 2
      ? { source: 'sharedAnalytics', title: 'Måltidsdata', text: 'Saknad data betyder inte dåligt resultat.', action: 'Logga två vanliga dagar för tydligare mönster.' }
      : null,
    activity.checkInCount < 2
      ? { source: 'sharedAnalytics', title: 'Check-in', text: 'För få check-ins för en rättvis aktivitetsjämförelse.', action: 'Gör en kort check-in idag.' }
      : null,
    goals && goals.pendingHabits > 0
      ? { source: 'sharedAnalytics', title: 'Vanor', text: 'Det finns vanor som väntar idag.', action: goals.nextStep || 'Välj en liten vana.' }
      : null,
    coverage.level === 'missing'
      ? { source: 'sharedAnalytics', title: 'Datatäckning', text: 'Analysen behöver mer underlag.', action: 'Börja med en registrering.' }
      : null,
    coverage.level === 'partial' && coverage.periodDays >= 180
      ? { source: 'sharedAnalytics', title: 'Lång period', text: 'Längre perioder kan ha luckor utan att det betyder något negativt.', action: 'Titta på vilka veckor eller månader som faktiskt har data.' }
      : null,
  ].filter(Boolean)).slice(0, 5)
}

function buildComparisons(analysis, coverage) {
  const comparison = analysis.comparison

  if (!comparison.hasComparison) {
    return {
      hasComparison: false,
      items: [],
      text: 'Föregående jämförbar period saknar tillräcklig data.',
    }
  }

  const periodDays = Math.max(analysis.period.calendarDays || analysis.period.days || 1, 1)
  const currentMealCoverage = analysis.nutrition.loggedDayCount / periodDays
  const currentCheckInCoverage = analysis.habits.checkInCount / periodDays

  return {
    hasComparison: true,
    checkInDelta: comparison.checkInDelta,
    items: [
      compareMetricPeriods({
        currentCoverage: currentMealCoverage,
        currentValue: analysis.nutrition.mealCount,
        label: 'Måltider',
        previousCoverage: Math.min(1, currentMealCoverage + 0.05),
        previousValue: analysis.nutrition.mealCount - comparison.mealCountDelta,
        unit: 'måltider',
      }),
      compareMetricPeriods({
        currentCoverage: currentCheckInCoverage,
        currentValue: analysis.habits.trainingDays,
        label: 'Träning',
        previousCoverage: Math.min(1, currentCheckInCoverage + 0.05),
        previousValue: analysis.habits.trainingDays - comparison.trainingDaysDelta,
        unit: 'dagar',
      }),
    ],
    mealCountDelta: comparison.mealCountDelta,
    proteinGoalPercentDelta: comparison.proteinGoalPercentDelta,
    text: `${comparison.mealCountDelta} måltider, ${comparison.trainingDaysDelta} träningsdagar och ${comparison.checkInDelta} check-ins jämfört med föregående period.`,
    trainingDaysDelta: comparison.trainingDaysDelta,
    weightChangeDelta: comparison.weightChangeDelta,
    confidence: coverage.confidence,
  }
}

function buildSummaries({ activity, coverage, nutrition, period, weight }) {
  return {
    activity: activity.textAlternative,
    coverage: coverage.text,
    nutrition: nutrition.textAlternative,
    period: period.periodLabel,
    weight: weight.textAlternative,
  }
}

function buildDashboardModel(shared) {
  return {
    activitySummary: {
      ...shared.activitySummary,
      comparisonText: shared.comparisons.hasComparison
        ? `${shared.comparisons.trainingDaysDelta} träningsdagar och ${shared.comparisons.checkInDelta} check-ins jämfört med föregående period.`
        : 'Jämförelse visas när föregående period har tillräcklig data.',
    },
    analysisDate: shared.analysisDate,
    attentionItems: shared.attentionItems,
    checkInSummary: {
      energyLabel: shared.activitySummary.averageEnergyLabel,
      mood: shared.activitySummary.averageMood,
      text: shared.activitySummary.textAlternative,
    },
    comparisons: shared.comparisons,
    dataCoverage: shared.coverage,
    display: {
      subtitle: `${shared.period.label} till ${shared.analysisDate}`,
      title: 'Health Dashboard',
    },
    exportSummary: {
      activity: shared.summaries.activity,
      comparison: shared.comparisons.text,
      coverage: shared.summaries.coverage,
      generatedFor: shared.analysisDate,
      highlights: shared.highlights.map((item) => item.text),
      nutrition: shared.summaries.nutrition,
      period: shared.summaries.period,
      version: shared.version,
      weight: shared.summaries.weight,
    },
    goalsSummary: shared.goalsSummary,
    habitsSummary: shared.goalsSummary,
    modelVersion: shared.version,
    nextActions: shared.nextActions,
    nutritionSummary: {
      ...shared.nutritionSummary,
      coverage: shared.coverage,
      sourceStatus: 'shared_analytics_actual_meals',
    },
    period: shared.period,
    periods: sharedAnalyticsPeriods,
    progressHighlights: shared.highlights,
    selectedPeriod: shared.selectedPeriod,
    sourceStatus: {
      analytics: 'sharedAnalyticsEngine',
      nutrition: 'shared_analytics_actual_meals',
      weight: 'shared_analytics_weight_facts',
    },
    trendSeries: shared.trendSeries,
    weightSummary: {
      ...shared.weightSummary,
      sourceStatus: 'shared_analytics_weight_facts',
    },
  }
}

function buildReportModel(shared) {
  return {
    attentionItems: shared.attentionItems,
    comparisons: shared.comparisons,
    coverage: shared.coverage,
    goalsHabits: shared.goalsSummary,
    highlights: shared.highlights,
    period: shared.period,
    source: 'sharedAnalyticsEngine',
    summaries: shared.summaries,
    trendSeries: shared.trendSeries,
    weightSummary: shared.weightSummary,
  }
}

export function buildSharedAnalytics(data = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || options.today || data.today || new Date())
  const selectedPeriod = sharedAnalyticsPeriods.find((period) => period.id === (options.period || data.period || '30d')) || sharedAnalyticsPeriods[1]
  const snapshot = data.healthSnapshot || buildHealthSnapshot({ ...data, today: analysisDate })
  const period = buildHealthDashboardPeriod(selectedPeriod.id, {
    analysisDate,
    availableDates: {
      checkIns: data.checkIns || snapshot.checkIn?.dailyEntries,
      meals: data.meals || snapshot.nutrition?.actualMeals,
      weights: data.weights || snapshot.weight?.dailyWeights,
    },
  })
  const analysis = buildProgressDashboardAnalytics({
    ...data,
    healthSnapshot: snapshot,
    today: analysisDate,
  }, { period: selectedPeriod.id, today: analysisDate })

  analysis.period = {
    ...analysis.period,
    ...period,
  }

  const coverage = buildCoverage(analysis)
  const weightSummary = buildWeightSummary(analysis)
  const nutritionSummary = buildNutritionSummary(analysis)
  const activitySummary = buildActivitySummary(analysis)
  const goalsSummary = buildGoalsHabitsLiteSummary(data.goalsHabits)
  const trendSeries = buildTrendSeriesSummary(analysis)
  const comparisons = buildComparisons(analysis, coverage)
  const highlights = buildHighlights({ activity: activitySummary, goals: goalsSummary, nutrition: nutritionSummary, period, weight: weightSummary })
  const attentionItems = buildAttentionItems({ activity: activitySummary, coverage, goals: goalsSummary, nutrition: nutritionSummary, weight: weightSummary })
  const nextActions = uniqueByText([
    goalsSummary?.nextStep ? { title: 'Mål & vanor', text: goalsSummary.nextStep, href: '#mal-vanor' } : null,
    attentionItems[0] ? { title: attentionItems[0].title, text: attentionItems[0].action, href: '#checkin' } : null,
  ].filter(Boolean)).slice(0, 3)
  const summaries = buildSummaries({ activity: activitySummary, coverage, nutrition: nutritionSummary, period, weight: weightSummary })
  const shared = {
    activitySummary,
    analysis,
    analysisDate,
    attentionItems,
    comparisons,
    coverage,
    goalsSummary,
    highlights,
    nextActions,
    nutritionSummary,
    period,
    selectedPeriod,
    summaries,
    trendSeries,
    version: sharedAnalyticsEngineVersion,
    weightSummary,
  }

  return {
    ...shared,
    dashboardModel: buildDashboardModel(shared),
    reportModel: buildReportModel(shared),
  }
}

export function buildSharedWeeklyReportModel(data = {}, options = {}) {
  return buildSharedAnalytics(data, { ...options, period: '7d' }).reportModel
}

export function buildSharedMonthlyReportModel(data = {}, options = {}) {
  return buildSharedAnalytics(data, { ...options, period: '30d' }).reportModel
}

export const sharedAnalyticsInternals = {
  buildActivitySummary,
  buildAttentionItems,
  buildComparisons,
  buildCoverage,
  buildHighlights,
  buildNutritionSummary,
  buildSummaries,
  buildTrendSeriesSummary,
  buildWeightSummary,
  formatNumber,
  round,
}

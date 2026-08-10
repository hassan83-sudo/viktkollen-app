import { buildAchievementEngine } from '../achievements/achievementEngine.js'
import { calculateAiHealthScore } from '../dashboardService.js'
import { formatKg } from '../healthCalculations.js'
import { buildHealthJourneySummary } from '../healthJourney/healthJourneySummary.js'
import {
  addLocalDays,
  getEntryLocalDate,
  getLocalDateString,
  isLocalDateInRange,
} from '../localDate.js'
import { buildHealthPredictionModel } from '../prediction/healthPredictionEngine.js'
import { buildProgressDashboardAnalytics, formatProgressChange } from '../progress/progressAnalytics.js'
import { buildProgressPhotoComparison, sortProgressPhotosChronologically } from '../progressPhotos.js'
import { buildSharedAnalytics } from '../sharedAnalyticsEngine.js'
import { buildSharedReportUiModel } from '../sharedReportUiModel.js'

export const reportCenterVersion = 1

export const reportCenterTypes = [
  { id: 'weekly', label: 'Veckorapport' },
  { id: 'monthly', label: 'Manadsrapport' },
  { id: 'progress', label: 'Framstegsrapport' },
]

export const reportCenterPeriods = [
  { days: 7, id: '7d', label: '7 dagar' },
  { days: 30, id: '30d', label: '30 dagar' },
  { days: 90, id: '90d', label: '90 dagar' },
  { days: null, id: 'custom', label: 'Egen period' },
]

export const reportPhotoModes = [
  { id: 'none', label: 'Inga bilder' },
  { id: 'latest', label: 'Senaste bilden' },
  { id: 'beforeAfter', label: 'Fore/efter' },
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeNumber(value, fallback = null) {
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

function formatNumber(value, unit = '') {
  if (!Number.isFinite(value)) return 'Saknas'

  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`
}

function resolveReportType(type) {
  return reportCenterTypes.some((entry) => entry.id === type) ? type : 'progress'
}

export function resolveReportCenterPeriod(options = {}) {
  const today = getLocalDateString(options.today || options.analysisDate || new Date())
  const periodId = reportCenterPeriods.some((entry) => entry.id === options.period) ? options.period : '30d'
  const selected = reportCenterPeriods.find((entry) => entry.id === periodId)
  const customStart = getLocalDateString(options.customStart || '')
  const customEnd = getLocalDateString(options.customEnd || '')
  const end = periodId === 'custom' && customEnd ? customEnd : today
  const start = periodId === 'custom' && customStart
    ? customStart
    : getLocalDateString(addLocalDays(end, -selected.days + 1))
  const normalizedStart = start && end && start <= end ? start : end
  const calendarDays = normalizedStart && end
    ? Math.max(1, Math.round((new Date(`${end}T12:00:00`) - new Date(`${normalizedStart}T12:00:00`)) / 86400000) + 1)
    : selected.days || 1
  const analyticsPeriod = calendarDays <= 7 ? '7d' : calendarDays <= 30 ? '30d' : '90d'

  return {
    analyticsPeriod,
    calendarDays,
    end,
    id: periodId,
    label: periodId === 'custom' ? `${normalizedStart} till ${end}` : selected.label,
    start: normalizedStart,
  }
}

function inPeriod(entry, period) {
  const date = getEntryLocalDate(entry)

  return date && isLocalDateInRange(date, period)
}

function filterInputByPeriod(input = {}, period) {
  const healthSnapshot = input.healthSnapshot || {}

  return {
    ...input,
    checkIns: safeArray(input.checkIns || healthSnapshot.checkIn?.dailyEntries).filter((entry) => inPeriod(entry, period)),
    healthSnapshot,
    meals: safeArray(input.meals || healthSnapshot.nutrition?.actualMeals).filter((entry) => inPeriod(entry, period)),
    weights: safeArray(input.weights || healthSnapshot.weight?.dailyWeights).filter((entry) => inPeriod(entry, period)),
  }
}

function getBestStepDay(entries = []) {
  return safeArray(entries)
    .map((entry) => ({
      date: getEntryLocalDate(entry),
      steps: safeNumber(entry.steps),
    }))
    .filter((entry) => entry.date && Number.isFinite(entry.steps))
    .sort((first, second) => second.steps - first.steps || first.date.localeCompare(second.date, 'sv-SE'))[0] || null
}

function buildPhotoSelection(photos = [], mode = 'none', shareable = false) {
  if (shareable || mode === 'none') {
    return { included: false, items: [], mode: 'none', summary: 'Progressbilder ingar inte automatiskt.' }
  }

  const chronological = sortProgressPhotosChronologically(photos)
  if (!chronological.length) {
    return { included: false, items: [], mode, summary: 'Inga progressbilder finns att inkludera.' }
  }

  if (mode === 'latest') {
    const latest = chronological.at(-1)

    return {
      included: true,
      items: [latest],
      mode,
      summary: `Senaste bild: ${getLocalDateString(latest.createdAt || latest.date) || 'datum saknas'}.`,
    }
  }

  const comparison = buildProgressPhotoComparison({
    afterPhotoId: chronological.at(-1)?.id,
    beforePhotoId: chronological[0]?.id,
    photos: chronological,
  })

  return {
    comparison,
    included: comparison.hasBoth,
    items: [comparison.before, comparison.after].filter(Boolean),
    mode: 'beforeAfter',
    summary: comparison.hasBoth
      ? `Fore/efter: ${comparison.daysBetween} dagar, ${comparison.weightChangeLabel}.`
      : 'Minst tva bilder behovs for fore/efter.',
  }
}

function buildTrendValue(shared, id) {
  const candidates = [
    shared.trendSeries?.weight,
    ...safeArray(shared.trendSeries?.nutrition),
    ...safeArray(shared.trendSeries?.activity),
  ]

  return candidates.find((series) => series?.id === id) || null
}

function buildOverview({ input, shared, filtered }) {
  const score = calculateAiHealthScore({
    checkIn: input.checkIn,
    foods: input.foods,
    mealHistory: input.meals || input.healthSnapshot?.nutrition?.actualMeals,
    meals: input.meals,
    weights: input.weights || input.healthSnapshot?.weight?.dailyWeights,
  }).score

  return {
    currentWeight: shared.weightSummary.currentWeight,
    currentWeightLabel: shared.weightSummary.currentWeightLabel,
    goalWeight: shared.weightSummary.goalWeight,
    goalWeightLabel: shared.weightSummary.goalWeightLabel,
    healthScore: Number.isFinite(score) ? score : null,
    healthScoreLabel: Number.isFinite(score) ? `${score}/100` : 'Saknas',
    periodEnd: shared.period.end,
    periodStart: shared.period.start,
    weightChange: filtered.weight.periodChangeKg,
    weightChangeLabel: formatProgressChange(filtered.weight.periodChangeKg),
  }
}

function buildProgressReportModel(input = {}, options = {}) {
  const period = resolveReportCenterPeriod(options)
  const filteredInput = filterInputByPeriod(input, period)
  const shared = buildSharedAnalytics(input, {
    analysisDate: period.end,
    cache: false,
    period: period.analyticsPeriod,
  })
  const filtered = buildProgressDashboardAnalytics(filteredInput, {
    period: period.analyticsPeriod,
    today: period.end,
  })
  const prediction = buildHealthPredictionModel(input, { analysisDate: period.end })
  const achievements = buildAchievementEngine(input, { analysisDate: period.end })
  const journey = buildHealthJourneySummary(input, { analysisDate: period.end })
  const bestStepDay = getBestStepDay(filtered.habits.entries)
  const photos = buildPhotoSelection(input.progressPhotoItems || input.progressPhotos, options.photoMode, options.shareable)
  const hasAnyData = filtered.weight.registrationCount > 0 ||
    filtered.nutrition.loggedDayCount > 0 ||
    filtered.habits.checkInCount > 0

  return {
    achievements: {
      latest: achievements.summary.latestAchievementTitle,
      next: achievements.summary.nextAchievementTitle,
      nextProgressPercent: achievements.nextAchievement?.progressPercent ?? 100,
      unlockedCount: achievements.summary.unlockedCount,
    },
    activity: {
      averageSteps: filtered.habits.averageSteps,
      averageStepsLabel: filtered.habits.averageSteps === null ? 'Saknas' : filtered.habits.averageSteps.toLocaleString('sv-SE'),
      bestDayLabel: bestStepDay ? `${bestStepDay.date}: ${bestStepDay.steps.toLocaleString('sv-SE')} steg` : 'Saknas',
      checkInConsistencyLabel: `${filtered.habits.checkInCount} av ${period.calendarDays} dagar`,
    },
    empty: !hasAnyData,
    generatedAt: period.end,
    insights: [
      journey.strongestPositiveTrend,
      journey.mainCurrentFocus,
      prediction.dashboard.recommendation,
    ].filter(Boolean).slice(0, 3),
    modelVersion: reportCenterVersion,
    nutrition: {
      averageCaloriesLabel: formatNumber(filtered.nutrition.averageCalories, 'kcal'),
      averageProteinLabel: formatNumber(filtered.nutrition.averageProtein, 'g'),
      proteinGoalDays: filtered.nutrition.proteinGoalDays,
      proteinGoalLabel: `${filtered.nutrition.proteinGoalDays} av ${filtered.nutrition.loggedDayCount} loggade dagar`,
    },
    overview: buildOverview({ filtered, input, shared }),
    period,
    photos,
    prediction: {
      confidence: prediction.dashboard.confidence.label,
      estimatedGoalDate: prediction.dashboard.estimatedGoalDate || 'Saknas',
      healthScoreNextWeek: prediction.dashboard.healthScoreNextWeek,
      healthScoreNextWeekLabel: prediction.dashboard.healthScoreNextWeek === null ? 'Saknas' : `${prediction.dashboard.healthScoreNextWeek}/100`,
      kgPerWeek: prediction.dashboard.kgPerWeek,
      kgPerWeekLabel: prediction.dashboard.kgPerWeek === null ? 'Saknas' : `${formatProgressChange(prediction.dashboard.kgPerWeek)} per vecka`,
      trend30Label: prediction.dashboard.trend30Label,
      trend7Label: prediction.dashboard.trend7Label,
      trendStatus: prediction.dashboard.trendStatus,
      weightTrendLabel: prediction.dashboard.weightTrendLabel,
    },
    privacy: {
      excludes: ['E-post', 'anvandar-id', 'privata anteckningar', 'progressbilder utan aktivt val'],
      shareable: Boolean(options.shareable),
      text: options.shareable
        ? 'Delbar rapport ar rensad fran identifierare, privata anteckningar och bilder.'
        : 'Rapporten skapas lokalt. Progressbilder ingar bara nar du valjer det.',
    },
    reportType: 'progress',
    sharedAnalytics: shared,
    title: 'Framstegsrapport',
    trendCards: ['weight', 'calories', 'protein', 'steps']
      .map((id) => buildTrendValue(shared, id))
      .filter(Boolean)
      .map((series) => ({
        averageLabel: formatNumber(series.average, series.unit),
        coverageLabel: `${series.coverage?.actual ?? 0} av ${series.coverage?.expected ?? 0}`,
        href: '#framsteg',
        id: series.id,
        label: series.label,
        series,
        summary: series.textualSummary,
      })),
    weight: {
      currentLabel: shared.weightSummary.currentWeightLabel,
      goalLabel: shared.weightSummary.goalWeightLabel,
      totalChangeLabel: shared.weightSummary.totalChange === null
        ? 'Saknas'
        : formatKg(shared.weightSummary.totalChange, { minimumFractionDigits: 1 }),
      trend30Label: prediction.dashboard.trend30Label,
      trend7Label: prediction.dashboard.trend7Label,
      weeklyAverageLabel: shared.weightSummary.weeklyAverageLabel,
    },
  }
}

export function buildReportCenterModel(input = {}, options = {}) {
  const reportType = resolveReportType(options.reportType)
  const period = resolveReportCenterPeriod({
    ...options,
    period: reportType === 'weekly' ? '7d' : reportType === 'monthly' ? '30d' : options.period,
  })

  if (reportType === 'weekly' || reportType === 'monthly') {
    const sourceReport = reportType === 'weekly' ? input.weeklyReportData : input.monthlyReport
    const sharedAnalytics = sourceReport?.sharedAnalytics || buildSharedAnalytics(input, {
      analysisDate: period.end,
      cache: false,
      period: period.analyticsPeriod,
    }).reportModel
    const report = sourceReport || { sharedAnalytics }
    const uiModel = buildSharedReportUiModel(report, { reportType })

    return {
      empty: !sourceReport && uiModel.dataQuality.mealDays + uiModel.dataQuality.weightDays + uiModel.dataQuality.checkInDays === 0,
      generatedAt: uiModel.generatedAt,
      modelVersion: reportCenterVersion,
      period,
      photos: buildPhotoSelection(input.progressPhotoItems || input.progressPhotos, 'none', true),
      privacy: {
        excludes: ['E-post', 'anvandar-id', 'privata anteckningar', 'progressbilder'],
        shareable: true,
        text: 'Vecko- och manadsrapportens preview anvander privacy-safe rapportdata utan bilder.',
      },
      reportType,
      sharedReport: uiModel,
      title: uiModel.overview.title,
      trendCards: uiModel.trendCards,
    }
  }

  return buildProgressReportModel(input, options)
}

export function buildShareableReportCenterModel(input = {}, options = {}) {
  return buildReportCenterModel(input, {
    ...options,
    photoMode: 'none',
    shareable: true,
  })
}

export function buildReportCenterExportText(model = {}) {
  const lines = [
    `Viktkollen ${model.title || 'rapport'}`,
    `Period: ${model.period?.label || 'Saknas'}`,
    `Skapad: ${model.generatedAt || model.period?.end || 'Saknas'}`,
    '',
    'Privacy',
    model.privacy?.text || 'Rapporten ar privacy-safe.',
    `Exkluderar: ${safeArray(model.privacy?.excludes).join(', ')}`,
  ]

  if (model.sharedReport) {
    lines.push('', 'Sammanfattning', model.sharedReport.textualSummary)
  } else {
    lines.push(
      '',
      'Oversikt',
      `Vikt: ${model.overview.currentWeightLabel}`,
      `Malvikt: ${model.overview.goalWeightLabel}`,
      `Viktforandring: ${model.overview.weightChangeLabel}`,
      `Health Score: ${model.overview.healthScoreLabel}`,
      '',
      'Nutrition',
      `Snitt kalorier: ${model.nutrition.averageCaloriesLabel}`,
      `Snitt protein: ${model.nutrition.averageProteinLabel}`,
      `Proteinmal: ${model.nutrition.proteinGoalLabel}`,
      '',
      'Aktivitet',
      `Snittsteg: ${model.activity.averageStepsLabel}`,
      `Basta stegdag: ${model.activity.bestDayLabel}`,
      `Check-ins: ${model.activity.checkInConsistencyLabel}`,
      '',
      'Prediction',
      `Beraknad maldag: ${model.prediction.estimatedGoalDate}`,
      `Trend: ${model.prediction.weightTrendLabel}`,
      `Health Score nasta vecka: ${model.prediction.healthScoreNextWeekLabel}`,
      `Confidence: ${model.prediction.confidence}`,
      '',
      'Achievements',
      `Senaste: ${model.achievements.latest}`,
      `Upplasta: ${model.achievements.unlockedCount}`,
      `Nasta: ${model.achievements.next}`,
      '',
      'Progressbilder',
      model.photos.summary,
    )
  }

  return `${lines.join('\n')}\n`
}

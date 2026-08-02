export const sharedReportUiModelVersion = 3

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function formatNumber(value, unit = '') {
  if (!Number.isFinite(value)) return 'Saknas'
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'Saknas'
  return `${Math.round(value * 100).toLocaleString('sv-SE')}%`
}

function getReportTitle(reportType) {
  return reportType === 'weekly' ? 'Veckorapport V3' : 'Månadsrapport V3'
}

function getReportPeriodLabel(shared = {}, reportType) {
  return shared.period?.periodLabel || (reportType === 'weekly' ? 'Senaste 7 dagar' : 'Senaste 30 dagar')
}

function buildTrendCards(shared = {}) {
  const trendSeries = shared.trendSeries || {}
  const candidates = [
    trendSeries.weight,
    ...(safeArray(trendSeries.nutrition).filter((series) => ['protein', 'calories'].includes(series.id))),
    ...(safeArray(trendSeries.activity).filter((series) => ['steps', 'energy'].includes(series.id))),
  ]

  return candidates.filter(Boolean).slice(0, 5).map((series) => ({
    averageLabel: formatNumber(series.average, series.unit),
    coverageLabel: `${series.coverage?.actual ?? 0} av ${series.coverage?.expected ?? 0} buckets`,
    href: series.id === 'weight'
      ? '#vikt'
      : ['protein', 'calories'].includes(series.id)
        ? '#nutrition-dashboard'
        : '#checkin',
    id: series.id,
    label: series.label,
    series,
    summary: series.textualSummary,
    unit: series.unit,
  }))
}

function buildComparisonCards(shared = {}) {
  const items = safeArray(shared.comparisons?.items)

  if (!items.length) {
    return [{
      confidence: 'low',
      currentLabel: 'Saknas',
      explanation: shared.comparisons?.text || 'Föregående jämförbar period saknar tillräcklig data.',
      id: 'comparison-empty',
      previousLabel: 'Saknas',
      status: 'insufficient',
      title: 'Jämförelse',
    }]
  }

  return items.map((item) => ({
    confidence: item.confidence || 'low',
    coverageLabel: `Nu ${formatPercent(item.currentCoverage)} · före ${formatPercent(item.previousCoverage)}`,
    currentLabel: formatNumber(item.currentValue),
    differenceLabel: item.absoluteDifference === null ? 'Saknas' : formatNumber(item.absoluteDifference),
    explanation: item.text,
    id: `${item.label}-${item.comparisonStatus}`,
    percentLabel: item.percentDifference === null ? 'Saknas' : `${item.percentDifference.toLocaleString('sv-SE')}%`,
    previousLabel: formatNumber(item.previousValue),
    status: item.comparisonStatus,
    title: item.label,
  }))
}

function buildOverview(shared = {}, reportType) {
  return {
    activity: safeText(shared.summaries?.activity, 'Aktivitetsdata saknas ännu.'),
    coverage: safeText(shared.summaries?.coverage, 'Datatäckning saknas.'),
    nutrition: safeText(shared.summaries?.nutrition, 'Nutrition blir tydligare när måltider loggas.'),
    title: getReportTitle(reportType),
    weight: safeText(shared.summaries?.weight, 'Viktdata saknas ännu.'),
  }
}

export function buildSharedReportUiModel(report = {}, options = {}) {
  const shared = report.sharedAnalytics || report
  const reportType = options.reportType || (shared.period?.id === '7d' ? 'weekly' : 'monthly')
  const coverage = shared.coverage || {}
  const trendCards = buildTrendCards(shared)
  const comparisonCards = buildComparisonCards(shared)
  const highlights = safeArray(shared.highlights).slice(0, 4)
  const attentionItems = safeArray(shared.attentionItems).slice(0, 4)
  const nextActions = safeArray(shared.nextActions).slice(0, 3)
  const textualSummary = [
    buildOverview(shared, reportType).weight,
    buildOverview(shared, reportType).nutrition,
    buildOverview(shared, reportType).activity,
  ].join(' ')

  return {
    attentionItems,
    comparisonCards,
    comparisonLabel: shared.period?.comparisonLabel || 'Föregående period',
    confidence: coverage.confidence || 'missing',
    coverage,
    dataQuality: {
      checkInDays: coverage.checkInDays ?? 0,
      mealDays: coverage.mealDays ?? 0,
      periodDays: coverage.periodDays ?? 0,
      text: coverage.text || 'Börja med en registrering för tydligare rapport.',
      weightDays: coverage.weightDays ?? 0,
    },
    generatedAt: shared.analysisDate || report.generatedAt || '',
    goalsHabits: shared.goalsHabits || report.goalsHabits || null,
    highlights,
    modelVersion: sharedReportUiModelVersion,
    nextActions,
    overview: buildOverview(shared, reportType),
    period: shared.period || null,
    periodLabel: getReportPeriodLabel(shared, reportType),
    reportType,
    source: shared.source || 'sharedAnalyticsEngine',
    textualSummary,
    trendCards,
  }
}

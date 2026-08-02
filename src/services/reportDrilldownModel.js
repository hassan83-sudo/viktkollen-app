import { buildSharedReportUiModel } from './sharedReportUiModel.js'

export const reportDrilldownModelVersion = 4

const sectionConfig = {
  activity: {
    destination: '#checkin',
    title: 'Aktivitet & check-in',
  },
  attention: {
    destination: '#health-dashboard',
    title: 'Highlights & uppmärksamhet',
  },
  coverage: {
    destination: '#health-dashboard',
    title: 'Datatäckning',
  },
  goals: {
    destination: '#mal-vanor',
    title: 'Mål & vanor',
  },
  nutrition: {
    destination: '#nutrition-dashboard',
    title: 'Nutrition',
  },
  weight: {
    destination: '#vikt',
    title: 'Vikt',
  },
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function getTrendCardsForSection(model, sectionId) {
  if (sectionId === 'weight') return model.trendCards.filter((card) => card.id === 'weight')
  if (sectionId === 'nutrition') return model.trendCards.filter((card) => ['calories', 'protein'].includes(card.id))
  if (sectionId === 'activity') return model.trendCards.filter((card) => ['steps', 'energy'].includes(card.id))
  return []
}

function getSummaryForSection(model, sectionId) {
  if (sectionId === 'weight') return model.overview.weight
  if (sectionId === 'nutrition') return model.overview.nutrition
  if (sectionId === 'activity') return model.overview.activity
  if (sectionId === 'goals') return model.goalsHabits?.summary || 'Inga aktiva mål eller vanor finns i rapportunderlaget ännu.'
  if (sectionId === 'coverage') return model.dataQuality.text
  return model.highlights[0]?.text || model.attentionItems[0]?.text || 'Det finns inga tydliga datapunkter i den här sektionen ännu.'
}

function buildEvidence(model, sectionId) {
  if (sectionId === 'coverage') {
    return [
      `${model.dataQuality.mealDays} måltidsdagar av ${model.dataQuality.periodDays}.`,
      `${model.dataQuality.weightDays} viktmätningar.`,
      `${model.dataQuality.checkInDays} check-ins av ${model.dataQuality.periodDays}.`,
    ]
  }

  if (sectionId === 'attention') {
    return [
      ...model.highlights.map((item) => `${item.title}: ${item.text}`),
      ...model.attentionItems.map((item) => `${item.title}: ${item.text}`),
    ].slice(0, 8)
  }

  return getTrendCardsForSection(model, sectionId)
    .map((card) => `${card.label}: ${card.summary} ${card.coverageLabel}.`)
    .slice(0, 5)
}

export function buildReportDrilldownModel(report = {}, sectionId = 'coverage', options = {}) {
  const reportType = options.reportType || (report.sharedAnalytics?.period?.id === '7d' ? 'weekly' : 'monthly')
  const model = buildSharedReportUiModel(report, { reportType })
  const config = sectionConfig[sectionId] || sectionConfig.coverage
  const trendCards = getTrendCardsForSection(model, sectionId)
  const comparison = sectionId === 'weight' || sectionId === 'nutrition' || sectionId === 'activity'
    ? model.comparisonCards
    : []

  return {
    attentionItems: sectionId === 'attention' ? model.attentionItems : safeArray(model.attentionItems).slice(0, 2),
    comparison,
    coverage: model.coverage,
    destination: config.destination,
    evidence: buildEvidence(model, sectionId),
    highlights: sectionId === 'attention' ? model.highlights : safeArray(model.highlights).slice(0, 2),
    modelVersion: reportDrilldownModelVersion,
    period: model.period,
    reportType: model.reportType,
    sectionId,
    sourceStatus: model.source,
    summary: getSummaryForSection(model, sectionId),
    textualExplanation: 'Beräkningen kommer från Shared Analytics Engine. Saknad data visas som saknad data och räknas inte som noll.',
    title: config.title,
    trendCards,
  }
}

export const reportDrilldownSections = Object.entries(sectionConfig).map(([id, config]) => ({
  id,
  title: config.title,
}))

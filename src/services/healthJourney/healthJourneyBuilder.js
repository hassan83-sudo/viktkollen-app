import { buildAdaptiveCoachTimelineSummary } from '../adaptiveCoachTimeline.js'
import { buildAchievementEngine } from '../achievements/achievementEngine.js'
import { buildCoachActionSummary } from '../adaptiveCoachActions.js'
import { buildHealthPredictionModel, buildMinimalPredictionAiContext } from '../prediction/healthPredictionEngine.js'
import { buildInsightsEngine } from '../insights/insightsEngine.js'
import { buildNutritionCoachModel } from '../nutrition/nutritionCoachEngine.js'
import { buildSharedAnalytics } from '../sharedAnalyticsEngine.js'
import { addLocalDays, getLocalDateString } from '../localDate.js'
import {
  createHealthJourneyEvent,
  explainHealthJourneyEvent,
  healthJourneyModelVersion,
  makeHealthJourneyError,
  sanitizeHealthJourneyText,
} from './healthJourneyModel.js'

export const healthJourneyBuilderVersion = 1
const maxJourneyEvents = 36
const maxEventsPerDay = 5

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeNumber(value, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function localDayFromIso(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return getLocalDateString(date)
}

function weekKey(dateText) {
  const date = new Date(`${dateText || getLocalDateString(new Date())}T12:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return getLocalDateString(date)
}

function monthKey(dateText) {
  return String(dateText || '').slice(0, 7)
}

function eventDate(baseDate, offsetDays = 0) {
  return `${getLocalDateString(addLocalDays(baseDate, offsetDays))}T12:00:00.000Z`
}

function dedupeEvents(events) {
  const seen = new Set()
  return safeArray(events).filter((event) => {
    const key = [
      event.type,
      event.category,
      event.source,
      localDayFromIso(event.occurredAt),
      event.title,
      event.relatedEntityIdMasked || '',
    ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sortEvents(events) {
  return [...events].sort((first, second) => {
    const dateDiff = String(second.occurredAt).localeCompare(String(first.occurredAt))
    if (dateDiff) return dateDiff
    const importanceDiff = second.importance - first.importance
    if (importanceDiff) return importanceDiff
    return String(first.id).localeCompare(String(second.id))
  })
}

function limitEvents(events) {
  const dayCounts = new Map()
  return sortEvents(dedupeEvents(events))
    .filter((event) => {
      const day = localDayFromIso(event.occurredAt)
      const current = dayCounts.get(day) || 0
      if (current >= maxEventsPerDay && event.importance < 78) return false
      dayCounts.set(day, current + 1)
      return true
    })
    .slice(0, maxJourneyEvents)
}

function buildWeightEvents(shared, analysisDate) {
  const weight = shared.weightSummary
  const change = safeNumber(weight.totalChange)
  const hasWeight = safeNumber(weight.currentWeight) !== null
  const events = []

  if (hasWeight) {
    events.push(createHealthJourneyEvent({
      category: 'weight',
      confidence: shared.coverage.weightDays >= 2 ? 72 : 45,
      dataCoverage: shared.coverage.weightDays,
      explanation: 'Bygger på central viktkälla och representativa dagsvärden, inte rå viktlogg.',
      importance: change === null ? 48 : 66,
      occurredAt: eventDate(analysisDate),
      period: 'total',
      source: 'sharedAnalytics.weight',
      summary: change === null
        ? `Nuvarande vikt är ${weight.currentWeightLabel}.`
        : change < 0
          ? `Total viktförändring sedan start är ${Math.abs(change).toLocaleString('sv-SE')} kg ned.`
          : change > 0
            ? `Total viktförändring sedan start är ${change.toLocaleString('sv-SE')} kg upp.`
            : 'Vikten är oförändrad sedan start.',
      title: 'Viktresan uppdaterad',
      tone: change !== null && change < 0 ? 'positive' : 'neutral',
      type: 'weightProgress',
    }))
  }

  if (weight.goalRemaining !== null) {
    events.push(createHealthJourneyEvent({
      category: 'weight',
      confidence: shared.coverage.weightDays >= 2 ? 70 : 44,
      dataCoverage: shared.coverage.weightDays,
      explanation: 'Målavståndet visas separat från förändring sedan start.',
      importance: 58,
      occurredAt: eventDate(analysisDate, -1),
      period: 'goal',
      source: 'sharedAnalytics.goal',
      summary: `${weight.goalRemainingLabel} till målet enligt aktuell viktdata.`,
      title: 'Målavstånd',
      tone: 'neutral',
      type: 'weightProgress',
    }))
  }

  return events
}

function buildNutritionEvents(nutritionCoach, analysisDate) {
  const events = []
  const dailyScore = safeNumber(nutritionCoach.dailyScore)
  const weeklyScore = safeNumber(nutritionCoach.weeklyScore)

  if (dailyScore !== null || weeklyScore !== null) {
    events.push(createHealthJourneyEvent({
      category: 'nutrition',
      confidence: nutritionCoach.confidenceScore,
      dataCoverage: nutritionCoach.dailyTimeline?.mealCount || 0,
      explanation: 'Måltidskvalitet visas från aggregerade nutritionvärden och innehåller inte rå måltidstext.',
      importance: dailyScore !== null ? 82 : 58,
      occurredAt: eventDate(analysisDate),
      period: 'day',
      source: 'nutritionCoach.quality',
      summary: dailyScore !== null
        ? `Dagens måltidskvalitet är ${dailyScore}/100.`
        : `Veckans måltidskvalitet är ${weeklyScore}/100.`,
      title: 'Måltidskvalitet',
      tone: (dailyScore ?? weeklyScore) >= 70 ? 'positive' : 'neutral',
      type: 'mealQuality',
    }))
  }

  safeArray(nutritionCoach.gaps).slice(0, 2).forEach((gap, index) => {
    events.push(createHealthJourneyEvent({
      category: 'nutrition',
      confidence: nutritionCoach.confidenceScore,
      dataCoverage: nutritionCoach.dailyTimeline?.mealCount || 0,
      explanation: 'Luckan bygger på summerade dagens/veckans nutritionvärden. Saknad data tolkas neutralt.',
      importance: 56 - index,
      occurredAt: eventDate(analysisDate, -index),
      period: 'day',
      source: 'nutritionCoach.gaps',
      summary: gap,
      title: 'Nutrition att följa',
      tone: 'neutral',
      type: 'nutritionGap',
    }))
  })

  return events
}

function buildInsightEvents(insights, analysisDate) {
  const events = []

  safeArray(insights.milestones).slice(0, 3).forEach((milestone, index) => {
    events.push(createHealthJourneyEvent({
      category: milestone.id?.includes('meal') ? 'nutrition' : milestone.id?.includes('checkin') ? 'recovery' : 'habits',
      confidence: insights.confidence,
      dataCoverage: insights.coverage,
      explanation: 'Milstolpen kommer från Insights/Achievements-lagret och är verifierad av aggregerade counts.',
      importance: 76 - index,
      occurredAt: eventDate(analysisDate, -index),
      period: '90d',
      relatedEntityId: milestone.id,
      relatedEntityType: 'insightMilestone',
      source: 'insights.milestones',
      summary: milestone.text,
      title: milestone.title,
      tone: 'positive',
      type: 'habitMilestone',
    }))
  })

  safeArray(insights.improvementSignals).slice(0, 2).forEach((signal, index) => {
    events.push(createHealthJourneyEvent({
      category: signal.id?.includes('protein') ? 'nutrition' : signal.id?.includes('weight') ? 'weight' : 'habits',
      confidence: insights.confidence,
      dataCoverage: insights.coverage,
      explanation: 'Förbättringssignalen bygger på trendjämförelse mellan perioddelar.',
      importance: 68 - index,
      occurredAt: eventDate(analysisDate, -index),
      period: '90d',
      source: 'insights.improvements',
      summary: signal.text,
      title: signal.title,
      tone: 'positive',
      type: 'opportunityDetected',
    }))
  })

  safeArray(insights.regressionSignals).slice(0, 2).forEach((signal, index) => {
    events.push(createHealthJourneyEvent({
      category: signal.id?.includes('steps') ? 'activity' : signal.id?.includes('checkins') ? 'recovery' : 'habits',
      confidence: insights.confidence,
      dataCoverage: insights.coverage,
      explanation: 'Caution-signalen är neutral och bygger på aggregerad trend, inte på diagnos eller skuld.',
      importance: 65 - index,
      occurredAt: eventDate(analysisDate, -index),
      period: '90d',
      source: 'insights.regression',
      summary: signal.text,
      title: signal.title,
      tone: 'caution',
      type: 'cautionSignal',
    }))
  })

  return events
}

function buildPredictionEvents(predictions, analysisDate) {
  const predictionTitle = (prediction) => ({
    actionPlan: 'Action-plan trend',
    adherence: 'Följsamhet',
    consistency: 'Konsekvens',
    nutrition: 'Nutritionstrend',
    weightTrend: 'Viktprognos',
  }[prediction.metric] || 'Prognos')
  const warningTitle = (warning) => ({
    'declining adherence': 'Minskad följsamhet',
    'decreasing consistency': 'Minskad konsekvens',
    inactivity: 'Lägre aktivitet',
    'missing meals': 'Saknad måltidslogg',
    'repeated skipped actions': 'Flera hoppade actions',
  }[warning.signal] || 'Caution-signal')

  return [
    ...safeArray(predictions.predictions).slice(0, 2).map((prediction, index) => createHealthJourneyEvent({
      category: prediction.category === 'weight' ? 'weight' : 'dataQuality',
      confidence: prediction.confidence,
      dataCoverage: Math.round((predictions.coverage?.ratio || 0) * 100),
      explanation: `Prognos: ${prediction.uncertainty || 'Osäkerhet redovisas av prediction engine.'}`,
      importance: 80 - index,
      occurredAt: eventDate(analysisDate, -index),
      period: prediction.horizon,
      source: 'prediction.engine',
      summary: `Prognos: ${prediction.explanation}`,
      title: predictionTitle(prediction),
      tone: 'neutral',
      type: 'predictionChanged',
    })),
    ...safeArray(predictions.opportunities).slice(0, 1).map((opportunity) => createHealthJourneyEvent({
      category: opportunity.category === 'nutrition' ? 'nutrition' : 'habits',
      confidence: opportunity.confidence,
      dataCoverage: Math.round((predictions.coverage?.ratio || 0) * 100),
      explanation: 'Möjligheten kommer från prediction engine och är inte ett faktapåstående om framtiden.',
      importance: 78,
      occurredAt: eventDate(analysisDate),
      period: 'prediction',
      source: 'prediction.opportunity',
      summary: opportunity.explanation,
      title: opportunity.title,
      tone: 'positive',
      type: 'opportunityDetected',
    })),
    ...safeArray(predictions.warningSignals).slice(0, 1).map((warning) => createHealthJourneyEvent({
      category: warning.category === 'nutrition' ? 'nutrition' : warning.category === 'activity' ? 'activity' : 'habits',
      confidence: warning.confidence,
      dataCoverage: Math.round((predictions.coverage?.ratio || 0) * 100),
      explanation: 'Varningssignalen visas försiktigt som stöd och är inte medicinsk riskbedömning.',
      importance: 78,
      occurredAt: eventDate(analysisDate),
      period: 'prediction',
      source: 'prediction.warning',
      summary: warning.explanation,
      title: warningTitle(warning),
      tone: 'caution',
      type: 'cautionSignal',
    })),
  ]
}

function buildCoachEvents(input, analysisDate) {
  const timeline = buildAdaptiveCoachTimelineSummary(input, {
    analysisDate,
    filter: { period: '30d' },
    now: `${analysisDate}T12:00:00.000Z`,
  })
  const actionSummary = buildCoachActionSummary(input.adaptiveCoachFeedback)
  const completedFeedbackCount = [
    ...safeArray(input.adaptiveCoachFeedback?.recommendations),
    ...safeArray(input.adaptiveCoachFeedback?.actions),
    ...safeArray(input.adaptiveCoachFeedback?.history),
  ].filter((entry) => entry.status === 'completed' || entry.action === 'completed').length
  const completedCount = Math.max(actionSummary.completed || 0, completedFeedbackCount)
  const totalCount = Math.max(actionSummary.total || 0, completedFeedbackCount)
  const events = []

  if (timeline.latestEvent) {
    events.push(createHealthJourneyEvent({
      category: 'coach',
      confidence: timeline.confidence || 45,
      dataCoverage: timeline.eventCount || 0,
      explanation: 'Visas från coachens tidslinjesammanfattning utan full memorytext eller känsliga barriertexter.',
      importance: timeline.latestEvent.eventType === 'recommendationCompleted' ? 70 : 52,
      occurredAt: timeline.latestEvent.occurredAt || eventDate(analysisDate),
      period: '30d',
      relatedEntityId: timeline.latestEvent.recommendationId,
      relatedEntityType: 'coachRecommendation',
      source: 'adaptiveCoach.timeline',
      summary: timeline.latestEvent.summary,
      title: timeline.latestEvent.title,
      tone: timeline.latestEvent.eventType === 'recommendationCompleted' ? 'positive' : 'neutral',
      type: timeline.latestEvent.eventType === 'recommendationCompleted' ? 'coachActionCompleted' : 'coachRecommendation',
    }))
  }

  if (completedCount > 0) {
    events.push(createHealthJourneyEvent({
      category: 'coach',
      confidence: 68,
      dataCoverage: totalCount,
      explanation: 'Endast slutförda actions räknas som success. Accepterade actions räknas inte som klara.',
      importance: 79,
      occurredAt: eventDate(analysisDate, -1),
      period: 'all',
      source: 'coachActions.summary',
      summary: `${completedCount} coach action${completedCount === 1 ? '' : 's'} är markerade klara.`,
      title: 'Coach action slutförd',
      tone: 'positive',
      type: 'coachActionCompleted',
    }))
  }

  return events
}

function buildAchievementEvents(input, analysisDate) {
  const model = buildAchievementEngine(input, { analysisDate })
  return safeArray(model.achievements)
    .filter((achievement) => achievement.status === 'unlocked')
    .slice(0, 3)
    .map((achievement, index) => createHealthJourneyEvent({
      category: 'motivation',
      confidence: model.confidence,
      dataCoverage: model.coverage,
      explanation: 'Achievement återanvänds från befintlig achievement engine. Ingen ny XP- eller leaderboard-logik skapas.',
      importance: 72 - index,
      occurredAt: eventDate(analysisDate, -index),
      period: 'all',
      relatedEntityId: achievement.definitionId,
      relatedEntityType: 'achievement',
      source: 'achievements.engine',
      summary: achievement.description,
      title: achievement.title,
      tone: 'positive',
      type: 'achievementUnlocked',
    }))
}

export function aggregateHealthJourneyEvents(events = {}) {
  const visible = limitEvents(safeArray(events).filter((event) => event.userVisible))
  const groupBy = (keyFn) => visible.reduce((groups, event) => {
    const key = keyFn(event)
    const existing = groups.get(key) || {
      count: 0,
      events: [],
      key,
      sources: new Set(),
      tones: new Set(),
    }
    existing.count += 1
    existing.events.push(event)
    existing.sources.add(event.source)
    existing.tones.add(event.tone)
    groups.set(key, existing)
    return groups
  }, new Map())
  const serialize = (group) => ({
    count: group.count,
    events: group.events.slice(0, 5),
    key: group.key,
    sources: [...group.sources].sort(),
    summary: group.events[0]?.summary || '',
    tones: [...group.tones].sort(),
  })

  return {
    byDay: [...groupBy((event) => localDayFromIso(event.occurredAt)).values()].map(serialize),
    byMonth: [...groupBy((event) => monthKey(localDayFromIso(event.occurredAt))).values()].map(serialize),
    byTheme: [...groupBy((event) => event.category).values()].map(serialize),
    byWeek: [...groupBy((event) => weekKey(localDayFromIso(event.occurredAt))).values()].map(serialize),
    milestones: visible.filter((event) => ['achievementUnlocked', 'habitMilestone', 'coachActionCompleted', 'weeklyPlanCompleted'].includes(event.type)),
  }
}

export function buildHealthJourney(input = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || input.today || new Date())
  const period = options.period || '90d'
  const limitations = []
  let shared
  let insights
  let nutritionCoach
  let predictions

  try {
    shared = input.sharedAnalytics || buildSharedAnalytics(input, { analysisDate, period })
    insights = input.insights || buildInsightsEngine(input, { analysisDate, period })
    nutritionCoach = input.nutritionCoach || buildNutritionCoachModel(input, { analysisDate })
    predictions = input.predictions || buildHealthPredictionModel(input, { analysisDate })
  } catch {
    const fallbackEvent = createHealthJourneyEvent({
      category: 'dataQuality',
      confidence: 20,
      dataCoverage: 0,
      explanation: 'En säker fallback visas eftersom en analyskälla inte kunde användas.',
      importance: 80,
      occurredAt: eventDate(analysisDate),
      source: 'healthJourney.error',
      summary: makeHealthJourneyError('analyticsUnavailable').message,
      title: 'Journey begränsad',
      tone: 'caution',
      type: 'cautionSignal',
    })

    return {
      aggregation: aggregateHealthJourneyEvents([fallbackEvent]),
      analysisDate,
      confidence: 20,
      coverage: 0,
      errors: [makeHealthJourneyError('analyticsUnavailable')],
      events: [fallbackEvent],
      limitations: ['Analysen kunde inte byggas fullt ut.'],
      modelVersion: healthJourneyModelVersion,
      period,
      summary: null,
    }
  }

  if (shared.coverage.level === 'missing') limitations.push('Mer data behövs innan resan blir personlig.')
  if (safeArray(predictions.predictions).every((prediction) => prediction.confidence < 45)) limitations.push('Prognoser visas med låg säkerhet eller begränsas.')
  if (!nutritionCoach.dailyTimeline?.mealCount) limitations.push('Saknad måltidsdata idag tolkas inte som dåliga vanor.')

  const events = limitEvents([
    ...buildWeightEvents(shared, analysisDate),
    ...buildNutritionEvents(nutritionCoach, analysisDate),
    ...buildInsightEvents(insights, analysisDate),
    ...buildPredictionEvents(predictions, analysisDate),
    ...buildCoachEvents(input, analysisDate),
    ...buildAchievementEvents(input, analysisDate),
  ])

  const coverage = Math.round(clamp((shared.coverage.ratio || 0) * 100, 0, 100))
  const confidence = Math.round(clamp(
    safeArray(events).reduce((sum, event) => sum + event.confidence, 0) / Math.max(events.length, 1),
    events.length ? 20 : 10,
    90,
  ))

  return {
    aggregation: aggregateHealthJourneyEvents(events),
    analysisDate,
    confidence,
    coverage,
    errors: events.length ? [] : [makeHealthJourneyError('insufficientData')],
    events: events.map((event) => ({
      ...event,
      explanationDetails: explainHealthJourneyEvent(event),
    })),
    limitations,
    modelVersion: healthJourneyModelVersion,
    period,
    sourceStatus: {
      achievements: 'reused',
      analytics: 'sharedAnalyticsEngine',
      backup: 'derived-only',
      coach: 'adaptiveCoach',
      nutrition: 'nutritionCoachEngine',
      predictions: 'separate-prediction-events',
      storage: 'no-new-key',
      sync: 'no-new-model',
    },
  }
}

export function buildMinimalHealthJourneyAiPayload(journey = {}, { consent = false, question = '' } = {}) {
  if (!consent) {
    return {
      allowed: false,
      reason: 'Samtycke krävs.',
    }
  }

  const milestones = safeArray(journey.aggregation?.milestones).slice(0, 3).map((event) => event.category)
  const opportunity = safeArray(journey.events).find((event) => event.type === 'opportunityDetected')
  const caution = safeArray(journey.events).find((event) => event.tone === 'caution')

  return {
    allowed: true,
    confidence: journey.confidence,
    coverage: journey.coverage,
    currentCaution: caution ? { category: caution.category, confidence: caution.confidence } : null,
    currentOpportunity: opportunity ? { category: opportunity.category, confidence: opportunity.confidence } : null,
    limitations: safeArray(journey.limitations).slice(0, 3),
    milestoneCategories: milestones,
    predictionSummary: buildMinimalPredictionAiContext({
      confidence: journey.confidence,
      opportunities: opportunity ? [{ category: opportunity.category }] : [],
      predictions: safeArray(journey.events).filter((event) => event.type === 'predictionChanged').map((event) => ({ category: event.category })),
      warningSignals: caution ? [{ category: caution.category }] : [],
    }),
    question: sanitizeHealthJourneyText(question, '', 180),
    summary: {
      eventCount: safeArray(journey.events).length,
      period: journey.period,
    },
  }
}

export const healthJourneyBuilderInternals = {
  dedupeEvents,
  limitEvents,
  sortEvents,
}

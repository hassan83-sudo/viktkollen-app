import { buildAdaptiveCoach } from '../adaptiveCoachEngine.js'
import { buildAdaptiveCoachFeedbackSummary } from '../adaptiveCoachFeedback.js'
import { buildCoachMemory } from '../coachMemory/coachMemoryBuilder.js'
import { selectCoachMemoryContext } from '../coachMemory/coachContextSelector.js'
import { buildSharedAnalytics } from '../sharedAnalyticsEngine.js'

function safeText(value, fallback = '', max = 180) {
  return String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function stripUnsafeText(value) {
  return safeText(value)
    .replace(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '[redacted]')
    .replace(/token|session|auth|deviceId/gi, '[redacted]')
}

function metricText(label, value) {
  const text = stripUnsafeText(value, '', 160)
  return text ? `${label}: ${text}` : ''
}

function buildSafeMemoryContext(input, options, coachModel) {
  const memory = options.coachMemory || input.adaptiveCoachFeedback?.coachMemory || buildCoachMemory(input, {
    analysisDate: options.analysisDate,
    coachModel,
    period: options.period || '30d',
  })
  const selected = selectCoachMemoryContext(memory, {
    categories: options.memoryCategories || [],
    intents: options.intents || [],
    now: options.analysisDate ? `${options.analysisDate}T12:00:00.000Z` : undefined,
  })
  if (!selected.memoryEnabled || !selected.remoteAllowed) {
    return {
      enabled: selected.memoryEnabled,
      limitations: selected.limitations,
      remoteAllowed: false,
    }
  }

  return {
    activePriorityCategories: selected.activePriorityCategories,
    actionSize: selected.explicitPreferences.actionSize,
    coachStyle: selected.explicitPreferences.coachStyle,
    declinedStrategyCategories: selected.items
      .filter((item) => item.kind === 'declinedStrategy')
      .map((item) => item.category)
      .slice(0, 2),
    excludedFocusAreas: selected.explicitPreferences.excludedFocusAreas,
    limitations: selected.limitations,
    recentContext: selected.recentContext,
    recurringBarrierCategories: selected.items
      .filter((item) => item.kind === 'recurringBarrier')
      .map((item) => item.category)
      .slice(0, 2),
    remoteAllowed: true,
    selectedFocusAreas: selected.explicitPreferences.selectedFocusAreas,
    successfulStrategyCategories: selected.items
      .filter((item) => item.kind === 'successfulStrategy')
      .map((item) => item.category)
      .slice(0, 3),
  }
}

function buildSafeActionPlanContext(input, options = {}) {
  if (options.consent !== true) return { enabled: false, remoteAllowed: false }
  const plans = safeArray(input.adaptiveCoachFeedback?.actionPlans)
    .slice()
    .sort((first, second) => String(second.generatedAt || '').localeCompare(String(first.generatedAt || '')))
  const plan = plans[0]
  if (!plan) return { enabled: false, remoteAllowed: false }

  const actions = safeArray(plan.days).flatMap((day) => safeArray(day.actions))
  const categories = [...new Set(actions.map((action) => safeText(action.category, 'general', 40)).filter(Boolean))].slice(0, 5)

  return {
    categories,
    completed: actions.filter((action) => action.status === 'completed').length,
    confidence: Number.isFinite(Number(plan.confidence)) ? Number(plan.confidence) : null,
    enabled: true,
    pending: actions.filter((action) => !action.status || action.status === 'pending').length,
    remoteAllowed: true,
    skipped: actions.filter((action) => action.status === 'skipped').length,
    weekStatus: safeText(plan.adaptiveChange || 'Regelbaserad plan', '', 140),
  }
}

export function buildCoachRemoteRequestPayload(input = {}, options = {}) {
  const analysisDate = safeText(options.analysisDate || input.analysisDate || input.healthSnapshot?.date, '', 20)
  const coachModel = options.coachModel || buildAdaptiveCoach(input, { analysisDate, period: options.period || '30d' })
  const shared = options.sharedAnalytics || buildSharedAnalytics(input, { endDate: analysisDate, period: options.period || '30d' })
  const feedbackSummary = buildAdaptiveCoachFeedbackSummary(input.adaptiveCoachFeedback, {
    now: analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined,
  })
  const coverage = Number(coachModel.coverage?.ratio ?? shared.coverage?.ratio ?? 0)
  const confidence = Number(coachModel.confidence?.value ?? 0)
  const memoryContext = buildSafeMemoryContext(input, { ...options, analysisDate }, coachModel)
  const actionPlanContext = buildSafeActionPlanContext(input, options)
  const predictionContext = options.consent === true && coachModel.remotePredictionContext
    ? {
      categories: safeArray(coachModel.remotePredictionContext.categories).map((item) => safeText(item, '', 40)).filter(Boolean).slice(0, 6),
      confidence: Number.isFinite(Number(coachModel.remotePredictionContext.confidence)) ? Number(coachModel.remotePredictionContext.confidence) : null,
      opportunityCategories: safeArray(coachModel.remotePredictionContext.opportunities).map((item) => safeText(item, '', 40)).filter(Boolean).slice(0, 4),
      predictionCount: Number(coachModel.remotePredictionContext.predictionCount || 0),
      warningCategories: safeArray(coachModel.remotePredictionContext.warningSignals).map((item) => safeText(item, '', 40)).filter(Boolean).slice(0, 4),
    }
    : { enabled: false, remoteAllowed: false }

  const payload = {
    activeGoals: safeArray(input.goalsHabits?.goals).slice(0, 4).map((goal) => stripUnsafeText(goal.name || goal.title, '', 80)).filter(Boolean),
    analysisDate,
    attentionItems: safeArray(coachModel.riskAreas).map((item) => stripUnsafeText(item.text || item.title, '', 140)).slice(0, 5),
    confidence,
    consent: options.consent === true,
    coverage,
    highlights: safeArray(coachModel.summary?.workingWell).map((item) => stripUnsafeText(item.text || item.title, '', 140)).slice(0, 5),
    locale: 'sv-SE',
    metrics: {
      activity: metricText('aktivitet', shared.activitySummary?.text || shared.activitySummary?.averageStepsLabel),
      goals: metricText('mål', feedbackSummary.completionRateLabel),
      nutrition: metricText('nutrition', shared.nutritionSummary?.proteinGoalText || shared.nutritionSummary?.regularityText),
      reminders: metricText('reminders', shared.reminderSummary?.text || coachModel.recommendations?.find((item) => item.area === 'reminders')?.text),
      weight: metricText('vikttrend', shared.weightSummary?.periodChangeLabel || shared.weightSummary?.dataText),
    },
    actionPlanContext,
    memoryContext,
    predictionContext,
    period: options.period || '30d',
    question: stripUnsafeText(options.question, '', 180),
    weeklyFocus: stripUnsafeText(coachModel.summary?.todayFocus, '', 140),
  }

  return {
    limitations: [
      coverage < 0.4 ? 'Begränsat dataunderlag.' : '',
      'Rå historik, bilder, e-post, session och device-ID skickas inte.',
    ].filter(Boolean),
    payload,
    preview: {
      activity: payload.metrics.activity || 'Saknas',
      confidence: `${Math.round(confidence * 100)}%`,
      coverage: `${Math.round(coverage * 100)}%`,
      goals: payload.activeGoals.length ? `${payload.activeGoals.length} säkra mål/vanor` : 'Saknas',
      actionPlan: actionPlanContext.remoteAllowed
        ? `${actionPlanContext.pending} planerade, ${actionPlanContext.completed} klara, ${actionPlanContext.skipped} hoppade`
        : 'Av',
      memory: memoryContext.remoteAllowed
        ? `${memoryContext.coachStyle}, ${memoryContext.actionSize}, ${memoryContext.activePriorityCategories?.length || 0} prioriteringar`
        : 'Av',
      nutrition: payload.metrics.nutrition || 'Saknas',
      predictions: predictionContext.predictionCount ? `${predictionContext.predictionCount} aggregerade prognoser` : 'Av',
      weight: payload.metrics.weight || 'Saknas',
    },
  }
}

export function fingerprintCoachPayload(payload = {}) {
  const text = JSON.stringify({
    analysisDate: payload.analysisDate,
    attentionItems: payload.attentionItems,
    confidence: payload.confidence,
    coverage: payload.coverage,
    highlights: payload.highlights,
    actionPlanContext: payload.actionPlanContext,
    memoryContext: payload.memoryContext,
    predictionContext: payload.predictionContext,
    metrics: payload.metrics,
    period: payload.period,
    question: payload.question,
  })
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `coach-${(hash >>> 0).toString(36)}`
}

export const coachRequestBuilderInternals = {
  stripUnsafeText,
}

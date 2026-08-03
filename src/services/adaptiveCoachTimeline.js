import {
  adaptiveCoachTimelineEventTypes,
  appendCoachTimelineEvent,
  getAdaptiveCoachStatusLabel,
  normalizeAdaptiveCoachFeedback,
} from './adaptiveCoachFeedback.js'
import { buildCoachActionSummary } from './adaptiveCoachActions.js'
import { normalizeGoalsHabitsState } from './goalsHabits.js'
import { normalizeReminderState } from './reminders/reminderModel.js'

const statusEventTypes = {
  accepted: 'recommendationAccepted',
  completed: 'recommendationCompleted',
  dismissed: 'recommendationDismissed',
  postponed: 'recommendationPostponed',
}

const periodDays = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 220) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeNumber(value, fallback = null) {
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

function toIso(value, fallback = '') {
  const text = safeText(value)
  if (!text) return fallback
  const date = new Date(text)

  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function localDate(value) {
  const iso = toIso(value)

  return iso ? iso.slice(0, 10) : ''
}

function hashText(value) {
  const text = safeText(value).toLocaleLowerCase('sv-SE')
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function eventId(event) {
  return safeText(event.id) || `coach-timeline-${hashText([
    event.eventType,
    event.recommendationId,
    event.occurredAt,
    event.linkedEntityType,
    event.linkedEntityId,
    event.nextStatus,
  ].join('|'))}`
}

function eventFromFeedbackEntry(entry, options = {}) {
  const occurredAt = toIso(entry.updatedAt || entry.createdAt, options.now)
  const eventType = statusEventTypes[entry.status] || 'recommendationCreated'

  return {
    actionType: entry.linkedEntityType || '',
    category: entry.area || 'general',
    confidence: safeNumber(entry.confidence),
    coverage: safeNumber(entry.coverage),
    eventType,
    isDerived: true,
    isHistorical: !entry.actionCreatedAt,
    linkedEntityId: entry.linkedEntityId,
    linkedEntityType: entry.linkedEntityType,
    nextStatus: entry.status,
    occurredAt,
    outcome: entry.status,
    previousStatus: '',
    reason: entry.status === 'dismissed'
      ? entry.dismissedReason || 'Rådet markerades som inte relevant.'
      : entry.status === 'postponed'
        ? 'Rådet är uppskjutet.'
        : entry.status === 'completed'
          ? 'Rådet markerades klart.'
          : 'Rådet finns i coachhistoriken.',
    recommendationId: entry.recommendationId || entry.id,
    safetyCategory: 'standard',
    source: 'adaptiveCoachFeedback',
    status: entry.status,
    summary: entry.action || getAdaptiveCoachStatusLabel(entry.status),
    title: entry.title || 'Coachråd',
  }
}

function eventFromExplicitEvent(event) {
  return {
    actionType: safeText(event.actionType),
    category: safeText(event.category || 'general'),
    confidence: safeNumber(event.confidence),
    coverage: safeNumber(event.coverage),
    eventType: adaptiveCoachTimelineEventTypes.includes(event.eventType) ? event.eventType : 'insufficientData',
    isDerived: event.isDerived === true,
    isHistorical: event.isHistorical === true,
    linkedEntityId: safeText(event.linkedEntityId),
    linkedEntityType: safeText(event.linkedEntityType),
    nextStatus: safeText(event.nextStatus),
    occurredAt: toIso(event.occurredAt, new Date(0).toISOString()),
    outcome: safeText(event.outcome || event.nextStatus || event.status || 'unknown'),
    previousStatus: safeText(event.previousStatus),
    reason: safeText(event.reason, '', 240),
    recommendationId: safeText(event.recommendationId),
    safetyCategory: safeText(event.safetyCategory || 'standard'),
    source: safeText(event.source || 'adaptiveCoach'),
    status: safeText(event.status || event.nextStatus),
    summary: safeText(event.summary, '', 280),
    title: safeText(event.title, 'Coachhändelse'),
  }
}

function findLinkedEntity(entry, goalsHabits, reminders) {
  if (!entry.linkedEntityId || !entry.linkedEntityType) return null
  if (entry.linkedEntityType === 'goal') return goalsHabits.goals.find((item) => item.id === entry.linkedEntityId) || null
  if (entry.linkedEntityType === 'habit') return goalsHabits.habits.find((item) => item.id === entry.linkedEntityId) || null
  if (entry.linkedEntityType === 'weeklyFocus') return goalsHabits.weeklyFocus.find((item) => item.id === entry.linkedEntityId) || null
  if (entry.linkedEntityType === 'reminder') return reminders.reminders.find((item) => item.id === entry.linkedEntityId) || null

  return null
}

export function resolveCoachActionOutcome(entry = {}, context = {}, options = {}) {
  const goalsHabits = normalizeGoalsHabitsState(context.goalsHabits)
  const reminders = normalizeReminderState(context.reminderState, { now: options.now })
  const entity = findLinkedEntity(entry, goalsHabits, reminders)

  if (!entry.linkedEntityId || !entry.linkedEntityType) {
    if (entry.status === 'dismissed') return { outcome: 'dismissed', text: 'Rådet avfärdades.' }
    if (entry.status === 'postponed') return { outcome: 'postponed', text: 'Rådet är uppskjutet.' }
    return { outcome: 'unknown', text: 'Ingen länkad action finns.' }
  }
  if (!entity) return { outcome: 'unknown', text: 'Den länkade actionen hittas inte längre.' }

  if (entry.linkedEntityType === 'reminder') {
    if (entity.archivedAt) return { outcome: 'archived', text: 'Remindern är arkiverad.' }
    if (entity.lastCompletedAt) return { outcome: 'completed', text: 'Remindern har markerats klar.' }
    if (entity.lastSkippedAt) return { outcome: 'skipped', text: 'Remindern har hoppats över.' }
    if (entity.pausedAt || entity.enabled === false) return { outcome: 'paused', text: 'Remindern är pausad eller avstängd.' }
    return { outcome: 'active', text: 'Remindern är aktiv.' }
  }

  if (entity.status === 'completed') return { outcome: 'completed', text: 'Actionen är klar.' }
  if (entity.status === 'archived') return { outcome: 'archived', text: 'Actionen är arkiverad.' }
  if (entity.status === 'paused') return { outcome: 'paused', text: 'Actionen är pausad.' }
  if (entity.status === 'active') return { outcome: 'progressing', text: 'Actionen är aktiv och kan följas upp.' }

  return { outcome: 'unknown', text: 'Statusen är okänd.' }
}

function linkedOutcomeEvents(feedback, context, options = {}) {
  return feedback.recommendations
    .filter((entry) => entry.linkedEntityType && entry.linkedEntityId)
    .map((entry) => {
      const resolved = resolveCoachActionOutcome(entry, context, options)
      const eventType = resolved.outcome === 'completed'
        ? 'linkedActionCompleted'
        : resolved.outcome === 'paused'
          ? 'linkedActionPaused'
          : resolved.outcome === 'archived'
            ? 'linkedActionArchived'
            : 'linkedActionProgressed'

      return {
        actionType: entry.linkedEntityType,
        category: entry.area,
        eventType,
        isDerived: true,
        isHistorical: false,
        linkedEntityId: entry.linkedEntityId,
        linkedEntityType: entry.linkedEntityType,
        nextStatus: resolved.outcome,
        occurredAt: toIso(entry.actionCreatedAt || entry.updatedAt, options.now),
        outcome: resolved.outcome,
        reason: resolved.text,
        recommendationId: entry.recommendationId || entry.id,
        safetyCategory: 'standard',
        source: 'linkedAction',
        status: resolved.outcome,
        summary: resolved.text,
        title: entry.title,
      }
    })
}

export function explainCoachAdaptation(recommendation = {}, context = {}) {
  if (recommendation.suppressedBecause) return recommendation.suppressedBecause
  if (recommendation.feedbackStatus === 'dismissed') return 'Liknande råd har nyligen markerats som inte relevant.'
  if (recommendation.feedbackStatus === 'postponed') return 'Rådet är uppskjutet och visas bara när tiden har passerat.'
  if (recommendation.feedbackStatus === 'completed') return 'Liknande action har nyligen slutförts, så fokus kan flyttas.'
  if (recommendation.feedbackStatus === 'accepted') return 'Rådet är accepterat och kan följas upp.'
  if (context.coverage?.level === 'missing' || context.coverage?.level === 'low') return 'Datatäckningen är låg, därför prioriteras enkla registreringar.'

  return 'Rådet prioriteras av aktuell data och tidigare coachfeedback.'
}

function createPriorityEvents(recommendations = [], model = {}, options = {}) {
  return safeArray(recommendations).map((recommendation, index) => ({
    category: recommendation.area,
    confidence: model.confidence?.value ?? null,
    coverage: model.coverage?.ratio ?? null,
    currentPriority: index + 1,
    eventType: 'coachPriorityChanged',
    isDerived: true,
    isHistorical: false,
    occurredAt: toIso(options.now, `${model.analysisDate || options.analysisDate}T12:00:00.000Z`),
    reason: explainCoachAdaptation(recommendation, model),
    recommendationId: recommendation.id,
    source: 'adaptiveCoachEngine',
    status: recommendation.feedbackStatus || 'new',
    summary: explainCoachAdaptation(recommendation, model),
    title: recommendation.title,
  }))
}

function filterPeriod(events, filter = {}, analysisDate = '') {
  const period = filter.period || 'all'
  if (period === 'all' || !periodDays[period]) return events

  const end = new Date(`${analysisDate || localDate(new Date())}T23:59:59.999`)
  const start = new Date(end)
  start.setDate(start.getDate() - periodDays[period] + 1)

  return events.filter((event) => {
    const date = new Date(event.occurredAt)
    return !Number.isNaN(date.getTime()) && date >= start && date <= end
  })
}

export function buildAdaptiveCoachTimeline(input = {}, options = {}) {
  const feedback = normalizeAdaptiveCoachFeedback(input.adaptiveCoachFeedback || input.feedback || {}, {
    now: options.now || `${options.analysisDate || input.analysisDate || input.today || localDate(new Date())}T12:00:00.000Z`,
  })
  const analysisDate = options.analysisDate || input.analysisDate || input.today || localDate(options.now || new Date())
  const explicit = feedback.events.map(eventFromExplicitEvent)
  const feedbackEvents = feedback.recommendations.map((entry) => eventFromFeedbackEntry(entry, {
    now: `${analysisDate}T12:00:00.000Z`,
  }))
  const outcomeEvents = linkedOutcomeEvents(feedback, input, { analysisDate, now: options.now })
  const priorityEvents = createPriorityEvents(input.recommendations || input.coachModel?.recommendations || [], input.coachModel || {}, {
    analysisDate,
    now: options.now || `${analysisDate}T12:00:00.000Z`,
  })
  const events = [...explicit, ...feedbackEvents, ...outcomeEvents, ...priorityEvents]
    .filter((event) => event.occurredAt)
    .map((event) => ({
      ...event,
      id: eventId(event),
    }))
    .filter((event, index, list) => list.findIndex((item) => item.id === event.id) === index)
    .sort((first, second) => second.occurredAt.localeCompare(first.occurredAt) || first.id.localeCompare(second.id))
  const filtered = filterPeriod(events, options.filter || {}, analysisDate)
    .filter((event) => !options.filter?.category || event.category === options.filter.category)
    .filter((event) => !options.filter?.status || event.status === options.filter.status || event.outcome === options.filter.status)
    .filter((event) => !options.filter?.actionType || event.actionType === options.filter.actionType)

  return {
    analysisDate,
    events: filtered,
    filters: {
      actionTypes: [...new Set(events.map((event) => event.actionType).filter(Boolean))].sort(),
      categories: [...new Set(events.map((event) => event.category).filter(Boolean))].sort(),
      statuses: [...new Set(events.flatMap((event) => [event.status, event.outcome]).filter(Boolean))].sort(),
    },
    totalEvents: events.length,
  }
}

export function buildAdaptiveCoachTimelineSummary(input = {}, options = {}) {
  const timeline = buildAdaptiveCoachTimeline(input, options)
  const events = timeline.events
  const feedback = normalizeAdaptiveCoachFeedback(input.adaptiveCoachFeedback || input.feedback || {}, options)
  const actionSummary = buildCoachActionSummary(feedback)
  const counts = events.reduce((map, event) => ({
    ...map,
    [event.eventType]: (map[event.eventType] || 0) + 1,
  }), {})
  const completed = events.filter((event) => event.outcome === 'completed' || event.eventType === 'recommendationCompleted').length
  const positive = events.find((event) => event.eventType === 'positiveOutcome' || event.outcome === 'completed') || null

  return {
    accepted: counts.recommendationAccepted || 0,
    activeActions: actionSummary.total,
    completed,
    completionRate: actionSummary.completionRate,
    conversionRate: actionSummary.conversionRate,
    createdActions: (counts.goalCreated || 0) + (counts.habitCreated || 0) + (counts.reminderCreated || 0) + (counts.weeklyFocusCreated || 0),
    dismissed: counts.recommendationDismissed || 0,
    duplicatePrevented: counts.actionDuplicatePrevented || 0,
    insufficient: events.length === 0,
    latestEvent: events[0] || null,
    latestOutcome: events.find((event) => event.outcome && event.outcome !== 'unknown') || null,
    positiveOutcome: positive,
    postponed: counts.recommendationPostponed || 0,
    recommendations: feedback.recommendations.length,
    totalEvents: timeline.totalEvents,
    topActionType: Object.entries(actionSummary.byType).sort((first, second) => second[1] - first[1])[0]?.[0] || 'Saknas',
  }
}

export function appendAdaptiveCoachTimelineEvent(feedback, event, options = {}) {
  return appendCoachTimelineEvent(feedback, event, options)
}

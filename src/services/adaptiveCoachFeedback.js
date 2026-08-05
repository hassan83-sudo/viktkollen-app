import { normalizeCoachMemory } from './coachMemory/coachMemoryModel.js'

export const adaptiveCoachFeedbackStorageKey = 'viktkollen.adaptiveCoach.v1'
export const adaptiveCoachFeedbackVersion = 1
export const adaptiveCoachTimelineHistoryLimit = 140

export const adaptiveCoachTimelineEventTypes = [
  'recommendationCreated',
  'recommendationAccepted',
  'recommendationPostponed',
  'recommendationDismissed',
  'recommendationCompleted',
  'actionDraftOpened',
  'actionCreated',
  'actionDuplicatePrevented',
  'goalCreated',
  'habitCreated',
  'reminderCreated',
  'weeklyFocusCreated',
  'linkedActionProgressed',
  'linkedActionCompleted',
  'linkedActionPaused',
  'linkedActionArchived',
  'coachPriorityChanged',
  'positiveOutcome',
  'insufficientData',
  'patternDetected',
  'patternBecameInsufficient',
  'strategyChanged',
  'weeklyPlanDraftOpened',
  'weeklyPlanConfirmed',
  'weeklyPlanPartiallyApplied',
  'weeklyPlanCancelled',
  'planActionCreated',
  'duplicatePrevented',
  'planOutcomeObserved',
  'coachActionPlanGenerated',
  'coachActionPlanRegenerated',
  'coachActionPlanActionCompleted',
  'coachActionPlanActionSkipped',
]

const statusLabels = {
  accepted: 'Accepterad',
  completed: 'Klar',
  dismissed: 'Inte relevant',
  new: 'Ny',
  postponed: 'Uppskjuten',
}

const validStatuses = new Set(Object.keys(statusLabels))
const validTimelineEventTypes = new Set(adaptiveCoachTimelineEventTypes)

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/\s+/g, ' ')
    : fallback
}

function safeDateText(value, fallback = '') {
  const text = safeText(value)
  if (!text) return fallback
  const date = new Date(text)

  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function addDaysIso(dateText, days) {
  const base = safeDateText(dateText, new Date().toISOString())
  const date = new Date(base)
  date.setDate(date.getDate() + days)

  return date.toISOString()
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

function normalizeActionPlans(value = [], options = {}) {
  return safeArray(value)
    .map((plan) => normalizeActionPlan(plan, options))
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeActionPlan(plan = {}, options = {}) {
  const source = safeObject(plan)
  const generatedAt = safeDateText(source.generatedAt || source.createdAt || source.updatedAt, options.now || new Date().toISOString())
  const weekStart = safeText(source.weekStart || source.startDate)
  const days = safeArray(source.days)
    .map((day) => ({
      actions: safeArray(day.actions).map((action) => normalizePlanAction(action, { generatedAt })).filter(Boolean).slice(0, 6),
      date: safeText(day.date),
      label: safeText(day.label || day.date),
    }))
    .filter((day) => day.date)
    .slice(0, 7)

  if (!days.length) return null

  return {
    adaptiveChange: safeText(source.adaptiveChange),
    confidence: Math.max(0, Math.min(1, normalizeNumber(source.confidence, 0.35))),
    generatedAt,
    id: safeText(source.id, `coach-action-plan-${weekStart || generatedAt.slice(0, 10)}`),
    rationale: safeArray(source.rationale).map((entry) => safeText(entry)).filter(Boolean).slice(0, 5),
    safetyNote: safeText(source.safetyNote, 'Planen är frivillig, neutral och kan ändras när som helst.'),
    sourceStatus: safeText(source.sourceStatus, 'ruleBased'),
    updatedAt: safeDateText(source.updatedAt, generatedAt),
    version: normalizeNumber(source.version, 1),
    weekEnd: safeText(source.weekEnd),
    weekStart,
    days,
  }
}

function normalizePlanAction(action = {}, options = {}) {
  const source = safeObject(action)
  const status = ['pending', 'completed', 'skipped'].includes(source.status) ? source.status : 'pending'
  const category = normalizeArea(source.category)
  const dayPart = ['morning', 'afternoon', 'evening'].includes(source.dayPart) ? source.dayPart : 'morning'
  const title = safeText(source.title, 'Coachsteg')
  const id = safeText(source.id, `plan-action-${hashText(`${dayPart}|${category}|${title}`)}`)

  return {
    category,
    completedAt: status === 'completed' ? safeDateText(source.completedAt || source.updatedAt || options.generatedAt) : '',
    dayPart,
    description: safeText(source.description || source.action, 'Ett litet nästa steg.', 240),
    durationMinutes: Math.max(2, Math.min(45, normalizeNumber(source.durationMinutes, 10))),
    id,
    optionalReminder: source.optionalReminder && typeof source.optionalReminder === 'object'
      ? {
        enabled: source.optionalReminder.enabled === true,
        time: /^\d{2}:\d{2}$/.test(String(source.optionalReminder.time || '')) ? source.optionalReminder.time : '',
        title: safeText(source.optionalReminder.title, title, 90),
      }
      : null,
    priority: Math.max(1, Math.min(100, normalizeNumber(source.priority, 50))),
    reason: safeText(source.reason, '', 220),
    skippedAt: status === 'skipped' ? safeDateText(source.skippedAt || source.updatedAt || options.generatedAt) : '',
    status,
    title,
  }
}

function normalizeArea(value) {
  return safeText(value, 'general').toLocaleLowerCase('sv-SE')
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

function createTimelineEventId(event) {
  return `coach-event-${hashText([
    event.eventType,
    event.recommendationId,
    event.occurredAt,
    event.linkedEntityType,
    event.linkedEntityId,
    event.nextStatus,
  ].join('|'))}`
}

function normalizeStatus(value) {
  const status = safeText(value).toLocaleLowerCase('sv-SE')

  return validStatuses.has(status) ? status : 'new'
}

export function getCoachRecommendationId(recommendation = {}) {
  const area = normalizeArea(recommendation.area)
  const source = [
    area,
    safeText(recommendation.title),
    safeText(recommendation.action),
    safeText(recommendation.text),
  ].join('|')

  return `coach-${area}-${hashText(source)}`
}

function normalizeFeedbackEntry(entry = {}, options = {}) {
  const source = safeObject(entry)
  const recommendation = safeObject(options.recommendation)
  const now = safeDateText(options.now, new Date().toISOString())
  const id = safeText(source.id) || safeText(source.recommendationId) || getCoachRecommendationId(recommendation)
  const status = normalizeStatus(source.status || options.status)
  const createdAt = safeDateText(source.createdAt, now)
  const updatedAt = safeDateText(source.updatedAt, createdAt)
  const completedAt = status === 'completed'
    ? safeDateText(source.completedAt, updatedAt)
    : ''
  const dismissedReason = status === 'dismissed'
    ? safeText(source.dismissedReason || source.reason || options.dismissedReason, 'Inte relevant')
    : ''
  const postponedUntil = status === 'postponed'
    ? safeDateText(source.postponedUntil || options.postponedUntil, addDaysIso(updatedAt, 1))
    : ''

  return {
    action: safeText(source.action || recommendation.action),
    area: normalizeArea(source.area || recommendation.area),
    actionCreatedAt: safeDateText(source.actionCreatedAt),
    completedAt,
    completionSource: safeText(source.completionSource),
    createdAt,
    dismissedReason,
    id,
    lastActionStatus: safeText(source.lastActionStatus),
    linkedEntityId: safeText(source.linkedEntityId),
    linkedEntityType: safeText(source.linkedEntityType),
    postponedUntil,
    recommendationId: safeText(source.recommendationId, id),
    status,
    title: safeText(source.title || recommendation.title, 'Coachråd'),
    updatedAt,
  }
}

function normalizeHistoryEntry(entry = {}) {
  const source = safeObject(entry)
  const at = safeDateText(source.at || source.updatedAt || source.createdAt)
  if (!at) return null

  const recommendation = normalizeFeedbackEntry(source, { now: at })

  return {
    area: recommendation.area,
    at,
    dismissedReason: recommendation.dismissedReason,
    id: `${recommendation.id}-${at}-${recommendation.status}`,
    recommendationId: recommendation.recommendationId,
    status: recommendation.status,
    statusLabel: getAdaptiveCoachStatusLabel(recommendation.status),
    title: recommendation.title,
  }
}

function normalizeTimelineEvent(event = {}, options = {}) {
  const source = safeObject(event)
  const eventType = safeText(source.eventType)
  if (!validTimelineEventTypes.has(eventType)) return null

  const occurredAt = safeDateText(source.occurredAt || source.at || source.updatedAt, options.now || new Date().toISOString())
  const normalized = {
    actionType: safeText(source.actionType),
    category: normalizeArea(source.category || source.area),
    confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : null,
    coverage: Number.isFinite(Number(source.coverage)) ? Number(source.coverage) : null,
    eventType,
    isDerived: source.isDerived === true,
    isHistorical: source.isHistorical === true,
    linkedEntityId: safeText(source.linkedEntityId),
    linkedEntityType: safeText(source.linkedEntityType),
    nextStatus: safeText(source.nextStatus),
    occurredAt,
    outcome: safeText(source.outcome),
    previousStatus: safeText(source.previousStatus),
    reason: safeText(source.reason, '', 240),
    recommendationId: safeText(source.recommendationId),
    safetyCategory: safeText(source.safetyCategory || 'standard'),
    source: safeText(source.source || 'adaptiveCoach'),
    status: safeText(source.status),
    summary: safeText(source.summary, '', 280),
    title: safeText(source.title, 'Coachhändelse'),
  }

  return {
    ...normalized,
    id: safeText(source.id) || createTimelineEventId(normalized),
  }
}

export function normalizeAdaptiveCoachFeedback(value = {}, options = {}) {
  const source = safeObject(value)
  const now = safeDateText(options.now, source.updatedAt || new Date().toISOString())
  const rawEntries = safeArray(Array.isArray(source.recommendations)
    ? source.recommendations
    : Array.isArray(source.actions)
      ? source.actions
      : [])
  const byId = rawEntries.reduce((map, entry) => {
    const normalized = normalizeFeedbackEntry(entry, { now })
    const existing = map.get(normalized.id)

    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      map.set(normalized.id, existing ? {
        ...existing,
        ...normalized,
        action: normalized.action || existing.action,
        area: normalized.area === 'general' ? existing.area : normalized.area,
        title: normalized.title === 'Coachråd' ? existing.title : normalized.title,
      } : normalized)
    }

    return map
  }, new Map())
  const entries = [...byId.values()].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
  const history = [
    ...safeArray(source.history).map(normalizeHistoryEntry),
    ...entries.map((entry) => normalizeHistoryEntry(entry)),
  ]
    .filter(Boolean)
    .sort((first, second) => second.at.localeCompare(first.at))
    .filter((entry, index, list) =>
      list.findIndex((item) =>
        item.recommendationId === entry.recommendationId &&
        item.status === entry.status &&
        item.at === entry.at) === index)
    .slice(0, 100)
  const events = safeArray(source.events)
    .map((event) => normalizeTimelineEvent(event, { now }))
    .filter(Boolean)
    .sort((first, second) => second.occurredAt.localeCompare(first.occurredAt) || first.id.localeCompare(second.id))
    .filter((event, index, list) => list.findIndex((item) => item.id === event.id) === index)
    .slice(0, adaptiveCoachTimelineHistoryLimit)

  return {
    actionPlans: normalizeActionPlans(source.actionPlans, { now }),
    coachMemory: normalizeCoachMemory(source.coachMemory, { now }),
    events,
    history,
    recommendations: entries,
    updatedAt: [entries[0]?.updatedAt, events[0]?.occurredAt, now].filter(Boolean).sort().at(-1) || now,
    version: adaptiveCoachFeedbackVersion,
  }
}

export function appendCoachTimelineEvent(feedback, event, options = {}) {
  const now = safeDateText(options.now, new Date().toISOString())
  const normalized = normalizeAdaptiveCoachFeedback(feedback, { now })
  const nextEvent = normalizeTimelineEvent(event, { now })
  if (!nextEvent) return normalized

  return normalizeAdaptiveCoachFeedback({
    ...normalized,
    events: [
      nextEvent,
      ...normalized.events.filter((entry) => entry.id !== nextEvent.id),
    ].slice(0, adaptiveCoachTimelineHistoryLimit),
    updatedAt: now,
  }, { now })
}

export function mergeAdaptiveCoachActionPlan(feedback, plan, options = {}) {
  const now = safeDateText(options.now, new Date().toISOString())
  const normalized = normalizeAdaptiveCoachFeedback(feedback, { now })
  const nextPlan = normalizeActionPlan(plan, { now })
  if (!nextPlan) return normalized

  return normalizeAdaptiveCoachFeedback({
    ...normalized,
    actionPlans: [
      nextPlan,
      ...normalized.actionPlans.filter((entry) => entry.id !== nextPlan.id),
    ],
    events: [
      {
        eventType: normalized.actionPlans.some((entry) => entry.id === nextPlan.id)
          ? 'coachActionPlanRegenerated'
          : 'coachActionPlanGenerated',
        occurredAt: now,
        source: 'coachActionPlan',
        summary: 'En sjudagars coachplan skapades.',
        title: 'Coachplan skapad',
      },
      ...normalized.events,
    ],
    updatedAt: now,
  }, { now })
}

export function updateAdaptiveCoachPlanActionStatus(feedback, planId, actionId, status, options = {}) {
  const now = safeDateText(options.now, new Date().toISOString())
  const normalized = normalizeAdaptiveCoachFeedback(feedback, { now })
  const nextStatus = ['pending', 'completed', 'skipped'].includes(status) ? status : 'pending'
  let changedAction = null
  const actionPlans = normalized.actionPlans.map((plan) => {
    if (plan.id !== planId) return plan
    return {
      ...plan,
      days: plan.days.map((day) => ({
        ...day,
        actions: day.actions.map((action) => {
          if (action.id !== actionId) return action
          changedAction = {
            ...action,
            completedAt: nextStatus === 'completed' ? now : '',
            skippedAt: nextStatus === 'skipped' ? now : '',
            status: nextStatus,
          }
          return changedAction
        }),
      })),
      updatedAt: now,
    }
  })
  if (!changedAction) return normalized

  return normalizeAdaptiveCoachFeedback({
    ...normalized,
    actionPlans,
    events: [
      {
        category: changedAction.category,
        eventType: nextStatus === 'completed' ? 'coachActionPlanActionCompleted' : nextStatus === 'skipped' ? 'coachActionPlanActionSkipped' : 'planOutcomeObserved',
        occurredAt: now,
        source: 'coachActionPlan',
        status: nextStatus,
        summary: changedAction.title,
        title: nextStatus === 'completed' ? 'Plansteg klart' : nextStatus === 'skipped' ? 'Plansteg hoppades över' : 'Plansteg återställt',
      },
      ...normalized.events,
    ],
    updatedAt: now,
  }, { now })
}

export function getAdaptiveCoachStatusLabel(status) {
  return statusLabels[normalizeStatus(status)] || statusLabels.new
}

export function findAdaptiveCoachFeedback(feedback, recommendation) {
  const normalized = normalizeAdaptiveCoachFeedback(feedback)
  const id = safeText(recommendation?.id) || getCoachRecommendationId(recommendation)

  return normalized.recommendations.find((entry) => entry.id === id || entry.recommendationId === id) || null
}

export function updateAdaptiveCoachFeedback(feedback, recommendation, status, options = {}) {
  const normalized = normalizeAdaptiveCoachFeedback(feedback, options)
  const now = safeDateText(options.now, new Date().toISOString())
  const baseRecommendation = {
    ...safeObject(recommendation),
    id: safeText(recommendation?.id) || getCoachRecommendationId(recommendation),
  }
  const previous = findAdaptiveCoachFeedback(normalized, baseRecommendation)
  const nextEntry = normalizeFeedbackEntry({
    ...previous,
    ...baseRecommendation,
    completedAt: status === 'completed' ? now : '',
    dismissedReason: status === 'dismissed'
      ? safeText(options.dismissedReason, 'Inte relevant')
      : '',
    postponedUntil: status === 'postponed'
      ? safeDateText(options.postponedUntil, addDaysIso(now, 1))
      : '',
    status,
    updatedAt: now,
  }, { now, recommendation: baseRecommendation, status })
  const entries = [
    nextEntry,
    ...normalized.recommendations.filter((entry) => entry.id !== nextEntry.id),
  ]
  const historyEntry = normalizeHistoryEntry({
    ...nextEntry,
    at: now,
  })

  return normalizeAdaptiveCoachFeedback({
    actionPlans: normalized.actionPlans,
    events: [
      {
        eventType: status === 'accepted'
          ? 'recommendationAccepted'
          : status === 'postponed'
            ? 'recommendationPostponed'
            : status === 'dismissed'
              ? 'recommendationDismissed'
              : status === 'completed'
                ? 'recommendationCompleted'
                : 'recommendationCreated',
        nextStatus: status,
        occurredAt: now,
        previousStatus: previous?.status || '',
        reason: status === 'dismissed'
          ? safeText(options.dismissedReason, 'Inte relevant')
          : status === 'postponed'
            ? 'Användaren sköt upp rådet.'
            : status === 'completed'
              ? 'Användaren markerade rådet som klart.'
              : 'Användaren accepterade rådet.',
        recommendationId: nextEntry.recommendationId,
        status,
        summary: nextEntry.action || nextEntry.title,
        title: nextEntry.title,
      },
      ...normalized.events,
    ],
    history: [historyEntry, ...normalized.history],
    recommendations: entries,
    updatedAt: now,
    version: adaptiveCoachFeedbackVersion,
  }, { now })
}

export function getActiveAdaptiveCoachRecommendations(feedback, options = {}) {
  const now = safeDateText(options.now, new Date().toISOString())

  return normalizeAdaptiveCoachFeedback(feedback, { now }).recommendations.filter((entry) => {
    if (entry.status === 'completed' || entry.status === 'dismissed') return false
    if (entry.status === 'postponed') return entry.postponedUntil && entry.postponedUntil <= now

    return entry.status === 'accepted' || entry.status === 'new'
  })
}

function countByStatus(entries) {
  return entries.reduce((counts, entry) => ({
    ...counts,
    [entry.status]: (counts[entry.status] || 0) + 1,
  }), {
    accepted: 0,
    completed: 0,
    dismissed: 0,
    postponed: 0,
  })
}

function topArea(entries, fallback = 'Saknas') {
  const counts = entries.reduce((map, entry) => {
    const key = safeText(entry.area, 'general')
    map.set(key, (map.get(key) || 0) + 1)

    return map
  }, new Map())
  const top = [...counts.entries()].sort((first, second) => second[1] - first[1])[0]

  return top ? top[0] : fallback
}

export function buildAdaptiveCoachFeedbackSummary(feedback, options = {}) {
  const normalized = normalizeAdaptiveCoachFeedback(feedback, options)
  const entries = normalized.recommendations
  const counts = countByStatus(entries)
  const actionableTotal = counts.accepted + counts.completed + counts.postponed + counts.dismissed
  const completionRate = actionableTotal > 0
    ? Math.round((counts.completed / actionableTotal) * 100)
    : null
  const active = getActiveAdaptiveCoachRecommendations(normalized, options)
  const completedEntries = entries.filter((entry) => entry.status === 'completed')
  const dismissedEntries = entries.filter((entry) => entry.status === 'dismissed')

  return {
    accepted: counts.accepted,
    activeCount: active.length,
    activeRecommendations: active,
    completed: counts.completed,
    completionRate,
    completionRateLabel: completionRate === null ? 'Inget underlag' : `${completionRate.toLocaleString('sv-SE')}%`,
    confidence: entries.length ? Math.min(0.95, 0.45 + completedEntries.length * 0.08 + counts.accepted * 0.04) : 0.2,
    coverage: entries.length ? Math.min(1, entries.length / 6) : 0,
    dismissed: counts.dismissed,
    effectivenessLabel: completionRate === null
      ? 'Mer historik behövs'
      : completionRate >= 60
        ? 'Coachråden verkar hjälpa'
        : 'Coachråden behöver bättre tajming',
    helpedMost: topArea(completedEntries),
    ignoredMost: topArea(dismissedEntries),
    latestAction: normalized.history[0] || null,
    postponed: counts.postponed,
    recentActions: normalized.history.slice(0, 5),
    total: entries.length,
    updatedAt: normalized.updatedAt,
    weeklyStatus: active.length
      ? `${active.length} aktiva coachråd`
      : entries.length
        ? 'Inga aktiva coachråd just nu'
        : 'Ingen feedback ännu',
  }
}

function daysBetween(first, second) {
  const firstDate = new Date(first)
  const secondDate = new Date(second)
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(secondDate.getTime())) return Infinity

  return Math.abs(secondDate.getTime() - firstDate.getTime()) / 86400000
}

function buildAreaSuccessMap(entries) {
  return entries.reduce((map, entry) => {
    if (entry.status !== 'completed') return map
    map.set(entry.area, (map.get(entry.area) || 0) + 1)

    return map
  }, new Map())
}

export function applyFeedbackToRecommendations(recommendations = [], feedback, options = {}) {
  const now = safeDateText(options.now, new Date().toISOString())
  const normalized = normalizeAdaptiveCoachFeedback(feedback, { now })
  const areaSuccess = buildAreaSuccessMap(normalized.recommendations)

  return safeArray(recommendations)
    .map((recommendation) => {
      const id = safeText(recommendation.id) || getCoachRecommendationId(recommendation)
      const entry = normalized.recommendations.find((item) => item.id === id || item.recommendationId === id)
      const area = normalizeArea(recommendation.area)
      let feedbackAdjustment = areaSuccess.has(area) ? Math.min(12, areaSuccess.get(area) * 4) : 0
      let hiddenUntil = ''

      if (entry?.status === 'accepted') feedbackAdjustment += 10
      if (entry?.status === 'dismissed') feedbackAdjustment -= daysBetween(entry.updatedAt, now) <= 21 ? 45 : 12
      if (entry?.status === 'completed') feedbackAdjustment -= daysBetween(entry.completedAt || entry.updatedAt, now) <= 7 ? 30 : 6
      if (entry?.status === 'postponed' && entry.postponedUntil > now) {
        feedbackAdjustment -= 100
        hiddenUntil = entry.postponedUntil
      }

      return {
        ...recommendation,
        adjustedPriority: normalizeNumber(recommendation.priority) + feedbackAdjustment,
        feedbackStatus: entry?.status || 'new',
        feedbackStatusLabel: getAdaptiveCoachStatusLabel(entry?.status || 'new'),
        hiddenUntil,
        id,
        lastFeedbackAt: entry?.updatedAt || '',
      }
    })
    .filter((recommendation) => !recommendation.hiddenUntil)
    .sort((first, second) => second.adjustedPriority - first.adjustedPriority)
}

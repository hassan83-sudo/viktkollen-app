import {
  buildCoachActionDraft,
  commitCoachActionDraft,
  findCoachActionDuplicate,
  validateCoachActionDraft,
} from './adaptiveCoachActions.js'
import { appendAdaptiveCoachTimelineEvent } from './adaptiveCoachTimeline.js'
import { buildAdaptiveCoach } from './adaptiveCoachEngine.js'
import { buildAdaptiveCoachPatterns, buildAdaptiveCoachPatternSummary, sanitizeCoachPatternText } from './adaptiveCoachPatterns.js'
import { buildAdaptiveCoachStrategy } from './adaptiveCoachStrategy.js'
import { addLocalDays, getLocalDateString } from './localDate.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 220) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min

  return Math.min(max, Math.max(min, number))
}

function startOfWeek(dateText) {
  const date = new Date(`${getLocalDateString(dateText || new Date())}T12:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)

  return getLocalDateString(date)
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

function createRecommendationFromPattern(pattern) {
  return {
    action: pattern.recommendedResponse,
    area: pattern.category,
    evidence: pattern.evidence,
    id: `weekly-plan-${pattern.id}`,
    priority: pattern.eligibility === 'supported' ? 80 : 55,
    text: pattern.textualSummary,
    title: pattern.category === 'nutrition'
      ? 'Planera matrytmen'
      : pattern.category === 'activity'
        ? 'Planera vardagsrörelse'
        : pattern.category === 'weight'
          ? 'Planera registrering'
          : 'Planera coachfokus',
  }
}

function createProposedAction({ draft, pattern, recommendation, weekStart }) {
  const duplicateKey = `${draft.actionType}|${draft.category}|${draft.title}|${draft.reminderTime}`

  return {
    actionType: draft.actionType,
    activeDays: draft.activeDays,
    category: draft.category,
    confidence: draft.confidence,
    coverage: draft.coverage,
    description: draft.description,
    duplicateKey,
    duplicateStatus: 'unchecked',
    eligibility: draft.validation?.ok ? 'supported' : 'blocked',
    id: `plan-action-${hashText(`${weekStart}|${duplicateKey}|${recommendation.id}`)}`,
    reason: sanitizeCoachPatternText(pattern?.textualSummary || recommendation.text),
    reminderTime: draft.reminderTime,
    sourcePatternId: pattern?.id || '',
    sourceRecommendationId: recommendation.id,
    suggestedDays: draft.activeDays,
    suggestedTime: draft.reminderTime,
    title: draft.title,
    draft,
  }
}

function dedupeProposedActions(actions) {
  const seen = new Set()

  return safeArray(actions)
    .filter((action) => {
      if (seen.has(action.duplicateKey)) return false
      seen.add(action.duplicateKey)
      return true
    })
    .slice(0, 4)
}

export function buildAdaptiveCoachWeeklyPlan(input = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || input.analysisDate || input.today || new Date())
  const weekStart = startOfWeek(analysisDate)
  const weekEnd = getLocalDateString(addLocalDays(weekStart, 6))
  const now = options.now || `${analysisDate}T12:00:00.000Z`
  const coachModel = input.coachModel || buildAdaptiveCoach(input, { analysisDate, now, period: '30d' })
  const patternModel = input.patternModel || buildAdaptiveCoachPatterns(input, { analysisDate, days: 30, now })
  const patternSummary = buildAdaptiveCoachPatternSummary(input, { analysisDate, days: 30, now })
  const strategy = buildAdaptiveCoachStrategy({ ...input, coachModel, patternSummary }, { analysisDate, now })
  const usablePatterns = patternModel.patterns
    .filter((pattern) => pattern.eligibility === 'supported' || pattern.eligibility === 'tentative')
    .slice(0, 3)
  const patternRecommendations = usablePatterns.map(createRecommendationFromPattern)
  const recommendations = [
    ...patternRecommendations,
    ...coachModel.recommendations,
    ...strategy.recommendations.map((item) => ({
      action: item.action,
      area: item.category,
      evidence: [item.reason],
      id: item.id,
      priority: 50,
      text: item.reason,
      title: item.title,
    })),
  ]
  const proposedActions = dedupeProposedActions(recommendations.map((recommendation, index) => {
    const pattern = usablePatterns.find((item) => recommendation.id.includes(item.id)) || usablePatterns[index] || null
    const actionType = strategy.strategy === 'suggestReminder'
      ? 'reminder'
      : strategy.strategy === 'suggestHabit'
        ? 'habit'
        : 'weeklyFocus'
    const draft = buildCoachActionDraft(recommendation, {
      actionType,
      analysisDate,
      confidence: clamp(pattern?.confidence ?? strategy.confidence, 0.35, 1),
      coverage: clamp(pattern?.coverage ?? strategy.coverage, 0.35, 1),
      reminderTime: '09:00',
      weekStart,
    })

    return createProposedAction({ draft, pattern, recommendation, weekStart })
  }))

  return {
    analysisDate,
    confidence: strategy.confidence,
    coverage: strategy.coverage,
    existingActions: safeArray(coachModel.actionSummary?.activeActions).slice(0, 5),
    fallbackPlan: proposedActions.length ? '' : 'Börja med en neutral registrering innan coachen skapar planförslag.',
    focusAreas: usablePatterns.map((pattern) => ({
      category: pattern.category,
      patternId: pattern.id,
      text: pattern.textualSummary,
    })).slice(0, 3),
    proposedActions,
    rationale: strategy.explanation,
    safetyNote: 'Planen är ett utkast. Inget sparas innan du bekräftar, och förslagen ska vara små och neutrala.',
    scheduleSuggestions: proposedActions.map((action) => ({
      actionId: action.id,
      days: action.suggestedDays,
      time: action.suggestedTime,
    })),
    sourceStatus: 'derivedOnly',
    strategy,
    title: strategy.strategy === 'waitForMoreData'
      ? 'Veckoplan för bättre underlag'
      : `Veckoplan: ${strategy.title}`,
    weekEnd,
    weekStart,
  }
}

export function commitAdaptiveCoachWeeklyPlan(plan = {}, context = {}, options = {}) {
  const original = {
    adaptiveCoachFeedback: context.adaptiveCoachFeedback || {},
    feedback: context.adaptiveCoachFeedback || {},
    goalsHabits: context.goalsHabits || {},
    reminderState: context.reminderState || {},
  }
  const now = options.now || (plan.analysisDate ? `${plan.analysisDate}T12:00:00.000Z` : new Date().toISOString())
  const selectedIds = new Set(safeArray(options.selectedActionIds).length
    ? options.selectedActionIds
    : safeArray(plan.proposedActions).map((action) => action.id))
  const selected = safeArray(plan.proposedActions).filter((action) => selectedIds.has(action.id))
  const preflight = selected.map((action) => {
    const draft = action.draft || action
    const validation = validateCoachActionDraft(draft)
    const duplicate = findCoachActionDuplicate(draft, original)

    return { action, draft, duplicate, validation }
  })
  const failures = preflight
    .filter((item) => !item.validation.ok || item.duplicate.duplicate)
    .map((item) => ({
      actionId: item.action.id,
      error: item.duplicate.duplicate ? item.duplicate.message : item.validation.errors.join(' '),
      status: item.duplicate.duplicate ? 'duplicate' : 'invalid',
    }))

  if (failures.length) {
    const feedback = failures.some((failure) => failure.status === 'duplicate')
      ? appendAdaptiveCoachTimelineEvent(original.feedback, {
        eventType: 'duplicatePrevented',
        occurredAt: now,
        source: 'adaptiveCoachWeeklyPlan',
        summary: 'En veckoplan stoppades eftersom en liknande action redan finns.',
        title: 'Dubblett stoppad',
      }, { now })
      : original.feedback

    return {
      failures,
      feedback,
      goalsHabits: original.goalsHabits,
      ok: false,
      reminderState: original.reminderState,
      results: [],
      rolledBack: true,
    }
  }

  let next = original
  const results = []

  for (const item of preflight) {
    const recommendation = {
      action: item.draft.description,
      area: item.draft.category,
      id: item.draft.sourceRecommendationId,
      text: item.action.reason,
      title: item.draft.title,
    }
    const result = commitCoachActionDraft(item.draft, {
      adaptiveCoachFeedback: next.feedback,
      goalsHabits: next.goalsHabits,
      reminderState: next.reminderState,
    }, { now, recommendation })

    if (!result.ok) {
      return {
        failures: [{ actionId: item.action.id, error: result.error || 'Action kunde inte skapas.', status: 'failed' }],
        feedback: original.feedback,
        goalsHabits: original.goalsHabits,
        ok: false,
        reminderState: original.reminderState,
        results,
        rolledBack: true,
      }
    }

    next = {
      feedback: appendAdaptiveCoachTimelineEvent(result.feedback, {
        actionType: item.draft.actionType,
        eventType: 'planActionCreated',
        linkedEntityId: result.entity?.id,
        linkedEntityType: result.entity?.type,
        occurredAt: now,
        recommendationId: item.draft.sourceRecommendationId,
        source: 'adaptiveCoachWeeklyPlan',
        summary: `${item.draft.title} skapades från veckoplanen.`,
        title: 'Planåtgärd skapad',
      }, { now }),
      goalsHabits: result.goalsHabits,
      reminderState: result.reminderState,
    }
    results.push({ actionId: item.action.id, entity: result.entity, status: 'created' })
  }

  const feedback = appendAdaptiveCoachTimelineEvent(next.feedback, {
    eventType: results.length === selected.length ? 'weeklyPlanConfirmed' : 'weeklyPlanPartiallyApplied',
    occurredAt: now,
    source: 'adaptiveCoachWeeklyPlan',
    summary: `${results.length} av ${selected.length} valda actions skapades.`,
    title: 'Veckoplan bekräftad',
  }, { now })

  return {
    failures: [],
    feedback,
    goalsHabits: next.goalsHabits,
    ok: true,
    reminderState: next.reminderState,
    results,
    rolledBack: false,
  }
}

import {
  acceptWeeklyFocus,
  createGoal,
  createHabit,
  normalizeGoalsHabitsState,
  weekDays as goalsHabitsWeekDays,
} from './goalsHabits.js'
import {
  adaptiveCoachFeedbackVersion,
  appendCoachTimelineEvent,
  getCoachRecommendationId,
  updateAdaptiveCoachFeedback,
} from './adaptiveCoachFeedback.js'
import {
  normalizeReminder,
  normalizeReminderState,
  reminderMaxCount,
  validateReminder,
} from './reminders/reminderModel.js'

export const coachActionTypes = ['goal', 'habit', 'reminder', 'weeklyFocus']
export const coachActionSafetyCategories = ['standard', 'blocked', 'needs_review']

const unsafePatterns = [
  /diagnos/i,
  /medicin/i,
  /svält/i,
  /extrem/i,
  /straff/i,
  /förbjud/i,
  /hoppa över (mat|måltid|frukost|lunch|middag)/i,
  /snabb viktminskning/i,
  /gå ner .*kg.*vecka/i,
  /träna varje dag/i,
]

const categoryByArea = {
  activity: 'steps',
  goals: 'custom',
  nutrition: 'protein',
  reminders: 'check_in',
  weight: 'weight',
}

const reminderTypeByCategory = {
  check_in: 'check_in',
  custom: 'custom',
  meal_logging: 'meal_log',
  protein: 'meal_log',
  steps: 'steps',
  weight: 'weight',
  workout: 'workout',
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeText(value, fallback = '', max = 180) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeLongText(value, fallback = '') {
  return safeText(value, fallback, 360)
}

function safeNumber(value, fallback = null) {
  const raw = String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, '').trim()
  if (!raw) return fallback
  const number = Number(raw)

  return Number.isFinite(number) ? number : fallback
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min

  return Math.min(max, Math.max(min, number))
}

function normalizeDateText(value) {
  const text = safeText(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = new Date(text)

  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function startOfWeek(dateText) {
  const date = new Date(`${normalizeDateText(dateText) || new Date().toISOString().slice(0, 10)}T12:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)

  return date.toISOString().slice(0, 10)
}

function inferCategory(recommendation = {}) {
  const area = safeText(recommendation.area).toLocaleLowerCase('sv-SE')
  const text = `${recommendation.title || ''} ${recommendation.text || ''} ${recommendation.action || ''}`.toLocaleLowerCase('sv-SE')

  if (/protein|kvarg|ägg|måltid/.test(text)) return 'protein'
  if (/check-in|energi|humör/.test(text)) return 'check_in'
  if (/steg|promenad|rörelse/.test(text)) return 'steps'
  if (/vikt|väg/.test(text)) return 'weight'
  if (/träning|pass|gym/.test(text)) return 'workout'
  if (/logga|måltid/.test(text)) return 'meal_logging'

  return categoryByArea[area] || 'custom'
}

function inferTarget(category, recommendation = {}) {
  const text = `${recommendation.title || ''} ${recommendation.text || ''} ${recommendation.action || ''}`
  const explicit = safeNumber(text.match(/(\d+[\d\s.,]*)\s*(g|kg|steg|pass|gånger)/i)?.[1])

  if (Number.isFinite(explicit)) return explicit
  if (category === 'protein') return 100
  if (category === 'steps') return 7000
  if (category === 'workout') return 2
  if (category === 'meal_logging' || category === 'check_in') return 1
  if (category === 'weight') return 1

  return 1
}

function unitForCategory(category) {
  if (category === 'protein') return 'g'
  if (category === 'steps') return 'steg'
  if (category === 'weight') return 'gånger'
  if (category === 'workout') return 'pass'
  if (category === 'meal_logging' || category === 'check_in') return 'dagar'

  return 'gånger'
}

function periodForCategory(category) {
  if (category === 'protein' || category === 'steps') return 'day'
  if (category === 'weight' || category === 'workout') return 'week'

  return 'week'
}

function isUnsafeRecommendation(recommendation = {}) {
  const text = `${recommendation.title || ''} ${recommendation.text || ''} ${recommendation.action || ''}`.toLocaleLowerCase('sv-SE')

  return unsafePatterns.some((pattern) => pattern.test(text))
}

function hasConcreteAction(recommendation = {}) {
  return safeText(recommendation.action).length >= 8
}

function normalizeActionType(value, allowedTypes = coachActionTypes) {
  const type = safeText(value)

  return allowedTypes.includes(type) ? type : allowedTypes[0] || 'habit'
}

export function getCoachActionEligibility(recommendation = {}, context = {}) {
  const confidence = Number(context.confidence?.value ?? context.confidence ?? recommendation.confidence?.value ?? 0.7)
  const coverage = Number(context.coverage?.ratio ?? context.coverage ?? recommendation.coverage?.ratio ?? 0.7)
  const category = inferCategory(recommendation)
  const actionTypes = ['weeklyFocus']

  if (['protein', 'steps', 'weight', 'workout', 'meal_logging', 'check_in'].includes(category)) {
    actionTypes.push('habit')
  }
  if (['protein', 'steps', 'workout', 'meal_logging', 'check_in'].includes(category)) {
    actionTypes.push('goal')
  }
  if (['protein', 'steps', 'weight', 'workout', 'meal_logging', 'check_in', 'custom'].includes(category)) {
    actionTypes.push('reminder')
  }

  if (isUnsafeRecommendation(recommendation)) {
    return {
      actionTypes: [],
      blockReason: 'Förslaget kan inte omvandlas eftersom det behöver vara neutralt och tryggt.',
      category,
      eligible: false,
    }
  }
  if (!hasConcreteAction(recommendation)) {
    return {
      actionTypes: [],
      blockReason: 'Förslaget saknar en tillräckligt konkret handling.',
      category,
      eligible: false,
    }
  }
  if (confidence < 0.35 || coverage < 0.25) {
    return {
      actionTypes: [],
      blockReason: 'Coachen behöver lite mer underlag innan detta blir en sparbar action.',
      category,
      eligible: false,
    }
  }

  return {
    actionTypes: [...new Set(actionTypes)],
    blockReason: '',
    category,
    eligible: true,
  }
}

export function buildCoachActionDraft(recommendation = {}, options = {}) {
  const eligibility = getCoachActionEligibility(recommendation, options)
  const actionType = normalizeActionType(options.actionType, eligibility.actionTypes.length ? eligibility.actionTypes : coachActionTypes)
  const category = eligibility.category || inferCategory(recommendation)
  const target = inferTarget(category, recommendation)
  const title = safeText(options.title || recommendation.title, 'Coachaction', 90)
  const description = safeLongText(options.description || recommendation.action || recommendation.text, 'Ett litet nästa steg från coachen.')
  const analysisDate = normalizeDateText(options.analysisDate || options.today || new Date())

  return {
    actionType,
    activeDays: safeArray(options.activeDays).filter((day) => goalsHabitsWeekDays.includes(day)).length
      ? safeArray(options.activeDays).filter((day) => goalsHabitsWeekDays.includes(day))
      : [...goalsHabitsWeekDays],
    category,
    confidence: clamp(options.confidence ?? recommendation.confidence?.value ?? 0.7, 0, 1),
    coverage: clamp(options.coverage ?? recommendation.coverage?.ratio ?? 0.7, 0, 1),
    description,
    frequency: ['daily', 'weekly'].includes(options.frequency) ? options.frequency : category === 'weight' || category === 'workout' ? 'weekly' : 'daily',
    linkedInsightId: safeText(options.linkedInsightId || recommendation.id),
    reminderEnabled: options.reminderEnabled === true,
    reminderTime: /^\d{2}:\d{2}$/.test(String(options.reminderTime || '')) ? options.reminderTime : '09:00',
    safetyCategory: eligibility.eligible ? 'standard' : 'blocked',
    sourceRecommendationId: safeText(recommendation.id) || getCoachRecommendationId(recommendation),
    target,
    title,
    unit: safeText(options.unit || unitForCategory(category)),
    validation: validateCoachActionDraft({
      actionType,
      category,
      confidence: clamp(options.confidence ?? recommendation.confidence?.value ?? 0.7, 0, 1),
      coverage: clamp(options.coverage ?? recommendation.coverage?.ratio ?? 0.7, 0, 1),
      description,
      safetyCategory: eligibility.eligible ? 'standard' : 'blocked',
      target,
      title,
    }),
    weekStart: normalizeDateText(options.weekStart) || startOfWeek(analysisDate),
  }
}

export function validateCoachActionDraft(draft = {}) {
  const errors = []
  const title = safeText(draft.title)
  const description = safeText(draft.description)
  const target = safeNumber(draft.target)

  if (!coachActionTypes.includes(draft.actionType)) errors.push('Välj en giltig actiontyp.')
  if (!title) errors.push('Titel saknas.')
  if (!description) errors.push('Beskrivning saknas.')
  if (draft.safetyCategory === 'blocked') errors.push('Förslaget är blockerat av säkerhetsskäl.')
  if (isUnsafeRecommendation({ action: description, title })) errors.push('Texten behöver vara neutral och trygg.')
  if (draft.confidence < 0.35 || draft.coverage < 0.25) errors.push('Underlaget är för svagt för en sparbar action.')
  if (draft.actionType === 'goal' || draft.actionType === 'habit') {
    if (!Number.isFinite(target) || target <= 0) errors.push('Målet behöver ett positivt värde.')
  }
  if (draft.category === 'protein' && (target < 20 || target > 300)) errors.push('Proteinmål behöver ligga på en trygg nivå.')
  if (draft.category === 'steps' && (target < 500 || target > 50000)) errors.push('Stegmål behöver vara realistiskt.')
  if (draft.category === 'weight' && draft.actionType === 'goal') errors.push('Viktmål ändras i profilen, inte från coachactions.')

  return {
    errors,
    ok: errors.length === 0,
  }
}

function goalDuplicate(state, draft) {
  return state.goals.find((goal) =>
    goal.status === 'active' &&
    goal.category === draft.category &&
    (goal.target === safeNumber(draft.target) || goal.title.toLocaleLowerCase('sv-SE') === draft.title.toLocaleLowerCase('sv-SE')))
}

function habitDuplicate(state, draft) {
  return state.habits.find((habit) =>
    habit.status === 'active' &&
    habit.category === draft.category &&
    habit.linkedDataSource === (draft.linkedDataSource || draft.category))
}

function weeklyFocusDuplicate(state, draft) {
  return state.weeklyFocus.find((focus) =>
    focus.status === 'active' &&
    focus.weekStart === draft.weekStart &&
    (focus.linkedInsightId === draft.sourceRecommendationId || focus.title.toLocaleLowerCase('sv-SE') === draft.title.toLocaleLowerCase('sv-SE')))
}

function reminderDuplicate(state, draft) {
  return state.reminders.find((reminder) =>
    !reminder.archivedAt &&
    reminder.type === (reminderTypeByCategory[draft.category] || 'custom') &&
    reminder.time === draft.reminderTime &&
    reminder.linkedEntityId === draft.sourceRecommendationId)
}

function feedbackDuplicate(feedback = {}, draft = {}) {
  return safeArray(feedback.recommendations).find((entry) =>
    entry.recommendationId === draft.sourceRecommendationId &&
    entry.linkedEntityType &&
    entry.lastActionStatus !== 'archived')
}

export function findCoachActionDuplicate(draft = {}, context = {}) {
  const goalsHabits = normalizeGoalsHabitsState(context.goalsHabits)
  const reminders = normalizeReminderState(context.reminderState)
  const feedback = safeObject(context.adaptiveCoachFeedback)
  const existingFeedback = feedbackDuplicate(feedback, draft)
  if (existingFeedback) {
    return {
      duplicate: true,
      entityId: existingFeedback.linkedEntityId,
      entityType: existingFeedback.linkedEntityType,
      message: 'Det finns redan en coachaction kopplad till detta råd.',
    }
  }

  const existing = draft.actionType === 'goal'
    ? goalDuplicate(goalsHabits, draft)
    : draft.actionType === 'habit'
      ? habitDuplicate(goalsHabits, draft)
      : draft.actionType === 'weeklyFocus'
        ? weeklyFocusDuplicate(goalsHabits, draft)
        : reminderDuplicate(reminders, draft)

  return existing
    ? {
      duplicate: true,
      entityId: existing.id,
      entityType: draft.actionType,
      message: 'Det finns redan ett aktivt objekt som matchar förslaget.',
    }
    : { duplicate: false, entityId: '', entityType: '', message: '' }
}

function createFeedbackAfterAction(feedback, recommendation, status, entity, options = {}) {
  const now = options.now || new Date().toISOString()
  const next = updateAdaptiveCoachFeedback(feedback, recommendation, status, { now })
  const recommendationId = safeText(recommendation?.id) || getCoachRecommendationId(recommendation)

  const linkedFeedback = {
    ...next,
    recommendations: next.recommendations.map((entry) =>
      entry.recommendationId === recommendationId || entry.id === recommendationId
        ? {
          ...entry,
          actionCreatedAt: now,
          lastActionStatus: 'active',
          linkedEntityId: entity.id,
          linkedEntityType: entity.type,
        }
        : entry),
    version: adaptiveCoachFeedbackVersion,
  }

  return appendCoachTimelineEvent(linkedFeedback, {
    actionType: entity.type,
    eventType: entity.type === 'goal'
      ? 'goalCreated'
      : entity.type === 'habit'
        ? 'habitCreated'
        : entity.type === 'reminder'
          ? 'reminderCreated'
          : entity.type === 'weeklyFocus'
            ? 'weeklyFocusCreated'
            : 'actionCreated',
    linkedEntityId: entity.id,
    linkedEntityType: entity.type,
    nextStatus: 'active',
    occurredAt: now,
    recommendationId,
    summary: `${entity.type} skapades från coachrådet.`,
    title: safeText(recommendation?.title, 'Coachaction skapad'),
  }, { now })
}

export function commitCoachActionDraft(draft = {}, context = {}, options = {}) {
  const validation = validateCoachActionDraft(draft)
  if (!validation.ok) {
    return { error: validation.errors.join(' '), feedback: context.adaptiveCoachFeedback, goalsHabits: context.goalsHabits, ok: false, reminderState: context.reminderState }
  }

  const duplicate = findCoachActionDuplicate(draft, context)
  if (duplicate.duplicate) {
    return {
      duplicate,
      error: duplicate.message,
      feedback: context.adaptiveCoachFeedback,
      goalsHabits: context.goalsHabits,
      ok: false,
      reminderState: context.reminderState,
    }
  }

  const now = options.now || new Date().toISOString()
  const goalsHabits = normalizeGoalsHabitsState(context.goalsHabits)
  const reminderState = normalizeReminderState(context.reminderState, { now })
  const recommendation = safeObject(options.recommendation)
  const feedback = safeObject(context.adaptiveCoachFeedback)

  if (draft.actionType === 'goal') {
    const goal = createGoal({
      category: draft.category,
      description: draft.description,
      linkedDataSource: draft.category,
      period: periodForCategory(draft.category),
      progressMode: draft.category === 'custom' ? 'manual' : 'automatic',
      safetyCategory: draft.safetyCategory,
      source: 'adaptiveCoach',
      target: draft.target,
      title: draft.title,
      unit: draft.unit,
    }, { now, state: goalsHabits })
    if (!goal) return { error: 'Målet kunde inte skapas.', feedback, goalsHabits, ok: false, reminderState }

    return {
      entity: { id: goal.id, type: 'goal' },
      feedback: createFeedbackAfterAction(feedback, recommendation, 'accepted', { id: goal.id, type: 'goal' }, { now }),
      goalsHabits: { ...goalsHabits, goals: [...goalsHabits.goals, goal] },
      ok: true,
      reminderState,
    }
  }

  if (draft.actionType === 'habit') {
    const habit = createHabit({
      activeDays: draft.activeDays,
      category: draft.category,
      frequency: draft.frequency,
      linkedDataSource: draft.category,
      safetyCategory: draft.safetyCategory,
      source: 'adaptiveCoach',
      targetCount: draft.target,
      title: draft.title,
      trackingMode: draft.category === 'custom' ? 'manual' : 'automatic',
    }, { now })
    if (!habit) return { error: 'Vanan kunde inte skapas.', feedback, goalsHabits, ok: false, reminderState }

    return {
      entity: { id: habit.id, type: 'habit' },
      feedback: createFeedbackAfterAction(feedback, recommendation, 'accepted', { id: habit.id, type: 'habit' }, { now }),
      goalsHabits: { ...goalsHabits, habits: [...goalsHabits.habits, habit] },
      ok: true,
      reminderState,
    }
  }

  if (draft.actionType === 'weeklyFocus') {
    const nextGoalsHabits = acceptWeeklyFocus(goalsHabits, {
      action: draft.description,
      linkedInsightId: draft.sourceRecommendationId,
      reason: 'Skapad från Adaptive Coach.',
      title: draft.title,
      weekStart: draft.weekStart,
    }, { analysisDate: draft.weekStart, now })
    const focus = nextGoalsHabits.weeklyFocus.at(-1)
    if (!focus || nextGoalsHabits.weeklyFocus.length === goalsHabits.weeklyFocus.length) {
      return { error: 'Veckofokus kunde inte skapas.', feedback, goalsHabits, ok: false, reminderState }
    }

    return {
      entity: { id: focus.id, type: 'weeklyFocus' },
      feedback: createFeedbackAfterAction(feedback, recommendation, 'accepted', { id: focus.id, type: 'weeklyFocus' }, { now }),
      goalsHabits: nextGoalsHabits,
      ok: true,
      reminderState,
    }
  }

  const reminder = normalizeReminder({
    description: 'En neutral påminnelse från Adaptive Coach.',
    enabled: draft.reminderEnabled !== false,
    linkedEntityId: draft.sourceRecommendationId,
    linkedEntityType: 'coachRecommendation',
    scheduleType: draft.frequency === 'weekly' ? 'weekly' : 'daily',
    source: 'adaptiveCoach',
    time: draft.reminderTime,
    title: draft.title,
    type: reminderTypeByCategory[draft.category] || 'custom',
  }, { now })
  const reminderValidation = validateReminder(reminder)
  if (!reminderValidation.ok) return { error: reminderValidation.errors.join(' '), feedback, goalsHabits, ok: false, reminderState }
  if (reminderState.reminders.length >= reminderMaxCount) return { error: 'Max antal reminders är redan nått.', feedback, goalsHabits, ok: false, reminderState }

  return {
    entity: { id: reminderValidation.reminder.id, type: 'reminder' },
    feedback: createFeedbackAfterAction(feedback, recommendation, 'accepted', { id: reminderValidation.reminder.id, type: 'reminder' }, { now }),
    goalsHabits,
    ok: true,
    reminderState: {
      ...reminderState,
      history: [
        ...reminderState.history,
        {
          action: 'created_from_coach',
          at: now,
          id: `created-from-coach-${reminderValidation.reminder.id}-${now}`,
          reminderId: reminderValidation.reminder.id,
        },
      ],
      reminders: [...reminderState.reminders, reminderValidation.reminder],
      updatedAt: now,
    },
  }
}

export function buildCoachActionSummary(feedback = {}) {
  const actions = safeArray(feedback.recommendations)
    .filter((entry) => entry.linkedEntityType && entry.linkedEntityId)
    .filter((entry) => entry.lastActionStatus !== 'archived')
  const byType = actions.reduce((map, entry) => ({
    ...map,
    [entry.linkedEntityType]: (map[entry.linkedEntityType] || 0) + 1,
  }), {})
  const completed = actions.filter((entry) => entry.status === 'completed').length
  const conversionRate = safeArray(feedback.recommendations).length
    ? Math.round((actions.length / feedback.recommendations.length) * 100)
    : null

  return {
    activeActions: actions,
    byType,
    completed,
    completionRate: actions.length ? Math.round((completed / actions.length) * 100) : null,
    conversionRate,
    latestAction: actions.sort((first, second) => String(second.actionCreatedAt || second.updatedAt).localeCompare(String(first.actionCreatedAt || first.updatedAt)))[0] || null,
    total: actions.length,
  }
}

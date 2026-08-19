import {
  addLocalDays,
  getLocalCalendarDayDiff,
  getLocalDateRange,
  getLocalDateString,
  parseDateValue,
  parseLocalDate,
} from '../localDate.js'
import { normalizeGoalsHabitsState } from '../goalsHabits.js'
import {
  normalizeReminder,
  normalizeReminderState,
  normalizeReminderText,
  weekDays,
} from '../reminders/reminderModel.js'

export const dailyRoutinePlanVersion = 1
export const routineCategories = [
  'weight',
  'meal',
  'water',
  'movement',
  'check_in',
  'sleep',
  'oral_care',
  'personal_care',
  'custom',
]
export const routineRecurrences = ['daily', 'weekdays', 'weekends', 'selected_weekdays', 'weekly']
export const routineHistoryLimit = 240

const categoryLabels = {
  check_in: 'Check-in',
  custom: 'Egen',
  meal: 'Mat',
  movement: 'Rörelse',
  oral_care: 'Munvård',
  personal_care: 'Egenvård',
  sleep: 'Sömn',
  water: 'Vatten',
  weight: 'Vikt',
}

const reminderTypeToCategory = {
  check_in: 'check_in',
  custom: 'custom',
  habit: 'custom',
  meal_log: 'meal',
  steps: 'movement',
  weight: 'weight',
  workout: 'movement',
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function normalizeTime(value, fallback = '09:00') {
  const text = String(value || '')
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback
}

function localDateAtTime(dateText, time) {
  const date = parseLocalDate(dateText)
  if (!date) return null
  const [hours, minutes] = normalizeTime(time).split(':').map(Number)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function weekdayForDate(dateText) {
  const date = parseLocalDate(dateText)
  return date ? weekDays[(date.getDay() + 6) % 7] : ''
}

function normalizeDays(days) {
  const normalized = safeArray(days)
    .map((day) => normalizeReminderText(day))
    .filter((day) => weekDays.includes(day))

  return normalized.length ? [...new Set(normalized)] : [...weekDays]
}

function recurrenceFromReminder(reminder) {
  if (reminder.recurrence && routineRecurrences.includes(reminder.recurrence)) {
    return reminder.recurrence
  }
  if (reminder.scheduleType === 'weekdays') return 'weekdays'
  if (reminder.scheduleType === 'weekends') return 'weekends'
  if (reminder.scheduleType === 'selected_weekdays') return 'selected_weekdays'
  if (reminder.scheduleType === 'weekly') return reminder.daysOfWeek?.length === 1 ? 'weekly' : 'selected_weekdays'
  return 'daily'
}

function categoryFromSource(source = {}) {
  if (routineCategories.includes(source.category)) return source.category
  if (routineCategories.includes(source.type)) return source.type
  return reminderTypeToCategory[source.type] || 'custom'
}

function historyMatchesDate(entry, routineId, date) {
  return entry.routineId === routineId && entry.date === date
}

function normalizeRoutineHistoryEntry(entry = {}, options = {}) {
  if (!isObject(entry)) return null
  const now = options.now || new Date().toISOString()
  const action = ['completed', 'skipped', 'snoozed', 'missed', 'created', 'updated'].includes(entry.action)
    ? entry.action
    : 'updated'
  const scheduledAt = safeIso(entry.scheduledAt, '')
  const actionAt = safeIso(entry.completedAt || entry.skippedAt || entry.snoozedAt || entry.missedAt || entry.at, now)
  const date = getLocalDateString(entry.date || scheduledAt || actionAt)
  const routineId = normalizeReminderText(entry.routineId || entry.reminderId || entry.itemId, '', 120)
  if (!routineId || !date) return null

  return {
    action,
    at: actionAt,
    completedAt: action === 'completed' ? safeIso(entry.completedAt || entry.at, actionAt) : '',
    date,
    id: normalizeReminderText(entry.id, `${action}-${routineId}-${date}`, 140),
    reminderId: normalizeReminderText(entry.reminderId, routineId, 120),
    routineId,
    scheduledAt,
    skippedAt: action === 'skipped' ? safeIso(entry.skippedAt || entry.at, actionAt) : '',
    snoozedAt: action === 'snoozed' ? safeIso(entry.snoozedAt || entry.at, actionAt) : '',
    snoozedUntil: action === 'snoozed' ? safeIso(entry.snoozedUntil, '') : '',
    source: normalizeReminderText(entry.source, 'user', 60),
  }
}

function safeIso(value, fallback = '') {
  const date = parseDateValue(value)
  return date ? date.toISOString() : fallback
}

export function normalizeDailyRoutine(routine = {}, options = {}) {
  if (!isObject(routine)) return null
  const now = options.now || new Date().toISOString()
  const sourceType = normalizeReminderText(routine.sourceType, routine.reminderId ? 'reminder' : 'user', 40)
  const id = normalizeReminderText(routine.id || routine.reminderId, '', 120)
  const title = normalizeReminderText(routine.title, 'Egen rutin', 90)
  if (!id || !title) return null
  const recurrence = routineRecurrences.includes(routine.recurrence) ? routine.recurrence : 'daily'
  const daysOfWeek = normalizeDays(routine.daysOfWeek)

  return {
    category: categoryFromSource(routine),
    createdAt: safeIso(routine.createdAt, now),
    daysOfWeek,
    enabled: routine.enabled !== false,
    id,
    priority: ['low', 'medium', 'high'].includes(routine.priority) ? routine.priority : 'medium',
    recurrence,
    reminderId: normalizeReminderText(routine.reminderId || routine.id, '', 120),
    schedule: {
      recurrence,
      timeOfDay: normalizeTime(routine.timeOfDay || routine.targetTime || routine.time),
    },
    source: normalizeReminderText(routine.source, sourceType === 'reminder' ? 'reminder' : 'user', 60),
    sourceType,
    targetTime: normalizeTime(routine.targetTime || routine.timeOfDay || routine.time),
    timeOfDay: normalizeTime(routine.timeOfDay || routine.targetTime || routine.time),
    title,
    updatedAt: safeIso(routine.updatedAt, now),
  }
}

export function normalizeRoutineChecklistItem(item = {}, options = {}) {
  if (!isObject(item)) return null
  const now = options.now || new Date().toISOString()
  const title = normalizeReminderText(item.title, '', 90)
  if (!title) return null

  return {
    category: categoryFromSource(item),
    createdAt: safeIso(item.createdAt, now),
    enabled: item.enabled !== false,
    id: normalizeReminderText(item.id, `checklist-${title.toLocaleLowerCase('sv-SE').replace(/[^a-z0-9]+/g, '-')}`, 120),
    order: Math.max(0, Math.min(99, Math.round(Number(item.order) || 0))),
    source: normalizeReminderText(item.source, 'user', 60),
    title,
    updatedAt: safeIso(item.updatedAt, now),
  }
}

export function normalizeRoutinePlanState(value = {}, options = {}) {
  const source = isObject(value) ? value : {}

  return {
    checklist: safeArray(source.checklist)
      .map((item) => normalizeRoutineChecklistItem(item, options))
      .filter(Boolean)
      .sort((first, second) => first.order - second.order || first.title.localeCompare(second.title, 'sv-SE'))
      .slice(0, 40),
    history: safeArray(source.history)
      .map((entry) => normalizeRoutineHistoryEntry(entry, options))
      .filter(Boolean)
      .slice(-routineHistoryLimit),
    version: dailyRoutinePlanVersion,
  }
}

export function buildRoutineFromReminder(reminder = {}, options = {}) {
  const normalized = normalizeReminder(reminder, options)
  if (!normalized || normalized.archivedAt || normalized.pausedAt || normalized.needsReview) return null
  const recurrence = recurrenceFromReminder(normalized)

  return normalizeDailyRoutine({
    category: categoryFromSource(normalized),
    createdAt: normalized.createdAt,
    daysOfWeek: normalized.daysOfWeek,
    enabled: normalized.enabled,
    id: `reminder:${normalized.id}`,
    priority: normalized.type === 'check_in' || normalized.type === 'meal_log' ? 'high' : 'medium',
    recurrence,
    reminderId: normalized.id,
    source: normalized.source || 'reminder',
    sourceType: 'reminder',
    targetTime: normalized.time,
    timeOfDay: normalized.time,
    title: normalized.title,
    updatedAt: normalized.updatedAt,
  }, options)
}

export function buildRoutinesFromState({ goalsHabits = {}, reminderState = {} } = {}, options = {}) {
  const reminders = normalizeReminderState(reminderState, options).reminders
  const goals = normalizeGoalsHabitsState(goalsHabits)
  const reminderRoutines = reminders.map((reminder) => buildRoutineFromReminder(reminder, options)).filter(Boolean)
  const habitRoutines = goals.habits
    .filter((habit) => habit.status === 'active')
    .map((habit) => normalizeDailyRoutine({
      category: categoryFromSource(habit),
      createdAt: habit.createdAt,
      daysOfWeek: habit.activeDays,
      enabled: true,
      id: `habit:${habit.id}`,
      priority: 'medium',
      recurrence: habit.frequency === 'weekly' ? 'weekly' : 'selected_weekdays',
      source: 'habit',
      sourceType: 'habit',
      targetTime: habit.reminder?.time || '18:00',
      title: habit.title,
      updatedAt: habit.updatedAt,
    }, options))
    .filter(Boolean)

  return [...dedupeRoutines([...reminderRoutines, ...habitRoutines])]
}

function dedupeRoutines(routines) {
  const byKey = new Map()
  routines.forEach((routine) => {
    const key = `${routine.sourceType}:${routine.reminderId || routine.id}`
    if (!byKey.has(key)) byKey.set(key, routine)
  })
  return byKey.values()
}

export function isRoutineScheduledOnDate(routine, dateText) {
  const normalized = normalizeDailyRoutine(routine)
  if (!normalized || !normalized.enabled) return false
  const weekday = weekdayForDate(dateText)
  if (!weekday) return false
  if (normalized.recurrence === 'weekdays') return !['saturday', 'sunday'].includes(weekday)
  if (normalized.recurrence === 'weekends') return ['saturday', 'sunday'].includes(weekday)
  if (normalized.recurrence === 'selected_weekdays' || normalized.recurrence === 'weekly') {
    return normalized.daysOfWeek.includes(weekday)
  }
  return true
}

function statusForRoutine(routine, planState, dateText, nowDate) {
  const history = planState.history.filter((entry) => historyMatchesDate(entry, routine.id, dateText))
  const completed = history.find((entry) => entry.action === 'completed')
  if (completed) return { historyEntry: completed, status: 'done' }
  const snoozed = history
    .filter((entry) => entry.action === 'snoozed' && entry.snoozedUntil)
    .sort((first, second) => second.snoozedUntil.localeCompare(first.snoozedUntil))[0]
  if (snoozed && parseDateValue(snoozed.snoozedUntil) > nowDate) return { historyEntry: snoozed, status: 'snoozed' }
  const skipped = history.find((entry) => entry.action === 'skipped')
  if (skipped) return { historyEntry: skipped, status: 'skipped' }

  const scheduledAt = localDateAtTime(dateText, routine.targetTime)
  if (scheduledAt && scheduledAt < nowDate && getLocalDateString(nowDate) === dateText) {
    return { historyEntry: null, status: 'overdue' }
  }
  if (scheduledAt && getLocalDateString(nowDate) > dateText) return { historyEntry: null, status: 'missed' }
  return { historyEntry: null, status: 'pending' }
}

function buildPlanItem(routine, planState, dateText, nowDate) {
  const scheduledAtDate = localDateAtTime(dateText, routine.targetTime)
  const { historyEntry, status } = statusForRoutine(routine, planState, dateText, nowDate)

  return {
    category: routine.category,
    categoryLabel: categoryLabels[routine.category] || 'Egen',
    completedAt: historyEntry?.completedAt || '',
    id: `plan:${routine.id}:${dateText}`,
    missed: status === 'missed',
    reminderId: routine.reminderId,
    routineId: routine.id,
    scheduledAt: scheduledAtDate ? scheduledAtDate.toISOString() : '',
    skippedAt: historyEntry?.skippedAt || '',
    snoozedUntil: historyEntry?.snoozedUntil || '',
    source: routine.source,
    status,
    targetTime: routine.targetTime,
    title: routine.title,
  }
}

export function buildDailyRoutinePlan(input = {}, options = {}) {
  const nowDate = parseDateValue(options.now || new Date()) || new Date()
  const today = getLocalDateString(options.today || nowDate)
  const planState = normalizeRoutinePlanState(input.reminderState?.routinePlan || input.routinePlan, { now: nowDate.toISOString() })
  const routines = [
    ...buildRoutinesFromState(input, { now: nowDate.toISOString() }),
    ...planState.checklist.map((item) => normalizeDailyRoutine({
      ...item,
      id: `checklist:${item.id}`,
      recurrence: 'daily',
      sourceType: 'checklist',
      targetTime: '20:00',
    }, { now: nowDate.toISOString() })),
  ].filter(Boolean)
  const items = routines
    .filter((routine) => isRoutineScheduledOnDate(routine, today))
    .map((routine) => buildPlanItem(routine, planState, today, nowDate))
    .sort((first, second) => first.targetTime.localeCompare(second.targetTime) || first.title.localeCompare(second.title, 'sv-SE'))
  const counts = {
    done: items.filter((item) => item.status === 'done').length,
    missed: items.filter((item) => item.status === 'missed' || item.status === 'overdue').length,
    pending: items.filter((item) => item.status === 'pending').length,
    skipped: items.filter((item) => item.status === 'skipped').length,
    snoozed: items.filter((item) => item.status === 'snoozed').length,
    total: items.length,
  }

  return {
    counts,
    date: today,
    items,
    nextItem: items.find((item) => item.status === 'pending' || item.status === 'snoozed' || item.status === 'overdue') || null,
    planState,
    routines,
    summary: items.length
      ? `${counts.done}/${counts.total} punkter klara idag.`
      : 'Ingen daglig plan är aktiv ännu.',
    version: dailyRoutinePlanVersion,
  }
}

export function recordRoutineAction(reminderState = {}, action = {}, options = {}) {
  const now = safeIso(options.now || action.at, new Date().toISOString())
  const state = normalizeReminderState(reminderState, { now })
  const planState = normalizeRoutinePlanState(state.routinePlan, { now })
  const routineId = normalizeReminderText(action.routineId || (action.reminderId ? `reminder:${action.reminderId}` : ''), '', 120)
  const scheduledAt = safeIso(action.scheduledAt, now)
  const date = getLocalDateString(action.date || scheduledAt || now)
  const type = ['completed', 'skipped', 'snoozed', 'missed'].includes(action.action) ? action.action : 'completed'
  if (!routineId || !date) return state
  const dedupeKey = `${routineId}|${date}|${type}`
  const existing = planState.history.some((entry) => `${entry.routineId}|${entry.date}|${entry.action}` === dedupeKey)
  if (existing && type !== 'snoozed') return state
  const entry = normalizeRoutineHistoryEntry({
    action: type,
    at: now,
    completedAt: type === 'completed' ? now : '',
    date,
    id: `routine-${type}-${routineId}-${date}`,
    reminderId: action.reminderId,
    routineId,
    scheduledAt,
    skippedAt: type === 'skipped' ? now : '',
    snoozedAt: type === 'snoozed' ? now : '',
    snoozedUntil: type === 'snoozed' ? action.snoozedUntil : '',
    source: action.source || 'user',
  }, { now })

  return {
    ...state,
    routinePlan: {
      ...planState,
      history: [...planState.history.filter((item) => !(item.routineId === routineId && item.date === date && item.action === type)), entry]
        .filter(Boolean)
        .slice(-routineHistoryLimit),
    },
    updatedAt: now,
  }
}

export function upsertChecklistItem(reminderState = {}, item = {}, options = {}) {
  const now = safeIso(options.now, new Date().toISOString())
  const state = normalizeReminderState(reminderState, { now })
  const planState = normalizeRoutinePlanState(state.routinePlan, { now })
  const normalized = normalizeRoutineChecklistItem({
    ...item,
    updatedAt: now,
  }, { now })
  if (!normalized) return state

  return {
    ...state,
    routinePlan: {
      ...planState,
      checklist: [
        ...planState.checklist.filter((entry) => entry.id !== normalized.id),
        normalized,
      ].sort((first, second) => first.order - second.order || first.title.localeCompare(second.title, 'sv-SE')),
    },
    updatedAt: now,
  }
}

export function toggleChecklistItem(reminderState = {}, itemId, enabled, options = {}) {
  const now = safeIso(options.now, new Date().toISOString())
  const state = normalizeReminderState(reminderState, { now })
  const planState = normalizeRoutinePlanState(state.routinePlan, { now })

  return {
    ...state,
    routinePlan: {
      ...planState,
      checklist: planState.checklist.map((item) =>
        item.id === itemId ? { ...item, enabled: enabled !== false, updatedAt: now } : item),
    },
    updatedAt: now,
  }
}

export function buildRoutineStreak(routineId, history = [], options = {}) {
  const today = getLocalDateString(options.today || options.now || new Date())
  const range = getLocalDateRange(Math.max(1, Math.min(90, options.days || 30)), today)
  const completedDates = new Set(
    safeArray(history)
      .map((entry) => normalizeRoutineHistoryEntry(entry, options))
      .filter((entry) => entry?.routineId === routineId && entry.action === 'completed')
      .map((entry) => entry.date),
  )
  let current = 0
  let longest = 0
  let cursor = today

  while (cursor && cursor >= range.start) {
    if (!completedDates.has(cursor)) break
    current += 1
    cursor = getLocalDateString(addLocalDays(cursor, -1))
  }

  let running = 0
  for (let date = range.start; date <= range.end; date = getLocalDateString(addLocalDays(date, 1))) {
    if (completedDates.has(date)) {
      running += 1
      longest = Math.max(longest, running)
    } else {
      running = 0
    }
    if (date === range.end) break
  }

  return {
    completedDays: completedDates.size,
    current,
    longest,
    message: current > 0 ? `${current} dagar i rad` : 'Redo att börja om lugnt',
  }
}

export function buildRoutineCoachContext(input = {}, options = {}) {
  const plan = buildDailyRoutinePlan(input, options)
  const history = plan.planState.history
  const weekStart = getLocalDateString(addLocalDays(plan.date, -6))
  const recentCompleted = history.filter((entry) =>
    entry.action === 'completed' && getLocalCalendarDayDiff(weekStart, entry.date) >= 0 && getLocalCalendarDayDiff(entry.date, plan.date) >= 0)
  const recentSkipped = history.filter((entry) =>
    entry.action === 'skipped' && getLocalCalendarDayDiff(weekStart, entry.date) >= 0 && getLocalCalendarDayDiff(entry.date, plan.date) >= 0)

  return {
    completed: recentCompleted.length,
    completionStatus: plan.counts.total ? `${plan.counts.done}/${plan.counts.total}` : 'missing',
    planSummary: plan.summary,
    provenance: {
      completed: recentCompleted.length ? 'completed' : 'missing',
      routines: plan.routines.length ? 'user_entered' : 'missing',
      skipped: recentSkipped.length ? 'skipped' : 'missing',
    },
    skipped: recentSkipped.length,
    today: {
      done: plan.counts.done,
      missed: plan.counts.missed,
      pending: plan.counts.pending,
      snoozed: plan.counts.snoozed,
      total: plan.counts.total,
    },
  }
}

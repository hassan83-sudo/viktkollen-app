import { getUnifiedWeightFacts } from './healthCalculations.js'
import { addLocalDays, getEntryLocalDate, getLocalDateRange, getLocalDateString, isLocalDateInRange } from './localDate.js'
import { calculateDailyNutritionSummary } from './nutrition/dailyNutritionSummary.js'
import { filterActualMealsForDate } from './nutrition/mealDateUtils.js'
import { normalizeNutritionGoals, parseProteinGoal } from './nutrition/nutritionGoals.js'
import { normalizeCheckInMetrics } from './checkInNormalization.js'

export const goalsHabitsStorageKey = 'viktkollen.goalsHabits.v2'
export const goalsHabitsSchemaVersion = 2
export const goalCategories = ['weight', 'protein', 'meal_logging', 'steps', 'workout', 'check_in', 'custom', 'weekly_focus']
export const habitCategories = ['weight', 'meal_logging', 'protein', 'steps', 'workout', 'check_in', 'custom']
export const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const historyLimit = 160
const maxActiveGoals = 12

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function normalizeText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 160)
}

function normalizeLongText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 360)
}

function parseNumber(value, fallback = null) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function createStableId(prefix, seed = '') {
  const text = `${prefix}:${seed || Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    .toLocaleLowerCase('sv-SE')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return text.slice(0, 90)
}

function normalizeReminder(value = {}) {
  if (!isObject(value)) return null
  const days = safeArray(value.days).filter((day) => weekDays.includes(day))

  return {
    days: days.length ? days : [...weekDays],
    enabled: value.enabled === true,
    id: normalizeText(value.id) || createStableId('reminder', `${value.linkedType || 'habit'}-${value.linkedId || value.time}`),
    linkedId: normalizeText(value.linkedId),
    linkedType: ['goal', 'habit', 'weekly_focus'].includes(value.linkedType) ? value.linkedType : 'habit',
    paused: value.paused === true,
    time: /^\d{2}:\d{2}$/.test(String(value.time || '')) ? value.time : '09:00',
  }
}

function normalizeHistoryEvent(value = {}) {
  if (!isObject(value)) return null

  return {
    at: value.at || new Date().toISOString(),
    detail: normalizeLongText(value.detail),
    field: normalizeText(value.field),
    id: normalizeText(value.id) || createStableId('event', `${value.type}-${value.at || Date.now()}`),
    itemId: normalizeText(value.itemId),
    itemTitle: normalizeText(value.itemTitle),
    itemType: ['goal', 'habit', 'weekly_focus', 'state'].includes(value.itemType) ? value.itemType : 'state',
    type: normalizeText(value.type, 'updated'),
  }
}

function isUnsafeText(value) {
  const text = normalizeText(value).toLocaleLowerCase('sv-SE')
  return ['straff', 'misslyck', 'svält', 'hoppa över måltid', 'dum', 'värdelös']
    .some((keyword) => text.includes(keyword))
}

function validateGoalDraft(draft = {}, currentState = {}) {
  const category = goalCategories.includes(draft.category) ? draft.category : 'custom'
  const target = parseNumber(draft.target)
  const activeGoalCount = safeArray(currentState.goals).filter((goal) => goal.status === 'active').length

  if (isUnsafeText(draft.title) || isUnsafeText(draft.description)) {
    return { ok: false, message: 'Formulera målet neutralt och utan straffande ord.' }
  }
  if (activeGoalCount >= maxActiveGoals && draft.status !== 'archived') {
    return { ok: false, message: 'Du har redan många aktiva mål. Arkivera något eller välj ett mindre fokus.' }
  }
  if (category === 'weight' && target !== null && (target < 35 || target > 300)) {
    return { ok: false, message: 'Välj ett rimligare viktmål eller använd profilen som källa.' }
  }
  if (category === 'protein' && target !== null && (target < 20 || target > 300)) {
    return { ok: false, message: 'Välj ett proteinmål inom en trygg daglig nivå.' }
  }
  if (category === 'steps' && target !== null && (target < 500 || target > 50000)) {
    return { ok: false, message: 'Välj ett stegmål som är realistiskt att upprepa.' }
  }

  return { ok: true, message: '' }
}

function validateHabitDraft(draft = {}) {
  if (isUnsafeText(draft.title)) {
    return { ok: false, message: 'Formulera vanan neutralt och utan skuldbeläggning.' }
  }
  if (draft.category === 'workout' && Number(draft.targetCount) > 6 && safeArray(draft.activeDays).length >= 7) {
    return { ok: false, message: 'Lägg gärna in minst en vilodag för träningsvanor.' }
  }

  return { ok: true, message: '' }
}

function startOfWeek(dateText) {
  const date = new Date(`${dateText}T12:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return getLocalDateString(date)
}

function getDateWeekDay(dateText) {
  return weekDays[(new Date(`${dateText}T12:00:00`).getDay() + 6) % 7]
}

function dateRange(start, end) {
  const diff = Math.max(0, Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000))
  return Array.from({ length: diff + 1 }, (_, index) => getLocalDateString(addLocalDays(start, index)))
}

export function normalizeGoal(goal = {}, options = {}) {
  const category = goalCategories.includes(goal.category) ? goal.category : 'custom'
  const createdAt = goal.createdAt || options.now || new Date().toISOString()
  const status = ['active', 'paused', 'archived', 'completed'].includes(goal.status) ? goal.status : 'active'
  const target = parseNumber(goal.target)

  if (category !== 'custom' && target !== null && target <= 0) return null
  if (category === 'weight' && target !== null && (target < 35 || target > 300)) return null
  if (category === 'protein' && target !== null && (target < 20 || target > 300)) return null
  if (category === 'steps' && target !== null && (target < 500 || target > 50000)) return null

  return {
    archivedAt: goal.archivedAt || '',
    category,
    completedAt: goal.completedAt || '',
    createdAt,
    description: normalizeText(goal.description),
    id: normalizeText(goal.id) || createStableId('goal', `${category}-${goal.title || createdAt}`),
    linkedDataSource: normalizeText(goal.linkedDataSource || category),
    period: ['day', 'week', 'month', 'once'].includes(goal.period) ? goal.period : 'week',
    progressMode: ['automatic', 'manual', 'hybrid'].includes(goal.progressMode) ? goal.progressMode : 'automatic',
    safetyCategory: normalizeText(goal.safetyCategory || 'standard'),
    source: normalizeText(goal.source || 'user'),
    startDate: getLocalDateString(goal.startDate || createdAt),
    status,
    target,
    targetDate: goal.targetDate ? getLocalDateString(goal.targetDate) : '',
    title: normalizeText(goal.title, 'Nytt mål'),
    type: normalizeText(goal.type || category),
    unit: normalizeText(goal.unit || defaultUnitForCategory(category)),
    updatedAt: goal.updatedAt || createdAt,
    needsReview: goal.needsReview === true || validateGoalDraft(goal).ok === false,
  }
}

export function normalizeHabit(habit = {}, options = {}) {
  const category = habitCategories.includes(habit.category) ? habit.category : 'custom'
  const createdAt = habit.createdAt || options.now || new Date().toISOString()
  const trackingMode = ['automatic', 'manual', 'hybrid'].includes(habit.trackingMode) ? habit.trackingMode : 'automatic'
  const targetCount = Math.max(1, Math.min(31, Math.round(parseNumber(habit.targetCount, 1))))
  const activeDays = safeArray(habit.activeDays).filter((day) => weekDays.includes(day))

  return {
    activeDays: activeDays.length ? activeDays : [...weekDays],
    archivedAt: habit.archivedAt || '',
    category,
    createdAt,
    frequency: ['daily', 'weekly'].includes(habit.frequency) ? habit.frequency : 'daily',
    id: normalizeText(habit.id) || createStableId('habit', `${category}-${habit.title || createdAt}`),
    linkedDataSource: normalizeText(habit.linkedDataSource || category),
    pausedAt: habit.pausedAt || '',
    reminder: normalizeReminder(habit.reminder),
    reminderReference: normalizeText(habit.reminderReference),
    startDate: getLocalDateString(habit.startDate || createdAt),
    status: ['active', 'paused', 'archived'].includes(habit.status) ? habit.status : 'active',
    targetCount,
    title: normalizeText(habit.title, 'Ny vana'),
    trackingMode,
    updatedAt: habit.updatedAt || createdAt,
    needsReview: habit.needsReview === true || validateHabitDraft(habit).ok === false,
  }
}

function defaultUnitForCategory(category) {
  if (category === 'weight') return 'kg'
  if (category === 'protein') return 'g'
  if (category === 'steps') return 'steg'
  if (category === 'workout' || category === 'meal_logging' || category === 'check_in') return 'dagar'
  return 'gånger'
}

export function normalizeGoalsHabitsState(value = {}) {
  const source = isObject(value) ? value : {}

  return {
    completions: safeArray(source.completions)
      .filter(isObject)
      .map((completion) => ({
        completedAt: completion.completedAt || new Date().toISOString(),
        date: getLocalDateString(completion.date || completion.completedAt),
        habitId: normalizeText(completion.habitId),
        id: normalizeText(completion.id) || createStableId('completion', `${completion.habitId}-${completion.date}`),
      }))
      .filter((completion) => completion.habitId && completion.date),
    goals: safeArray(source.goals).map(normalizeGoal).filter(Boolean),
    habits: safeArray(source.habits).map(normalizeHabit).filter(Boolean),
    history: safeArray(source.history).map(normalizeHistoryEvent).filter(Boolean).slice(-historyLimit),
    reminders: safeArray(source.reminders).map(normalizeReminder).filter(Boolean).slice(0, 80),
    schemaVersion: goalsHabitsSchemaVersion,
    weeklyFocus: safeArray(source.weeklyFocus)
      .filter(isObject)
      .map((focus) => ({
        acceptedAt: focus.acceptedAt || '',
        archivedAt: focus.archivedAt || '',
        createdAt: focus.createdAt || new Date().toISOString(),
        id: normalizeText(focus.id) || createStableId('focus', focus.title),
        action: normalizeLongText(focus.action || focus.reason, 'Välj ett litet steg att upprepa den här veckan.'),
        completedAt: focus.completedAt || '',
        declinedAt: focus.declinedAt || '',
        linkedInsightId: normalizeText(focus.linkedInsightId),
        linkedItemId: normalizeText(focus.linkedItemId),
        linkedItemType: ['goal', 'habit'].includes(focus.linkedItemType) ? focus.linkedItemType : '',
        movedFromWeekStart: focus.movedFromWeekStart ? getLocalDateString(focus.movedFromWeekStart) : '',
        order: Math.max(0, Math.min(99, Math.round(parseNumber(focus.order, 0)))),
        reason: normalizeText(focus.reason),
        status: ['suggested', 'active', 'archived', 'completed'].includes(focus.status) ? focus.status : 'suggested',
        title: normalizeText(focus.title, 'Veckofokus'),
        weekStart: getLocalDateString(focus.weekStart || startOfWeek(new Date().toISOString())),
      }))
      .slice(0, 50),
  }
}

function addHistory(state, event = {}, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const now = options.now || new Date().toISOString()
  const nextEvent = normalizeHistoryEvent({
    ...event,
    at: event.at || now,
    id: event.id || createStableId('event', `${event.itemId}-${event.type}-${now}`),
  })
  if (!nextEvent) return normalized

  return {
    ...normalized,
    history: [...normalized.history, nextEvent].slice(-historyLimit),
  }
}

function getItemTitle(item, fallback = 'Objekt') {
  return normalizeText(item?.title, fallback)
}

export function createGoal(draft = {}, options = {}) {
  const now = options.now || new Date().toISOString()
  const validation = validateGoalDraft(draft, options.state)
  if (!validation.ok) return null
  return normalizeGoal({
    ...draft,
    createdAt: now,
    id: draft.id || createStableId('goal', `${draft.category}-${draft.title}-${now}`),
    updatedAt: now,
  }, { now })
}

export function createHabit(draft = {}, options = {}) {
  const now = options.now || new Date().toISOString()
  const validation = validateHabitDraft(draft)
  if (!validation.ok) return null
  return normalizeHabit({
    ...draft,
    createdAt: now,
    id: draft.id || createStableId('habit', `${draft.category}-${draft.title}-${now}`),
    updatedAt: now,
  }, { now })
}

export function createDefaultHabits(options = {}) {
  const now = options.now || new Date().toISOString()
  return [
    createHabit({ category: 'meal_logging', linkedDataSource: 'meals', title: 'Logga minst en måltid', trackingMode: 'automatic' }, { now }),
    createHabit({ category: 'check_in', linkedDataSource: 'checkIn', title: 'Gör dagens check-in', trackingMode: 'automatic' }, { now }),
    createHabit({ category: 'steps', linkedDataSource: 'checkIn.steps', targetCount: 7000, title: 'Nå stegmålet', trackingMode: 'automatic' }, { now }),
  ]
}

function hasManualCompletion(habit, date, state) {
  return state.completions.some((completion) => completion.habitId === habit.id && completion.date === date)
}

function hasWeightOnDate(weights, date) {
  return safeArray(weights).some((entry) => getEntryLocalDate(entry) === date)
}

function hasMealOnDate(meals, date) {
  return filterActualMealsForDate(meals, date).length > 0
}

function hasCheckInOnDate(checkIns, date) {
  return safeArray(checkIns).some((entry) => getEntryLocalDate(entry) === date)
}

function getCheckInForDate(checkIns, date, fallbackDate = '') {
  return safeArray(checkIns).filter((entry) => {
    const entryDate = getEntryLocalDate(entry)
    return entryDate === date || (!entryDate && fallbackDate === date)
  }).at(-1) || null
}

function automaticHabitDone(habit, date, data) {
  const checkIns = safeArray(data.checkIns?.length ? data.checkIns : data.checkIn ? [data.checkIn] : [])
  const checkIn = getCheckInForDate(checkIns, date, data.analysisDate)
  const metrics = checkIn ? normalizeCheckInMetrics(checkIn) : null

  if (habit.category === 'weight') return hasWeightOnDate(data.weights, date)
  if (habit.category === 'meal_logging') return hasMealOnDate(data.meals, date)
  if (habit.category === 'check_in') return hasCheckInOnDate(checkIns, date) || Boolean(checkIn && data.analysisDate === date)
  if (habit.category === 'workout') return metrics?.workout.completed === true
  if (habit.category === 'steps') return Number(metrics?.steps) >= habit.targetCount
  if (habit.category === 'protein') {
    const goals = normalizeNutritionGoals(data.nutritionGoals)
    const proteinGoal = parseProteinGoal(goals.protein)
    if (!proteinGoal) return false
    return calculateDailyNutritionSummary(data.meals, date, { nutritionGoals: goals }).totals.protein >= proteinGoal.target
  }

  return false
}

export function calculateHabitDayStatus(habit, date, data = {}, state = {}) {
  const normalized = normalizeHabit(habit)
  if (!normalized || normalized.status === 'archived') return { done: false, scheduled: false, skipped: true }

  const day = getDateWeekDay(date)
  const scheduled = normalized.activeDays.includes(day)
  const paused = normalized.status === 'paused'
  if (!scheduled || paused) return { done: false, paused, scheduled, skipped: true }

  const manualDone = hasManualCompletion(normalized, date, state)
  const autoDone = normalized.trackingMode !== 'manual' && automaticHabitDone(normalized, date, data)

  return {
    done: manualDone || autoDone,
    manualDone,
    automaticDone: autoDone,
    paused: false,
    scheduled,
    skipped: false,
  }
}

export function calculateHabitStreak(habit, data = {}, state = {}, options = {}) {
  const today = getLocalDateString(options.analysisDate || new Date())
  const start = getLocalDateString(habit.startDate || habit.createdAt || addLocalDays(today, -30))
  const dates = dateRange(start, today)
  let longest = 0
  let running = 0
  let latestCompleted = ''

  dates.forEach((date) => {
    const status = calculateHabitDayStatus(habit, date, data, state)
    if (!status.scheduled || status.paused) return
    if (status.done) {
      running += 1
      latestCompleted = date
    } else if (date !== today) {
      running = 0
    }
    longest = Math.max(longest, running)
  })

  return {
    completedThisWeek: dates
      .filter((date) => isLocalDateInRange(date, getLocalDateRange(7, today)))
      .filter((date) => calculateHabitDayStatus(habit, date, data, state).done).length,
    current: running,
    latestCompleted,
    longest,
    message: running > 0 ? `${running} planerade dagar i rad` : 'Redo att starta om i lugn takt',
  }
}

export function calculateGoalProgress(goal, data = {}, options = {}) {
  const normalized = normalizeGoal(goal)
  const today = getLocalDateString(options.analysisDate || new Date())
  if (!normalized || normalized.status === 'archived') return null

  if (normalized.category === 'weight') {
    const facts = getUnifiedWeightFacts({ goalWeight: data.profile?.goalWeight ?? normalized.target, profile: data.profile, weights: data.weights })
    return {
      current: facts.latestWeight,
      label: facts.goalRemaining === null ? 'Saknar viktdata' : `${Math.abs(facts.goalRemaining).toLocaleString('sv-SE')} kg kvar`,
      percent: facts.completePercent ?? 0,
      target: facts.goalWeight,
    }
  }

  if (normalized.category === 'protein') {
    const week = getLocalDateRange(7, today)
    const dates = dateRange(week.start, week.end)
    const reached = dates.filter((date) => {
      const summary = calculateDailyNutritionSummary(data.meals, date, { nutritionGoals: data.nutritionGoals })
      return summary.totals.protein >= normalized.target
    }).length

    return { current: reached, label: `${reached}/7 dagar`, percent: Math.round((reached / 7) * 100), target: 7 }
  }

  return {
    current: 0,
    label: 'Följ via vana eller check-in',
    percent: 0,
    target: normalized.target,
  }
}

export function buildGoalsHabitsViewModel(state, data = {}, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const analysisDate = getLocalDateString(options.analysisDate || new Date())
  const scopedData = { ...data, analysisDate }
  const activeHabits = normalized.habits.filter((habit) => habit.status !== 'archived')
  const todayHabits = activeHabits.map((habit) => ({
    habit,
    status: calculateHabitDayStatus(habit, analysisDate, scopedData, normalized),
    streak: calculateHabitStreak(habit, scopedData, normalized, { analysisDate }),
  }))
  const activeGoals = normalized.goals
    .filter((goal) => goal.status !== 'archived')
    .map((goal) => ({ goal, progress: calculateGoalProgress(goal, data, { analysisDate }) }))
  const weekStart = startOfWeek(analysisDate)
  const activeFocus = normalized.weeklyFocus
    .filter((focus) => focus.weekStart === weekStart && focus.status === 'active')
    .sort((first, second) => first.order - second.order)
    .slice(0, 3)
  const archivedGoals = normalized.goals.filter((goal) => goal.status === 'archived' || goal.status === 'completed')
  const archivedHabits = normalized.habits.filter((habit) => habit.status === 'archived')
  const pausedHabits = normalized.habits.filter((habit) => habit.status === 'paused')

  return {
    activeFocus,
    activeGoals,
    analysisDate,
    archivedGoals,
    archivedHabits,
    archivedCount: normalized.goals.filter((goal) => goal.status === 'archived').length + normalized.habits.filter((habit) => habit.status === 'archived').length,
    completionRate: todayHabits.length ? Math.round((todayHabits.filter((item) => item.status.done).length / todayHabits.length) * 100) : 0,
    empty: !activeGoals.length && !todayHabits.length && !activeFocus.length,
    pausedCount: normalized.habits.filter((habit) => habit.status === 'paused').length,
    pausedHabits,
    recentHistory: normalized.history.slice(-8).reverse(),
    state: normalized,
    todayHabits,
    todaySummary: {
      automaticDone: todayHabits.filter((item) => item.status.automaticDone).length,
      done: todayHabits.filter((item) => item.status.done).length,
      manualDone: todayHabits.filter((item) => item.status.manualDone).length,
      pending: todayHabits.filter((item) => !item.status.done && !item.status.skipped).length,
      scheduled: todayHabits.filter((item) => item.status.scheduled).length,
    },
    weekStart,
  }
}

export function markManualHabitDone(state, habitId, date = new Date(), options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const targetDate = getLocalDateString(date)
  const existing = normalized.completions.some((completion) => completion.habitId === habitId && completion.date === targetDate)
  if (existing) return normalized
  const habit = normalized.habits.find((item) => item.id === habitId)

  return addHistory({
    ...normalized,
    completions: [
      ...normalized.completions,
      {
        completedAt: options.now || new Date().toISOString(),
        date: targetDate,
        habitId,
        id: createStableId('completion', `${habitId}-${targetDate}`),
      },
    ],
  }, {
    detail: `${getItemTitle(habit, 'Vanan')} markerades klar ${targetDate}.`,
    itemId: habitId,
    itemTitle: getItemTitle(habit, 'Vana'),
    itemType: 'habit',
    type: 'manual_completion',
  }, options)
}

export function undoManualHabitDone(state, habitId, date = new Date(), options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const targetDate = getLocalDateString(date)
  const habit = normalized.habits.find((item) => item.id === habitId)
  const completions = normalized.completions.filter((completion) =>
    !(completion.habitId === habitId && completion.date === targetDate),
  )
  if (completions.length === normalized.completions.length) return normalized

  return addHistory({
    ...normalized,
    completions,
  }, {
    detail: `${getItemTitle(habit, 'Vanan')} ångrades för ${targetDate}.`,
    itemId: habitId,
    itemTitle: getItemTitle(habit, 'Vana'),
    itemType: 'habit',
    type: 'manual_completion_undone',
  }, options)
}

export function updateGoalsHabitsItemStatus(state, kind, id, status, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const now = options.now || new Date().toISOString()
  const field = kind === 'goal' ? 'goals' : 'habits'
  const before = normalized[field].find((item) => item.id === id)

  return addHistory({
    ...normalized,
    [field]: normalized[field].map((item) =>
      item.id === id
        ? {
          ...item,
          archivedAt: status === 'archived' ? now : status === 'active' ? '' : item.archivedAt,
          completedAt: kind === 'goal' && status === 'completed' ? now : item.completedAt,
          pausedAt: status === 'paused' ? now : '',
          reminder: item.reminder
            ? { ...item.reminder, enabled: status === 'active' ? item.reminder.enabled : false, paused: status !== 'active' }
            : item.reminder,
          status,
          updatedAt: now,
        }
        : item),
    reminders: normalized.reminders.map((reminder) =>
      reminder.linkedId === id && reminder.linkedType === kind
        ? { ...reminder, enabled: status === 'active' ? reminder.enabled : false, paused: status !== 'active' }
        : reminder),
  }, {
    detail: `${getItemTitle(before, kind === 'goal' ? 'Målet' : 'Vanan')} ändrade status till ${status}.`,
    itemId: id,
    itemTitle: getItemTitle(before, kind === 'goal' ? 'Mål' : 'Vana'),
    itemType: kind,
    type: status,
  }, options)
}

export function acceptWeeklyFocus(state, draft = {}, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const now = options.now || new Date().toISOString()
  const weekStart = getLocalDateString(draft.weekStart || startOfWeek(options.analysisDate || now))
  const activeCount = normalized.weeklyFocus.filter((focus) => focus.weekStart === weekStart && focus.status === 'active').length
  if (activeCount >= 3) return normalized

  return {
    ...normalized,
    weeklyFocus: [
      ...normalized.weeklyFocus,
      {
        acceptedAt: now,
        action: normalizeLongText(draft.action || draft.reason, 'Välj ett litet steg att upprepa den här veckan.'),
        archivedAt: '',
        completedAt: '',
        createdAt: now,
        declinedAt: '',
        id: createStableId('focus', `${draft.title}-${weekStart}`),
        linkedInsightId: normalizeText(draft.linkedInsightId),
        linkedItemId: normalizeText(draft.linkedItemId),
        linkedItemType: ['goal', 'habit'].includes(draft.linkedItemType) ? draft.linkedItemType : '',
        movedFromWeekStart: '',
        order: activeCount,
        reason: normalizeText(draft.reason, 'Bygger på dina senaste insikter.'),
        status: 'active',
        title: normalizeText(draft.title, 'Veckofokus'),
        weekStart,
      },
    ],
  }
}

export function updateGoal(state, id, patch = {}, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const current = normalized.goals.find((goal) => goal.id === id)
  if (!current) return { error: 'Målet hittades inte.', state: normalized }
  const validation = validateGoalDraft({ ...current, ...patch }, { goals: normalized.goals.filter((goal) => goal.id !== id) })
  if (!validation.ok) return { error: validation.message, state: normalized }
  const now = options.now || new Date().toISOString()
  const updated = normalizeGoal({
    ...current,
    ...patch,
    createdAt: current.createdAt,
    id: current.id,
    updatedAt: now,
  }, { now })
  if (!updated) return { error: 'Målet kunde inte sparas.', state: normalized }

  return {
    error: '',
    state: addHistory({
      ...normalized,
      goals: normalized.goals.map((goal) => goal.id === id ? updated : goal),
    }, {
      detail: `${current.title} redigerades.`,
      itemId: id,
      itemTitle: updated.title,
      itemType: 'goal',
      type: 'edited',
    }, options),
  }
}

export function updateHabit(state, id, patch = {}, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const current = normalized.habits.find((habit) => habit.id === id)
  if (!current) return { error: 'Vanan hittades inte.', state: normalized }
  const validation = validateHabitDraft({ ...current, ...patch })
  if (!validation.ok) return { error: validation.message, state: normalized }
  const now = options.now || new Date().toISOString()
  const updated = normalizeHabit({
    ...current,
    ...patch,
    createdAt: current.createdAt,
    id: current.id,
    updatedAt: now,
  }, { now })
  if (!updated) return { error: 'Vanan kunde inte sparas.', state: normalized }

  return {
    error: '',
    state: addHistory({
      ...normalized,
      habits: normalized.habits.map((habit) => habit.id === id ? updated : habit),
    }, {
      detail: `${current.title} redigerades.`,
      field: patch.frequency && patch.frequency !== current.frequency ? 'frequency' : '',
      itemId: id,
      itemTitle: updated.title,
      itemType: 'habit',
      type: 'edited',
    }, options),
  }
}

export function restoreGoalsHabitsItem(state, kind, id, options = {}) {
  return updateGoalsHabitsItemStatus(state, kind, id, 'active', options)
}

export function deleteArchivedGoalsHabitsItem(state, kind, id, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const field = kind === 'goal' ? 'goals' : 'habits'
  const item = normalized[field].find((entry) => entry.id === id)
  if (!item || item.status !== 'archived') return normalized

  return addHistory({
    ...normalized,
    [field]: normalized[field].filter((entry) => entry.id !== id),
    completions: kind === 'habit' ? normalized.completions.filter((entry) => entry.habitId !== id) : normalized.completions,
    reminders: normalized.reminders.filter((reminder) => !(reminder.linkedType === kind && reminder.linkedId === id)),
  }, {
    detail: `${item.title} togs bort permanent efter arkivering.`,
    itemId: id,
    itemTitle: item.title,
    itemType: kind,
    type: 'deleted',
  }, options)
}

export function configureGoalsHabitsReminder(state, kind, id, reminderDraft = {}, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const field = kind === 'goal' ? 'goals' : 'habits'
  const item = normalized[field].find((entry) => entry.id === id)
  if (!item) return normalized
  const reminder = normalizeReminder({ ...reminderDraft, linkedId: id, linkedType: kind })
  if (!reminder) return normalized

  return addHistory({
    ...normalized,
    [field]: normalized[field].map((entry) =>
      entry.id === id
        ? { ...entry, reminder, reminderReference: reminder.id, updatedAt: options.now || new Date().toISOString() }
        : entry),
    reminders: [
      ...normalized.reminders.filter((entry) => !(entry.linkedId === id && entry.linkedType === kind)),
      reminder,
    ],
  }, {
    detail: `Påminnelse ${reminder.enabled ? 'aktiverades' : 'sparades avstängd'} för ${item.title}.`,
    itemId: id,
    itemTitle: item.title,
    itemType: kind,
    type: 'reminder_updated',
  }, options)
}

export function updateWeeklyFocus(state, id, patch = {}, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const current = normalized.weeklyFocus.find((focus) => focus.id === id)
  if (!current) return normalized
  const now = options.now || new Date().toISOString()
  const nextFocus = {
    ...current,
    action: normalizeLongText(patch.action ?? current.action),
    archivedAt: patch.status === 'archived' ? now : current.archivedAt,
    completedAt: patch.status === 'completed' ? now : current.completedAt,
    declinedAt: patch.status === 'archived' && patch.declined ? now : current.declinedAt,
    linkedItemId: normalizeText(patch.linkedItemId ?? current.linkedItemId),
    linkedItemType: ['goal', 'habit'].includes(patch.linkedItemType) ? patch.linkedItemType : current.linkedItemType,
    order: Number.isFinite(Number(patch.order)) ? Math.max(0, Math.min(99, Math.round(Number(patch.order)))) : current.order,
    reason: normalizeText(patch.reason ?? current.reason),
    status: ['active', 'archived', 'completed', 'suggested'].includes(patch.status) ? patch.status : current.status,
    title: normalizeText(patch.title ?? current.title, current.title),
  }

  return addHistory({
    ...normalized,
    weeklyFocus: normalized.weeklyFocus.map((focus) => focus.id === id ? nextFocus : focus),
  }, {
    detail: `${current.title} uppdaterades.`,
    itemId: id,
    itemTitle: nextFocus.title,
    itemType: 'weekly_focus',
    type: patch.status || 'focus_edited',
  }, options)
}

export function moveWeeklyFocusToNextWeek(state, id, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const current = normalized.weeklyFocus.find((focus) => focus.id === id)
  if (!current) return normalized
  const nextWeekStart = getLocalDateString(addLocalDays(current.weekStart, 7))
  const activeCount = normalized.weeklyFocus.filter((focus) => focus.weekStart === nextWeekStart && focus.status === 'active').length
  if (activeCount >= 3) return normalized
  const now = options.now || new Date().toISOString()

  return addHistory({
    ...normalized,
    weeklyFocus: [
      ...normalized.weeklyFocus.map((focus) => focus.id === id ? { ...focus, archivedAt: now, status: 'archived' } : focus),
      {
        ...current,
        acceptedAt: now,
        archivedAt: '',
        completedAt: '',
        createdAt: now,
        declinedAt: '',
        id: createStableId('focus', `${current.title}-${nextWeekStart}`),
        movedFromWeekStart: current.weekStart,
        order: activeCount,
        status: 'active',
        weekStart: nextWeekStart,
      },
    ],
  }, {
    detail: `${current.title} flyttades till nästa vecka.`,
    itemId: id,
    itemTitle: current.title,
    itemType: 'weekly_focus',
    type: 'focus_moved',
  }, options)
}

export function buildGoalsHabitsReportSummary(state, data = {}, options = {}) {
  const model = buildGoalsHabitsViewModel(state, data, options)
  const activeHabits = model.todayHabits.filter((item) => item.habit.status === 'active')
  const completedFocus = model.state.weeklyFocus.filter((focus) => focus.status === 'completed')
  const longestStreak = activeHabits.reduce((best, item) => Math.max(best, item.streak.longest), 0)

  return {
    activeFocus: model.activeFocus.map((focus) => focus.title),
    activeGoals: model.activeGoals.map(({ goal, progress }) => ({
      progress: progress?.label || 'Följs när data finns',
      title: goal.title,
    })),
    completedFocusCount: completedFocus.length,
    consistencyPercent: model.completionRate,
    longestStreak,
    manualHabitCount: activeHabits.filter((item) => item.habit.trackingMode === 'manual').length,
    nextStep: model.todaySummary.pending > 0
      ? 'Välj en väntande vana och gör den så liten att den passar idag.'
      : 'Behåll rytmen med samma lilla nästa steg.',
    positiveProgress: model.completionRate > 0
      ? `${model.completionRate}% av dagens planerade vanor är klara.`
      : 'Det finns utrymme att starta mjukt med en liten vana.',
    summary: model.empty
      ? 'Inga extra mål eller vanor är aktiva ännu.'
      : `${model.activeGoals.length} aktiva mål, ${activeHabits.length} vanor och ${model.activeFocus.length} veckofokus.`,
  }
}

export function buildGoalsHabitsDashboardSummary(state, data = {}, options = {}) {
  const model = buildGoalsHabitsViewModel(state, data, options)
  if (model.empty) return null

  return {
    completionRate: model.completionRate,
    focusTitle: model.activeFocus[0]?.title || '',
    nearestGoal: model.activeGoals[0]?.goal.title || '',
    pendingHabits: model.todaySummary.pending,
    title: 'Mål & vanor',
  }
}

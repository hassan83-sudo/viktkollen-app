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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function normalizeText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 160)
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
    reminderReference: normalizeText(habit.reminderReference),
    startDate: getLocalDateString(habit.startDate || createdAt),
    status: ['active', 'paused', 'archived'].includes(habit.status) ? habit.status : 'active',
    targetCount,
    title: normalizeText(habit.title, 'Ny vana'),
    trackingMode,
    updatedAt: habit.updatedAt || createdAt,
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
    schemaVersion: goalsHabitsSchemaVersion,
    weeklyFocus: safeArray(source.weeklyFocus)
      .filter(isObject)
      .map((focus) => ({
        acceptedAt: focus.acceptedAt || '',
        archivedAt: focus.archivedAt || '',
        createdAt: focus.createdAt || new Date().toISOString(),
        id: normalizeText(focus.id) || createStableId('focus', focus.title),
        linkedInsightId: normalizeText(focus.linkedInsightId),
        reason: normalizeText(focus.reason),
        status: ['suggested', 'active', 'archived', 'completed'].includes(focus.status) ? focus.status : 'suggested',
        title: normalizeText(focus.title, 'Veckofokus'),
        weekStart: getLocalDateString(focus.weekStart || startOfWeek(new Date().toISOString())),
      }))
      .slice(0, 50),
  }
}

export function createGoal(draft = {}, options = {}) {
  const now = options.now || new Date().toISOString()
  return normalizeGoal({
    ...draft,
    createdAt: now,
    id: draft.id || createStableId('goal', `${draft.category}-${draft.title}-${now}`),
    updatedAt: now,
  }, { now })
}

export function createHabit(draft = {}, options = {}) {
  const now = options.now || new Date().toISOString()
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
    .slice(0, 3)

  return {
    activeFocus,
    activeGoals,
    analysisDate,
    archivedCount: normalized.goals.filter((goal) => goal.status === 'archived').length + normalized.habits.filter((habit) => habit.status === 'archived').length,
    completionRate: todayHabits.length ? Math.round((todayHabits.filter((item) => item.status.done).length / todayHabits.length) * 100) : 0,
    empty: !activeGoals.length && !todayHabits.length && !activeFocus.length,
    pausedCount: normalized.habits.filter((habit) => habit.status === 'paused').length,
    state: normalized,
    todayHabits,
    weekStart,
  }
}

export function markManualHabitDone(state, habitId, date = new Date(), options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const targetDate = getLocalDateString(date)
  const existing = normalized.completions.some((completion) => completion.habitId === habitId && completion.date === targetDate)
  if (existing) return normalized

  return {
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
  }
}

export function updateGoalsHabitsItemStatus(state, kind, id, status, options = {}) {
  const normalized = normalizeGoalsHabitsState(state)
  const now = options.now || new Date().toISOString()
  const field = kind === 'goal' ? 'goals' : 'habits'

  return {
    ...normalized,
    [field]: normalized[field].map((item) =>
      item.id === id
        ? {
          ...item,
          archivedAt: status === 'archived' ? now : item.archivedAt,
          pausedAt: status === 'paused' ? now : '',
          status,
          updatedAt: now,
        }
        : item),
  }
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
        archivedAt: '',
        createdAt: now,
        id: createStableId('focus', `${draft.title}-${weekStart}`),
        linkedInsightId: normalizeText(draft.linkedInsightId),
        reason: normalizeText(draft.reason, 'Bygger på dina senaste insikter.'),
        status: 'active',
        title: normalizeText(draft.title, 'Veckofokus'),
        weekStart,
      },
    ],
  }
}

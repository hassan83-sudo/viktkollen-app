import { filterActualMealsForDate } from '../nutrition/mealDateUtils.js'
import { getEntryLocalDate, getLocalDateString } from '../localDate.js'
import { normalizeGoalsHabitsState } from '../goalsHabits.js'
import { normalizeReminderText } from './reminderModel.js'

function hasWeightToday(weights = [], today) {
  return weights.some((entry) => getEntryLocalDate(entry) === today)
}

function hasCheckInToday(checkIns = [], today) {
  return checkIns.some((entry) => getEntryLocalDate(entry) === today)
}

function suggestion(id, type, title, description, time, enabled) {
  if (!enabled) return null
  return {
    description,
    id,
    scheduleType: 'daily',
    source: 'smart_suggestion',
    time,
    title,
    type,
  }
}

export function buildSmartReminderSuggestions(data = {}, options = {}) {
  const today = getLocalDateString(options.today || new Date())
  const enabled = options.enabledCategories || {}
  const checkIns = Array.isArray(data.checkIns) ? data.checkIns : data.checkIn ? [data.checkIn] : []
  const mealsToday = filterActualMealsForDate(data.meals || [], today)
  const goalsHabits = normalizeGoalsHabitsState(data.goalsHabits || {})
  const pendingHabit = goalsHabits.habits.find((habit) => habit.status === 'active' && habit.reminder?.enabled)

  return [
    suggestion(
      `smart-check-in-${today}`,
      'check_in',
      'Dagens check-in',
      'En kort check-in kan hjälpa översikten bli mer aktuell.',
      '19:00',
      enabled.check_in && !hasCheckInToday(checkIns, today),
    ),
    suggestion(
      `smart-weight-${today}`,
      'weight',
      'Viktregistrering',
      'Registrera vikt när det passar din valda rytm.',
      '08:00',
      enabled.weight && !hasWeightToday(data.weights || [], today),
    ),
    suggestion(
      `smart-meal-${today}`,
      'meal_log',
      'Måltidsloggning',
      'Lägg till dagens måltider om du vill följa näringen.',
      '18:00',
      enabled.meal_log && mealsToday.length === 0,
    ),
    pendingHabit
      ? suggestion(
        `smart-habit-${pendingHabit.id}`,
        'habit',
        normalizeReminderText(pendingHabit.title, 'Vanepåminnelse', 90),
        'Följ upp vanan i lugn takt.',
        pendingHabit.reminder?.time || '18:00',
        enabled.habit,
      )
      : null,
    suggestion(
      `smart-weekly-report-${today}`,
      'weekly_report',
      'Veckorapport',
      'Veckans sammanfattning finns när du vill titta.',
      '17:00',
      enabled.weekly_report,
    ),
    suggestion(
      `smart-monthly-report-${today}`,
      'monthly_report',
      'Månadsrapport',
      'Månadens sammanfattning finns när du vill titta.',
      '17:00',
      enabled.monthly_report,
    ),
  ].filter(Boolean)
}

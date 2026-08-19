import { formatKg, normalizeDailyWeightEntries, parseWeightValue } from '../healthCalculations.js'
import { getLocalCalendarDayDiff, getLocalDateString, parseDateValue } from '../localDate.js'

function safeDate(value) {
  return parseDateValue(value)
}

function safeNumber(value) {
  const parsed = parseWeightValue(value)

  return Number.isFinite(parsed) ? parsed : null
}

function round(value, digits = 1) {
  const factor = 10 ** digits

  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function normalizeForecastWeights(weights = [], today = new Date()) {
  const now = safeDate(today) || new Date()
  const todayDate = getLocalDateString(now)

  return normalizeDailyWeightEntries(weights, { today: now })
    .map((entry) => {
      const date = safeDate(entry.date)
      const value = safeNumber(entry.value)
      const entryDate = date ? getLocalDateString(date) : ''

      if (value === null || !date || entryDate > todayDate || value < 25 || value > 350) return null

      return {
        date: entryDate,
        time: date.getTime(),
        value,
      }
    })
    .filter(Boolean)
    .sort((first, second) => first.time - second.time || first.value - second.value)
}

export function calculateRobustWeeklyTrend(weights = [], options = {}) {
  const normalized = normalizeForecastWeights(weights, options.today)
  if (normalized.length < 3) return null

  const first = normalized[0]
  const latest = normalized.at(-1)
  const days = Math.max(1, getLocalCalendarDayDiff(first.date, latest.date) || 0)
  if (days < 14) return null

  const change = latest.value - first.value
  const weeklyRate = round((change / days) * 7, 2)

  if (Math.abs(weeklyRate) > 2.5) return null

  return {
    days,
    direction: weeklyRate < -0.05 ? 'down' : weeklyRate > 0.05 ? 'up' : 'stable',
    latestWeight: latest.value,
    startWeight: first.value,
    weeklyRate,
  }
}

export function forecastGoalProgress({ currentWeight, goalWeight, today = new Date(), weights = [] } = {}) {
  const current = safeNumber(currentWeight)
  const goal = safeNumber(goalWeight)

  if (current === null || goal === null) {
    return {
      confidence: 'insufficient',
      status: 'missing_goal',
      text: 'Målvikt eller aktuell vikt saknas, så prognosen behöver mer data.',
    }
  }

  const remaining = round(current - goal)
  if (Math.abs(remaining) <= 0.1) {
    return {
      confidence: 'high',
      estimatedMonth: '',
      remainingKg: 0,
      status: 'reached',
      text: 'Du är ungefär vid målet just nu. Fortsätt följa trenden över tid.',
      weeklyRate: 0,
      weeksRemaining: 0,
    }
  }

  const trend = calculateRobustWeeklyTrend(weights, { today })
  if (!trend) {
    return {
      confidence: 'insufficient',
      remainingKg: remaining,
      status: 'insufficient_data',
      text: 'Mer viktdata behövs innan en försiktig målprognos blir meningsfull.',
    }
  }

  const movingTowardGoal = remaining > 0 ? trend.weeklyRate < -0.05 : trend.weeklyRate > 0.05
  if (!movingTowardGoal) {
    return {
      confidence: 'low',
      remainingKg: remaining,
      status: 'not_moving_toward_goal',
      text: `Trenden går inte tydligt mot målet just nu. Senaste robusta takt är ${formatKg(trend.weeklyRate)} per vecka.`,
      weeklyRate: trend.weeklyRate,
    }
  }

  const weeksRemaining = Math.ceil(Math.abs(remaining) / Math.abs(trend.weeklyRate))
  if (!Number.isFinite(weeksRemaining) || weeksRemaining > 156) {
    return {
      confidence: 'low',
      remainingKg: remaining,
      status: 'too_uncertain',
      text: 'Prognosen är för osäker med nuvarande takt. Fortsätt logga vikt regelbundet.',
      weeklyRate: trend.weeklyRate,
    }
  }

  const date = safeDate(today) || new Date()
  date.setDate(date.getDate() + weeksRemaining * 7)
  const estimatedMonth = new Intl.DateTimeFormat('sv-SE', {
    month: 'long',
    year: 'numeric',
  }).format(date)
  const intervalPadding = weeksRemaining <= 12 ? 2 : weeksRemaining <= 52 ? 4 : 8
  const weekInterval = {
    max: weeksRemaining + intervalPadding,
    min: Math.max(1, weeksRemaining - intervalPadding),
  }
  const weekIntervalLabel = weekInterval.min === weekInterval.max
    ? `${weekInterval.min} veckor`
    : `${weekInterval.min}-${weekInterval.max} veckor`

  return {
    confidence: weeksRemaining <= 52 ? 'medium' : 'low',
    estimatedMonth,
    remainingKg: remaining,
    status: 'projected',
    text: `Med nuvarande försiktiga trend, ${formatKg(trend.weeklyRate)} per vecka, kan målet ungefär nås om ${weekIntervalLabel}. Se det som en riktning, inte ett löfte.`,
    weekInterval,
    weekIntervalLabel,
    weeklyRate: trend.weeklyRate,
    weeksRemaining,
  }
}

export const progressForecastInternals = {
  round,
  safeDate,
  safeNumber,
}

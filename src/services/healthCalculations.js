import { isMeasuredWeightEntry } from './weightProvenance.js'

export function parseWeightValue(value, fallback = null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : fallback
  }

  const normalized = String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseSignedNumber(value, fallback = null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }

  const normalized = String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : fallback
}

function roundNumber(value, digits = 1) {
  const factor = 10 ** digits

  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function formatKg(value, options = {}) {
  const number = parseSignedNumber(value)

  if (number === null) {
    return options.fallback ?? 'saknas'
  }

  const digits = options.maximumFractionDigits ?? 1
  const rounded = roundNumber(number, digits)
  const displayNumber = Object.is(rounded, -0) || Math.abs(rounded) < 0.05 ? 0 : rounded
  const formattedNumber = displayNumber.toLocaleString('sv-SE', {
    maximumFractionDigits: digits,
    minimumFractionDigits:
      options.minimumFractionDigits ?? (Number.isInteger(displayNumber) ? 0 : 1),
  }).replace('−', '-')

  return `${formattedNumber} kg`
}

function safeDate(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function getLocalDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function getWeightEntryDateTime(entry = {}) {
  if (String(entry.date || '').includes('T') && !/^\d{2}:\d{2}$/.test(String(entry.time || ''))) {
    return safeDate(entry.date)
  }

  const dateText = String(entry.date || '').slice(0, 10)
  const timeText = /^\d{2}:\d{2}$/.test(String(entry.time || '')) ? entry.time : ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return safeDate(`${dateText}T${timeText || '12:00'}:00`)
  }

  return safeDate(entry.date || entry.createdAt || entry.timestamp)
}

function getWeightEntrySource(entry = {}) {
  return String(entry.source || 'Manuell').trim().toLocaleLowerCase('sv-SE')
}

function getWeightEntryNote(entry = {}) {
  return String(entry.note || '').trim().toLocaleLowerCase('sv-SE')
}

function getWeightMigrationKey(entry) {
  return [
    entry.localDate,
    entry.value.toFixed(1),
    entry.source,
    entry.note,
  ].join('|')
}

function getLatestCentralWeightEntry(entries = []) {
  return [...entries].sort((first, second) =>
    second.minutes - first.minutes ||
    second.time - first.time ||
    String(second.id).localeCompare(String(first.id), 'sv-SE'),
  )[0]
}

export function normalizeWeightEntries(weights = []) {
  const rawEntries = (Array.isArray(weights) ? weights : [])
    .filter(isMeasuredWeightEntry)
    .map((entry) => {
      const value = parseWeightValue(entry?.value ?? entry?.weight)
      const date = getWeightEntryDateTime(entry)

      if (value === null || !date || Number.isNaN(date.getTime())) {
        return null
      }
      const localDate = getLocalDateString(date)

      return {
        date: date.toISOString(),
        id: String(entry?.id || ''),
        localDate,
        minutes: date.getHours() * 60 + date.getMinutes(),
        note: getWeightEntryNote(entry),
        source: getWeightEntrySource(entry),
        time: date.getTime(),
        value,
      }
    })
    .filter(Boolean)
    .sort((first, second) => first.time - second.time || first.value - second.value)
  const groups = rawEntries.reduce((map, entry) => {
    const key = getWeightMigrationKey(entry)

    map.set(key, [...(map.get(key) || []), entry])
    return map
  }, new Map())
  const migratedEntries = []

  groups.forEach((entries) => {
    let cluster = []
    let previousMinutes = null

    entries.forEach((entry) => {
      if (previousMinutes !== null && entry.minutes - previousMinutes > 5) {
        migratedEntries.push(getLatestCentralWeightEntry(cluster))
        cluster = []
      }

      cluster.push(entry)
      previousMinutes = entry.minutes
    })

    if (cluster.length) {
      migratedEntries.push(getLatestCentralWeightEntry(cluster))
    }
  })

  return migratedEntries
    .map(({ date, value }) => ({ date, value }))
    .sort((first, second) => new Date(first.date) - new Date(second.date))
}

export function normalizeDailyWeightEntries(weights = [], options = {}) {
  const todayDate = options.today ? getLocalDateString(safeDate(options.today) || new Date()) : null
  const byDate = normalizeWeightEntries(weights).reduce((groups, entry) => {
    const date = safeDate(entry.date)
    const localDate = date ? getLocalDateString(date) : ''

    if (!date || !localDate || (todayDate && localDate > todayDate)) {
      return groups
    }

    const current = groups.get(localDate)
    const normalized = {
      date: localDate,
      time: date.getTime(),
      value: entry.value,
    }

    if (!current || normalized.time >= current.time) {
      groups.set(localDate, normalized)
    }

    return groups
  }, new Map())

  return [...byDate.values()]
    .sort((first, second) => first.time - second.time || first.value - second.value)
    .map(({ date, value }) => ({ date, value }))
}

export function calculateWeightChange(currentWeight, startWeight) {
  const current = parseWeightValue(currentWeight)
  const start = parseWeightValue(startWeight)

  return current === null || start === null
    ? null
    : Number((current - start).toFixed(1))
}

export function calculateGoalDistance(currentWeight, goalWeight) {
  const current = parseWeightValue(currentWeight)
  const goal = parseWeightValue(goalWeight)

  return current === null || goal === null
    ? null
    : Number((current - goal).toFixed(1))
}

export function calculateGoalProgress({ currentWeight, goalWeight, startWeight }) {
  const current = parseWeightValue(currentWeight)
  const goal = parseWeightValue(goalWeight)
  const start = parseWeightValue(startWeight)

  if (current === null || goal === null || start === null) {
    return null
  }

  const totalDistance = Math.abs(start - goal)

  if (totalDistance === 0) {
    return {
      completePercent: current === goal ? 100 : 0,
      completedKg: current === goal ? 0 : null,
      direction: 'stable',
      milestones: [],
      nextMilestone: null,
      passedMilestones: [],
      remainingKg: current === goal ? 0 : null,
      remainingPercent: current === goal ? 0 : 100,
      totalDistance,
    }
  }

  const rawProgressDistance = Math.max(
    0,
    start > goal ? start - current : current - start,
  )
  const progressDistance = Math.min(totalDistance, rawProgressDistance)
  const completePercent = Math.max(
    0,
    Math.min(100, roundNumber((progressDistance / totalDistance) * 100)),
  )
  const remainingPercent = Math.max(0, Math.min(100, roundNumber(100 - completePercent)))
  const direction = start > goal ? 'loss' : 'gain'
  const milestonePercents = [10, 25, 50, 75, 90, 100]
  const milestones = milestonePercents.map((percent) => {
    const rawWeight = start + (goal - start) * (percent / 100)
    const weight = roundNumber(rawWeight)
    const passed = direction === 'loss'
      ? current <= weight + 0.0001
      : current >= weight - 0.0001

    return { passed, percent, weight }
  })
  const passedMilestones = milestones.filter((milestone) => milestone.passed)
  const nextMilestone = milestones.find((milestone) => !milestone.passed) ?? null

  return {
    completePercent,
    completedKg: roundNumber(progressDistance),
    direction,
    milestones,
    nextMilestone,
    passedMilestones,
    remainingKg: roundNumber(Math.max(0, totalDistance - progressDistance)),
    remainingPercent,
    totalDistance: roundNumber(totalDistance),
  }
}

export function getGoalDistanceSummary({ currentWeight, goalWeight }) {
  const current = parseWeightValue(currentWeight)
  const goal = parseWeightValue(goalWeight)

  if (current === null || goal === null) {
    return null
  }

  const remaining = calculateGoalDistance(current, goal)

  return {
    currentWeight: current,
    goalWeight: goal,
    remaining,
  }
}

export function getProteinWeight({ message = '', savedWeight }) {
  return extractWeightFromText(message) ?? parseWeightValue(savedWeight)
}

export function getProteinNeedForContext({ message = '', savedWeight }) {
  const weight = getProteinWeight({ message, savedWeight })

  if (weight === null) {
    return null
  }

  return {
    ...calculateProteinNeed(weight),
    weight,
    weightWasMentioned: extractWeightFromText(message) !== null,
  }
}

export function calculateBmi(weightKg, heightCm) {
  const weight = parseWeightValue(weightKg)
  const height = Number(String(heightCm ?? '').replace(',', '.'))

  if (weight === null || !Number.isFinite(height) || height <= 0) {
    return null
  }

  const heightMeters = height > 3 ? height / 100 : height

  return Number((weight / (heightMeters * heightMeters)).toFixed(1))
}

export function calculateProteinNeed(weightKg) {
  const weight = parseWeightValue(weightKg)

  if (weight === null) {
    return null
  }

  return {
    activeUpper: Math.round(weight * 2),
    lower: Math.round(weight * 1.2),
    upper: Math.round(weight * 1.6),
  }
}

export function extractWeightFromText(text) {
  const match = String(text || '').match(/(\d{2,3}(?:[,.]\d+)?)\s*(?:kg|kilo)/i)

  return match ? parseWeightValue(match[1]) : null
}

export function getWeightStats(weights = [], options = {}) {
  const sortedWeights = normalizeWeightEntries(weights)
  const firstLogged = sortedWeights[0] ?? null
  const latestLogged = sortedWeights.at(-1) ?? null
  const previousLogged = sortedWeights.at(-2) ?? null
  const current = latestLogged?.value ?? parseWeightValue(options.currentWeight)
  const start = firstLogged?.value ?? parseWeightValue(options.startWeight)
  const changeSinceStart = calculateWeightChange(current, start)
  const recentChange = calculateWeightChange(
    latestLogged?.value,
    previousLogged?.value,
  )

  return {
    changeSinceStart,
    current,
    first: start,
    hasWeights: sortedWeights.length > 0,
    latestDate: latestLogged?.date ?? null,
    latestWeight: latestLogged,
    recentChange,
    simpleTrend:
      changeSinceStart === null
        ? 'stable'
        : changeSinceStart < -0.3
          ? 'down'
          : changeSinceStart > 0.3
            ? 'up'
            : 'stable',
    trend:
      recentChange === null
        ? 'För lite data'
        : recentChange < -0.1
          ? 'Nedåt'
          : recentChange > 0.1
            ? 'Uppåt'
            : 'Stabil',
    weights: sortedWeights,
  }
}

export function getUnifiedWeightContext({
  currentWeight,
  goalWeight,
  profile = {},
  startWeight,
  weights = [],
} = {}) {
  const explicitStartWeight = parseWeightValue(startWeight)
  const profileStartWeight = parseWeightValue(profile?.startWeight)
  const profileGoalWeight = parseWeightValue(goalWeight ?? profile?.goalWeight)
  const weightStats = getWeightStats(weights, {
    currentWeight,
    startWeight: explicitStartWeight ?? profileStartWeight,
  })
  const current = weightStats.current
  const start = weightStats.first ?? explicitStartWeight ?? profileStartWeight
  const remainingKg = calculateGoalDistance(current, profileGoalWeight)
  const goalProgress = calculateGoalProgress({
    currentWeight: current,
    goalWeight: profileGoalWeight,
    startWeight: start,
  })
  const changeSinceStart = calculateWeightChange(current, start)

  return {
    changeSinceStart,
    completePercent: goalProgress?.completePercent ?? null,
    goalProgress,
    currentWeight: current,
    goalWeight: profileGoalWeight,
    hasWeights: weightStats.hasWeights,
    history: weightStats.weights,
    latestDate: weightStats.latestDate,
    latestWeight: weightStats.latestWeight,
    percentRemaining: goalProgress?.remainingPercent ?? null,
    recentChange: weightStats.recentChange,
    remainingKg,
    simpleTrend: weightStats.simpleTrend,
    startWeight: start,
    trend: weightStats.trend,
  }
}

export function getUnifiedWeightFacts(options = {}) {
  const weightContext = getUnifiedWeightContext(options)
  const latestWeight = weightContext.currentWeight
  const startWeight = weightContext.startWeight
  const goalWeight = weightContext.goalWeight
  const weightChange =
    latestWeight === null || startWeight === null
      ? null
      : Number((latestWeight - startWeight).toFixed(1))
  const weightLost =
    weightChange === null
      ? null
      : Number(Math.max(0, -weightChange).toFixed(1))
  const weightGained =
    weightChange === null
      ? null
      : Number(Math.max(0, weightChange).toFixed(1))
  const goalRemaining =
    latestWeight === null || goalWeight === null
      ? null
      : Number((latestWeight - goalWeight).toFixed(1))

  return {
    ...weightContext,
    firstEntry: weightContext.history[0] ?? null,
    goalRemaining,
    latestEntry: weightContext.latestWeight,
    latestWeight,
    weightChange,
    weightGained,
    weightLost,
  }
}

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

export function formatKg(value, options = {}) {
  const number = parseSignedNumber(value)

  if (number === null) {
    return options.fallback ?? 'saknas'
  }

  const formattedNumber = number.toLocaleString('sv-SE', {
    maximumFractionDigits: options.maximumFractionDigits ?? 1,
    minimumFractionDigits:
      options.minimumFractionDigits ?? (Number.isInteger(number) ? 0 : 1),
  }).replace('−', '-')

  return `${formattedNumber} kg`
}

export function normalizeWeightEntries(weights = []) {
  return (Array.isArray(weights) ? weights : [])
    .map((entry) => {
      const value = parseWeightValue(entry?.value)
      const date = new Date(entry?.date)

      if (value === null || Number.isNaN(date.getTime())) {
        return null
      }

      return {
        date: date.toISOString(),
        value,
      }
    })
    .filter(Boolean)
    .sort((first, second) => new Date(first.date) - new Date(second.date))
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
    return null
  }

  const progressDistance = Math.max(
    0,
    start > goal ? start - current : current - start,
  )
  const completePercent = Math.max(
    0,
    Math.min(100, Math.round((progressDistance / totalDistance) * 100)),
  )
  const remainingPercent = Math.max(0, Math.min(100, 100 - completePercent))

  return {
    completePercent,
    remainingPercent,
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
  const profileStartWeight = parseWeightValue(
    startWeight ?? profile?.startWeight,
  )
  const profileGoalWeight = parseWeightValue(goalWeight ?? profile?.goalWeight)
  const weightStats = getWeightStats(weights, {
    currentWeight,
    startWeight: profileStartWeight,
  })
  const current = weightStats.current
  const start = profileStartWeight ?? weightStats.first
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

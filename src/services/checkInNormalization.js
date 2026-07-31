import { formatSleepDuration as formatCentralSleepDuration } from './healthFormatting.js'

const technicalText = new Set(['true', 'false', 'undefined', 'null', '[object object]', 'nan', 'infinity'])

function cleanText(value) {
  if (typeof value !== 'string') return ''

  const text = value.replace(/\s+/g, ' ').trim()
  const lower = text.toLocaleLowerCase('sv-SE')

  return text && !technicalText.has(lower) ? text : ''
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function getObjectField(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  for (const field of fields) {
    if (value[field] !== undefined && value[field] !== null) return value[field]
  }

  return undefined
}

function parseNumber(value) {
  const raw = typeof value === 'object' && value !== null
    ? firstDefined(value.value, value.score, value.energy, value.steps, value.sleep, value.sleepHours)
    : value
  const normalized = typeof raw === 'string' ? raw.replace(',', '.') : raw
  const parsed = typeof normalized === 'string'
    ? Number(normalized.match(/-?\d+(?:\.\d+)?/)?.[0])
    : Number(normalized)

  return Number.isFinite(parsed) ? parsed : null
}

function normalizeDisplayLabel(text) {
  const cleaned = cleanText(text)
  const lower = cleaned.toLocaleLowerCase('sv-SE')

  if (!lower) return ''
  if (lower === 'hiit') return 'HIIT'
  if (lower === 'gym') return 'Gym'

  return lower.charAt(0).toLocaleUpperCase('sv-SE') + lower.slice(1)
}

function getObjectType(value) {
  return cleanText(getObjectField(value, ['type', 'name', 'label', 'activity', 'workoutType', 'training', 'exercise']))
}

function normalizeWorkoutLabel(value) {
  return normalizeDisplayLabel(cleanText(value) || getObjectType(value))
}

function objectMarksCompletion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  if (typeof value.completed === 'boolean') return value.completed
  if (typeof value.done === 'boolean') return value.done
  if (typeof value.checked === 'boolean') return value.checked

  return Boolean(getObjectType(value))
}

function objectMarksNonCompletion(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (
      value.completed === false ||
      value.done === false ||
      value.checked === false
    ),
  )
}

export function normalizeWorkout(checkIn = {}) {
  const workoutValue = checkIn?.workout
  const explicitlyNotCompleted = workoutValue === false || objectMarksNonCompletion(workoutValue)
  const type =
    normalizeWorkoutLabel(checkIn?.workoutType) ||
    normalizeWorkoutLabel(checkIn?.trainingType) ||
    normalizeWorkoutLabel(checkIn?.exerciseType) ||
    normalizeWorkoutLabel(checkIn?.activityType) ||
    normalizeWorkoutLabel(checkIn?.training) ||
    normalizeWorkoutLabel(checkIn?.exercise) ||
    normalizeWorkoutLabel(workoutValue)

  const completed =
    !explicitlyNotCompleted &&
    (
      workoutValue === true ||
      objectMarksCompletion(workoutValue) ||
      Boolean(type)
    )

  if (!completed) {
    return {
      completed: false,
      displayLabel: 'Ingen registrerad',
      type: '',
    }
  }

  return {
    completed: true,
    displayLabel: type || 'Träning markerad',
    type,
  }
}

function parseEnergyScale(value, energyValue) {
  const rawScale = Number(getObjectField(value, ['scale', 'max', 'maxValue', 'outOf']))

  if (Number.isFinite(rawScale) && rawScale > 0) return rawScale
  if (Number.isFinite(energyValue) && energyValue > 0 && energyValue <= 5) return 10

  return 10
}

export function normalizeEnergy(value) {
  const parsed = parseNumber(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      displayLabel: 'Saknas',
      level: 'missing',
      scale: null,
      value: null,
    }
  }

  const scale = parseEnergyScale(value, parsed)
  const clamped = Math.max(1, Math.min(parsed, scale))
  const normalizedToTen = scale === 10 ? clamped : Math.round((clamped / scale) * 10)
  const level = normalizedToTen <= 3 ? 'low' : normalizedToTen <= 6 ? 'medium' : 'high'

  return {
    displayLabel: `${clamped.toLocaleString('sv-SE')} av ${scale}`,
    level,
    scale,
    value: normalizedToTen,
  }
}

const moodMap = new Map([
  ['good', ['Positiv', 4]],
  ['great', ['Positiv', 5]],
  ['happy', ['Glad', 5]],
  ['glad', ['Glad', 5]],
  ['focused', ['Fokuserad', 4]],
  ['fokuserad', ['Fokuserad', 4]],
  ['calm', ['Lugn', 4]],
  ['lugn', ['Lugn', 4]],
  ['neutral', ['Neutral', 3]],
  ['ok', ['Neutral', 3]],
  ['low', ['Låg', 2]],
  ['bad', ['Låg', 1]],
  ['sad', ['Låg', 1]],
  ['trött', ['Trött', 2]],
  ['tired', ['Trött', 2]],
  ['stressad', ['Stressad', 2]],
  ['stressed', ['Stressad', 2]],
  ['🙂', ['Glad', 5]],
  ['😊', ['Glad', 5]],
  ['😐', ['Neutral', 3]],
  ['😞', ['Låg', 1]],
  ['😴', ['Trött', 2]],
])

export function normalizeMood(value) {
  const raw = typeof value === 'object' && value !== null
    ? firstDefined(value.displayLabel, value.label, value.mood, value.value, value.key, value.name)
    : value
  const text = cleanText(raw)
  const lower = text.toLocaleLowerCase('sv-SE')
  const mapped = moodMap.get(lower)

  if (mapped) {
    return {
      displayLabel: mapped[0],
      key: mapped[0].toLocaleLowerCase('sv-SE'),
      score: mapped[1],
      value: lower,
    }
  }

  const label = normalizeDisplayLabel(text)

  if (!label) {
    return {
      displayLabel: 'Saknas',
      key: '',
      score: null,
      value: '',
    }
  }

  return {
    displayLabel: label,
    key: label.toLocaleLowerCase('sv-SE'),
    score: 3,
    value: lower,
  }
}

export function normalizeSteps(value) {
  return normalizeStepMetrics(value).value
}

function parseStepValue(value) {
  const raw = typeof value === 'object' && value !== null
    ? firstDefined(value.value, value.steps, value.stepCount, value.dailySteps, value.count, value.total)
    : value

  if (typeof raw === 'string') {
    const compact = raw.replace(/\s+/g, '').replace(',', '.')
    const parsed = Number(compact.match(/-?\d+(?:\.\d+)?/)?.[0])

    return Number.isFinite(parsed) ? parsed : null
  }

  const parsed = Number(raw)

  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeStepMetrics(value, { goal = null } = {}) {
  const parsed = parseStepValue(value)
  const safeGoal = parseStepValue(goal)

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    return {
      displayLabel: 'Saknas',
      goalProgress: null,
      status: 'missing',
      value: null,
    }
  }

  const rounded = Math.round(parsed)
  const goalProgress = Number.isFinite(safeGoal) && safeGoal > 0
    ? {
      percent: Math.round((rounded / safeGoal) * 100),
      remaining: Math.max(0, Math.round(safeGoal - rounded)),
      visualPercent: Math.max(0, Math.min(Math.round((rounded / safeGoal) * 100), 100)),
    }
    : null

  return {
    displayLabel: `${rounded.toLocaleString('sv-SE')} steg`,
    goalProgress,
    status: 'valid',
    value: rounded,
  }
}

export function normalizeSleep(value) {
  return normalizeSleepMetrics(value).hours
}

function parseSleepValue(value) {
  const raw = typeof value === 'object' && value !== null
    ? firstDefined(value.hours, value.sleepHours, value.value, value.duration, value.sleep)
    : value
  const objectMinutes = typeof value === 'object' && value !== null
    ? parseNumber(value.minutes)
    : null

  if (typeof raw === 'string') {
    const text = raw.trim().toLocaleLowerCase('sv-SE').replace(',', '.')
    const timeMatch = text.match(/^(\d{1,2}):(\d{1,2})$/)

    if (timeMatch) {
      return Number(timeMatch[1]) + Number(timeMatch[2]) / 60
    }

    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:h|tim|timmar|hour|hours)/)
    const minuteMatch = text.match(/(\d+)\s*(?:m|min|minuter|minutes)/)

    if (hourMatch || minuteMatch) {
      return (hourMatch ? Number(hourMatch[1]) : 0) + (minuteMatch ? Number(minuteMatch[1]) / 60 : 0)
    }
  }

  const parsed = parseNumber(raw)

  if (Number.isFinite(parsed) && Number.isFinite(objectMinutes)) {
    return parsed + objectMinutes / 60
  }

  return parsed
}

export function formatSleepDuration(hours) {
  return formatCentralSleepDuration(hours)
}

export function normalizeSleepMetrics(value) {
  const parsed = parseSleepValue(value)

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
    return {
      displayLabel: 'Saknas',
      hours: null,
      level: 'missing',
      minutes: null,
      status: 'missing',
    }
  }

  const minutes = Math.round(parsed * 60)
  const hours = Number((minutes / 60).toFixed(2))
  const level = hours < 6 ? 'low' : hours <= 9 ? 'normal' : 'high'

  return {
    displayLabel: formatSleepDuration(hours),
    hours,
    level,
    minutes,
    status: 'valid',
  }
}

export function normalizeCheckInMetrics(checkIn = {}) {
  const energy = normalizeEnergy(checkIn?.energy ?? getObjectField(checkIn, ['energyLevel']))
  const mood = normalizeMood(checkIn?.mood ?? checkIn?.feeling)
  const sleep = normalizeSleepMetrics(checkIn?.sleep ?? checkIn?.sleepHours ?? checkIn?.sleepDuration)
  const steps = normalizeStepMetrics(checkIn?.steps ?? checkIn?.stepCount ?? checkIn?.dailySteps)
  const workout = normalizeWorkout(checkIn)

  return {
    energy,
    mood,
    sleep: sleep.hours,
    sleepLabel: sleep.displayLabel,
    sleepLevel: sleep.level,
    sleepMetrics: sleep,
    steps: steps.value,
    stepsLabel: steps.displayLabel,
    stepMetrics: steps,
    workout,
  }
}

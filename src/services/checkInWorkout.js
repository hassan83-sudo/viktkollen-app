function cleanText(value) {
  if (typeof value !== 'string') return ''

  const text = value.replace(/\s+/g, ' ').trim()
  const lower = text.toLocaleLowerCase('sv-SE')

  if (!text || ['true', 'false', 'undefined', 'null', '[object object]'].includes(lower)) {
    return ''
  }

  return text
}

function getObjectType(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''

  return cleanText(
    value.type ||
    value.name ||
    value.label ||
    value.activity ||
    value.workoutType ||
    value.training ||
    value.exercise,
  )
}

function normalizeWorkoutLabel(value) {
  const text = cleanText(value) || getObjectType(value)
  const lower = text.toLocaleLowerCase('sv-SE')

  if (!lower) return ''
  if (lower === 'hiit') return 'HIIT'
  if (lower === 'gym') return 'Gym'

  return lower.charAt(0).toLocaleUpperCase('sv-SE') + lower.slice(1)
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

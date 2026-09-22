// A11Y-7F: dedicated local storage for user-created step-by-step visual
// routines. Deliberately separate from accessibilityPreferences.js and
// accessibilityCommunicationPhrases.js's storage keys - a routine is its own
// kind of user content, not a UI preference or a communication phrase.
// This is a generic, user-authored task list, never a medical/medication
// tool - the service has no concept of doses, treatment or compliance.
export const routinesStorageKey = 'viktkollen.accessibility.routines.v1'

// Conservative, documented limits to prevent unbounded local storage growth.
export const maxRoutines = 10
export const maxStepsPerRoutine = 20
export const maxRoutineNameLength = 60
export const maxRoutineStepLength = 120

function getStorage(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  return storage && typeof storage.getItem === 'function' ? storage : null
}

function isValidStep(value) {
  return typeof value === 'string' && value.trim() && value.length <= maxRoutineStepLength
}

function isValidRoutine(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.id === 'string' && value.id
    && typeof value.name === 'string' && value.name.trim() && value.name.length <= maxRoutineNameLength
    && Array.isArray(value.steps)
    && value.steps.length > 0
    && value.steps.length <= maxStepsPerRoutine
    && value.steps.every(isValidStep),
  )
}

function normalizeSteps(steps) {
  return (Array.isArray(steps) ? steps : [])
    .map((step) => String(step || '').trim())
    .filter(Boolean)
}

function writeRoutines(routines, storage) {
  const localStorage = getStorage(storage)
  if (!localStorage) return false

  try {
    localStorage.setItem(routinesStorageKey, JSON.stringify(routines))
    return true
  } catch {
    return false
  }
}

// Malformed storage (invalid JSON, wrong type, invalid item shape, entries
// beyond the limit) is normalized away rather than allowed to break the
// accessibility hub: never throws, always returns a safe, valid array.
export function readRoutines(storage) {
  const localStorage = getStorage(storage)
  if (!localStorage) return []

  try {
    const raw = localStorage.getItem(routinesStorageKey)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isValidRoutine).slice(0, maxRoutines)
  } catch {
    return []
  }
}

function validateNameAndSteps(name, steps) {
  const trimmedName = String(name || '').trim()
  const trimmedSteps = normalizeSteps(steps)

  if (!trimmedName) return { error: 'emptyName' }
  if (trimmedName.length > maxRoutineNameLength) return { error: 'nameTooLong' }
  if (trimmedSteps.length === 0) return { error: 'emptySteps' }
  if (trimmedSteps.some((step) => step.length > maxRoutineStepLength)) return { error: 'stepTooLong' }
  if (trimmedSteps.length > maxStepsPerRoutine) return { error: 'tooManySteps' }
  return { error: null, trimmedName, trimmedSteps }
}

export function addRoutine({ name, steps } = {}, storage) {
  const current = readRoutines(storage)
  const validation = validateNameAndSteps(name, steps)
  if (validation.error) return { error: validation.error, routines: current }
  if (current.length >= maxRoutines) return { error: 'limitReached', routines: current }

  const routine = {
    createdAt: new Date().toISOString(),
    id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: validation.trimmedName,
    steps: validation.trimmedSteps,
  }
  const next = [...current, routine]
  writeRoutines(next, storage)
  return { error: null, routine, routines: next }
}

export function updateRoutine(id, { name, steps } = {}, storage) {
  const current = readRoutines(storage)
  const existing = current.find((routine) => routine.id === id)
  if (!existing) return { error: 'notFound', routines: current }

  const validation = validateNameAndSteps(name, steps)
  if (validation.error) return { error: validation.error, routines: current }

  const routine = { ...existing, name: validation.trimmedName, steps: validation.trimmedSteps }
  const next = current.map((item) => (item.id === id ? routine : item))
  writeRoutines(next, storage)
  return { error: null, routine, routines: next }
}

export function removeRoutine(id, storage) {
  const next = readRoutines(storage).filter((routine) => routine.id !== id)
  writeRoutines(next, storage)
  return next
}

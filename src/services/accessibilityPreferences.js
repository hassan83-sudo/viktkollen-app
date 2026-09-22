export const accessibilityPreferencesKey = 'viktkollen.accessibility.preferences.v1'

export const defaultAccessibilityPreferences = Object.freeze({
  avoidPreciseGestures: false,
  calmMode: false,
  extraInteractionTime: false,
  hapticFeedback: false,
  highContrast: false,
  keyboardFriendly: false,
  largeControls: false,
  lineSpacing: false,
  reduceMotion: false,
  seniorMode: false,
  simpleReading: false,
  navigationSpeech: false,
  navigationSpeechRate: 'normal',
  textSize: 'normal',
  visualFeedback: false,
})

const booleanKeys = Object.freeze(
  Object.keys(defaultAccessibilityPreferences).filter((key) => !['textSize', 'navigationSpeechRate'].includes(key)),
)

function getStorage(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  return storage && typeof storage.getItem === 'function' ? storage : null
}

export function normalizeAccessibilityPreferences(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const normalized = { ...defaultAccessibilityPreferences }

  booleanKeys.forEach((key) => {
    if (typeof source[key] === 'boolean') normalized[key] = source[key]
  })

  if (['normal', 'large', 'extra-large'].includes(source.textSize)) {
    normalized.textSize = source.textSize
  }
  if (['slow', 'normal', 'fast'].includes(source.navigationSpeechRate)) {
    normalized.navigationSpeechRate = source.navigationSpeechRate
  }

  return normalized
}

export function readAccessibilityPreferences(storage) {
  const localStorage = getStorage(storage)
  if (!localStorage) return { preferences: { ...defaultAccessibilityPreferences }, source: 'unavailable' }

  try {
    const raw = localStorage.getItem(accessibilityPreferencesKey)
    if (!raw) return { preferences: { ...defaultAccessibilityPreferences }, source: 'missing' }

    return {
      preferences: normalizeAccessibilityPreferences(JSON.parse(raw)),
      source: 'stored',
    }
  } catch {
    return { preferences: { ...defaultAccessibilityPreferences }, source: 'invalid' }
  }
}

export function saveAccessibilityPreferences(preferences, storage) {
  const localStorage = getStorage(storage)
  if (!localStorage) return false

  try {
    localStorage.setItem(accessibilityPreferencesKey, JSON.stringify(normalizeAccessibilityPreferences(preferences)))
    return true
  } catch {
    return false
  }
}

export function resetAccessibilityPreferences(storage) {
  const localStorage = getStorage(storage)
  if (!localStorage) return false

  try {
    localStorage.removeItem(accessibilityPreferencesKey)
    return true
  } catch {
    return false
  }
}

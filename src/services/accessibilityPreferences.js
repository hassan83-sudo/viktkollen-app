import { useEffect, useState } from 'react'

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

// A11Y-7B: in-tab-only subscriber list so any mounted consumer (App root,
// AccessibilityHub, etc.) can react immediately when preferences change,
// without a reload, server round-trip, or BroadcastChannel. AccessibilityHub
// remains the only writer; this just lets other readers hear about writes.
const accessibilityPreferenceListeners = new Set()

function notifyAccessibilityPreferenceListeners(preferences) {
  accessibilityPreferenceListeners.forEach((listener) => {
    try {
      listener(preferences)
    } catch {
      // A listener error must never break preference persistence for others.
    }
  })
}

export function subscribeAccessibilityPreferences(listener) {
  if (typeof listener !== 'function') return () => {}
  accessibilityPreferenceListeners.add(listener)
  return () => {
    accessibilityPreferenceListeners.delete(listener)
  }
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

// A11Y-8A: listeners are notified even when persisting fails (storage
// missing, full or blocked). AccessibilityHub reads its state through these
// listeners, so a change still applies for the current tab; the return value
// still reports whether it was persisted.
export function saveAccessibilityPreferences(preferences, storage) {
  const normalized = normalizeAccessibilityPreferences(preferences)
  const localStorage = getStorage(storage)
  let persisted = false

  if (localStorage) {
    try {
      localStorage.setItem(accessibilityPreferencesKey, JSON.stringify(normalized))
      persisted = true
    } catch {
      persisted = false
    }
  }

  notifyAccessibilityPreferenceListeners(normalized)
  return persisted
}

export function resetAccessibilityPreferences(storage) {
  const localStorage = getStorage(storage)
  let persisted = false

  if (localStorage) {
    try {
      localStorage.removeItem(accessibilityPreferencesKey)
      persisted = true
    } catch {
      persisted = false
    }
  }

  notifyAccessibilityPreferenceListeners({ ...defaultAccessibilityPreferences })
  return persisted
}

// A11Y-7B: resolves the same "senior mode bundles several toggles" rule
// AccessibilityHub already applies to its own scope, so any other consumer
// (the app root) reflects an identical effective state rather than a second,
// possibly-drifting copy of that logic.
export function getEffectiveAccessibilityPreferences(preferences) {
  const source = preferences && typeof preferences === 'object' ? preferences : defaultAccessibilityPreferences

  return {
    highContrast: Boolean(source.seniorMode || source.highContrast),
    largeControls: Boolean(source.seniorMode || source.largeControls),
    lineSpacing: Boolean(source.seniorMode || source.lineSpacing),
    reduceMotion: Boolean(source.seniorMode || source.reduceMotion),
    simpleReading: Boolean(source.seniorMode || source.simpleReading),
    textSize: source.seniorMode ? 'extra-large' : source.textSize,
  }
}

// A11Y-7B: single hook any component can use to read the current, live
// accessibility preferences without owning or duplicating the storage logic
// above. AccessibilityHub keeps its own read/save calls (unchanged); this
// hook exists for read-only consumers such as the app root.
export function useAccessibilityPreferences() {
  const [preferences, setPreferences] = useState(() => readAccessibilityPreferences().preferences)

  useEffect(() => subscribeAccessibilityPreferences(setPreferences), [])

  return preferences
}

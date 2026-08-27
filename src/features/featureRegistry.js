export const FEATURE_FLAGS_STORAGE_KEY = 'viktkollen.features.v1'

export const defaultFeatureFlags = Object.freeze({
  smartCamera: true,
  eyes: true,
  mouth: true,
  memory: true,
  familySafety: false,
  dayMap: false,
  transportDetection: false,
  walkieTalkie: false,
  social: false,
  socialUi: true,
  socialLive: false,
})

const knownFeatureIds = Object.freeze(Object.keys(defaultFeatureFlags))

function isExplicitBoolean(value) {
  return value === true || value === false
}

function readStoredOverrides() {
  if (typeof window === 'undefined' || !window.localStorage) return {}

  try {
    const raw = window.localStorage.getItem(FEATURE_FLAGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function normalizeFeatureFlags(overrides = {}) {
  const next = { ...defaultFeatureFlags }

  knownFeatureIds.forEach((id) => {
    if (isExplicitBoolean(overrides[id])) next[id] = overrides[id]
  })

  return next
}

export function getFeatureFlags(overrides = {}) {
  return normalizeFeatureFlags({
    ...readStoredOverrides(),
    ...overrides,
  })
}

export function isFeatureEnabled(id, flags = getFeatureFlags()) {
  return flags?.[id] === true
}

export function setFeatureFlag(id, enabled, { persist = false } = {}) {
  if (!knownFeatureIds.includes(id)) return getFeatureFlags()

  const next = normalizeFeatureFlags({
    ...readStoredOverrides(),
    [id]: Boolean(enabled),
  })

  if (persist && typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(next))
  }

  return next
}

export function getRegisteredFeatureIds() {
  return [...knownFeatureIds]
}

export function listEnabledFeatures(flags = getFeatureFlags()) {
  return knownFeatureIds.filter((id) => flags[id] === true)
}

export function getHubEntries(flags = getFeatureFlags()) {
  return {
    eyes: isFeatureEnabled('eyes', flags),
    familySafety: isFeatureEnabled('familySafety', flags),
    memory: isFeatureEnabled('memory', flags),
    mouth: isFeatureEnabled('mouth', flags),
    smartCamera: isFeatureEnabled('smartCamera', flags),
    social: isFeatureEnabled('socialUi', flags),
  }
}

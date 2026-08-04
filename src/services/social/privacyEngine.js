export const visibilityLevels = ['private', 'shared', 'public']

const blockedShareFields = [
  'email',
  'fullName',
  'phone',
  'accessToken',
  'refreshToken',
  'supabase',
  'auth',
  'diagnosis',
  'medication',
  'rawWeight',
  'bodyPhoto',
  'image',
  'base64',
]

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeText(value, fallback = '', max = 180) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeVisibility(value, fallback = 'private') {
  return visibilityLevels.includes(value) ? value : fallback
}

export function normalizePrivacySettings(settings = {}) {
  const source = isObject(settings) ? settings : {}

  return {
    achievementSharing: normalizeVisibility(source.achievementSharing, 'shared'),
    leaderboardOptIn: source.leaderboardOptIn === true,
    progressSharing: normalizeVisibility(source.progressSharing, 'private'),
    shareDisplayName: safeText(source.shareDisplayName, 'Viktkollen-användare', 80),
    sharedGoalVisibility: normalizeVisibility(source.sharedGoalVisibility, 'shared'),
    weeklySummarySharing: normalizeVisibility(source.weeklySummarySharing, 'private'),
  }
}

export function anonymizeText(value, fallback = 'Delad uppdatering') {
  const text = safeText(value, fallback, 240)

  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[maskerad e-post]')
    .replace(/\b\d{6,}\b/g, '[maskerat id]')
}

export function sanitizeSharePayload(payload = {}) {
  if (!isObject(payload)) return {}

  return Object.fromEntries(Object.entries(payload)
    .filter(([key]) => !blockedShareFields.some((field) => key.toLowerCase().includes(field.toLowerCase())))
    .map(([key, value]) => {
      if (typeof value === 'string') return [key, anonymizeText(value)]
      if (Number.isFinite(value)) return [key, value]
      if (Array.isArray(value)) return [key, value.map((entry) => (isObject(entry) ? sanitizeSharePayload(entry) : anonymizeText(entry))).slice(0, 12)]
      if (isObject(value)) return [key, sanitizeSharePayload(value)]
      if (value === null || value === undefined || typeof value === 'boolean') return [key, value]
      return [key, anonymizeText(value)]
    }))
}

export function canShareVisibility(visibility, audience = 'friend') {
  const level = normalizeVisibility(visibility)
  if (level === 'private') return false
  if (level === 'shared') return audience === 'friend' || audience === 'partner'
  return true
}

export function buildPrivacyReadiness(settings = {}) {
  const privacy = normalizePrivacySettings(settings)
  const configured = Boolean(privacy.shareDisplayName)

  return {
    configured,
    label: configured ? 'Redo med privacy defaults' : 'Saknar privacy defaults',
    leaderboardOptIn: privacy.leaderboardOptIn,
    privateByDefault: privacy.progressSharing === 'private' && privacy.weeklySummarySharing === 'private',
    settings: privacy,
  }
}

export const privacyEngineInternals = {
  blockedShareFields,
  normalizeVisibility,
}

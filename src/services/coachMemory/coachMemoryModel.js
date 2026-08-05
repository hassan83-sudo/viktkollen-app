export const coachMemoryVersion = 1
export const coachMemoryPolicyVersion = 'adaptive-coach-personalization-v8'

export const coachMemoryCategories = [
  'preferences',
  'activePriorities',
  'successfulStrategies',
  'declinedStrategies',
  'recurringBarriers',
  'recentContext',
  'coachStyle',
  'adaptationMetadata',
]

export const coachStyleOptions = ['neutral', 'lugn', 'uppmuntrande', 'rak', 'coachande']
export const coachActionSizeOptions = ['mycket liten', 'liten', 'normal']
export const coachFocusCategories = ['weight', 'nutrition', 'activity', 'goals', 'reminders', 'recovery', 'planning']
export const coachMemoryLifecycleStatuses = [
  'created',
  'reinforced',
  'weakened',
  'stale',
  'forgotten',
  'userConfirmed',
  'userEdited',
  'userRejected',
]

const sensitivePatterns = [
  /diagnos/i,
  /läkemedel|medicin/i,
  /sjukdom/i,
  /personlighet|introvert|extrovert/i,
  /kroppskommentar|utseende/i,
  /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i,
  /userId|deviceId|auth|session|token|localStorage|supabase/i,
  /base64|data:image|prompt|providerresponse|chatthistorik/i,
  /rå (måltid|vikt|check-in)|raw(Meals|Weights|CheckIns)/i,
  /<script|javascript:|<\/?[a-z][\s\S]*>/i,
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeText(value, fallback = '', max = 120) {
  const text = String(value || fallback).replace(/\s+/g, ' ').trim()
  if (!text || sensitivePatterns.some((pattern) => pattern.test(text))) return ''
  return text.slice(0, max)
}

function safeDate(value, fallback = '') {
  const text = String(value || '').trim()
  if (!text) return fallback
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function uniqueCategories(items) {
  return [...new Set(safeArray(items)
    .map((item) => safeText(item, '', 32))
    .filter((item) => coachFocusCategories.includes(item)))]
}

function hashText(value) {
  const text = safeText(value, 'memory').toLocaleLowerCase('sv-SE')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function createCoachMemoryItemId(category, key) {
  return `coach-memory-${safeText(category, 'general', 32)}-${hashText(key)}`
}

export function isSensitiveCoachMemoryValue(value) {
  return sensitivePatterns.some((pattern) => pattern.test(String(value || '')))
}

export function normalizeCoachMemoryItem(item = {}, options = {}) {
  const source = safeObject(item)
  const category = safeText(source.category || source.strategyCategory || source.barrierCategory || options.category, 'general', 32)
  if (!coachFocusCategories.includes(category)) return null
  const evidenceCount = Math.max(0, Math.floor(Number(source.evidenceCount ?? source.count ?? 0) || 0))
  const confidence = clamp(source.confidence ?? (evidenceCount >= 3 ? 0.7 : evidenceCount >= 2 ? 0.45 : 0.2), 0, 0.95)
  const lifecycle = coachMemoryLifecycleStatuses.includes(source.lifecycle) ? source.lifecycle : 'created'
  const generatedAt = safeDate(source.generatedAt || source.latestDate || source.latestObservedDate || source.latestSuccessDate, options.now || new Date().toISOString())
  const staleAfter = safeDate(source.staleAfter, '')

  return {
    category,
    confidence: Number(confidence.toFixed(2)),
    evidenceCount,
    evidenceType: safeText(source.evidenceType || source.sourceCategory || 'coachLifecycle', 'coachLifecycle', 48),
    id: safeText(source.id) || createCoachMemoryItemId(category, `${category}|${source.evidenceType}|${evidenceCount}`),
    latestObservedDate: safeDate(source.latestObservedDate || source.latestDate || source.latestSuccessDate, generatedAt),
    lifecycle,
    source: safeText(source.source || 'derived', 'derived', 32),
    staleAfter,
  }
}

function normalizePreferences(value = {}) {
  const source = safeObject(value)
  const preferredCoachTone = coachStyleOptions.includes(source.preferredCoachTone) ? source.preferredCoachTone : 'neutral'
  const preferredActionSize = coachActionSizeOptions.includes(source.preferredActionSize) ? source.preferredActionSize : 'normal'
  return {
    excludedFocusAreas: uniqueCategories(source.excludedFocusAreas),
    preferredActionSize,
    preferredCoachTone,
    preferredFocusAreas: uniqueCategories(source.preferredFocusAreas),
    preferredReminderTimeBand: safeText(source.preferredReminderTimeBand, '', 32),
  }
}

function normalizeConsent(value = {}) {
  const source = safeObject(value)
  return {
    memoryReviewedAt: safeDate(source.memoryReviewedAt, ''),
    personalizationEnabled: source.personalizationEnabled === true,
    policyVersion: safeText(source.policyVersion, coachMemoryPolicyVersion, 80) || coachMemoryPolicyVersion,
    remoteAiMemoryEnabled: source.remoteAiMemoryEnabled === true,
  }
}

function normalizeRecentContext(value = {}, options = {}) {
  const source = safeObject(value)
  return {
    activeActionCount: Math.max(0, Math.min(12, Math.floor(Number(source.activeActionCount) || 0))),
    currentCoverage: clamp(source.currentCoverage, 0, 1),
    currentMomentum: safeText(source.currentMomentum, 'insufficient', 40) || 'insufficient',
    safeWeeklySummary: safeText(source.safeWeeklySummary, '', 180),
    staleAfter: safeDate(source.staleAfter, options.now || new Date().toISOString()),
  }
}

export function normalizeCoachMemory(value = {}, options = {}) {
  const source = safeObject(value)
  const now = safeDate(options.now, new Date().toISOString())
  const successfulStrategies = safeArray(source.successfulStrategies)
    .map((item) => normalizeCoachMemoryItem(item, { category: item?.category || item?.strategyCategory, now }))
    .filter(Boolean)
    .filter((item) => item.evidenceCount >= 1 && item.lifecycle !== 'forgotten')
    .slice(0, 8)
  const declinedStrategies = safeArray(source.declinedStrategies)
    .map((item) => normalizeCoachMemoryItem(item, { category: item?.category || item?.strategyCategory, now }))
    .filter(Boolean)
    .filter((item) => item.evidenceCount >= 2 && item.lifecycle !== 'forgotten')
    .slice(0, 8)
  const recurringBarriers = safeArray(source.recurringBarriers)
    .map((item) => normalizeCoachMemoryItem(item, { category: item?.category || item?.barrierCategory, now }))
    .filter(Boolean)
    .filter((item) => item.evidenceCount >= 2 && item.lifecycle !== 'forgotten')
    .slice(0, 6)

  return {
    activePriorities: uniqueCategories(source.activePriorities),
    adaptationMetadata: {
      generatedAt: safeDate(source.adaptationMetadata?.generatedAt, now),
      lastReviewedAt: safeDate(source.adaptationMetadata?.lastReviewedAt || source.consent?.memoryReviewedAt, ''),
      memoryVersion: coachMemoryVersion,
      sourceVersion: safeText(source.adaptationMetadata?.sourceVersion, 'adaptiveCoachV8', 40) || 'adaptiveCoachV8',
      staleAfter: safeDate(source.adaptationMetadata?.staleAfter, ''),
      userEdited: source.adaptationMetadata?.userEdited === true,
    },
    categories: coachMemoryCategories,
    consent: normalizeConsent(source.consent),
    declinedStrategies,
    preferences: normalizePreferences(source.preferences || source.coachStyle),
    recentContext: normalizeRecentContext(source.recentContext, { now }),
    recurringBarriers,
    successfulStrategies,
    version: coachMemoryVersion,
  }
}

export function createDefaultCoachMemory(options = {}) {
  return normalizeCoachMemory({}, options)
}

export function forgetCoachMemoryItem(memory = {}, itemId = '', options = {}) {
  const normalized = normalizeCoachMemory(memory, options)
  const markForgotten = (item) => item.id === itemId ? { ...item, lifecycle: 'forgotten' } : item
  return normalizeCoachMemory({
    ...normalized,
    declinedStrategies: normalized.declinedStrategies.map(markForgotten),
    recurringBarriers: normalized.recurringBarriers.map(markForgotten),
    successfulStrategies: normalized.successfulStrategies.map(markForgotten),
  }, options)
}

export function forgetDerivedCoachMemory(memory = {}, options = {}) {
  const normalized = normalizeCoachMemory(memory, options)
  return normalizeCoachMemory({
    ...normalized,
    declinedStrategies: [],
    recurringBarriers: [],
    successfulStrategies: [],
  }, options)
}

export function updateCoachMemoryPreferences(memory = {}, patch = {}, options = {}) {
  const normalized = normalizeCoachMemory(memory, options)
  return normalizeCoachMemory({
    ...normalized,
    adaptationMetadata: {
      ...normalized.adaptationMetadata,
      userEdited: true,
    },
    preferences: {
      ...normalized.preferences,
      ...safeObject(patch),
    },
  }, options)
}

export const coachMemoryModelInternals = {
  hashText,
  safeText,
  sensitivePatterns,
}

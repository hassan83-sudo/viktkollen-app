import { readStorageResult, writeStorageResult } from '../../services/appStorageService.js'

export const wellbeingStorageKey = 'viktkollen.wellbeing.v1'
export const wellbeingSchemaVersion = 1
export const wellbeingRetentionDays = 90

export const moodOptions = Object.freeze(['great', 'good', 'okay', 'heavy', 'veryHard'])
export const reasonOptions = Object.freeze(['stress', 'worry', 'sad', 'lonely', 'angry', 'sleep', 'preferNot'])
export const exerciseIds = Object.freeze(['breathe', 'grounding', 'relax', 'nextStep', 'contact'])

const defaultState = Object.freeze({
  schemaVersion: wellbeingSchemaVersion,
  checkIns: [],
  plan: {
    helps: '',
    personalSupportLine: '',
    safePeople: '',
    safePlaces: '',
    warningSigns: '',
    careContacts: '',
    updatedAt: '',
  },
  notes: [],
  updatedAt: '',
})

function safeDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function safeText(value, maxLength = 800) {
  return String(value || '').trim().slice(0, maxLength)
}

function cutoffIso(now = new Date().toISOString()) {
  const date = safeDate(now) || new Date()
  date.setDate(date.getDate() - wellbeingRetentionDays)
  return date.toISOString()
}

export function normalizeWellbeingPlan(plan = {}, options = {}) {
  const source = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {}
  return {
    helps: safeText(source.helps),
    personalSupportLine: safeText(source.personalSupportLine, 280),
    safePeople: safeText(source.safePeople),
    safePlaces: safeText(source.safePlaces),
    warningSigns: safeText(source.warningSigns),
    careContacts: safeText(source.careContacts),
    updatedAt: safeDate(source.updatedAt)?.toISOString() || options.now || '',
  }
}

export function normalizeWellbeingCheckIn(checkIn = {}, options = {}) {
  const now = options.now || new Date().toISOString()
  const mood = moodOptions.includes(checkIn.mood) ? checkIn.mood : ''
  const reasons = Array.isArray(checkIn.reasons)
    ? checkIn.reasons.filter((reason) => reasonOptions.includes(reason))
    : []

  return {
    createdAt: safeDate(checkIn.createdAt)?.toISOString() || now,
    id: typeof checkIn.id === 'string' && checkIn.id ? checkIn.id : `wellbeing-${now}`,
    mood,
    note: safeText(checkIn.note),
    reasons: [...new Set(reasons)],
  }
}

export function normalizeWellbeingState(input = {}, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const cutoff = cutoffIso(options.now)
  const checkIns = Array.isArray(source.checkIns)
    ? source.checkIns
      .map((item) => normalizeWellbeingCheckIn(item, options))
      .filter((item) => item.mood && item.createdAt >= cutoff)
      .slice(-120)
    : []

  return {
    schemaVersion: wellbeingSchemaVersion,
    checkIns,
    plan: normalizeWellbeingPlan(source.plan, options),
    notes: [],
    updatedAt: safeDate(source.updatedAt)?.toISOString() || options.now || '',
  }
}

export function createWellbeingCheckIn(state, draft, options = {}) {
  const current = normalizeWellbeingState(state, options)
  const now = options.now || new Date().toISOString()
  const checkIn = normalizeWellbeingCheckIn({ ...draft, createdAt: now, id: `wellbeing-${now}` }, { now })
  if (!checkIn.mood) return current

  return normalizeWellbeingState({
    ...current,
    checkIns: [...current.checkIns, checkIn],
    updatedAt: now,
  }, { now })
}

export function updateWellbeingPlan(state, plan, options = {}) {
  const now = options.now || new Date().toISOString()
  return normalizeWellbeingState({
    ...normalizeWellbeingState(state, options),
    plan: normalizeWellbeingPlan({ ...plan, updatedAt: now }, { now }),
    updatedAt: now,
  }, { now })
}

export function clearWellbeingPlan(state, options = {}) {
  const now = options.now || new Date().toISOString()
  return normalizeWellbeingState({
    ...normalizeWellbeingState(state, options),
    plan: { ...defaultState.plan, updatedAt: now },
    updatedAt: now,
  }, { now })
}

export function getWellbeingCoachCapabilities(config = {}) {
  return {
    aiAvailable: config.aiAvailable === true,
    canListen: false,
    canUseMicrophone: false,
    placeholder: config.aiAvailable !== true,
    safetyMode: true,
  }
}

export function evaluateWellbeingSafety(text = '') {
  const normalized = String(text || '').toLocaleLowerCase('sv-SE')
  const immediateRisk = /\b(självmord|ta livet|vill dö|inte säker|skada mig|skada någon|akut fara|fara)\b/i.test(normalized)
  return {
    immediateRisk,
    recommendedAction: immediateRisk ? 'emergency' : 'support',
  }
}

export function createPreparedSupportMessage() {
  return 'Hej. Jag mår inte så bra just nu och skulle behöva prata med någon. Har du möjlighet?'
}

export function getAgeLanguage(profile = {}, readyState = {}) {
  const level = profile?.schoolLevel || readyState?.level || readyState?.selectedLevel || ''
  if (['preschool', 'fklass', 'lagstadiet', 'mellanstadiet'].includes(level)) return 'child'
  if (['hogstadiet', 'gymnasium'].includes(level)) return 'teen'
  return 'general'
}

export function readWellbeingState() {
  return normalizeWellbeingState(readStorageResult(wellbeingStorageKey, defaultState).value)
}

export function saveWellbeingState(state) {
  const next = normalizeWellbeingState(state)
  writeStorageResult(wellbeingStorageKey, next)
  return next
}

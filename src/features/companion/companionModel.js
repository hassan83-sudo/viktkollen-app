import { readStorage, removeStorage, writeStorage } from '../../services/appStorageService.js'
import { readyPersonalities, readyAvatars } from '../ready/readyAvatars.js'
import { readyStorageKey } from '../ready/readyModel.js'

export const companionStorageKey = 'viktkollen.ai-companion.v1'
export const companionSchemaVersion = 1

export const companionToneIds = Object.freeze(['calm', 'direct-honest', 'encouraging', 'custom'])
export const companionResponseLengths = Object.freeze(['short', 'balanced', 'detailed'])
export const companionEncouragementLevels = Object.freeze(['low', 'medium', 'high'])
export const companionDirectnessLevels = Object.freeze(['gentle', 'clear', 'very-direct'])
export const companionEmojiPreferences = Object.freeze(['none', 'some', 'many'])
export const companionReminderSuggestionPreferences = Object.freeze(['off', 'ask-first', 'suggest'])
export const companionAgeStyles = Object.freeze(['child', 'teen', 'adult', 'all-ages'])
export const companionCommunicationPreferences = Object.freeze(['text', 'visual', 'text-and-verified-sign'])
export const companionSignLanguageIds = Object.freeze(['sts', 'asl', 'bsl', 'international-sign'])

const avatarIds = new Set(readyAvatars.map((avatar) => avatar.id))
const toneIds = new Set(companionToneIds)
const responseLengths = new Set(companionResponseLengths)
const encouragementLevels = new Set(companionEncouragementLevels)
const directnessLevels = new Set(companionDirectnessLevels)
const emojiPreferences = new Set(companionEmojiPreferences)
const reminderSuggestionPreferences = new Set(companionReminderSuggestionPreferences)
const ageStyles = new Set(companionAgeStyles)
const communicationPreferences = new Set(companionCommunicationPreferences)
const signLanguageIds = new Set(companionSignLanguageIds)

function cleanText(value, fallback = '') {
  return String(value || fallback).trim().slice(0, 40)
}

function pick(validValues, value, fallback) {
  return validValues.has(value) ? value : fallback
}

function nowIso() {
  return new Date().toISOString()
}

export function createDefaultCompanionProfile(overrides = {}) {
  const now = nowIso()
  return normalizeCompanionProfile({
    version: companionSchemaVersion,
    avatarId: 'nova',
    displayName: 'AI-kompisen',
    pronouns: '',
    tone: 'calm',
    responseLength: 'balanced',
    encouragementLevel: 'medium',
    directness: 'clear',
    emojiPreference: 'some',
    reminderSuggestionPreference: 'ask-first',
    ageStyle: 'all-ages',
    selectedSignLanguage: 'sts',
    communicationPreference: 'text',
    prefersSpeech: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  })
}

export function normalizeCompanionProfile(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const createdAt = typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : nowIso()
  const updatedAt = typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt

  return {
    version: companionSchemaVersion,
    avatarId: pick(avatarIds, source.avatarId, 'nova'),
    displayName: cleanText(source.displayName, 'AI-kompisen') || 'AI-kompisen',
    pronouns: cleanText(source.pronouns),
    tone: pick(toneIds, source.tone, 'calm'),
    responseLength: pick(responseLengths, source.responseLength, 'balanced'),
    encouragementLevel: pick(encouragementLevels, source.encouragementLevel, 'medium'),
    directness: pick(directnessLevels, source.directness, 'clear'),
    emojiPreference: pick(emojiPreferences, source.emojiPreference, 'some'),
    reminderSuggestionPreference: pick(reminderSuggestionPreferences, source.reminderSuggestionPreference, 'ask-first'),
    ageStyle: pick(ageStyles, source.ageStyle, 'all-ages'),
    selectedSignLanguage: pick(signLanguageIds, source.selectedSignLanguage, 'sts'),
    communicationPreference: pick(communicationPreferences, source.communicationPreference, 'text'),
    prefersSpeech: source.prefersSpeech === true,
    createdAt,
    updatedAt,
  }
}

export function migrateReadyCompanionProfile(readyState = {}, existingProfile = null) {
  if (existingProfile) return normalizeCompanionProfile(existingProfile)
  const personalityTone = {
    calm: 'calm',
    cheerful: 'encouraging',
    direct: 'direct-honest',
    funny: 'encouraging',
    study: 'calm',
  }
  const readyPersonality = readyPersonalities.includes(readyState.personality) ? readyState.personality : 'calm'
  return createDefaultCompanionProfile({
    avatarId: readyState.avatarId,
    pronouns: readyState.pronouns,
    tone: personalityTone[readyPersonality],
    selectedSignLanguage: readyState.selectedSignLanguage,
    communicationPreference: readyState.communicationPreference,
    prefersSpeech: readyState.prefersSpeech,
  })
}

export function loadCompanionProfile() {
  const stored = readStorage(companionStorageKey, null)
  if (stored) return normalizeCompanionProfile(stored)
  const readyState = readStorage(readyStorageKey, null)
  const migrated = migrateReadyCompanionProfile(readyState || {})
  writeStorage(companionStorageKey, migrated)
  return migrated
}

export function saveCompanionProfile(profile) {
  const previous = readStorage(companionStorageKey, null)
  const normalized = normalizeCompanionProfile({
    ...previous,
    ...profile,
    updatedAt: nowIso(),
  })
  writeStorage(companionStorageKey, normalized)
  return normalized
}

export function resetCompanionProfile() {
  return saveCompanionProfile(createDefaultCompanionProfile())
}

export function deleteCompanionProfile(confirmation) {
  if (String(confirmation || '').trim().toLocaleLowerCase('sv-SE') !== 'radera ai-kompis') {
    return { deleted: false, profile: loadCompanionProfile() }
  }
  removeStorage(companionStorageKey)
  return { deleted: true, profile: createDefaultCompanionProfile({ deletedAt: nowIso() }) }
}

export const companionSafetyPolicy = Object.freeze({
  alwaysClearlyAi: true,
  noRomanceOrSexualMinors: true,
  noSecrets: true,
  noExclusiveRelationship: true,
  noManipulation: true,
  neverReplacesTrustedPeopleOrCare: true,
  trustedAdultForSeriousRisk: true,
  emergency112First: true,
  noDiagnosis: true,
  noMedicationAdvice: true,
  safetyOverridesPersonality: true,
})

export function getCompanionCombinationCount() {
  return readyAvatars.length *
    companionToneIds.length *
    companionResponseLengths.length *
    companionEncouragementLevels.length *
    companionDirectnessLevels.length *
    companionEmojiPreferences.length *
    companionReminderSuggestionPreferences.length *
    companionAgeStyles.length *
    companionSignLanguageIds.length *
    companionCommunicationPreferences.length *
    2
}

/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { userDataKeys } from '../../services/userDataRepository.js'
import { readyStorageKey } from '../ready/readyModel.js'
import {
  companionSafetyPolicy,
  companionStorageKey,
  createDefaultCompanionProfile,
  deleteCompanionProfile,
  getCompanionCombinationCount,
  loadCompanionProfile,
  migrateReadyCompanionProfile,
  normalizeCompanionProfile,
  resetCompanionProfile,
  saveCompanionProfile,
} from './companionModel.js'

describe('companionModel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('creates and validates the shared default profile', () => {
    expect(createDefaultCompanionProfile()).toMatchObject({
      avatarId: 'nova',
      communicationPreference: 'text',
      directness: 'clear',
      displayName: 'AI-kompisen',
      emojiPreference: 'some',
      encouragementLevel: 'medium',
      responseLength: 'balanced',
      selectedSignLanguage: 'sts',
      tone: 'calm',
      version: 1,
    })
  })

  it('normalizes corrupt stored values without crashing', () => {
    expect(normalizeCompanionProfile({
      avatarId: 'missing',
      communicationPreference: 'unsafe',
      directness: 'pushy',
      displayName: '  Kompis med ett väldigt långt namn som kapas  ',
      emojiPreference: 'all',
      selectedSignLanguage: 'mixed',
      tone: 'secret',
    })).toMatchObject({
      avatarId: 'nova',
      communicationPreference: 'text',
      directness: 'clear',
      emojiPreference: 'some',
      selectedSignLanguage: 'sts',
      tone: 'calm',
    })
  })

  it('migrates old Ready choices idempotently into the shared key', () => {
    window.localStorage.setItem(readyStorageKey, JSON.stringify({
      avatarId: 'ash',
      communicationPreference: 'text-and-verified-sign',
      personality: 'direct',
      prefersSpeech: true,
      pronouns: 'hen',
      selectedSignLanguage: 'bsl',
    }))

    const first = loadCompanionProfile()
    const second = loadCompanionProfile()

    expect(first).toMatchObject({
      avatarId: 'ash',
      communicationPreference: 'text-and-verified-sign',
      prefersSpeech: true,
      pronouns: 'hen',
      selectedSignLanguage: 'bsl',
      tone: 'direct-honest',
    })
    expect(second).toEqual(first)
    expect(JSON.parse(window.localStorage.getItem(companionStorageKey))).toMatchObject(first)
  })

  it('preserves existing shared profile over Ready migration input', () => {
    const existing = createDefaultCompanionProfile({ avatarId: 'quill', displayName: 'Mira' })
    expect(migrateReadyCompanionProfile({ avatarId: 'ash' }, existing)).toMatchObject({
      avatarId: 'quill',
      displayName: 'Mira',
    })
  })

  it('saves edits, resets, and deletes only the companion profile after confirmation', () => {
    const preserved = {
      [userDataKeys.aiCoachReports]: [{ id: 'coach-report' }],
      [userDataKeys.chat]: [{ role: 'user', content: 'hej' }],
      [userDataKeys.goalsHabits]: { active: true },
      [userDataKeys.meals]: [{ id: 'meal' }],
      [userDataKeys.readyStore]: { items: [{ label: 'Ryggsack' }] },
      [userDataKeys.remindersV2]: [{ id: 'notice' }],
      [userDataKeys.weights]: [{ value: 80 }],
      'viktkollen.economy.v1': { budget: [] },
      'viktkollen.wellbeing.v1': { plan: { safePeople: 'Alex' } },
    }
    Object.entries(preserved).forEach(([key, value]) => {
      window.localStorage.setItem(key, JSON.stringify(value))
    })
    saveCompanionProfile({
      avatarId: 'kai',
      directness: 'very-direct',
      displayName: 'Sam',
      emojiPreference: 'none',
      encouragementLevel: 'high',
      responseLength: 'short',
      tone: 'encouraging',
    })

    expect(JSON.parse(window.localStorage.getItem(companionStorageKey))).toMatchObject({
      avatarId: 'kai',
      displayName: 'Sam',
    })

    expect(resetCompanionProfile()).toMatchObject({ avatarId: 'nova', displayName: 'AI-kompisen' })
    expect(deleteCompanionProfile('fel').deleted).toBe(false)
    expect(deleteCompanionProfile('radera ai-kompis').deleted).toBe(true)
    expect(window.localStorage.getItem(companionStorageKey)).toBe(null)
    Object.entries(preserved).forEach(([key, value]) => {
      expect(JSON.parse(window.localStorage.getItem(key))).toEqual(value)
    })
  })

  it('keeps child safety rules explicit and counts data-driven combinations', () => {
    expect(companionSafetyPolicy).toMatchObject({
      alwaysClearlyAi: true,
      emergency112First: true,
      noDiagnosis: true,
      noExclusiveRelationship: true,
      noManipulation: true,
      noMedicationAdvice: true,
      noRomanceOrSexualMinors: true,
      noSecrets: true,
      safetyOverridesPersonality: true,
      trustedAdultForSeriousRisk: true,
    })
    expect(getCompanionCombinationCount()).toBe(746496)
  })
})

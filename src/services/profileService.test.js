import { describe, expect, it } from 'vitest'

import {
  buildCompactProfileContext,
  createProfileForm,
  getProfileCompleteness,
  hasUsableProfile,
  normalizeActivityLevel,
  normalizeHeightCm,
  normalizeProfile,
  normalizeWeightDirection,
  profileDraftToProfile,
  validateProfileDraft,
} from './profileService.js'

describe('profileService', () => {
  it('normalizes legacy profile fields into the central profile model', () => {
    const profile = normalizeProfile({
      activityLevel: 'Medel',
      goal: 'gå ner i vikt',
      goalWeight: '78 kg',
      height: '178',
      name: ' Hassan ',
      startWeight: '91,8',
    }, { now: '2026-08-19T10:00:00.000Z' })

    expect(profile).toMatchObject({
      activityLevel: 'moderate',
      activityLevelLabel: 'Medel',
      displayName: 'Hassan',
      goalWeight: '78',
      height: '178',
      heightCm: 178,
      name: 'Hassan',
      schemaVersion: 2,
      startWeight: '91,8',
      weightDirection: 'loss',
    })
    expect(profile.provenance).toMatchObject({
      activityLevel: 'user_entered',
      displayName: 'user_entered',
      goalWeight: 'user_entered',
      height: 'user_entered',
      startWeight: 'user_entered',
      weightDirection: 'user_entered',
    })
  })

  it('keeps empty and partial profiles usable without fake defaults', () => {
    const empty = normalizeProfile({}, { now: '2026-08-19T10:00:00.000Z' })
    const partial = normalizeProfile({ displayName: 'Ali', onboardingCompleted: true })

    expect(empty.displayName).toBe('')
    expect(empty.heightCm).toBeNull()
    expect(empty.weightDirection).toBe('missing')
    expect(empty.provenance.height).toBe('missing')
    expect(hasUsableProfile(empty)).toBe(false)
    expect(hasUsableProfile(partial)).toBe(true)
  })

  it('validates height and weights defensively', () => {
    expect(normalizeHeightCm('1,78')).toBe(178)
    expect(normalizeHeightCm('178')).toBe(178)
    expect(normalizeHeightCm('-178')).toBeNull()
    expect(normalizeHeightCm('450')).toBeNull()
    expect(validateProfileDraft({ goalWeight: '900', height: '45', startWeight: 'abc' })).toMatchObject({
      goalWeight: expect.any(String),
      height: expect.any(String),
      startWeight: expect.any(String),
    })
  })

  it('normalizes activity and goal direction aliases backward compatibly', () => {
    expect(normalizeActivityLevel('Låg')).toBe('low')
    expect(normalizeActivityLevel('lätt promenad')).toBe('light')
    expect(normalizeActivityLevel('Hög träning')).toBe('high')
    expect(normalizeWeightDirection('bygga muskler')).toBe('gain')
    expect(normalizeWeightDirection('', { goalWeight: 80, startWeight: 90 })).toBe('loss')
    expect(normalizeWeightDirection('', { goalWeight: 90, startWeight: 80 })).toBe('gain')
  })

  it('creates a skippable onboarding profile and keeps dietary preferences structured', () => {
    const result = profileDraftToProfile({
      activityLevel: 'light',
      avoidances: 'jordnötter, fläsk',
      dietaryPattern: 'vegetarian',
      displayName: '',
      goalWeight: '',
      height: '',
      startWeight: '',
      weightDirection: 'maintain',
    }, { now: '2026-08-19T10:00:00.000Z' })

    expect(result.errors).toEqual({})
    expect(result.profile).toMatchObject({
      activityLevel: 'light',
      onboardingCompleted: true,
      weightDirection: 'maintain',
    })
    expect(result.profile.dietaryPreferences).toMatchObject({
      avoidedFoods: ['jordnötter', 'fläsk'],
      dietType: 'vegetarian',
    })
  })

  it('reports completeness and next best action without aggressive fake precision', () => {
    const completeness = getProfileCompleteness({ displayName: 'Ali', onboardingCompleted: true })

    expect(completeness.status).toBe('partial')
    expect(completeness.completed).toContain('Grundprofil')
    expect(completeness.missing.map((item) => item.id)).toContain('height')
    expect(completeness.nextBestAction).toContain('Lägg till längd')
  })

  it('builds compact AI-safe profile context instead of a raw profile dump', () => {
    const context = buildCompactProfileContext({
      accessToken: 'secret',
      activityLevel: 'Hög',
      displayName: 'Ali',
      goalWeight: '82 kg',
      height: 181,
      session: { user: 'not-for-ai' },
    })

    expect(context).toMatchObject({
      activityLevel: 'high',
      displayName: 'Ali',
      goalWeight: 82,
      heightCm: 181,
    })
    expect(JSON.stringify(context)).not.toMatch(/secret|session|accessToken/)
  })

  it('roundtrips current forms from normalized profile values', () => {
    const form = createProfileForm(normalizeProfile({
      activityLevel: 'Hög',
      dietaryPreferences: { avoidedFoods: ['nötter'], dietType: 'vegan' },
      goalWeight: '82',
      height: 181,
      name: 'Ali',
      startWeight: '90',
    }))

    expect(form).toMatchObject({
      activityLevel: 'high',
      avoidances: 'nötter',
      dietaryPattern: 'vegan',
      displayName: 'Ali',
      height: '181',
      weightDirection: 'loss',
    })
  })
})

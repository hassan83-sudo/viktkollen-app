import { describe, expect, it } from 'vitest'

import {
  getNutritionRemoteConsentStorageKey,
  grantNutritionRemoteConsent,
  normalizeNutritionRemoteConsent,
  readNutritionRemoteConsent,
  revokeNutritionRemoteConsent,
} from './nutritionRemoteConsent.js'

function memoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed))
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
  }
}

describe('nutritionRemoteConsent', () => {
  it('saves first explicit consent for the current user', () => {
    const storage = memoryStorage()
    const consent = grantNutritionRemoteConsent('user-a', {
      now: '2026-08-19T10:00:00.000Z',
      storage,
    })

    expect(consent.granted).toBe(true)
    expect(readNutritionRemoteConsent('user-a', { storage }).granted).toBe(true)
    expect(readNutritionRemoteConsent('user-a', { storage }).grantedAt).toBe('2026-08-19T10:00:00.000Z')
  })

  it('persists consent so a second analysis does not require a new checkbox', () => {
    const storage = memoryStorage()
    grantNutritionRemoteConsent('user-a', { storage })

    expect(readNutritionRemoteConsent('user-a', { storage }).granted).toBe(true)
    expect(readNutritionRemoteConsent('user-a', { storage }).version).toBe('nutrition-photo-remote-v1')
  })

  it('does not leak consent between users or logout fallback scope', () => {
    const storage = memoryStorage()
    grantNutritionRemoteConsent('user-a', { storage })

    expect(readNutritionRemoteConsent('user-b', { storage }).granted).toBe(false)
    expect(readNutritionRemoteConsent('', { storage }).granted).toBe(false)
    expect(getNutritionRemoteConsentStorageKey('user-a')).not.toBe(getNutritionRemoteConsentStorageKey('user-b'))
  })

  it('revoked consent blocks remote analysis again', () => {
    const storage = memoryStorage()
    grantNutritionRemoteConsent('user-a', { storage })
    const revoked = revokeNutritionRemoteConsent('user-a', { storage })

    expect(revoked.granted).toBe(false)
    expect(readNutritionRemoteConsent('user-a', { storage }).granted).toBe(false)
  })

  it('requires re-consent after a consent version bump', () => {
    const storage = memoryStorage()
    grantNutritionRemoteConsent('user-a', {
      now: '2026-08-19T10:00:00.000Z',
      storage,
      version: 'nutrition-photo-remote-v1',
    })

    expect(readNutritionRemoteConsent('user-a', {
      storage,
      version: 'nutrition-photo-remote-v2',
    }).granted).toBe(false)
  })

  it('fails safe for malformed stored consent', () => {
    const storage = memoryStorage({
      [getNutritionRemoteConsentStorageKey('user-a')]: '{not-json',
      [getNutritionRemoteConsentStorageKey('user-b')]: JSON.stringify({ granted: true, version: 'nutrition-photo-remote-v1' }),
    })

    expect(readNutritionRemoteConsent('user-a', { storage }).granted).toBe(false)
    expect(readNutritionRemoteConsent('user-b', { storage }).granted).toBe(false)
    expect(normalizeNutritionRemoteConsent('yes').granted).toBe(false)
  })
})

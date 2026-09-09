import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createScopedSyncStorage,
  createUserDataScopeFromAuth,
  getProfile,
  getScopedStorageKey,
  getWeights,
  isUserDataScopeHydrated,
  migrateLegacyProfileAndWeights,
  saveProfile,
  saveWeights,
  setActiveUserDataScope,
  userDataKeys,
  userDataScopeMetadataKey,
} from './userDataRepository.js'
import { readSyncMetadata, syncMetadataStorageKey, writeSyncMetadata } from './sync/syncMetadata.js'

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))

  return {
    getItem: vi.fn((key) => (data.has(key) ? data.get(key) : null)),
    removeItem: vi.fn((key) => data.delete(key)),
    setItem: vi.fn((key, value) => data.set(key, String(value))),
    snapshot: () => Object.fromEntries(data.entries()),
  }
}

function installStorage(storage) {
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', {
    CustomEvent: class {
      constructor(type, init = {}) {
        this.detail = init.detail
        this.type = type
      }
    },
    dispatchEvent: vi.fn(),
    localStorage: storage,
  })
}

beforeEach(() => {
  installStorage(createMemoryStorage())
  setActiveUserDataScope(createUserDataScopeFromAuth({ authLoading: true }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('scoped profile and weight repository', () => {
  it('does not read or write profile and weights while auth is loading', () => {
    setActiveUserDataScope(createUserDataScopeFromAuth({ authLoading: true }))

    saveProfile({ displayName: 'Ali', height: 178 })
    saveWeights([{ id: 'w1', value: 90 }])

    expect(getProfile(null)).toBeNull()
    expect(getWeights([])).toEqual([])
    expect(localStorage.snapshot()).toEqual({})
  })

  it('keeps guest data in a separate namespace without marking cloud sync dirty', () => {
    const guestScope = createUserDataScopeFromAuth({ authLoading: false })
    setActiveUserDataScope(guestScope)

    saveProfile({ displayName: 'Guest', height: 171 })
    saveWeights([{ id: 'guest-weight', value: 82 }])

    expect(getProfile(null)).toMatchObject({ displayName: 'Guest', heightCm: 171 })
    expect(getWeights([])).toEqual([{ id: 'guest-weight', value: 82 }])
    expect(localStorage.snapshot()).toHaveProperty(getScopedStorageKey(userDataKeys.profile, guestScope))
    expect(readSyncMetadata(localStorage).pendingKeys).toEqual([])
  })

  it('lets account A save and read profile and weights without exposing them to account B', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const accountB = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-b' })

    setActiveUserDataScope(accountA)
    saveProfile({ displayName: 'A', height: 180 })
    saveWeights([{ id: 'stable-weight-id', updatedAt: '2026-08-30T10:00:00.000Z', value: 91 }])

    setActiveUserDataScope(accountB)
    expect(getProfile(null)).toBeNull()
    expect(getWeights([])).toEqual([])

    setActiveUserDataScope(accountA)
    expect(getProfile(null)).toMatchObject({ displayName: 'A', heightCm: 180 })
    expect(getWeights([])[0].id).toBe('stable-weight-id')
  })

  it('hides account A on logout without deleting it and restores it when A returns', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const guest = createUserDataScopeFromAuth({ authLoading: false })

    setActiveUserDataScope(accountA)
    saveProfile({ displayName: 'A', height: 180 })
    saveWeights([{ id: 'w-a', value: 91 }])

    setActiveUserDataScope(guest)
    expect(getProfile(null)).toBeNull()
    expect(getWeights([])).toEqual([])

    setActiveUserDataScope(accountA)
    expect(getProfile(null)).toMatchObject({ displayName: 'A' })
    expect(getWeights([])).toEqual([{ id: 'w-a', value: 91 }])
  })

  it('migrates legacy profile and weights exactly once without deleting originals or duplicating ids', () => {
    localStorage.setItem(userDataKeys.profile, JSON.stringify({ displayName: 'Legacy', height: 179 }))
    localStorage.setItem(userDataKeys.weights, JSON.stringify([{ id: 'w1', value: 90 }]))

    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const first = migrateLegacyProfileAndWeights(accountA, {
      isProfile: (value) => value && typeof value === 'object' && !Array.isArray(value),
      isWeights: Array.isArray,
    })
    const second = migrateLegacyProfileAndWeights(accountA, {
      isProfile: (value) => value && typeof value === 'object' && !Array.isArray(value),
      isWeights: Array.isArray,
    })

    expect(first.migrated.sort()).toEqual([userDataKeys.profile, userDataKeys.weights].sort())
    expect(second.migrated).toEqual([])
    expect(JSON.parse(localStorage.getItem(userDataKeys.profile))).toMatchObject({ displayName: 'Legacy' })
    expect(JSON.parse(localStorage.getItem(userDataKeys.weights))).toEqual([{ id: 'w1', value: 90 }])

    setActiveUserDataScope(accountA)
    expect(getWeights([])).toEqual([{ id: 'w1', value: 90 }])
  })

  it('does not claim legacy ownership when no valid legacy data exists', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })

    expect(migrateLegacyProfileAndWeights(accountA, {
      isProfile: (value) => value && typeof value === 'object' && !Array.isArray(value),
      isWeights: Array.isArray,
    }).migrated).toEqual([])
    expect(localStorage.getItem(userDataScopeMetadataKey)).toBeNull()
  })

  it('does not allow legacy data to be claimed by a second account', () => {
    localStorage.setItem(userDataKeys.profile, JSON.stringify({ displayName: 'Legacy' }))

    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const accountB = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-b' })

    expect(migrateLegacyProfileAndWeights(accountA, {
      isProfile: (value) => value && typeof value === 'object' && !Array.isArray(value),
      isWeights: Array.isArray,
    }).migrated).toEqual([userDataKeys.profile])
    expect(migrateLegacyProfileAndWeights(accountB, {
      isProfile: (value) => value && typeof value === 'object' && !Array.isArray(value),
      isWeights: Array.isArray,
    }).migrated).toEqual([])

    expect(JSON.parse(localStorage.getItem(userDataScopeMetadataKey)).legacyClaim.storageId).toContain('user-a')
    expect(localStorage.getItem(getScopedStorageKey(userDataKeys.profile, accountB))).toBeNull()
  })

  it('ignores corrupt legacy data safely and keeps the original value untouched', () => {
    localStorage.setItem(userDataKeys.profile, '{bad json')
    localStorage.setItem(userDataKeys.weights, '{bad json')

    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const result = migrateLegacyProfileAndWeights(accountA, {
      isProfile: (value) => value && typeof value === 'object' && !Array.isArray(value),
      isWeights: Array.isArray,
    })

    expect(result.ok).toBe(true)
    expect(result.migrated).toEqual([])
    expect(localStorage.getItem(userDataKeys.profile)).toBe('{bad json')
    expect(localStorage.getItem(userDataKeys.weights)).toBe('{bad json')
  })

  it('maps cloud sync logical keys to only the current authenticated account namespace', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const accountB = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-b' })
    const storageA = createScopedSyncStorage(accountA, localStorage)
    const storageB = createScopedSyncStorage(accountB, localStorage)

    storageA.setItem(userDataKeys.weights, JSON.stringify([{ id: 'w-a', value: 90 }]))
    storageB.setItem(userDataKeys.weights, JSON.stringify([{ id: 'w-b', value: 80 }]))

    expect(JSON.parse(storageA.getItem(userDataKeys.weights))).toEqual([{ id: 'w-a', value: 90 }])
    expect(JSON.parse(storageB.getItem(userDataKeys.weights))).toEqual([{ id: 'w-b', value: 80 }])
    expect(storageA.getItem(syncMetadataStorageKey)).toBeNull()
  })

  it('keeps account A sync metadata from affecting account B', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const accountB = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-b' })

    setActiveUserDataScope(accountA)
    saveWeights([{ id: 'w-a', value: 90 }])

    expect(readSyncMetadata(createScopedSyncStorage(accountA, localStorage)).pendingKeys).toContain(userDataKeys.weights)
    expect(readSyncMetadata(createScopedSyncStorage(accountB, localStorage)).pendingKeys).toEqual([])
    expect(readSyncMetadata(localStorage).pendingKeys).toEqual([])
  })

  it('reloads onboarding profile and start weight only for the same authenticated user scope', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const accountB = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-b' })

    setActiveUserDataScope(accountA)
    saveProfile({ displayName: 'A', height: 181, startWeight: '91,8' })
    saveWeights([{ id: 'onboarding-start-weight', source: 'Manuell', value: 91.8 }])

    setActiveUserDataScope(createUserDataScopeFromAuth({ authLoading: true }))
    setActiveUserDataScope(accountA)
    expect(getProfile(null)).toMatchObject({ displayName: 'A', heightCm: 181, startWeight: '91,8' })
    expect(getWeights([])).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'onboarding-start-weight', value: 91.8 }),
    ]))

    setActiveUserDataScope(accountB)
    expect(getProfile(null)).toBeNull()
    expect(getWeights([])).toEqual([])
  })

  it('treats direct account A to account B switch as unhydrated until B scope loads', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const accountB = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-b' })
    const hydratedScopeId = accountA.storageId

    expect(isUserDataScopeHydrated(accountA, hydratedScopeId)).toBe(true)
    expect(isUserDataScopeHydrated(accountB, hydratedScopeId)).toBe(false)
  })

  it('keeps empty profile and weights from saving during a direct scope switch', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    const accountB = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-b' })
    const hydratedScopeId = accountA.storageId

    setActiveUserDataScope(accountB)
    if (isUserDataScopeHydrated(accountB, hydratedScopeId)) {
      saveProfile({})
      saveWeights([])
    }

    expect(localStorage.getItem(getScopedStorageKey(userDataKeys.profile, accountB))).toBeNull()
    expect(localStorage.getItem(getScopedStorageKey(userDataKeys.weights, accountB))).toBeNull()
  })
})

describe('writeJsonStorage skips no-op writes (CLOUD SYNC SPRINT follow-up, fixed 2026-09)', () => {
  // Root cause being regression-tested: App.jsx's profile/weights auto-save
  // effects re-fire after a successful sync (refreshAppStateFromStorage
  // gives React a fresh object/array reference even when the content did
  // not change), which used to unconditionally call markSyncKeyDirty again
  // and leave pendingKeys non-empty forever even though nothing had
  // actually changed. See src/services/userDataRepository.js's
  // writeJsonStorage for the fix.

  it('1. saveProfile called twice with identical content does not re-mark viktkollen.profile pending on the second call', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    setActiveUserDataScope(accountA)
    const scopedStorage = createScopedSyncStorage(accountA, localStorage)

    saveProfile({ displayName: 'Ali', heightCm: 178 })
    // Round-trip through getProfile so the second saveProfile call is fed
    // exactly the same (already-normalized, timestamp-stable) object the
    // first call produced - this is precisely what
    // refreshAppStateFromStorage() -> setProfile() -> the auto-save effect
    // does in App.jsx after a sync.
    const storedProfile = getProfile(null)

    // Clear pending exactly like a completed sync would.
    writeSyncMetadata({ ...readSyncMetadata(scopedStorage), pendingKeys: [] }, scopedStorage)

    saveProfile(storedProfile)

    expect(readSyncMetadata(scopedStorage).pendingKeys).not.toContain(userDataKeys.profile)
  })

  it('2. saveWeights called twice with identical content does not re-mark viktkollen.weights pending on the second call', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    setActiveUserDataScope(accountA)
    const scopedStorage = createScopedSyncStorage(accountA, localStorage)

    saveWeights([{ id: 'w1', value: 90 }])
    writeSyncMetadata({ ...readSyncMetadata(scopedStorage), pendingKeys: [] }, scopedStorage)

    // A brand-new array/object with the same content, not the same
    // reference - exactly like readInitialWeights() building a fresh
    // array from storage after a sync.
    saveWeights([{ id: 'w1', value: 90 }])

    expect(readSyncMetadata(scopedStorage).pendingKeys).not.toContain(userDataKeys.weights)
  })

  it('3. a genuinely changed profile is still marked pending', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    setActiveUserDataScope(accountA)
    const scopedStorage = createScopedSyncStorage(accountA, localStorage)

    saveProfile({ displayName: 'Ali', heightCm: 178 })
    writeSyncMetadata({ ...readSyncMetadata(scopedStorage), pendingKeys: [] }, scopedStorage)

    saveProfile({ displayName: 'Alexandra', heightCm: 178 })

    expect(readSyncMetadata(scopedStorage).pendingKeys).toContain(userDataKeys.profile)
  })

  it('4. genuinely changed weights are still marked pending', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    setActiveUserDataScope(accountA)
    const scopedStorage = createScopedSyncStorage(accountA, localStorage)

    saveWeights([{ id: 'w1', value: 90 }])
    writeSyncMetadata({ ...readSyncMetadata(scopedStorage), pendingKeys: [] }, scopedStorage)

    saveWeights([{ id: 'w1', value: 89 }])

    expect(readSyncMetadata(scopedStorage).pendingKeys).toContain(userDataKeys.weights)
  })

  it('5. simulates a completed sync: save, clear pending like a successful sync would, re-save identical content -> pendingKeys stays empty for both keys', () => {
    const accountA = createUserDataScopeFromAuth({ authLoading: false, userId: 'user-a' })
    setActiveUserDataScope(accountA)
    const scopedStorage = createScopedSyncStorage(accountA, localStorage)

    saveProfile({ displayName: 'Ali', heightCm: 178 })
    saveWeights([{ id: 'w1', value: 90 }])
    const storedProfile = getProfile(null)

    expect(readSyncMetadata(scopedStorage).pendingKeys).toEqual(
      expect.arrayContaining([userDataKeys.profile, userDataKeys.weights]),
    )

    // Exactly what a successful runCloudSync does at the end of its loop
    // (cloudSyncEngine.js: pendingKeys filtered down to that run's
    // conflicts, which is empty here).
    writeSyncMetadata({ ...readSyncMetadata(scopedStorage), pendingKeys: [] }, scopedStorage)

    // Exactly what App.jsx's refreshAppStateFromStorage() -> setProfile()/
    // setWeights() -> the auto-save effects do next: re-save the same data
    // that was just synced, with fresh object/array references.
    saveProfile(storedProfile)
    saveWeights([{ id: 'w1', value: 90 }])

    expect(readSyncMetadata(scopedStorage).pendingKeys).toEqual([])
  })
})

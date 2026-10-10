/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'

import { clearLocalViktkollenData, getLocalDeletionKeys } from '../../services/accountDeletionClient.js'
import { isAllowedSyncStorageKey } from '../../services/sync/syncMetadata.js'
import { getBackupStorageKeys, setActiveUserDataScope } from '../../services/userDataRepository.js'
import { localModelVersionTag } from './localBodyScanConfig.js'
import {
  clearLocalScanRecords,
  deleteLocalScanRecord,
  getLatestLocalScanRecord,
  getLocalBodyScanStorageKey,
  loadLocalScanRecords,
  saveLocalScanRecord,
} from './localBodyScanStore.js'

const userA = { kind: 'authenticated', storageId: 'user.a', userId: 'a' }
const userB = { kind: 'authenticated', storageId: 'user.b', userId: 'b' }
const loading = { kind: 'loading', storageId: '', userId: '' }

function record(createdAt, waist = 0.23, extra = {}) {
  return {
    createdAt,
    id: `local-${createdAt}`,
    modelVersion: localModelVersionTag,
    views: { front: { conditions: { bodyFraction: 0.8, luminance: 120, roll: 1 }, metrics: { waist } } },
    ...extra,
  }
}

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  setActiveUserDataScope({})
})

describe('local body scan values store', () => {
  it('keeps values per user and never mixes accounts', () => {
    saveLocalScanRecord(record('2026-09-01T08:00:00.000Z', 0.25), userA)
    saveLocalScanRecord(record('2026-09-02T08:00:00.000Z', 0.3), userB)

    expect(getLocalBodyScanStorageKey(userA)).not.toBe(getLocalBodyScanStorageKey(userB))
    expect(loadLocalScanRecords(userA).map((entry) => entry.views.front.metrics.waist)).toEqual([0.25])
    expect(loadLocalScanRecords(userB).map((entry) => entry.views.front.metrics.waist)).toEqual([0.3])
    expect(getLatestLocalScanRecord({ kind: 'guest', storageId: 'guest' })).toBeNull()
  })

  it('strips anything that could carry image data before saving', () => {
    const dirty = record('2026-09-01T08:00:00.000Z', 0.25, {
      frontPhoto: { preview: 'data:image/jpeg;base64,AAAA' },
      image: 'blob:https://app/123',
    })
    dirty.views.front.mask = { data: [1, 1, 1] }
    dirty.views.front.landmarks = [{ x: 1 }]
    dirty.views.front.metrics.preview = 'data:image/png;base64,BBBB'
    saveLocalScanRecord(dirty, userA)

    const raw = window.localStorage.getItem(getLocalBodyScanStorageKey(userA))
    expect(raw).not.toMatch(/data:|blob:|base64|mask|landmarks|preview|image/)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('does not write while the auth scope is loading', () => {
    expect(saveLocalScanRecord(record('2026-09-01T08:00:00.000Z'), loading).ok).toBe(false)
    expect(window.localStorage.length).toBe(0)
  })

  it('deletes one record or all records', () => {
    saveLocalScanRecord(record('2026-09-01T08:00:00.000Z'), userA)
    saveLocalScanRecord(record('2026-09-02T08:00:00.000Z'), userA)
    expect(deleteLocalScanRecord('local-2026-09-01T08:00:00.000Z', userA)).toHaveLength(1)
    clearLocalScanRecords(userA)
    expect(loadLocalScanRecords(userA)).toEqual([])
  })

  it('is never synced or backed up to the cloud', () => {
    const key = getLocalBodyScanStorageKey(userA)
    expect(isAllowedSyncStorageKey(key)).toBe(false)
    expect(getBackupStorageKeys()).not.toContain(key)
  })

  it('is cleared on account deletion for the active user only', () => {
    setActiveUserDataScope({ kind: 'authenticated', userId: 'a' })
    const keyA = getLocalBodyScanStorageKey()
    saveLocalScanRecord(record('2026-09-01T08:00:00.000Z'))
    saveLocalScanRecord(record('2026-09-01T08:00:00.000Z'), userB)

    expect(getLocalDeletionKeys()).toContain(keyA)
    clearLocalViktkollenData()
    expect(window.localStorage.getItem(keyA)).toBeNull()
    expect(loadLocalScanRecords(userB)).toHaveLength(1)
  })
})

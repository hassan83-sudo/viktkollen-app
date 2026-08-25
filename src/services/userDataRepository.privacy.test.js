import { describe, expect, it } from 'vitest'

import {
  getBackupStorageKeys,
  getDeletionStorageKeys,
  userDataKeys,
} from './userDataRepository.js'
import { PROFILE_PHOTO_STORAGE_KEY } from './profilePhotoStorage.js'

describe('user data backup vs deletion keys', () => {
  it('keeps deletion broader than backup', () => {
    const backup = new Set(getBackupStorageKeys())
    const deletion = new Set(getDeletionStorageKeys())

    expect(deletion.size).toBeGreaterThan(backup.size)
    backup.forEach((key) => {
      expect(deletion.has(key)).toBe(true)
    })
  })

  it('deletes the profile photo without adding it to Cloud Backup', () => {
    expect(userDataKeys.profilePhoto).toBe(PROFILE_PHOTO_STORAGE_KEY)
    expect(getDeletionStorageKeys()).toContain(PROFILE_PHOTO_STORAGE_KEY)
    expect(getBackupStorageKeys()).not.toContain(PROFILE_PHOTO_STORAGE_KEY)
  })

  it('still backups Body Scan history metadata keys', () => {
    expect(getBackupStorageKeys()).toContain(userDataKeys.bodyAnalysisHistory)
    expect(getBackupStorageKeys()).toContain(userDataKeys.bodyAnalysisLatest)
    expect(getBackupStorageKeys()).toContain(userDataKeys.bodyAnalysisLegacyHistory)
    expect(getDeletionStorageKeys()).toContain(userDataKeys.bodyAnalysisHistory)
  })

  it('does not start backing up the reminder scheduler lock', () => {
    expect(getBackupStorageKeys()).not.toContain(userDataKeys.reminderSchedulerLock)
    expect(getDeletionStorageKeys()).toContain(userDataKeys.reminderSchedulerLock)
  })
})

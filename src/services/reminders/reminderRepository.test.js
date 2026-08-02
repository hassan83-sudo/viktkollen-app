import { describe, expect, it } from 'vitest'
import { getBackupStorageKeys, userDataKeys } from '../userDataRepository.js'
import { isAllowedSyncStorageKey } from '../sync/syncMetadata.js'
import { getReminderStorageKey } from './reminderRepository.js'

describe('reminderRepository contract', () => {
  it('uses a versioned reminder storage key', () => {
    expect(getReminderStorageKey()).toBe('viktkollen.reminders.v2')
    expect(userDataKeys.remindersV2).toBe('viktkollen.reminders.v2')
  })

  it('syncs and backs up reminder data but not the technical scheduler lock', () => {
    expect(isAllowedSyncStorageKey(userDataKeys.remindersV2)).toBe(true)
    expect(isAllowedSyncStorageKey(userDataKeys.reminderSchedulerLock)).toBe(false)
    expect(getBackupStorageKeys()).toContain(userDataKeys.remindersV2)
    expect(getBackupStorageKeys()).not.toContain(userDataKeys.reminderSchedulerLock)
  })
})

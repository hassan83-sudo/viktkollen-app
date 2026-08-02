import * as userDataRepository from '../userDataRepository.js'
import { readStorage, writeStorage } from '../appStorageService.js'
import { normalizeReminderState, reminderStorageKey } from './reminderModel.js'

const schedulerLockKey = userDataRepository.userDataKeys.reminderSchedulerLock
const schedulerLockTtlMs = 45000

export function readReminderState(options = {}) {
  return normalizeReminderState(
    userDataRepository.getRemindersV2({}, (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))),
    options,
  )
}

export function saveReminderState(state, options = {}) {
  return userDataRepository.saveRemindersV2(normalizeReminderState(state, options))
}

export function claimReminderSchedulerLeadership(tabId, options = {}) {
  const now = Number(options.now ?? Date.now())
  const current = readStorage(schedulerLockKey, null)
  const currentExpiresAt = Number(current?.expiresAt || 0)

  if (current?.tabId && current.tabId !== tabId && currentExpiresAt > now) {
    return false
  }

  writeStorage(schedulerLockKey, {
    expiresAt: now + schedulerLockTtlMs,
    storageKey: reminderStorageKey,
    tabId,
  })

  return true
}

export function releaseReminderSchedulerLeadership(tabId) {
  const current = readStorage(schedulerLockKey, null)
  if (current?.tabId === tabId) {
    writeStorage(schedulerLockKey, null)
  }
}

export function getReminderStorageKey() {
  return reminderStorageKey
}

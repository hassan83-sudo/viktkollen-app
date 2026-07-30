import { markSyncKeyDirty } from './sync/syncMetadata.js'

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function readStorage(key, fallbackValue) {
  if (!canUseLocalStorage()) {
    return fallbackValue
  }

  try {
    const storedValue = window.localStorage.getItem(key)

    if (storedValue === null) {
      return fallbackValue
    }

    return JSON.parse(storedValue)
  } catch {
    return fallbackValue
  }
}

export function writeStorage(key, value) {
  if (!canUseLocalStorage()) {
    return false
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    markSyncKeyDirty(key, window.localStorage)
    return true
  } catch {
    return false
  }
}

export function removeStorage(key) {
  if (!canUseLocalStorage()) {
    return false
  }

  try {
    window.localStorage.removeItem(key)
    markSyncKeyDirty(key, window.localStorage)
    return true
  } catch {
    return false
  }
}

import { markSyncKeyDirty } from './sync/syncMetadata.js'
import { normalizeAppError } from './appErrorService.js'

export const appStorageChangedEvent = 'viktkollen:app-storage-changed'

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function notifyStorageChanged(key) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return

  const EventConstructor = window.CustomEvent || (typeof CustomEvent === 'function' ? CustomEvent : null)
  if (!EventConstructor) return

  window.dispatchEvent(new EventConstructor(appStorageChangedEvent, {
    detail: { key },
  }))
}

export function readStorage(key, fallbackValue) {
  return readStorageResult(key, fallbackValue).value
}

export function readStorageResult(key, fallbackValue) {
  if (!canUseLocalStorage()) {
    return {
      error: null,
      ok: false,
      reason: 'Lokal lagring är inte tillgänglig.',
      type: 'storage_unavailable',
      value: fallbackValue,
    }
  }

  try {
    const storedValue = window.localStorage.getItem(key)

    if (storedValue === null) {
      return {
        error: null,
        ok: true,
        reason: '',
        type: 'missing',
        value: fallbackValue,
      }
    }

    return {
      error: null,
      ok: true,
      reason: '',
      type: 'ok',
      value: JSON.parse(storedValue),
    }
  } catch (error) {
    const normalized = normalizeAppError(error, { area: 'storage' })

    return {
      error,
      ok: false,
      reason: normalized.userMessage,
      type: normalized.type,
      value: fallbackValue,
    }
  }
}

export function writeStorage(key, value) {
  return writeStorageResult(key, value).ok
}

export function writeStorageResult(key, value) {
  if (!canUseLocalStorage()) {
    return {
      error: null,
      ok: false,
      reason: 'Lokal lagring är inte tillgänglig.',
      type: 'storage_unavailable',
    }
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    markSyncKeyDirty(key, window.localStorage)
    notifyStorageChanged(key)
    return {
      error: null,
      ok: true,
      reason: '',
      type: 'ok',
    }
  } catch (error) {
    const normalized = normalizeAppError(error, { area: 'storage' })

    return {
      error,
      ok: false,
      reason: normalized.userMessage,
      type: normalized.type,
    }
  }
}

export function removeStorage(key) {
  return removeStorageResult(key).ok
}

export function removeStorageResult(key) {
  if (!canUseLocalStorage()) {
    return {
      error: null,
      ok: false,
      reason: 'Lokal lagring är inte tillgänglig.',
      type: 'storage_unavailable',
    }
  }

  try {
    window.localStorage.removeItem(key)
    markSyncKeyDirty(key, window.localStorage)
    notifyStorageChanged(key)
    return {
      error: null,
      ok: true,
      reason: '',
      type: 'ok',
    }
  } catch (error) {
    const normalized = normalizeAppError(error, { area: 'storage' })

    return {
      error,
      ok: false,
      reason: normalized.userMessage,
      type: normalized.type,
    }
  }
}

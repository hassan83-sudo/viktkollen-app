import { appStorageChangedEvent } from '../appStorageService.js'
import { loadCloudSyncEngine } from '../cloudRuntimeLoader.js'
import { refreshSyncStatus, resetSyncStatus } from './syncStatusStore.js'
import { getDueSyncQueueItems, readSyncQueue } from './syncQueue.js'
import { isAllowedSyncStorageKey, readSyncMetadata } from './syncMetadata.js'

export const defaultSyncSchedulerOptions = {
  debounceMs: 1500,
  maxWaitMs: 30000,
  periodicMs: 5 * 60 * 1000,
}

function getOnlineState(windowRef) {
  return windowRef?.navigator?.onLine !== false
}

function getVisibilityState(documentRef) {
  return documentRef?.visibilityState || 'visible'
}

function getRetryAt(storage) {
  return readSyncQueue(storage).items
    .map((item) => item.nextAttemptAt)
    .filter(Boolean)
    .sort()[0] || ''
}

function retryIsDue(retryAt, now = new Date()) {
  return !retryAt || new Date(retryAt).getTime() <= now.getTime()
}

function shouldAutoRun({ force = false, storage, windowRef }) {
  if (force) return true
  if (!getOnlineState(windowRef)) return false

  const metadata = readSyncMetadata(storage)
  if (!metadata.enabled || metadata.conflicts.length > 0) return false
  if (metadata.pendingKeys.length === 0 && getDueSyncQueueItems(readSyncQueue(storage)).length === 0) return false

  return retryIsDue(getRetryAt(storage))
}

export function createGlobalSyncScheduler(options = {}) {
  const config = { ...defaultSyncSchedulerOptions, ...options }
  const windowRef = config.windowRef || (typeof window !== 'undefined' ? window : null)
  const documentRef = config.documentRef || (typeof document !== 'undefined' ? document : null)
  const storage = config.storage
  const loadEngine = config.loadEngine || loadCloudSyncEngine
  const setTimeoutRef = config.setTimeout || ((callback, delay) => windowRef?.setTimeout(callback, delay))
  const clearTimeoutRef = config.clearTimeout || ((timerId) => windowRef?.clearTimeout(timerId))
  const setIntervalRef = config.setInterval || ((callback, delay) => windowRef?.setInterval(callback, delay))
  const clearIntervalRef = config.clearInterval || ((timerId) => windowRef?.clearInterval(timerId))

  let userId = ''
  let stopped = true
  let runToken = 0
  let runningPromise = null
  let pendingAfterRun = false
  let debounceTimer = null
  let maxWaitTimer = null
  let periodicTimer = null
  let currentReason = ''
  let onDataChanged = () => {}

  function clearTimers() {
    if (debounceTimer) clearTimeoutRef(debounceTimer)
    if (maxWaitTimer) clearTimeoutRef(maxWaitTimer)
    if (periodicTimer) clearIntervalRef(periodicTimer)
    debounceTimer = null
    maxWaitTimer = null
    periodicTimer = null
  }

  function clearScheduleTimers() {
    if (debounceTimer) clearTimeoutRef(debounceTimer)
    if (maxWaitTimer) clearTimeoutRef(maxWaitTimer)
    debounceTimer = null
    maxWaitTimer = null
  }

  async function run(reason = 'auto', runOptions = {}) {
    if (stopped || !userId) {
      refreshSyncStatus({ currentTrigger: reason, running: false, userId })
      return { ok: false, status: 'not_authenticated' }
    }

    if (runningPromise) {
      pendingAfterRun = true
      return runningPromise
    }

    const force = runOptions.force === true
    if (!shouldAutoRun({ force, storage, windowRef })) {
      refreshSyncStatus({ currentTrigger: reason, running: false, userId })
      return { ok: true, status: 'skipped' }
    }

    const token = runToken
    currentReason = reason
    clearScheduleTimers()
    refreshSyncStatus({ currentTrigger: reason, running: true, userId })

    runningPromise = loadEngine()
      .then(({ runCloudSync }) => runCloudSync({
        force,
        online: getOnlineState(windowRef),
        storage,
        userId,
      }))
      .then((result) => {
        if (token === runToken && !stopped) {
          if (result?.ok && (result.downloaded?.length || result.merged?.length)) {
            onDataChanged()
          }
          refreshSyncStatus({ currentTrigger: reason, running: false, userId })
        }

        return result
      })
      .catch((error) => {
        if (token === runToken && !stopped) {
          refreshSyncStatus({ currentTrigger: reason, running: false, userId })
        }

        return {
          error: String(error?.message || 'Sync misslyckades.'),
          ok: false,
          status: 'error',
        }
      })
      .finally(() => {
        runningPromise = null

        if (pendingAfterRun && token === runToken && !stopped) {
          pendingAfterRun = false
          schedule('pending-after-run')
        }
      })

    return runningPromise
  }

  function schedule(reason = 'change', scheduleOptions = {}) {
    if (stopped || !userId) return

    currentReason = reason
    refreshSyncStatus({ currentTrigger: reason, running: Boolean(runningPromise), userId })

    if (scheduleOptions.immediate) {
      void run(reason, scheduleOptions)
      return
    }

    if (debounceTimer) clearTimeoutRef(debounceTimer)
    debounceTimer = setTimeoutRef(() => {
      debounceTimer = null
      void run(reason, scheduleOptions)
    }, config.debounceMs)

    if (!maxWaitTimer) {
      maxWaitTimer = setTimeoutRef(() => {
        maxWaitTimer = null
        if (debounceTimer) {
          clearTimeoutRef(debounceTimer)
          debounceTimer = null
        }
        void run(`${reason}:max-wait`, scheduleOptions)
      }, config.maxWaitMs)
    }
  }

  function handleStorageChanged(event) {
    const key = event?.detail?.key
    if (!isAllowedSyncStorageKey(key)) return

    schedule('local-change')
  }

  function handleOnline() {
    schedule('online', { immediate: true })
  }

  function handleVisibilityChange() {
    if (getVisibilityState(documentRef) === 'visible') {
      schedule('visible', { immediate: true })
    }
  }

  function start(nextUserId) {
    if (!nextUserId) {
      stop()
      return
    }

    if (!stopped && userId === nextUserId) {
      refreshSyncStatus({ currentTrigger: currentReason, running: Boolean(runningPromise), userId })
      return
    }

    stop()
    stopped = false
    userId = nextUserId
    runToken += 1
    refreshSyncStatus({ currentTrigger: 'start', running: false, userId })

    windowRef?.addEventListener?.(appStorageChangedEvent, handleStorageChanged)
    windowRef?.addEventListener?.('online', handleOnline)
    documentRef?.addEventListener?.('visibilitychange', handleVisibilityChange)
    periodicTimer = setIntervalRef(() => {
      if (getVisibilityState(documentRef) === 'visible') {
        schedule('periodic')
      }
    }, config.periodicMs)

    if (getOnlineState(windowRef) && getVisibilityState(documentRef) === 'visible') {
      schedule('app-start', { immediate: true })
    }
  }

  function stop() {
    clearTimers()
    windowRef?.removeEventListener?.(appStorageChangedEvent, handleStorageChanged)
    windowRef?.removeEventListener?.('online', handleOnline)
    documentRef?.removeEventListener?.('visibilitychange', handleVisibilityChange)
    stopped = true
    userId = ''
    pendingAfterRun = false
    runToken += 1
    resetSyncStatus()
  }

  function syncNow(reason = 'manual') {
    return run(reason, { force: true })
  }

  return {
    getState: () => ({
      currentReason,
      running: Boolean(runningPromise),
      stopped,
      userId,
    }),
    schedule,
    setOnDataChanged: (callback) => {
      onDataChanged = typeof callback === 'function' ? callback : () => {}
    },
    start,
    stop,
    syncNow,
  }
}

export const globalSyncScheduler = createGlobalSyncScheduler()

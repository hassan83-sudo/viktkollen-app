import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appStorageChangedEvent } from '../appStorageService.js'
import { createGlobalSyncScheduler, globalSyncSchedulerInternals } from './globalSyncScheduler.js'
import { refreshSyncStatus } from './syncStatusStore.js'
import { enqueueSyncAction, writeSyncQueue } from './syncQueue.js'
import { markSyncKeyDirty, readSyncMetadata, writeSyncMetadata } from './syncMetadata.js'

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))

  return {
    getItem: vi.fn((key) => (data.has(key) ? data.get(key) : null)),
    removeItem: vi.fn((key) => data.delete(key)),
    setItem: vi.fn((key, value) => data.set(key, String(value))),
    snapshot: () => Object.fromEntries(data.entries()),
  }
}

function createEventTargetMock() {
  const listeners = new Map()

  return {
    addEventListener: vi.fn((type, listener) => {
      listeners.set(type, [...(listeners.get(type) || []), listener])
    }),
    dispatch(type, event = {}) {
      ;(listeners.get(type) || []).forEach((listener) => listener(event))
    },
    removeEventListener: vi.fn((type, listener) => {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== listener))
    }),
  }
}

function createSchedulerHarness({ online = true, visible = true, runCloudSync } = {}) {
  const storage = createMemoryStorage()
  const windowTarget = createEventTargetMock()
  const documentTarget = createEventTargetMock()
  const windowRef = {
    ...windowTarget,
    clearInterval,
    clearTimeout,
    navigator: { onLine: online },
    setInterval,
    setTimeout,
  }
  const documentRef = {
    ...documentTarget,
    visibilityState: visible ? 'visible' : 'hidden',
  }
  const sync = runCloudSync || vi.fn(async () => ({ downloaded: [], ok: true, status: 'synced', uploaded: [] }))
  const scheduler = createGlobalSyncScheduler({
    debounceMs: 100,
    documentRef,
    loadEngine: async () => ({ runCloudSync: sync }),
    maxWaitMs: 500,
    periodicMs: 1000,
    storage,
    windowRef,
  })

  return {
    documentRef,
    scheduler,
    storage,
    sync,
    windowRef,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  refreshSyncStatus({ currentTrigger: '', running: false, userId: '' })
})

describe('global sync scheduler', () => {
  it('treats corrupt retry timestamps as due so sync can recover', () => {
    const now = new Date('2026-07-31T10:00:00.000Z')

    expect(globalSyncSchedulerInternals.retryIsDue('inte-ett-datum', now)).toBe(true)
    expect(globalSyncSchedulerInternals.retryIsDue('2026-07-31T09:00:00.000Z', now)).toBe(true)
    expect(globalSyncSchedulerInternals.retryIsDue('2026-07-31T11:00:00.000Z', now)).toBe(false)
  })

  it('does not run while signed out', async () => {
    const { scheduler, sync } = createSchedulerHarness()

    scheduler.start('')
    await vi.runAllTimersAsync()

    expect(sync).not.toHaveBeenCalled()
  })

  it('starts after login when dirty data exists', async () => {
    const { scheduler, storage, sync } = createSchedulerHarness()
    writeSyncMetadata({ enabled: true }, storage)
    markSyncKeyDirty('viktkollen.profile', storage)

    scheduler.start('user-1')
    await vi.advanceTimersByTimeAsync(0)

    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledWith(expect.objectContaining({ force: false, userId: 'user-1' }))
  })

  it('does not start autosync offline until online event fires', async () => {
    const { scheduler, storage, sync, windowRef } = createSchedulerHarness({ online: false })
    writeSyncMetadata({ enabled: true }, storage)
    markSyncKeyDirty('viktkollen.profile', storage)

    scheduler.start('user-1')
    await vi.advanceTimersByTimeAsync(0)
    expect(sync).not.toHaveBeenCalled()

    windowRef.navigator.onLine = true
    windowRef.dispatch('online')
    await vi.advanceTimersByTimeAsync(0)

    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('debounces multiple local change notifications into one sync', async () => {
    const { scheduler, storage, sync, windowRef } = createSchedulerHarness()
    writeSyncMetadata({ enabled: true }, storage)
    scheduler.start('user-1')
    await vi.advanceTimersByTimeAsync(0)

    markSyncKeyDirty('viktkollen.profile', storage)
    windowRef.dispatch(appStorageChangedEvent, { detail: { key: 'viktkollen.profile' } })
    windowRef.dispatch(appStorageChangedEvent, { detail: { key: 'viktkollen.weights' } })
    await vi.advanceTimersByTimeAsync(99)
    expect(sync).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('ignores non-allowlisted local change notifications', async () => {
    const { scheduler, storage, sync, windowRef } = createSchedulerHarness()
    writeSyncMetadata({ enabled: true }, storage)
    scheduler.start('user-1')
    await vi.advanceTimersByTimeAsync(0)

    windowRef.dispatch(appStorageChangedEvent, { detail: { key: 'viktkollen.auth.token' } })
    await vi.advanceTimersByTimeAsync(1000)

    expect(sync).not.toHaveBeenCalled()
  })

  it('uses max wait for continuous changes', async () => {
    const { scheduler, storage, sync, windowRef } = createSchedulerHarness()
    writeSyncMetadata({ enabled: true }, storage)
    scheduler.start('user-1')
    await vi.advanceTimersByTimeAsync(0)

    for (let index = 0; index < 6; index += 1) {
      markSyncKeyDirty('viktkollen.profile', storage)
      windowRef.dispatch(appStorageChangedEvent, { detail: { key: 'viktkollen.profile' } })
      await vi.advanceTimersByTimeAsync(90)
    }

    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('keeps a single active sync and schedules one follow-up', async () => {
    let resolveRun
    const runPromise = new Promise((resolve) => {
      resolveRun = resolve
    })
    const { scheduler, storage, sync, windowRef } = createSchedulerHarness({
      runCloudSync: vi.fn(() => runPromise),
    })
    writeSyncMetadata({ enabled: true }, storage)
    markSyncKeyDirty('viktkollen.profile', storage)

    scheduler.start('user-1')
    await vi.advanceTimersByTimeAsync(0)
    windowRef.dispatch(appStorageChangedEvent, { detail: { key: 'viktkollen.weights' } })
    await vi.advanceTimersByTimeAsync(100)
    expect(sync).toHaveBeenCalledTimes(1)

    resolveRun({ downloaded: [], ok: true, status: 'synced', uploaded: [] })
    await vi.advanceTimersByTimeAsync(100)

    expect(sync).toHaveBeenCalledTimes(2)
  })

  it('manual sync bypasses disabled autosync and retry wait', async () => {
    const { scheduler, storage, sync } = createSchedulerHarness()
    writeSyncQueue(enqueueSyncAction({}, {
      action: 'upload',
      nextAttemptAt: '2999-01-01T00:00:00.000Z',
      storageKey: 'viktkollen.profile',
    }), storage)

    scheduler.start('user-1')
    await scheduler.syncNow('manual')

    expect(sync).toHaveBeenCalledWith(expect.objectContaining({ force: true, userId: 'user-1' }))
  })

  it('does not auto-run when a conflict exists', async () => {
    const { scheduler, storage, sync, windowRef } = createSchedulerHarness()
    writeSyncMetadata({
      conflicts: [{ storageKey: 'viktkollen.profile' }],
      enabled: true,
      pendingKeys: ['viktkollen.profile'],
    }, storage)

    scheduler.start('user-1')
    windowRef.dispatch(appStorageChangedEvent, { detail: { key: 'viktkollen.profile' } })
    await vi.advanceTimersByTimeAsync(1000)

    expect(sync).not.toHaveBeenCalled()
  })

  it('stops timers and listeners on logout', () => {
    const { scheduler, windowRef, documentRef } = createSchedulerHarness()

    scheduler.start('user-1')
    scheduler.stop()

    expect(windowRef.removeEventListener).toHaveBeenCalledWith(appStorageChangedEvent, expect.any(Function))
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function))
    expect(documentRef.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('reacts when a hidden tab becomes visible', async () => {
    const { documentRef, scheduler, storage, sync } = createSchedulerHarness({ visible: false })
    writeSyncMetadata({ enabled: true }, storage)
    markSyncKeyDirty('viktkollen.profile', storage)

    scheduler.start('user-1')
    sync.mockClear()
    documentRef.visibilityState = 'visible'
    documentRef.dispatch('visibilitychange')
    await vi.advanceTimersByTimeAsync(0)

    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('keeps dirty queue over scheduler recreation', async () => {
    const storage = createMemoryStorage()
    writeSyncMetadata({ enabled: true }, storage)
    markSyncKeyDirty('viktkollen.profile', storage)

    expect(readSyncMetadata(storage).pendingKeys).toContain('viktkollen.profile')
  })
})

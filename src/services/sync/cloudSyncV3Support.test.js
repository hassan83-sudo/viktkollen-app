import { describe, expect, it, vi } from 'vitest'

import {
  appendCloudSyncHistoryEvent,
  clearCloudSyncHistory,
  getCloudSyncHistory,
  maxCloudSyncHistoryItems,
} from './cloudSyncHistory.js'
import {
  buildCurrentDeviceDescriptor,
  buildMultiDeviceRegistry,
  summarizeMultiDeviceRegistry,
} from './multiDeviceRegistry.js'
import {
  enqueueSyncAction,
  getDueSyncQueueItems,
  getSyncQueueStatus,
  markSyncQueueItemFailed,
  normalizeSyncQueue,
} from './syncQueue.js'
import {
  applyWithCloudRecovery,
  rollbackCloudRecovery,
} from './cloudRecoveryEngine.js'

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key) => map.get(key) ?? null),
    removeItem: vi.fn((key) => map.delete(key)),
    setItem: vi.fn((key, value) => map.set(key, String(value))),
  }
}

describe('Cloud Sync V3 support modules', () => {
  it('keeps queue FIFO while collapsing duplicate updates for the same key', () => {
    let queue = normalizeSyncQueue()
    queue = enqueueSyncAction(queue, { action: 'upload', storageKey: 'viktkollen.weights' }, { now: '2026-08-04T10:00:00.000Z' })
    queue = enqueueSyncAction(queue, { action: 'upload', storageKey: 'viktkollen.meals' }, { now: '2026-08-04T10:01:00.000Z' })
    queue = enqueueSyncAction(queue, { action: 'upload', storageKey: 'viktkollen.weights' }, { now: '2026-08-04T10:02:00.000Z' })

    expect(queue.items.map((item) => item.storageKey)).toEqual(['viktkollen.meals', 'viktkollen.weights'])
  })

  it('preserves latest tombstone state for a key', () => {
    let queue = normalizeSyncQueue()
    queue = enqueueSyncAction(queue, { action: 'upload', storageKey: 'viktkollen.weights' }, { now: '2026-08-04T10:00:00.000Z' })
    queue = enqueueSyncAction(queue, { action: 'delete', storageKey: 'viktkollen.weights' }, { now: '2026-08-04T10:01:00.000Z' })

    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].action).toBe('delete')
  })

  it('reports retry backlog and permanent failures safely', () => {
    let queue = enqueueSyncAction(normalizeSyncQueue(), { action: 'upload', storageKey: 'viktkollen.weights' }, { now: '2026-08-04T10:00:00.000Z' })
    const itemId = queue.items[0].id
    for (let index = 0; index < 5; index += 1) {
      queue = markSyncQueueItemFailed(queue, itemId, 'network', new Date(`2026-08-04T10:0${index}:00.000Z`))
    }

    expect(getSyncQueueStatus(queue).failedCount).toBe(1)
    expect(getDueSyncQueueItems(queue)).toHaveLength(0)
  })

  it('masks and limits technical history without raw payload', () => {
    clearCloudSyncHistory()
    for (let index = 0; index < maxCloudSyncHistoryItems + 3; index += 1) {
      appendCloudSyncHistoryEvent({
        deviceId: 'device-abcdefghijklmnopqrstuvwxyz',
        eventType: 'upload',
        safeSummary: `uploaded ${index}`,
      }, { now: `2026-08-04T10:${String(index).padStart(2, '0')}:00.000Z` })
    }

    const history = getCloudSyncHistory()
    expect(history).toHaveLength(maxCloudSyncHistoryItems)
    expect(history.at(-1).deviceIdMasked).not.toContain('abcdefghijklmnopqrstuvwxyz')
    expect(JSON.stringify(history)).not.toMatch(/payload|token|session|email/)
  })

  it('builds current device descriptor without full fingerprinting', () => {
    const descriptor = buildCurrentDeviceDescriptor({
      deviceId: 'device-current-1234567890',
      now: '2026-08-04T10:00:00.000Z',
      windowRef: {
        matchMedia: () => ({ matches: true }),
        navigator: { userAgent: 'Mozilla/5.0 (iPhone) CriOS/120' },
      },
    })

    expect(descriptor.platform).toBe('iPhone')
    expect(descriptor.browser).toBe('Chrome')
    expect(descriptor.appMode).toBe('Installerad PWA')
    expect(JSON.stringify(descriptor)).not.toContain('Mozilla/5.0')
  })

  it('summarizes active and stale devices deterministically', () => {
    const devices = buildMultiDeviceRegistry({
      currentDeviceId: 'device-a',
      metadata: { deviceId: 'device-a', lastSuccessfulSyncAt: '2026-08-04T10:00:00.000Z' },
      now: '2026-08-04T10:00:00.000Z',
      remoteRows: [{ deviceId: 'device-b', serverUpdatedAt: '2026-06-01T10:00:00.000Z' }],
    })
    const summary = summarizeMultiDeviceRegistry(devices)

    expect(summary.currentDevice.deviceId).toBe('device-a')
    expect(summary.staleDeviceCount).toBe(1)
  })

  it('rolls back through cloud recovery when apply fails', () => {
    const storage = createStorage({ 'viktkollen.weights': JSON.stringify([{ id: 'old' }]) })
    const result = applyWithCloudRecovery({
      apply: () => {
        storage.setItem('viktkollen.weights', JSON.stringify([{ id: 'new' }]))
        throw new Error('boom')
      },
      keys: ['viktkollen.weights'],
      now: '2026-08-04T10:00:00.000Z',
      storage,
    })

    expect(result.ok).toBe(false)
    expect(result.recoveryStatus).toBe('recovered')
    expect(storage.getItem('viktkollen.weights')).toContain('old')
  })

  it('can rollback an explicit snapshot idempotently', () => {
    const storage = createStorage({ 'viktkollen.weights': JSON.stringify([{ id: 'old' }]) })
    const result = applyWithCloudRecovery({
      apply: () => storage.setItem('viktkollen.weights', JSON.stringify([{ id: 'new' }])),
      keys: ['viktkollen.weights'],
      storage,
    })

    expect(result.ok).toBe(true)
    expect(rollbackCloudRecovery(result.snapshot, storage).ok).toBe(true)
    expect(rollbackCloudRecovery(result.snapshot, storage).ok).toBe(true)
    expect(storage.getItem('viktkollen.weights')).toContain('old')
  })
})

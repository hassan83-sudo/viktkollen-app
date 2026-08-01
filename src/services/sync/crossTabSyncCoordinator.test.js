import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appStorageChangedEvent } from '../appStorageService.js'
import {
  createCrossTabMessage,
  createCrossTabTransport,
  crossTabMessageTypes,
  validateCrossTabMessage,
} from './crossTabSyncTransport.js'
import {
  createCrossTabSyncCoordinator,
  createLeaderLease,
  shouldClaimLeadership,
} from './crossTabSyncCoordinator.js'

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

function createBusTransport(tabId, bus) {
  const listeners = new Set()
  const transport = {
    close: vi.fn(() => bus.delete(tabId)),
    getDiagnostics: () => ({ received: 0, rejected: 0, sent: 0, tabId, transportType: 'test-bus' }),
    getTabId: () => tabId,
    getTransportType: () => 'test-bus',
    open: vi.fn(() => bus.set(tabId, transport)),
    post: vi.fn((type, payload = {}) => {
      const message = {
        payload,
        protocolVersion: 1,
        sentAt: new Date().toISOString(),
        tabId,
        type,
        userScope: 'user-1',
      }
      bus.forEach((target, targetTabId) => {
        if (targetTabId !== tabId) {
          target.deliver(message)
        }
      })
      return true
    }),
    deliver(message) {
      listeners.forEach((listener) => listener(message))
    },
    subscribe: vi.fn((listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
  }

  return transport
}

function createSchedulerMock() {
  return {
    schedule: vi.fn(),
    setOnDataChanged: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    syncNow: vi.fn(async () => ({ ok: true, status: 'synced' })),
  }
}

function createCoordinatorHarness({ storage = createMemoryStorage(), tabId = 'tab-bbbbbbbb', transport } = {}) {
  const windowRef = {
    ...createEventTargetMock(),
    clearInterval,
    clearTimeout,
    localStorage: storage,
    setInterval,
    setTimeout,
  }
  const documentRef = {
    ...createEventTargetMock(),
    visibilityState: 'visible',
  }
  const scheduler = createSchedulerMock()
  const coordinator = createCrossTabSyncCoordinator({
    documentRef,
    heartbeatMs: 100,
    leaseMs: 300,
    manualSyncTimeoutMs: 250,
    scheduler,
    storage,
    tabId,
    transport,
    windowRef,
  })

  return { coordinator, documentRef, scheduler, storage, windowRef }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('cross-tab sync transport', () => {
  it('accepts valid technical messages', () => {
    const message = createCrossTabMessage({
      payload: { storageKey: 'viktkollen.profile' },
      tabId: 'tab-aaaaaaaa',
      type: crossTabMessageTypes.localDataDirty,
      userScope: 'user-1',
    })

    expect(validateCrossTabMessage(message, { ownTabId: 'tab-bbbbbbbb', userScope: 'user-1' }).ok).toBe(true)
  })

  it('rejects unknown protocol, type, echo and wrong user scope', () => {
    const message = createCrossTabMessage({
      tabId: 'tab-aaaaaaaa',
      type: crossTabMessageTypes.heartbeat,
      userScope: 'user-1',
    })

    expect(validateCrossTabMessage({ ...message, protocolVersion: 999 }, { ownTabId: 'tab-bbbbbbbb', userScope: 'user-1' }).reason).toBe('protocol')
    expect(validateCrossTabMessage({ ...message, type: 'RAW_DATA' }, { ownTabId: 'tab-bbbbbbbb', userScope: 'user-1' }).reason).toBe('type')
    expect(validateCrossTabMessage(message, { ownTabId: 'tab-aaaaaaaa', userScope: 'user-1' }).reason).toBe('echo')
    expect(validateCrossTabMessage(message, { ownTabId: 'tab-bbbbbbbb', userScope: 'user-2' }).reason).toBe('scope')
  })

  it('strips unknown payload fields and prevents raw data fields', () => {
    const message = createCrossTabMessage({
      payload: {
        authToken: 'secret',
        meals: [{ name: 'pizza' }],
        storageKey: 'viktkollen.meals',
      },
      tabId: 'tab-aaaaaaaa',
      type: crossTabMessageTypes.localDataDirty,
      userScope: 'user-1',
    })

    expect(message.payload).toEqual({ storageKey: 'viktkollen.meals' })
  })

  it('uses storage fallback when BroadcastChannel is missing', () => {
    const storage = createMemoryStorage()
    const windowRef = createEventTargetMock()
    const transport = createCrossTabTransport({
      BroadcastChannelRef: null,
      storage,
      tabId: 'tab-aaaaaaaa',
      windowRef,
    })

    transport.open('user-1')
    expect(transport.getTransportType()).toBe('storage')
    expect(transport.post(crossTabMessageTypes.tabHello, { role: 'unknown' })).toBe(true)
    expect(storage.setItem).toHaveBeenCalled()
    transport.close()
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('storage', expect.any(Function))
  })
})

describe('cross-tab leader election', () => {
  it('claims leadership when no valid lease exists', () => {
    expect(shouldClaimLeadership({
      currentLease: null,
      tabId: 'tab-bbbbbbbb',
      userScope: 'user-1',
      visible: true,
    })).toBe(true)
  })

  it('keeps a valid visible leader with lower tab id', () => {
    const lease = createLeaderLease({
      leaseMs: 1000,
      tabId: 'tab-aaaaaaaa',
      userScope: 'user-1',
      visible: true,
    }, new Date('2026-07-31T10:00:00.000Z'))

    expect(shouldClaimLeadership({
      currentLease: lease,
      tabId: 'tab-bbbbbbbb',
      userScope: 'user-1',
      visible: true,
    }, new Date('2026-07-31T10:00:00.500Z'))).toBe(false)
  })

  it('allows takeover when the lease has expired', () => {
    const lease = createLeaderLease({
      leaseMs: 1000,
      tabId: 'tab-aaaaaaaa',
      userScope: 'user-1',
      visible: true,
    }, new Date('2026-07-31T10:00:00.000Z'))

    expect(shouldClaimLeadership({
      currentLease: lease,
      tabId: 'tab-bbbbbbbb',
      userScope: 'user-1',
      visible: true,
    }, new Date('2026-07-31T10:00:02.000Z'))).toBe(true)
  })
})

describe('cross-tab sync coordinator', () => {
  it('starts the scheduler only for the leader', () => {
    const { coordinator, scheduler } = createCoordinatorHarness()

    coordinator.start('user-1')

    expect(coordinator.getState().role).toBe('leader')
    expect(scheduler.start).toHaveBeenCalledWith('user-1')
  })

  it('keeps a second tab as follower while a valid leader lease exists', () => {
    const storage = createMemoryStorage()
    const leader = createCoordinatorHarness({ storage, tabId: 'tab-aaaaaaaa' })
    const follower = createCoordinatorHarness({ storage, tabId: 'tab-bbbbbbbb' })

    leader.coordinator.start('user-1')
    follower.coordinator.start('user-1')

    expect(leader.coordinator.getState().role).toBe('leader')
    expect(follower.coordinator.getState().role).toBe('follower')
    expect(follower.scheduler.start).not.toHaveBeenCalled()
  })

  it('routes follower dirty events to the leader without payload', () => {
    const storage = createMemoryStorage()
    const bus = new Map()
    const leader = createCoordinatorHarness({
      storage,
      tabId: 'tab-aaaaaaaa',
      transport: createBusTransport('tab-aaaaaaaa', bus),
    })
    const follower = createCoordinatorHarness({
      storage,
      tabId: 'tab-bbbbbbbb',
      transport: createBusTransport('tab-bbbbbbbb', bus),
    })

    leader.coordinator.start('user-1')
    follower.coordinator.start('user-1')
    follower.windowRef.dispatch(appStorageChangedEvent, { detail: { key: 'viktkollen.profile' } })

    expect(follower.coordinator.getState().role).toBe('follower')
    expect(leader.scheduler.schedule).toHaveBeenCalledWith('cross-tab-dirty')
    expect(follower.scheduler.schedule).not.toHaveBeenCalled()
  })

  it('runs manual sync through the leader when requested by a follower', async () => {
    const storage = createMemoryStorage()
    const bus = new Map()
    const leader = createCoordinatorHarness({
      storage,
      tabId: 'tab-aaaaaaaa',
      transport: createBusTransport('tab-aaaaaaaa', bus),
    })
    const follower = createCoordinatorHarness({
      storage,
      tabId: 'tab-bbbbbbbb',
      transport: createBusTransport('tab-bbbbbbbb', bus),
    })

    leader.coordinator.start('user-1')
    follower.coordinator.start('user-1')
    const result = await follower.coordinator.syncNow('manual')

    expect(result.ok).toBe(true)
    expect(leader.scheduler.syncNow).toHaveBeenCalledWith('manual-cross-tab')
    expect(follower.scheduler.syncNow).not.toHaveBeenCalled()
  })

  it('takes over when no leader answers a manual sync request', async () => {
    const storage = createMemoryStorage()
    const leader = createCoordinatorHarness({ storage, tabId: 'tab-aaaaaaaa' })
    const follower = createCoordinatorHarness({ storage, tabId: 'tab-bbbbbbbb' })

    leader.coordinator.start('user-1')
    follower.coordinator.start('user-1')
    leader.coordinator.stop()
    const result = await follower.coordinator.syncNow('manual')

    expect(result.ok).toBe(true)
    expect(follower.coordinator.getState().role).toBe('leader')
    expect(follower.scheduler.start).toHaveBeenCalledWith('user-1')
  })

  it('cleans listeners and scheduler on stop', () => {
    const { coordinator, documentRef, scheduler, windowRef } = createCoordinatorHarness()

    coordinator.start('user-1')
    coordinator.stop()

    expect(windowRef.removeEventListener).toHaveBeenCalledWith(appStorageChangedEvent, expect.any(Function))
    expect(documentRef.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(scheduler.stop).toHaveBeenCalled()
  })
})

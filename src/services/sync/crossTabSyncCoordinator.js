import { appStorageChangedEvent } from '../appStorageService.js'
import { globalSyncScheduler } from './globalSyncScheduler.js'
import { isAllowedSyncStorageKey } from './syncMetadata.js'
import { refreshSyncStatus, updateSyncCoordinationStatus } from './syncStatusStore.js'
import {
  createCrossTabTransport,
  createTabId,
  crossTabMessageTypes,
  isValidTabId,
} from './crossTabSyncTransport.js'

export const crossTabLeaderLeaseKey = 'viktkollen.sync.crossTab.leader.v1'

export const defaultCrossTabCoordinatorOptions = {
  heartbeatMs: 5000,
  leaseMs: 15000,
  manualSyncTimeoutMs: 8000,
}

function getVisibilityState(documentRef) {
  return documentRef?.visibilityState || 'visible'
}

function getStorage(storage, windowRef) {
  if (storage) return storage
  if (windowRef?.localStorage) return windowRef.localStorage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return null
}

function normalizeTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function nowIso(now = new Date()) {
  return now.toISOString()
}

function readLease(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(crossTabLeaderLeaseKey) || '{}')
    if (!parsed || parsed.protocolVersion !== 1 || !isValidTabId(parsed.tabId)) return null
    if (!parsed.userScope) return null

    return {
      claimedAt: String(parsed.claimedAt || ''),
      expiresAt: String(parsed.expiresAt || ''),
      protocolVersion: 1,
      tabId: parsed.tabId,
      userScope: String(parsed.userScope || ''),
      visible: parsed.visible === true,
    }
  } catch {
    return null
  }
}

function writeLease(storage, lease) {
  try {
    storage?.setItem?.(crossTabLeaderLeaseKey, JSON.stringify(lease))
    return true
  } catch {
    return false
  }
}

function removeOwnLease(storage, tabId) {
  const lease = readLease(storage)
  if (lease?.tabId !== tabId) return

  try {
    storage?.removeItem?.(crossTabLeaderLeaseKey)
  } catch {
    // Best-effort cleanup only.
  }
}

export function createLeaderLease({ leaseMs, tabId, userScope, visible }, now = new Date()) {
  return {
    claimedAt: nowIso(now),
    expiresAt: nowIso(new Date(now.getTime() + leaseMs)),
    protocolVersion: 1,
    tabId,
    userScope,
    visible: visible === true,
  }
}

export function shouldClaimLeadership({ currentLease, tabId, userScope, visible }, now = new Date()) {
  if (!userScope || !isValidTabId(tabId)) return false
  if (!currentLease || currentLease.userScope !== userScope) return true
  if (normalizeTime(currentLease.expiresAt) <= now.getTime()) return true
  if (currentLease.tabId === tabId) return true

  if (visible && !currentLease.visible) return true
  if (visible === currentLease.visible && tabId < currentLease.tabId) return true

  return false
}

export function createCrossTabSyncCoordinator(options = {}) {
  const config = { ...defaultCrossTabCoordinatorOptions, ...options }
  const windowRef = config.windowRef || (typeof window !== 'undefined' ? window : null)
  const documentRef = config.documentRef || (typeof document !== 'undefined' ? document : null)
  const storage = getStorage(config.storage, windowRef)
  const scheduler = config.scheduler || globalSyncScheduler
  const setIntervalRef = config.setInterval || ((callback, delay) => windowRef?.setInterval(callback, delay))
  const clearIntervalRef = config.clearInterval || ((timerId) => windowRef?.clearInterval(timerId))
  const setTimeoutRef = config.setTimeout || ((callback, delay) => windowRef?.setTimeout(callback, delay))
  const clearTimeoutRef = config.clearTimeout || ((timerId) => windowRef?.clearTimeout(timerId))
  const tabId = config.tabId || createTabId(config.random)
  const transport = config.transport || createCrossTabTransport({
    BroadcastChannelRef: config.BroadcastChannelRef,
    random: config.random,
    storage,
    tabId,
    windowRef,
  })

  let userScope = ''
  let started = false
  let role = 'unknown'
  let activeTabs = new Map()
  let heartbeatTimer = null
  let leaseTimer = null
  let manualSyncPromise = null
  let manualSyncTimer = null
  let unsubscribeTransport = null
  let onDataChanged = () => {}
  let latestTrigger = ''
  let leaderLastSeenAt = ''

  function updateStatus(extra = {}) {
    const diagnostics = transport.getDiagnostics()
    updateSyncCoordinationStatus({
      activeTabCount: activeTabs.size + (started ? 1 : 0),
      hasLeader: role === 'leader' || Boolean(readLease(storage)),
      leaderLastSeenAt,
      latestTrigger,
      role,
      schedulerActive: role === 'leader',
      tabId,
      transportType: diagnostics.transportType,
      ...extra,
    })
  }

  function becomeFollower(reason = 'follower') {
    if (role === 'leader') {
      scheduler.stop()
    }
    role = 'follower'
    latestTrigger = reason
    updateStatus()
  }

  function becomeLeader(reason = 'leader') {
    if (!started || !userScope) return
    role = 'leader'
    latestTrigger = reason
    const lease = createLeaderLease({
      leaseMs: config.leaseMs,
      tabId,
      userScope,
      visible: getVisibilityState(documentRef) === 'visible',
    })
    writeLease(storage, lease)
    scheduler.setOnDataChanged(onDataChanged)
    scheduler.start(userScope)
    transport.post(crossTabMessageTypes.leaderClaim, {
      expiresAt: lease.expiresAt,
      reason,
    })
    leaderLastSeenAt = nowIso()
    updateStatus({ hasLeader: true })
  }

  function evaluateLeadership(reason = 'evaluate') {
    if (!started || !userScope) return

    const lease = readLease(storage)
    const shouldClaim = shouldClaimLeadership({
      currentLease: lease,
      tabId,
      userScope,
      visible: getVisibilityState(documentRef) === 'visible',
    })

    if (shouldClaim) {
      becomeLeader(reason)
      return
    }

    if (lease?.userScope === userScope) {
      leaderLastSeenAt = nowIso()
    }
    becomeFollower(reason)
  }

  function renewLease() {
    if (role !== 'leader' || !started) return
    const lease = createLeaderLease({
      leaseMs: config.leaseMs,
      tabId,
      userScope,
      visible: getVisibilityState(documentRef) === 'visible',
    })
    writeLease(storage, lease)
    transport.post(crossTabMessageTypes.heartbeat, {
      expiresAt: lease.expiresAt,
      role,
    })
    updateStatus({ hasLeader: true, leaderLastSeenAt: nowIso() })
  }

  function handleLocalDataChanged(event) {
    const storageKey = event?.detail?.key
    if (!isAllowedSyncStorageKey(storageKey)) return

    latestTrigger = 'local-change'
    transport.post(crossTabMessageTypes.localDataDirty, { storageKey })
    if (role === 'leader') {
      scheduler.schedule('local-change')
    } else {
      updateStatus({ dirty: true })
    }
  }

  function handleVisibilityChange() {
    evaluateLeadership('visibilitychange')
  }

  function handlePageHide() {
    if (role === 'leader') {
      transport.post(crossTabMessageTypes.leaderRelease, { reason: 'pagehide' })
      removeOwnLease(storage, tabId)
    }
  }

  function finishManualSync(result) {
    if (!manualSyncPromise) return
    const { resolve } = manualSyncPromise
    manualSyncPromise = null
    if (manualSyncTimer) clearTimeoutRef(manualSyncTimer)
    manualSyncTimer = null
    resolve(result)
  }

  function handleMessage(message) {
    activeTabs.set(message.tabId, message.sentAt)

    if (message.type === crossTabMessageTypes.tabHello) {
      if (role === 'leader') {
        renewLease()
      }
      updateStatus()
      return
    }

    if (message.type === crossTabMessageTypes.tabGoodbye) {
      activeTabs.delete(message.tabId)
      updateStatus()
      return
    }

    if (message.type === crossTabMessageTypes.leaderClaim || message.type === crossTabMessageTypes.heartbeat) {
      leaderLastSeenAt = message.sentAt
      evaluateLeadership(message.type.toLowerCase())
      return
    }

    if (message.type === crossTabMessageTypes.leaderRelease) {
      evaluateLeadership('leader-release')
      return
    }

    if (message.type === crossTabMessageTypes.localDataDirty) {
      latestTrigger = 'cross-tab-dirty'
      if (role === 'leader') {
        scheduler.schedule('cross-tab-dirty')
      }
      updateStatus({ dirty: true })
      return
    }

    if (message.type === crossTabMessageTypes.syncRequest) {
      latestTrigger = 'manual-request'
      if (role === 'leader') {
        void scheduler.syncNow('manual-cross-tab').then((result) => {
          transport.post(result?.ok ? crossTabMessageTypes.syncCompleted : crossTabMessageTypes.syncFailed, {
            requestId: message.payload.requestId || '',
            statusCode: result?.status || 'unknown',
            statusLabel: result?.error || '',
          })
        })
      }
      updateStatus()
      return
    }

    if (
      message.type === crossTabMessageTypes.syncCompleted
      || message.type === crossTabMessageTypes.syncFailed
    ) {
      if (message.payload.requestId && manualSyncPromise?.requestId === message.payload.requestId) {
        finishManualSync({
          error: message.payload.statusLabel || '',
          ok: message.type === crossTabMessageTypes.syncCompleted,
          status: message.payload.statusCode || 'synced',
        })
      }
      refreshSyncStatus({ currentTrigger: 'cross-tab-status', running: false, userId: userScope })
      updateStatus()
      return
    }

    if (message.type === crossTabMessageTypes.statusSnapshot) {
      refreshSyncStatus({
        currentTrigger: message.payload.reason || 'cross-tab-status',
        running: message.payload.running === true,
        userId: userScope,
      })
      updateStatus()
    }
  }

  function start(nextUserScope) {
    if (!nextUserScope) {
      stop()
      return
    }

    if (started && userScope === nextUserScope) {
      evaluateLeadership('start-refresh')
      return
    }

    stop()
    started = true
    userScope = String(nextUserScope)
    role = 'unknown'
    activeTabs = new Map()
    transport.open(userScope)
    unsubscribeTransport = transport.subscribe(handleMessage)
    windowRef?.addEventListener?.(appStorageChangedEvent, handleLocalDataChanged)
    windowRef?.addEventListener?.('pagehide', handlePageHide)
    windowRef?.addEventListener?.('beforeunload', handlePageHide)
    documentRef?.addEventListener?.('visibilitychange', handleVisibilityChange)
    heartbeatTimer = setIntervalRef(renewLease, config.heartbeatMs)
    leaseTimer = setIntervalRef(() => evaluateLeadership('lease-check'), Math.max(1000, Math.floor(config.heartbeatMs * 1.2)))
    transport.post(crossTabMessageTypes.tabHello, { role: 'unknown' })
    evaluateLeadership('start')
  }

  function stop() {
    if (started) {
      transport.post(crossTabMessageTypes.tabGoodbye, { role })
    }
    if (role === 'leader') {
      transport.post(crossTabMessageTypes.leaderRelease, { reason: 'stop' })
      removeOwnLease(storage, tabId)
    }
    if (heartbeatTimer) clearIntervalRef(heartbeatTimer)
    if (leaseTimer) clearIntervalRef(leaseTimer)
    if (manualSyncTimer) clearTimeoutRef(manualSyncTimer)
    windowRef?.removeEventListener?.(appStorageChangedEvent, handleLocalDataChanged)
    windowRef?.removeEventListener?.('pagehide', handlePageHide)
    windowRef?.removeEventListener?.('beforeunload', handlePageHide)
    documentRef?.removeEventListener?.('visibilitychange', handleVisibilityChange)
    unsubscribeTransport?.()
    unsubscribeTransport = null
    transport.close()
    scheduler.stop()
    started = false
    userScope = ''
    role = 'unknown'
    activeTabs = new Map()
    manualSyncPromise = null
    manualSyncTimer = null
    updateStatus({ activeTabCount: 0, hasLeader: false, leaderLastSeenAt: '' })
  }

  function syncNow(reason = 'manual') {
    if (!started || !userScope) {
      return Promise.resolve({ ok: false, status: 'not_authenticated' })
    }

    if (role === 'leader') {
      return scheduler.syncNow(reason)
    }

    if (manualSyncPromise) return manualSyncPromise.promise

    evaluateLeadership('manual-sync')
    if (role === 'leader') {
      return scheduler.syncNow(reason)
    }

    const requestId = `${tabId}-${Date.now().toString(36)}`
    const promise = new Promise((resolve) => {
      manualSyncPromise = { promise: null, requestId, resolve }
      manualSyncTimer = setTimeoutRef(() => {
        manualSyncPromise = null
        manualSyncTimer = null
        evaluateLeadership('manual-timeout')
        if (role === 'leader') {
          void scheduler.syncNow('manual-takeover').then(resolve)
        } else {
          resolve({ ok: false, status: 'leader_timeout', error: 'Sync kunde inte startas just nu.' })
        }
      }, config.manualSyncTimeoutMs)
    })

    manualSyncPromise.promise = promise
    latestTrigger = 'manual-follower'
    transport.post(crossTabMessageTypes.syncRequest, { reason, requestId })
    updateStatus({ latestTrigger })

    return promise
  }

  return {
    getState: () => ({
      activeTabCount: activeTabs.size + (started ? 1 : 0),
      leaderLastSeenAt,
      role,
      started,
      tabId,
      transportType: transport.getTransportType(),
      userScope,
    }),
    setOnDataChanged: (callback) => {
      onDataChanged = typeof callback === 'function' ? callback : () => {}
      scheduler.setOnDataChanged(onDataChanged)
    },
    start,
    stop,
    syncNow,
  }
}

export const globalSyncCoordinator = createCrossTabSyncCoordinator()

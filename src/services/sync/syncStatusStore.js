import { readSyncMetadata } from './syncMetadata.js'
import { getSyncQueueStatus, readSyncQueue } from './syncQueue.js'
import { summarizeCloudSyncHistory } from './cloudSyncHistory.js'
import { buildMultiDeviceRegistry, summarizeMultiDeviceRegistry } from './multiDeviceRegistry.js'
import { getCloudRecoveryStatus } from './cloudRecoveryEngine.js'

const listeners = new Set()
const defaultCoordinationStatus = {
  activeTabCount: 0,
  hasLeader: false,
  latestTrigger: '',
  leaderLastSeenAt: '',
  role: 'unknown',
  schedulerActive: false,
  tabId: '',
  transportType: 'none',
}

let coordinationStatus = { ...defaultCoordinationStatus }

function getOnlineState() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

function buildStatus(overrides = {}) {
  const metadata = readSyncMetadata()
  const queue = readSyncQueue()
  const queueStatus = getSyncQueueStatus(queue, new Date(), getOnlineState())
  const historySummary = summarizeCloudSyncHistory()
  const multiDevice = summarizeMultiDeviceRegistry(buildMultiDeviceRegistry({ currentDeviceId: metadata.deviceId, metadata }))
  const recovery = getCloudRecoveryStatus(typeof localStorage !== 'undefined' ? localStorage : null)
  const pendingQueueItems = queue.items.filter((item) => item.status !== 'failed')
  const retryAt = pendingQueueItems
    .map((item) => item.nextAttemptAt)
    .filter(Boolean)
    .sort()[0] || ''
  const dirty = metadata.pendingKeys.length > 0 || pendingQueueItems.length > 0
  const conflict = metadata.conflicts.length > 0
  const online = getOnlineState()
  const running = overrides.running === true
  let statusCode = 'synced'
  let statusLabel = 'Synkad'

  if (!metadata.enabled) {
    statusCode = 'disabled'
    statusLabel = 'Synk av'
  } else if (running) {
    statusCode = 'running'
    statusLabel = 'Synkar...'
  } else if (!online) {
    statusCode = 'offline'
    statusLabel = 'Offline - synkar när anslutningen återkommer'
  } else if (conflict) {
    statusCode = 'conflict'
    statusLabel = 'Konflikt kräver åtgärd'
  } else if (metadata.lastError) {
    statusCode = retryAt ? 'retry_waiting' : 'error'
    statusLabel = retryAt ? 'Synk pausad till nästa försök' : 'Synkfel'
  } else if (dirty) {
    statusCode = 'dirty'
    statusLabel = 'Ändringar väntar på synk'
  }

  return {
    conflict,
    conflicts: metadata.conflicts,
    currentDevice: multiDevice.currentDevice,
    currentTrigger: overrides.currentTrigger || '',
    dirty,
    enabled: metadata.enabled,
    error: metadata.lastError,
    failedItems: queueStatus.failedCount,
    historySize: historySummary.size,
    lastSuccessfulSyncAt: metadata.lastSuccessfulSyncAt,
    multiDevice,
    nextRetryAt: queueStatus.nextRetryAt,
    online,
    pendingDownloads: queue.items.filter((item) => item.action === 'download' && item.status !== 'failed').length,
    pendingUploads: queue.items.filter((item) => ['upload', 'delete'].includes(item.action) && item.status !== 'failed').length,
    pendingCount: metadata.pendingKeys.length + pendingQueueItems.length,
    queueStatus,
    recoveryStatus: recovery.recoveryStatus,
    retryAt,
    running,
    statusCode,
    statusLabel,
    syncHealth: statusCode === 'synced' ? 'healthy' : statusCode === 'dirty' ? 'pending' : statusCode === 'retry_waiting' ? 'retrying' : statusCode,
    syncCoordination: { ...coordinationStatus },
    userId: overrides.userId || '',
  }
}

let snapshot = buildStatus()

function emit() {
  listeners.forEach((listener) => listener())
}

export function getSyncStatusSnapshot() {
  return snapshot
}

export function subscribeSyncStatus(listener) {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

export function refreshSyncStatus(overrides = {}) {
  snapshot = buildStatus({
    currentTrigger: snapshot.currentTrigger,
    running: snapshot.running,
    userId: snapshot.userId,
    ...overrides,
  })
  emit()

  return snapshot
}

export function resetSyncStatus() {
  coordinationStatus = { ...defaultCoordinationStatus }
  snapshot = buildStatus({ currentTrigger: '', running: false, userId: '' })
  emit()

  return snapshot
}

export function updateSyncCoordinationStatus(patch = {}) {
  coordinationStatus = {
    ...coordinationStatus,
    ...Object.fromEntries(Object.entries(patch)
      .filter(([, value]) => ['boolean', 'number', 'string'].includes(typeof value))),
  }
  snapshot = buildStatus({
    currentTrigger: snapshot.currentTrigger,
    running: snapshot.running,
    userId: snapshot.userId,
  })
  emit()

  return snapshot
}

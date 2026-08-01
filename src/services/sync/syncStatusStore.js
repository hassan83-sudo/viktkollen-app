import { readSyncMetadata } from './syncMetadata.js'
import { readSyncQueue } from './syncQueue.js'

const listeners = new Set()

function getOnlineState() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

function buildStatus(overrides = {}) {
  const metadata = readSyncMetadata()
  const queue = readSyncQueue()
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
    currentTrigger: overrides.currentTrigger || '',
    dirty,
    enabled: metadata.enabled,
    error: metadata.lastError,
    lastSuccessfulSyncAt: metadata.lastSuccessfulSyncAt,
    online,
    pendingCount: metadata.pendingKeys.length + pendingQueueItems.length,
    retryAt,
    running,
    statusCode,
    statusLabel,
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
  snapshot = buildStatus({ currentTrigger: '', running: false, userId: '' })
  emit()

  return snapshot
}

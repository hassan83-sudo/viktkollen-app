import { PWA_APP_VERSION } from '../../registerServiceWorker.js'

export const syncDiagnosticsEventLimit = 100

const forbiddenReportPatterns = [
  /access[_-]?token/i,
  /authorization/i,
  /bearer/i,
  /chat/i,
  /email/i,
  /meal/i,
  /nutrition/i,
  /password/i,
  /photo/i,
  /session/i,
  /supabase[_-]?auth/i,
  /token/i,
  /weight/i,
]

const listeners = new Set()
let eventHistory = []
let runtimeState = {
  cloudRuntimeLoaded: false,
  cloudSyncEngineLoaded: false,
  cloudSyncServiceLoaded: false,
}
let lastRejectedMessageReason = ''
let latestSyncResult = ''
let latestErrorCategory = ''

function createDiagnosticsSnapshot() {
  return {
    events: eventHistory,
    lastRejectedMessageReason,
    latestErrorCategory,
    latestSyncResult,
    runtimeState: { ...runtimeState },
  }
}

let diagnosticsSnapshot = createDiagnosticsSnapshot()

function getOnlineState() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

function getVisibilityState() {
  if (typeof document === 'undefined') return 'unknown'
  return document.visibilityState || 'visible'
}

function getServiceWorkerStatus() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return 'unavailable'
  return navigator.serviceWorker.controller ? 'controlled' : 'available'
}

function getStandaloneState() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

function maskText(value, visible = 4) {
  const text = String(value || '')
  if (!text) return ''
  if (text.length <= visible) return `${text.slice(0, 1)}...`

  return `${text.slice(0, visible)}...${text.slice(-2)}`
}

export function maskSyncIdentifier(value) {
  return maskText(value, 6)
}

function sanitizeDetail(detail = {}) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {}

  return Object.fromEntries(Object.entries(detail)
    .filter(([key, value]) => {
      if (forbiddenReportPatterns.some((pattern) => pattern.test(key))) return false
      return ['boolean', 'number', 'string'].includes(typeof value)
    })
    .map(([key, value]) => {
      if (/id|scope/i.test(key)) return [key, maskSyncIdentifier(value)]
      return [key, typeof value === 'string' ? value.slice(0, 160) : value]
    }))
}

function emit() {
  diagnosticsSnapshot = createDiagnosticsSnapshot()
  listeners.forEach((listener) => listener())
}

export function addSyncDiagnosticEvent(category, message, detail = {}) {
  const event = {
    category: String(category || 'sync').slice(0, 40),
    detail: sanitizeDetail(detail),
    message: String(message || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    timestamp: new Date().toISOString(),
  }

  eventHistory = [...eventHistory, event].slice(-syncDiagnosticsEventLimit)
  emit()
  return event
}

export function clearSyncDiagnosticEvents() {
  eventHistory = []
  lastRejectedMessageReason = ''
  latestSyncResult = ''
  latestErrorCategory = ''
  emit()
}

export function recordCrossTabRejectedMessage(reason) {
  lastRejectedMessageReason = String(reason || 'unknown').slice(0, 80)
  addSyncDiagnosticEvent('transport', 'Cross-tab message rejected.', { reason: lastRejectedMessageReason })
}

export function recordCloudRuntimeLoaded(moduleName) {
  runtimeState = {
    ...runtimeState,
    cloudRuntimeLoaded: true,
    cloudSyncEngineLoaded: runtimeState.cloudSyncEngineLoaded || moduleName === 'engine',
    cloudSyncServiceLoaded: runtimeState.cloudSyncServiceLoaded || moduleName === 'service',
  }
  addSyncDiagnosticEvent('runtime', 'Cloud runtime module loaded.', { moduleName })
}

export function recordSyncResult(result = {}) {
  latestSyncResult = result.ok ? 'ok' : String(result.status || 'failed').slice(0, 80)
  latestErrorCategory = result.ok ? '' : String(result.errorCategory || result.status || 'sync_failed').slice(0, 80)
  addSyncDiagnosticEvent(result.ok ? 'sync' : 'error', result.ok ? 'Sync completed.' : 'Sync failed.', {
    status: latestSyncResult,
  })
}

export function buildSyncDiagnosticsSnapshot(syncStatus = {}) {
  const coordination = syncStatus.syncCoordination || {}

  return {
    appVersion: PWA_APP_VERSION,
    browser: {
      broadcastChannelAvailable: typeof BroadcastChannel !== 'undefined',
      online: getOnlineState(),
      pwaStandalone: getStandaloneState(),
      serviceWorkerStatus: getServiceWorkerStatus(),
      storageFallbackAvailable: typeof window !== 'undefined' && Boolean(window.localStorage),
      visibility: getVisibilityState(),
    },
    cloudRuntime: { ...runtimeState },
    coordination: {
      activeTabCount: coordination.activeTabCount || 0,
      hasLeader: coordination.hasLeader === true,
      latestTrigger: coordination.latestTrigger || syncStatus.currentTrigger || '',
      leaderLastSeenAt: coordination.leaderLastSeenAt || '',
      leaseExpiry: coordination.leaseExpiry || '',
      role: coordination.role || 'unknown',
      schedulerActive: coordination.schedulerActive === true,
      tabId: maskSyncIdentifier(coordination.tabId),
      transportType: coordination.transportType || 'none',
      userScope: maskSyncIdentifier(syncStatus.userId),
    },
    events: eventHistory,
    lastRejectedMessageReason,
    latestErrorCategory,
    latestSyncResult,
    sync: {
      conflict: syncStatus.conflict === true,
      dirty: syncStatus.dirty === true,
      failedItems: syncStatus.failedItems || 0,
      historySize: syncStatus.historySize || 0,
      lastSuccessfulSyncAt: syncStatus.lastSuccessfulSyncAt || '',
      nextRetryAt: syncStatus.nextRetryAt || syncStatus.retryAt || '',
      pendingCount: syncStatus.pendingCount || 0,
      pendingDownloads: syncStatus.pendingDownloads || 0,
      pendingUploads: syncStatus.pendingUploads || 0,
      queueHealth: syncStatus.queueStatus?.queueHealth || 'unknown',
      recoveryStatus: syncStatus.recoveryStatus || 'ready',
      retryAt: syncStatus.retryAt || '',
      running: syncStatus.running === true,
      staleDeviceCount: syncStatus.multiDevice?.staleDeviceCount || 0,
      statusCode: syncStatus.statusCode || 'unknown',
      statusLabel: syncStatus.statusLabel || '',
      syncHealth: syncStatus.syncHealth || syncStatus.statusCode || 'unknown',
    },
  }
}

export function exportSyncDiagnosticsReport(syncStatus = {}) {
  const report = buildSyncDiagnosticsSnapshot(syncStatus)
  const text = JSON.stringify(report, null, 2)

  if (forbiddenReportPatterns.some((pattern) => pattern.test(text))) {
    return JSON.stringify({
      appVersion: report.appVersion,
      error: 'Diagnosticsrapporten stoppades eftersom den inneholl forbjudna falt.',
    }, null, 2)
  }

  return text
}

export function getSyncDiagnosticsSnapshot() {
  return diagnosticsSnapshot
}

export function subscribeSyncDiagnostics(listener) {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

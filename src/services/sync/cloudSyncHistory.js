import { maskSyncIdentifier } from './syncDiagnostics.js'

export const syncHistoryEventTypes = [
  'syncStarted',
  'syncSucceeded',
  'syncFailed',
  'upload',
  'download',
  'safeMerge',
  'manualConflict',
  'conflictResolved',
  'retryScheduled',
  'retrySucceeded',
  'recoveryStarted',
  'recoverySucceeded',
  'recoveryFailed',
  'deviceSeen',
  'leaderChanged',
]

export const maxCloudSyncHistoryItems = 50

let historyItems = []

function safeText(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeEventType(value) {
  return syncHistoryEventTypes.includes(value) ? value : 'syncFailed'
}

export function normalizeCloudSyncHistoryEvent(event = {}, options = {}) {
  const occurredAt = safeText(event.occurredAt, 80) || (options.now instanceof Date ? options.now.toISOString() : options.now || new Date().toISOString())
  const eventType = safeEventType(event.eventType)

  return {
    dataType: safeText(event.dataType, 120),
    deviceIdMasked: maskSyncIdentifier(event.deviceIdMasked || event.deviceId || ''),
    durationMs: Math.max(0, Math.min(10 * 60 * 1000, Number(event.durationMs) || 0)),
    eventType,
    id: safeText(event.id, 120) || `sync-history-${occurredAt}-${eventType}`,
    occurredAt,
    result: safeText(event.result, 80),
    retryCount: Math.max(0, Math.min(99, Number(event.retryCount) || 0)),
    safeSummary: safeText(event.safeSummary || event.message, 220),
    technicalCode: safeText(event.technicalCode, 80),
  }
}

export function appendCloudSyncHistoryEvent(event = {}, options = {}) {
  const normalized = normalizeCloudSyncHistoryEvent(event, options)
  historyItems = [...historyItems, normalized].slice(-maxCloudSyncHistoryItems)
  return normalized
}

export function getCloudSyncHistory() {
  return [...historyItems]
}

export function clearCloudSyncHistory() {
  historyItems = []
  return historyItems
}

export function summarizeCloudSyncHistory() {
  const latest = historyItems.at(-1) || null
  const failedCount = historyItems.filter((item) => item.eventType === 'syncFailed' || item.eventType === 'recoveryFailed').length
  const conflictCount = historyItems.filter((item) => item.eventType === 'manualConflict').length

  return {
    conflictCount,
    failedCount,
    latest,
    size: historyItems.length,
  }
}

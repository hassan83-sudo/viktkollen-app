import { isAllowedSyncStorageKey } from './syncMetadata.js'

export const syncQueueStorageKey = 'viktkollen.syncQueue'
export const maxSyncQueueAttempts = 5

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeText(value, max = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function createQueueId(seed = Date.now()) {
  return `sync-queue-${seed}-${Math.random().toString(36).slice(2, 8)}`
}

function nextRetryAt(attempts, now = new Date()) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1))
  const date = new Date(now)
  date.setMinutes(date.getMinutes() + delayMinutes)
  return date.toISOString()
}

export function normalizeSyncQueueItem(item = {}, options = {}) {
  if (!isObject(item) || !isAllowedSyncStorageKey(item.storageKey)) return null
  const action = ['upload', 'download', 'delete', 'resolve-conflict'].includes(item.action) ? item.action : 'upload'
  const attempts = Math.max(0, Math.min(maxSyncQueueAttempts, Number(item.attempts) || 0))
  const now = options.now || new Date().toISOString()

  return {
    action,
    attempts,
    createdAt: normalizeText(item.createdAt, 80) || now,
    error: normalizeText(item.error, 500),
    id: normalizeText(item.id, 120) || createQueueId(now),
    nextAttemptAt: normalizeText(item.nextAttemptAt, 80),
    status: ['pending', 'running', 'failed', 'waiting_offline'].includes(item.status) ? item.status : 'pending',
    storageKey: item.storageKey,
    updatedAt: normalizeText(item.updatedAt, 80) || now,
  }
}

export function normalizeSyncQueue(value = {}) {
  const items = Array.isArray(value?.items) ? value.items : Array.isArray(value) ? value : []
  const deduped = new Map()

  items.map(normalizeSyncQueueItem).filter(Boolean).forEach((item) => {
    const key = ['upload', 'delete', 'download'].includes(item.action)
      ? `state|${item.storageKey}`
      : `${item.action}|${item.storageKey}`
    deduped.set(key, item)
  })

  return {
    items: [...deduped.values()].sort((first, second) =>
      new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()),
    version: 1,
  }
}

export function readSyncQueue(storage) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return normalizeSyncQueue()

  try {
    return normalizeSyncQueue(JSON.parse(resolvedStorage.getItem(syncQueueStorageKey) || '{}'))
  } catch {
    return normalizeSyncQueue()
  }
}

export function writeSyncQueue(queue, storage) {
  const normalized = normalizeSyncQueue(queue)
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return normalized

  try {
    resolvedStorage.setItem(syncQueueStorageKey, JSON.stringify(normalized))
  } catch {
    return normalized
  }

  return normalized
}

export function enqueueSyncAction(queue = {}, item = {}, options = {}) {
  const normalized = normalizeSyncQueue(queue)
  const nextItem = normalizeSyncQueueItem({ ...item, status: 'pending' }, options)
  if (!nextItem) return normalized
  const collapseStateAction = ['upload', 'delete', 'download'].includes(nextItem.action)

  return normalizeSyncQueue({
    items: [
      ...normalized.items.filter((entry) => {
        if (collapseStateAction && ['upload', 'delete', 'download'].includes(entry.action)) {
          return entry.storageKey !== nextItem.storageKey
        }
        return !(entry.action === nextItem.action && entry.storageKey === nextItem.storageKey)
      }),
      nextItem,
    ],
  })
}

export function getDueSyncQueueItems(queue = {}, now = new Date(), online = true) {
  if (!online) return []
  const time = new Date(now).getTime()

  return normalizeSyncQueue(queue).items.filter((item) => {
    if (item.status === 'running') return false
    if (item.attempts >= maxSyncQueueAttempts) return false
    if (!item.nextAttemptAt) return true

    return new Date(item.nextAttemptAt).getTime() <= time
  })
}

export function markSyncQueueItemRunning(queue = {}, itemId, now = new Date().toISOString()) {
  return normalizeSyncQueue({
    items: normalizeSyncQueue(queue).items.map((item) => item.id === itemId ? { ...item, status: 'running', updatedAt: now } : item),
  })
}

export function markSyncQueueItemSucceeded(queue = {}, itemId) {
  return normalizeSyncQueue({
    items: normalizeSyncQueue(queue).items.filter((item) => item.id !== itemId),
  })
}

export function markSyncQueueItemFailed(queue = {}, itemId, error = '', now = new Date()) {
  return normalizeSyncQueue({
    items: normalizeSyncQueue(queue).items.map((item) => {
      if (item.id !== itemId) return item
      const attempts = item.attempts + 1

      return {
        ...item,
        attempts,
        error: normalizeText(error, 500),
        nextAttemptAt: attempts >= maxSyncQueueAttempts ? '' : nextRetryAt(attempts, now),
        status: attempts >= maxSyncQueueAttempts ? 'failed' : 'pending',
        updatedAt: new Date(now).toISOString(),
      }
    }),
  })
}

export function markSyncQueueOffline(queue = {}, now = new Date().toISOString()) {
  return normalizeSyncQueue({
    items: normalizeSyncQueue(queue).items.map((item) => ({
      ...item,
      status: item.status === 'running' ? 'pending' : 'waiting_offline',
      updatedAt: now,
    })),
  })
}

export function getSyncQueueStatus(queue = {}, now = new Date(), online = true) {
  const normalized = normalizeSyncQueue(queue)
  const pending = normalized.items.filter((item) => item.status === 'pending')
  const failed = normalized.items.filter((item) => item.status === 'failed')
  const running = normalized.items.filter((item) => item.status === 'running')
  const offline = normalized.items.filter((item) => item.status === 'waiting_offline')
  const due = getDueSyncQueueItems(normalized, now, online)

  return {
    dueCount: due.length,
    failedCount: failed.length,
    nextRetryAt: normalized.items.map((item) => item.nextAttemptAt).filter(Boolean).sort()[0] || '',
    offlineCount: offline.length,
    pendingCount: pending.length,
    queueHealth: failed.length ? 'failed' : !online ? 'offline' : running.length ? 'running' : pending.length ? 'pending' : 'empty',
    runningCount: running.length,
    totalCount: normalized.items.length,
  }
}

export const syncQueueInternals = {
  createQueueId,
  getStorage,
  nextRetryAt,
  normalizeText,
}

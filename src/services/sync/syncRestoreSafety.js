import {
  getPayloadSizeBytes,
  isAllowedSyncStorageKey,
  maxSyncPayloadBytes,
  syncStorageAllowlist,
} from './syncMetadata.js'

export const syncRestoreSnapshotStorageKey = 'viktkollen.syncRestoreSnapshots'
export const maxSyncRestoreSnapshots = 5

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function normalizeSnapshot(value = {}) {
  const entries = value?.entries && typeof value.entries === 'object' && !Array.isArray(value.entries)
    ? value.entries
    : {}

  return {
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    entries: Object.fromEntries(
      Object.entries(entries)
        .filter(([key]) => isAllowedSyncStorageKey(key))
        .map(([key, raw]) => [key, raw === null ? null : String(raw)]),
    ),
    id: typeof value.id === 'string' ? value.id : `sync-restore-${Date.now()}`,
    reason: typeof value.reason === 'string' ? value.reason.slice(0, 200) : 'sync-restore',
  }
}

export function readSyncRestoreSnapshots(storage) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return []

  const parsed = safeJsonParse(resolvedStorage.getItem(syncRestoreSnapshotStorageKey) || '[]', [])

  return (Array.isArray(parsed) ? parsed : [])
    .map(normalizeSnapshot)
    .slice(0, maxSyncRestoreSnapshots)
}

export function createSyncRestoreSnapshot(storage, keys = syncStorageAllowlist, options = {}) {
  const resolvedStorage = getStorage(storage)
  const timestamp = options.now instanceof Date
    ? options.now.toISOString()
    : typeof options.now === 'string'
      ? options.now
      : new Date().toISOString()

  if (!resolvedStorage) {
    return normalizeSnapshot({ createdAt: timestamp, entries: {}, reason: options.reason })
  }

  const entries = {}

  keys.filter(isAllowedSyncStorageKey).forEach((key) => {
    entries[key] = resolvedStorage.getItem(key)
  })

  const snapshot = normalizeSnapshot({
    createdAt: timestamp,
    entries,
    id: `sync-restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reason: options.reason,
  })

  try {
    resolvedStorage.setItem(syncRestoreSnapshotStorageKey, JSON.stringify([
      snapshot,
      ...readSyncRestoreSnapshots(resolvedStorage),
    ].slice(0, maxSyncRestoreSnapshots)))
  } catch {
    return snapshot
  }

  return snapshot
}

export function rollbackSyncRestoreSnapshot(snapshot, storage) {
  const resolvedStorage = getStorage(storage)
  const normalized = normalizeSnapshot(snapshot)

  if (!resolvedStorage) return false

  Object.entries(normalized.entries).forEach(([key, raw]) => {
    if (!isAllowedSyncStorageKey(key)) return
    if (raw === null) {
      resolvedStorage.removeItem(key)
      return
    }

    resolvedStorage.setItem(key, raw)
  })

  return true
}

export function validateIncomingSyncRecord(record) {
  const storageKey = record?.storageKey || record?.storage_key

  if (!record || !isAllowedSyncStorageKey(storageKey)) {
    return { ok: false, reason: 'Nyckeln får inte synkas.' }
  }

  if (record.deleted_at) {
    return { ok: true }
  }

  const sizeBytes = getPayloadSizeBytes(record.payload ?? null)

  if (sizeBytes > maxSyncPayloadBytes) {
    return { ok: false, reason: 'Molnposten är för stor för säker sync.' }
  }

  try {
    JSON.stringify(record.payload ?? null)
  } catch {
    return { ok: false, reason: 'Molnposten kan inte serialiseras säkert.' }
  }

  return { ok: true, sizeBytes }
}

export function applyIncomingSyncRecordSafely(record, storage, applyRecord, options = {}) {
  const validation = validateIncomingSyncRecord(record)
  const storageKey = record?.storageKey || record?.storage_key

  if (!validation.ok) {
    return { ...validation, applied: null, snapshot: null }
  }

  const snapshot = createSyncRestoreSnapshot(storage, [storageKey], {
    now: options.now,
    reason: `sync-apply:${storageKey}`,
  })

  try {
    const applied = applyRecord(record)

    return { applied, ok: true, snapshot }
  } catch (error) {
    rollbackSyncRestoreSnapshot(snapshot, storage)

    return {
      applied: null,
      ok: false,
      reason: String(error?.message || 'Molndata kunde inte appliceras säkert.'),
      snapshot,
    }
  }
}

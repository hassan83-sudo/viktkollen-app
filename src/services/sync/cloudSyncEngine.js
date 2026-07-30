import { supabase } from '../supabaseClient.js'
import {
  calculateChecksum,
  clearSyncUserState,
  createLocalSyncRecord,
  getOrCreateSyncDeviceId,
  isAllowedSyncStorageKey,
  maxSyncPayloadBytes,
  readSyncMetadata,
  stableSerialize,
  syncStorageAllowlist,
  writeSyncMetadata,
} from './syncMetadata.js'
import {
  enqueueSyncAction,
  markSyncQueueOffline,
  readSyncQueue,
  writeSyncQueue,
} from './syncQueue.js'
import { applyConflictChoice, resolveSyncConflict } from './syncConflictResolver.js'

export const cloudSyncTable = 'user_sync_items'

let syncRunning = false

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString()
}

function normalizeText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function getOnlineState(online) {
  if (typeof online === 'boolean') return online
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) return navigator.onLine

  return true
}

function buildKeyMeta(record, remoteRevision = '') {
  return {
    checksum: record?.checksum || '',
    deletedAt: record?.deletedAt || record?.deleted_at || '',
    lastRemoteRevision: normalizeText(remoteRevision, 120),
    updatedAt: record?.clientUpdatedAt || record?.client_updated_at || nowIso(),
  }
}

function makeResult(overrides = {}) {
  return {
    conflicts: [],
    downloaded: [],
    error: '',
    ok: true,
    pendingCount: 0,
    skipped: [],
    status: 'ok',
    uploaded: [],
    ...overrides,
  }
}

export function buildLocalSyncSnapshot(storage, now = new Date()) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return { records: [], skipped: [{ reason: 'Ingen lokal lagring.', storageKey: '' }] }

  const records = []
  const skipped = []
  const timestamp = nowIso(now)

  syncStorageAllowlist.forEach((storageKey) => {
    const record = createLocalSyncRecord(storageKey, resolvedStorage, timestamp)
    if (!record) return

    if (!record.ok) {
      skipped.push({
        reason: record.warning || 'Nyckeln kunde inte förberedas för sync.',
        storageKey,
      })
      return
    }

    records.push(record)
  })

  return { records, skipped }
}

export function normalizeRemoteSyncRow(row = {}) {
  const storageKey = row.storage_key || row.storageKey || ''

  if (!isAllowedSyncStorageKey(storageKey)) return null

  return {
    checksum: normalizeText(row.checksum, 120),
    clientUpdatedAt: normalizeText(row.client_updated_at || row.clientUpdatedAt, 80),
    dataVersion: Number(row.data_version || row.dataVersion) || 1,
    deleted_at: normalizeText(row.deleted_at || row.deletedAt, 80),
    deviceId: normalizeText(row.device_id || row.deviceId, 160),
    payload: row.payload ?? null,
    remoteRevision: normalizeText(row.server_updated_at || row.updated_at || row.remoteRevision || row.id, 120),
    serverUpdatedAt: normalizeText(row.server_updated_at || row.updated_at || row.serverUpdatedAt, 80),
    storageKey,
  }
}

export function normalizeRemoteSyncRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(normalizeRemoteSyncRow).filter(Boolean)
}

export function createRemoteSyncPayload(record, userId, deviceId) {
  return {
    checksum: record.checksum,
    client_updated_at: record.clientUpdatedAt || nowIso(),
    data_version: record.dataVersion || 1,
    deleted_at: record.deleted ? record.deletedAt || nowIso() : null,
    device_id: deviceId,
    payload: record.deleted ? null : record.payload,
    storage_key: record.storageKey,
    user_id: userId,
  }
}

async function fetchRemoteSyncRows(client) {
  const { data, error } = await client
    .from(cloudSyncTable)
    .select('id,user_id,storage_key,payload,data_version,client_updated_at,server_updated_at,device_id,checksum,deleted_at')

  if (error) throw error

  return normalizeRemoteSyncRows(data)
}

async function uploadLocalRecord({ client, deviceId, record, userId }) {
  const payload = createRemoteSyncPayload(record, userId, deviceId)
  const { data, error } = await client
    .from(cloudSyncTable)
    .upsert(payload, { onConflict: 'user_id,storage_key' })

  if (error) throw error

  return normalizeRemoteSyncRow(data?.[0] || payload) || {
    ...record,
    remoteRevision: record.clientUpdatedAt,
  }
}

function applyRemoteRecordToLocal(record, storage) {
  const resolvedStorage = getStorage(storage)
  const normalizedRecord = record?.storageKey ? record : normalizeRemoteSyncRow(record)
  if (!resolvedStorage || !isAllowedSyncStorageKey(normalizedRecord?.storageKey)) return null

  if (normalizedRecord.deleted_at) {
    resolvedStorage.removeItem(normalizedRecord.storageKey)
    return {
      checksum: calculateChecksum(null),
      deleted: true,
      deletedAt: normalizedRecord.deleted_at,
      storageKey: normalizedRecord.storageKey,
    }
  }

  resolvedStorage.setItem(normalizedRecord.storageKey, JSON.stringify(normalizedRecord.payload ?? null))

  return {
    checksum: normalizedRecord.checksum || calculateChecksum(stableSerialize(normalizedRecord.payload ?? null)),
    clientUpdatedAt: normalizedRecord.clientUpdatedAt || normalizedRecord.serverUpdatedAt || nowIso(),
    dataVersion: normalizedRecord.dataVersion || 1,
    deleted: false,
    payload: normalizedRecord.payload ?? null,
    storageKey: normalizedRecord.storageKey,
  }
}

export function scanLocalSyncChanges(storage, now = new Date()) {
  const metadata = readSyncMetadata(storage)
  const snapshot = buildLocalSyncSnapshot(storage, now)
  let queue = readSyncQueue(storage)
  const changedKeys = []

  snapshot.records.forEach((record) => {
    const previous = metadata.keys[record.storageKey]
    if (record.deleted && !previous?.checksum && !metadata.pendingKeys.includes(record.storageKey)) return
    const hasChanged = previous?.checksum !== record.checksum || previous?.deletedAt !== record.deletedAt
    const isPending = metadata.pendingKeys.includes(record.storageKey)

    if (hasChanged || isPending) {
      changedKeys.push(record.storageKey)
      queue = enqueueSyncAction(queue, {
        action: record.deleted ? 'delete' : 'upload',
        storageKey: record.storageKey,
      }, { now: nowIso(now) })
    }
  })

  writeSyncQueue(queue, storage)

  return {
    changedKeys,
    queue,
    snapshot,
  }
}

function addConflict(metadata, storageKey, conflict, timestamp) {
  return {
    ...metadata,
    conflicts: [
      {
        action: conflict.action,
        createdAt: timestamp,
        localRecord: conflict.localRecord,
        reason: conflict.reason || 'Både lokal data och molndata har ändrats.',
        remoteRecord: conflict.remoteRecord,
        storageKey,
      },
      ...metadata.conflicts.filter((item) => item.storageKey !== storageKey),
    ].slice(0, 50),
  }
}

export async function runCloudSync(options = {}) {
  const {
    client = supabase,
    force = false,
    now = new Date(),
    online,
    storage,
    userId,
  } = options
  const resolvedStorage = getStorage(storage)
  const timestamp = nowIso(now)
  let metadata = readSyncMetadata(resolvedStorage)
  const deviceId = metadata.deviceId || getOrCreateSyncDeviceId(resolvedStorage)

  if (!userId) {
    return makeResult({ ok: false, status: 'not_authenticated', error: 'Logga in för att använda automatisk sync.' })
  }

  if (!client) {
    return makeResult({ ok: false, status: 'not_configured', error: 'Supabase är inte konfigurerat.' })
  }

  if (!metadata.enabled && !force) {
    return makeResult({
      pendingCount: metadata.pendingKeys.length,
      status: 'disabled',
    })
  }

  if (!getOnlineState(online)) {
    writeSyncQueue(markSyncQueueOffline(readSyncQueue(resolvedStorage), timestamp), resolvedStorage)
    writeSyncMetadata({
      ...metadata,
      deviceId,
      lastAttemptAt: timestamp,
      lastError: 'Ingen nätverksanslutning.',
    }, resolvedStorage)
    return makeResult({ ok: false, pendingCount: metadata.pendingKeys.length, status: 'offline', error: 'Ingen nätverksanslutning.' })
  }

  if (syncRunning) {
    return makeResult({ ok: false, pendingCount: metadata.pendingKeys.length, status: 'already_running', error: 'Sync pågår redan.' })
  }

  syncRunning = true

  try {
    const scan = scanLocalSyncChanges(resolvedStorage, now)
    const localByKey = new Map(scan.snapshot.records.map((record) => [record.storageKey, record]))
    const remoteRows = await fetchRemoteSyncRows(client)
    const remoteByKey = new Map(remoteRows.map((record) => [record.storageKey, record]))
    const keys = new Set([...localByKey.keys(), ...remoteByKey.keys(), ...metadata.pendingKeys])
    const result = makeResult({ skipped: scan.snapshot.skipped })

    metadata = readSyncMetadata(resolvedStorage)

    for (const storageKey of keys) {
      if (!isAllowedSyncStorageKey(storageKey)) continue

      const localRecord = localByKey.get(storageKey) || createLocalSyncRecord(storageKey, resolvedStorage, timestamp)
      const remoteRecord = remoteByKey.get(storageKey)
      const previous = metadata.keys[storageKey] || {}

      if (localRecord?.deleted && !remoteRecord && !previous.checksum && !metadata.pendingKeys.includes(storageKey)) {
        continue
      }

      const decision = resolveSyncConflict({
        localRecord,
        metadata: previous,
        remoteRecord,
      })

      if (decision.action === 'none') {
        const record = remoteRecord || localRecord
        metadata.keys[storageKey] = buildKeyMeta(record, remoteRecord?.remoteRevision)
        continue
      }

      if (decision.action === 'upload' || decision.action === 'upload_tombstone') {
        const uploaded = await uploadLocalRecord({ client, deviceId, record: localRecord, userId })
        metadata.keys[storageKey] = buildKeyMeta(localRecord, uploaded.remoteRevision)
        result.uploaded.push(storageKey)
        continue
      }

      if (decision.action === 'download' || decision.action === 'apply_remote_delete') {
        const applied = applyRemoteRecordToLocal(remoteRecord, resolvedStorage)
        metadata.keys[storageKey] = buildKeyMeta(applied || remoteRecord, remoteRecord.remoteRevision)
        result.downloaded.push(storageKey)
        continue
      }

      if (decision.action === 'merge_upload') {
        const mergedRecord = {
          ...localRecord,
          checksum: decision.checksum,
          clientUpdatedAt: timestamp,
          deleted: false,
          payload: decision.payload,
          raw: stableSerialize(decision.payload),
          sizeBytes: decision.payload ? stableSerialize(decision.payload).length : 0,
        }
        if (mergedRecord.sizeBytes > maxSyncPayloadBytes) {
          result.skipped.push({ reason: 'Merge-resultatet blev för stort för automatisk sync.', storageKey })
          continue
        }
        resolvedStorage.setItem(storageKey, JSON.stringify(decision.payload))
        const uploaded = await uploadLocalRecord({ client, deviceId, record: mergedRecord, userId })
        metadata.keys[storageKey] = buildKeyMeta(mergedRecord, uploaded.remoteRevision)
        result.uploaded.push(storageKey)
        continue
      }

      metadata = addConflict(metadata, storageKey, decision, timestamp)
      result.conflicts.push(storageKey)
    }

    const pendingKeys = metadata.pendingKeys.filter((key) => result.conflicts.includes(key))
    writeSyncMetadata({
      ...metadata,
      deviceId,
      lastAttemptAt: timestamp,
      lastError: result.conflicts.length ? 'Konflikter behöver lösas manuellt.' : '',
      lastSuccessfulSyncAt: result.conflicts.length ? metadata.lastSuccessfulSyncAt : timestamp,
      pendingKeys,
    }, resolvedStorage)
    writeSyncQueue({ items: readSyncQueue(resolvedStorage).items.filter((item) => pendingKeys.includes(item.storageKey)) }, resolvedStorage)

    return {
      ...result,
      ok: result.conflicts.length === 0,
      pendingCount: pendingKeys.length,
      status: result.conflicts.length ? 'conflict' : 'synced',
    }
  } catch (error) {
    writeSyncMetadata({
      ...metadata,
      deviceId,
      lastAttemptAt: timestamp,
      lastError: normalizeText(error?.message || 'Sync misslyckades.'),
    }, resolvedStorage)

    return makeResult({
      ok: false,
      pendingCount: metadata.pendingKeys.length,
      status: 'error',
      error: normalizeText(error?.message || 'Sync misslyckades.'),
    })
  } finally {
    syncRunning = false
  }
}

export function setCloudSyncEnabled(enabled, storage, now = new Date()) {
  const metadata = readSyncMetadata(storage)

  return writeSyncMetadata({
    ...metadata,
    enabled: enabled === true,
    lastAttemptAt: enabled ? metadata.lastAttemptAt : nowIso(now),
    lastError: '',
  }, storage)
}

export async function resolveStoredSyncConflict(storageKey, choice, options = {}) {
  const { client = supabase, now = new Date(), storage, userId } = options
  const metadata = readSyncMetadata(storage)
  const conflict = metadata.conflicts.find((item) => item.storageKey === storageKey)
  const decision = applyConflictChoice({ ...conflict, action: 'conflict' }, choice)
  const timestamp = nowIso(now)

  if (!decision.ok) {
    return makeResult({ ok: false, status: 'conflict_error', error: decision.reason })
  }

  if (decision.action === 'download') {
    const applied = applyRemoteRecordToLocal(decision.record, storage)
    writeSyncMetadata({
      ...metadata,
      conflicts: metadata.conflicts.filter((item) => item.storageKey !== storageKey),
      keys: {
        ...metadata.keys,
        [storageKey]: buildKeyMeta(applied || decision.record, decision.record?.remoteRevision),
      },
      pendingKeys: metadata.pendingKeys.filter((key) => key !== storageKey),
    }, storage)
    return makeResult({ downloaded: [storageKey], status: 'resolved' })
  }

  if (!userId) return makeResult({ ok: false, status: 'not_authenticated', error: 'Logga in för att lösa konflikten.' })
  const uploaded = await uploadLocalRecord({
    client,
    deviceId: metadata.deviceId || getOrCreateSyncDeviceId(storage),
    record: decision.record,
    userId,
  })
  writeSyncMetadata({
    ...metadata,
    conflicts: metadata.conflicts.filter((item) => item.storageKey !== storageKey),
    keys: {
      ...metadata.keys,
      [storageKey]: buildKeyMeta(decision.record, uploaded.remoteRevision || timestamp),
    },
    pendingKeys: metadata.pendingKeys.filter((key) => key !== storageKey),
  }, storage)

  return makeResult({ status: 'resolved', uploaded: [storageKey] })
}

export function getCloudSyncStatusModel(storage, online) {
  const metadata = readSyncMetadata(storage)
  const queue = readSyncQueue(storage)
  const pendingCount = metadata.pendingKeys.length + queue.items.filter((item) => item.status !== 'failed').length

  return {
    conflicts: metadata.conflicts,
    deviceId: metadata.deviceId,
    enabled: metadata.enabled,
    isOnline: getOnlineState(online),
    lastError: metadata.lastError,
    lastSuccessfulSyncAt: metadata.lastSuccessfulSyncAt,
    pendingCount,
    queue,
    status: metadata.enabled ? 'På' : 'Av',
  }
}

export function clearCloudSyncLocalState(storage) {
  return clearSyncUserState(storage)
}

export const cloudSyncEngineInternals = {
  applyRemoteRecordToLocal,
  buildKeyMeta,
  fetchRemoteSyncRows,
  getOnlineState,
  getStorage,
  normalizeText,
  nowIso,
  uploadLocalRecord,
}

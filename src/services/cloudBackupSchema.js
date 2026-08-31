import { readStorage, writeStorage } from './appStorageService.js'
import { isBodyAnalysisCloudStorageKey, sanitizeValueForCloudTransfer } from './bodyAnalysisHistory.js'
import { sanitizeMediaPayloadMap } from './security/mediaSafeguard.js'
import {
  getBackupStorageKeys,
  getCloudClientId,
  getPreRestoreBackup,
  getUserDataBackupSnapshot,
  savePreRestoreBackup,
} from './userDataRepository.js'

export const cloudBackupSchemaVersion = 2
export const maxRecommendedBackupSizeBytes = 4.5 * 1024 * 1024

export function sanitizeBackupUserData(userData = {}) {
  if (!userData || typeof userData !== 'object' || Array.isArray(userData)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(userData).map(([key, value]) => [
      key,
      isBodyAnalysisCloudStorageKey(key) ? sanitizeValueForCloudTransfer(key, value) : value,
    ]),
  )
}

function stableSort(value) {
  if (Array.isArray(value)) {
    return value.map(stableSort)
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = stableSort(value[key])
        return sorted
      }, {})
  }

  return value
}

export function stableStringify(value) {
  return JSON.stringify(stableSort(value))
}

export function createStableChecksum(value) {
  const text = stableStringify(value)
  let hash = 5381

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index)
  }

  return `vk-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function getApproximatePayloadSize(payload) {
  const text = stableStringify(payload || {})

  if (typeof Blob !== 'undefined') {
    return new Blob([text]).size
  }

  return text.length
}

function getAppVersion() {
  return import.meta.env?.VITE_APP_VERSION || '0.0.0'
}

// forCloudUpload controls whether the central deny-by-default media
// guard is applied. It must stay OFF for the local pre-restore undo
// snapshot (source: 'pre-restore'), which never leaves the device and
// must keep full image fidelity so an undo can restore local images
// exactly as they were. It is ON for every payload actually destined
// for cloud upload or cloud comparison.
function readAllowlistedUserData({ forCloudUpload = true } = {}) {
  const sanitized = sanitizeBackupUserData(getBackupStorageKeys().reduce((data, key) => {
    const value = readStorage(key, null)

    if (value === null || value === undefined) {
      return data
    }

    return {
      ...data,
      [key]: value,
    }
  }, {}))

  return forCloudUpload ? sanitizeMediaPayloadMap(sanitized) : sanitized
}

export function buildCloudBackupPayload({ name = '', source = 'manual' } = {}) {
  const userData = readAllowlistedUserData({ forCloudUpload: source !== 'pre-restore' })
  const storageKeys = Object.keys(userData).sort()
  const exportedAt = new Date().toISOString()
  const clientId = getCloudClientId()
  const basePayload = {
    app: 'Viktkollen',
    appVersion: getAppVersion(),
    clientId,
    exportedAt,
    metadata: {
      containsLargeLocalImages: /data:image\//i.test(stableStringify(userData)),
      name: name.trim(),
      source,
      storageKeyCount: storageKeys.length,
      storageKeys,
    },
    schemaVersion: cloudBackupSchemaVersion,
    userData,
  }
  const sizeBytes = getApproximatePayloadSize(basePayload)

  return {
    ...basePayload,
    checksum: createStableChecksum({
      schemaVersion: basePayload.schemaVersion,
      userData: basePayload.userData,
    }),
    metadata: {
      ...basePayload.metadata,
      sizeBytes,
      warning:
        sizeBytes > maxRecommendedBackupSizeBytes
          ? 'Backupen är stor. Bilder kan senare flyttas till Supabase Storage.'
          : '',
    },
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeCloudBackupPayload(payload) {
  if (!isObject(payload)) {
    return null
  }

  if (payload.schemaVersion === cloudBackupSchemaVersion && isObject(payload.userData)) {
    const storageKeys = Object.keys(payload.userData).filter((key) =>
      getBackupStorageKeys().includes(key),
    )
    const userData = sanitizeBackupUserData(storageKeys.reduce((data, key) => ({
      ...data,
      [key]: payload.userData[key],
    }), {}))
    const normalized = {
      app: 'Viktkollen',
      appVersion: typeof payload.appVersion === 'string' ? payload.appVersion : '0.0.0',
      clientId: typeof payload.clientId === 'string' ? payload.clientId : '',
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : new Date().toISOString(),
      metadata: isObject(payload.metadata) ? payload.metadata : {},
      schemaVersion: cloudBackupSchemaVersion,
      userData,
    }

    return {
      ...normalized,
      checksum: payload.checksum || createStableChecksum({
        schemaVersion: normalized.schemaVersion,
        userData: normalized.userData,
      }),
      metadata: {
        ...normalized.metadata,
        sizeBytes: getApproximatePayloadSize(normalized),
        storageKeyCount: storageKeys.length,
        storageKeys,
      },
    }
  }

  if (payload.version === 1 && isObject(payload.data)) {
    return migrateLegacySnapshotToV2(payload)
  }

  if (payload.backup) {
    return normalizeCloudBackupPayload(payload.backup)
  }

  return null
}

export function migrateLegacySnapshotToV2(snapshot) {
  const allowedKeys = getBackupStorageKeys()
  const userData = sanitizeBackupUserData(Object.entries(snapshot.data || {}).reduce((data, [key, value]) => {
    if (!allowedKeys.includes(key) || value === undefined) {
      return data
    }

    return {
      ...data,
      [key]: value,
    }
  }, {}))
  const storageKeys = Object.keys(userData).sort()
  const migrated = {
    app: 'Viktkollen',
    appVersion: getAppVersion(),
    clientId: getCloudClientId(),
    exportedAt: snapshot.createdAt || new Date().toISOString(),
    metadata: {
      migratedFromSchemaVersion: 1,
      source: 'legacy-v1',
      storageKeyCount: storageKeys.length,
      storageKeys,
    },
    schemaVersion: cloudBackupSchemaVersion,
    userData,
  }

  return {
    ...migrated,
    checksum: createStableChecksum({
      schemaVersion: migrated.schemaVersion,
      userData,
    }),
    metadata: {
      ...migrated.metadata,
      sizeBytes: getApproximatePayloadSize(migrated),
    },
  }
}

export function validateCloudBackupPayload(payload) {
  const normalized = normalizeCloudBackupPayload(payload)

  if (!normalized) {
    return {
      ok: false,
      payload: null,
      reason: 'Backupen har ett ogiltigt format.',
    }
  }

  if (!isObject(normalized.userData)) {
    return {
      ok: false,
      payload: null,
      reason: 'Backupen saknar användardata.',
    }
  }

  if (Object.keys(normalized.userData).length === 0) {
    return {
      ok: false,
      payload: normalized,
      reason: 'Backupen är tom.',
    }
  }

  return {
    ok: true,
    payload: normalized,
    reason: '',
  }
}

export function compareCloudBackupPayloads(first, second) {
  const normalizedFirst = normalizeCloudBackupPayload(first)
  const normalizedSecond = normalizeCloudBackupPayload(second)

  if (!normalizedFirst || !normalizedSecond) {
    return {
      checksumMatches: false,
      identical: false,
    }
  }

  return {
    checksumMatches: normalizedFirst.checksum === normalizedSecond.checksum,
    identical: stableStringify(normalizedFirst.userData) === stableStringify(normalizedSecond.userData),
  }
}

export function getLocalCloudBackupPayload() {
  return buildCloudBackupPayload()
}

export function getLegacySnapshotAsV2() {
  return migrateLegacySnapshotToV2(getUserDataBackupSnapshot())
}

export function createPreRestoreBackup() {
  const snapshot = buildCloudBackupPayload({ source: 'pre-restore' })

  savePreRestoreBackup(snapshot)

  return snapshot
}

export function getUndoRestorePreview() {
  const saved = getPreRestoreBackup(null)
  const validation = validateCloudBackupPayload(saved?.snapshot)

  return {
    createdAt: saved?.createdAt || null,
    ok: validation.ok,
    payload: validation.payload,
    reason: validation.reason,
  }
}

export function restoreCloudBackupPayload(payload) {
  const validation = validateCloudBackupPayload(payload)

  if (!validation.ok) {
    return {
      failedKeys: [],
      ok: false,
      reason: validation.reason,
      restoredKeys: [],
    }
  }

  const allowedKeys = new Set(getBackupStorageKeys())
  const failedKeys = []
  const restoredKeys = []

  Object.entries(validation.payload.userData).forEach(([key, value]) => {
    if (!allowedKeys.has(key) || value === undefined) {
      return
    }

    if (writeStorage(key, value)) {
      restoredKeys.push(key)
    } else {
      failedKeys.push(key)
    }
  })

  return {
    failedKeys,
    ok: failedKeys.length === 0,
    reason:
      failedKeys.length > 0
        ? 'Några lokala värden kunde inte återställas.'
        : 'Återställning lyckades.',
    restoredKeys,
  }
}

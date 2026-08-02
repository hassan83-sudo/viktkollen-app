export const syncMetadataStorageKey = 'viktkollen.syncMetadata'
export const syncDeviceIdStorageKey = 'viktkollen.syncDeviceId'
export const syncDataVersion = 1
export const maxSyncPayloadBytes = 750000

export const syncStorageAllowlist = [
  'viktkollen.profile',
  'viktkollen.weights',
  'viktkollen.meals',
  'viktkollen.foods',
  'viktkollen.goalsHabits.v2',
  'viktkollen.checkIn',
  'viktkollen.photoMeals',
  'viktkollen.chat',
  'viktkollen.demoMode',
  'viktkollen.nutritionGoals',
  'viktkollen.favoriteMeals',
  'viktkollen.mealAnalysisHistory',
  'viktkollen.progress.goalSettings',
  'viktkollen.progress.insightsSeen',
  'viktkollen.progressPhotos',
  'viktkollen.progress.reports.v1',
  'viktkollen.bodyMeasurements',
  'viktkollen.reminders',
  'viktkollen.reminderLog',
  'viktkollen.reminders.v2',
  'viktkollen.scannedProducts',
  'viktkollen.aiConversationMemory',
  'viktkollen.aiCoach.reports.v1',
  'viktkollen.bodyAnalysis.history.v1',
  'viktkollen.bodyAnalysis.history',
  'viktkollen.bodyAnalysis.latest',
  'viktkollen.dietaryPreferences.v1',
  'viktkollen.mealTemplates',
  'viktkollen.mealPlans',
  'viktkollen.shoppingLists',
  'viktkollen.recipes',
  'viktkollen.generatedMealPlans',
  'viktkollen.progressDashboard.period',
]

const denyPatterns = [
  /auth/i,
  /session/i,
  /supabase/i,
  /token/i,
  /secret/i,
  /apikey/i,
  /api[_-]?key/i,
]

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

export function isDeniedSyncStorageKey(key) {
  const text = String(key || '')

  return denyPatterns.some((pattern) => pattern.test(text))
}

export function isAllowedSyncStorageKey(key) {
  return syncStorageAllowlist.includes(key) && !isDeniedSyncStorageKey(key)
}

export function stableSerialize(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`

  return `{${Object.keys(value)
    .filter((key) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`
}

export function calculateChecksum(value) {
  const text = typeof value === 'string' ? value : stableSerialize(value)
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function getPayloadSizeBytes(value) {
  const text = typeof value === 'string' ? value : stableSerialize(value)

  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }

  return text.length
}

export function parseStoredSyncValue(raw) {
  if (raw === null || raw === undefined) {
    return { deleted: true, ok: true, payload: null, raw: null }
  }

  try {
    return { deleted: false, ok: true, payload: JSON.parse(raw), raw }
  } catch {
    return { deleted: false, error: 'Ogiltig lokal JSON.', ok: false, payload: null, raw }
  }
}

function createDeviceId() {
  const random = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(4))
    : [Date.now(), Math.random() * 1e9, Math.random() * 1e9, Math.random() * 1e9]

  return `device-${Array.from(random).map((part) => Number(part).toString(36)).join('-')}`
}

export function getOrCreateSyncDeviceId(storage) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return createDeviceId()

  try {
    const existing = normalizeText(resolvedStorage.getItem(syncDeviceIdStorageKey), 120)
    if (/^device-[a-z0-9-]{12,}$/i.test(existing)) return existing

    const next = createDeviceId()
    resolvedStorage.setItem(syncDeviceIdStorageKey, next)
    return next
  } catch {
    return createDeviceId()
  }
}

export function normalizeSyncMetadata(value = {}, options = {}) {
  const source = isObject(value) ? value : {}
  const keys = isObject(source.keys) ? source.keys : {}
  const pendingKeys = Array.isArray(source.pendingKeys) ? source.pendingKeys : []
  const conflicts = Array.isArray(source.conflicts) ? source.conflicts : []
  const deviceId = normalizeText(source.deviceId, 120) || options.deviceId || ''

  return {
    conflicts: conflicts
      .filter((conflict) => isObject(conflict) && isAllowedSyncStorageKey(conflict.storageKey))
      .slice(0, 50),
    deviceId,
    enabled: source.enabled === true,
    keys: Object.fromEntries(Object.entries(keys)
      .filter(([key]) => isAllowedSyncStorageKey(key))
      .map(([key, entry]) => [
        key,
        {
          checksum: normalizeText(entry?.checksum, 80),
          deletedAt: normalizeText(entry?.deletedAt, 80),
          lastRemoteRevision: normalizeText(entry?.lastRemoteRevision, 120),
          updatedAt: normalizeText(entry?.updatedAt, 80),
        },
      ])),
    lastAttemptAt: normalizeText(source.lastAttemptAt, 80),
    lastError: normalizeText(source.lastError, 500),
    lastSuccessfulSyncAt: normalizeText(source.lastSuccessfulSyncAt, 80),
    pendingKeys: [...new Set(pendingKeys.filter(isAllowedSyncStorageKey))],
    version: syncDataVersion,
  }
}

export function readSyncMetadata(storage) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return normalizeSyncMetadata()

  try {
    return normalizeSyncMetadata(JSON.parse(resolvedStorage.getItem(syncMetadataStorageKey) || '{}'), {
      deviceId: getOrCreateSyncDeviceId(resolvedStorage),
    })
  } catch {
    return normalizeSyncMetadata({}, { deviceId: getOrCreateSyncDeviceId(resolvedStorage) })
  }
}

export function writeSyncMetadata(metadata, storage) {
  const resolvedStorage = getStorage(storage)
  const normalized = normalizeSyncMetadata(metadata, {
    deviceId: metadata?.deviceId || getOrCreateSyncDeviceId(resolvedStorage),
  })

  if (!resolvedStorage) return normalized

  try {
    resolvedStorage.setItem(syncMetadataStorageKey, JSON.stringify(normalized))
  } catch {
    return normalized
  }

  return normalized
}

export function updateSyncMetadata(patch, storage) {
  return writeSyncMetadata({
    ...readSyncMetadata(storage),
    ...patch,
    keys: {
      ...readSyncMetadata(storage).keys,
      ...(patch.keys || {}),
    },
  }, storage)
}

export function markSyncKeyDirty(storageKey, storage, now = new Date().toISOString()) {
  if (!isAllowedSyncStorageKey(storageKey)) return readSyncMetadata(storage)

  const metadata = readSyncMetadata(storage)
  return writeSyncMetadata({
    ...metadata,
    keys: {
      ...metadata.keys,
      [storageKey]: {
        ...(metadata.keys[storageKey] || {}),
        updatedAt: now,
      },
    },
    pendingKeys: [...new Set([...metadata.pendingKeys, storageKey])],
  }, storage)
}

export function clearSyncUserState(storage) {
  const metadata = readSyncMetadata(storage)

  return writeSyncMetadata({
    deviceId: metadata.deviceId,
    enabled: false,
    keys: {},
    pendingKeys: [],
  }, storage)
}

export function createLocalSyncRecord(storageKey, storage, now = new Date().toISOString()) {
  if (!isAllowedSyncStorageKey(storageKey)) return null
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return null
  const parsed = parseStoredSyncValue(resolvedStorage.getItem(storageKey))
  const checksum = calculateChecksum(parsed.deleted ? null : parsed.raw)
  const sizeBytes = getPayloadSizeBytes(parsed.raw || '')

  return {
    checksum,
    clientUpdatedAt: now,
    dataVersion: syncDataVersion,
    deleted: parsed.deleted,
    deletedAt: parsed.deleted ? now : '',
    ok: parsed.ok && sizeBytes <= maxSyncPayloadBytes,
    payload: parsed.payload,
    raw: parsed.raw,
    sizeBytes,
    storageKey,
    warning: sizeBytes > maxSyncPayloadBytes ? 'För stor payload för automatisk synk.' : parsed.error || '',
  }
}

export const syncMetadataInternals = {
  createDeviceId,
  denyPatterns,
  getStorage,
  normalizeText,
}

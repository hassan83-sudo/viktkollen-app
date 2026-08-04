import {
  calculateChecksum,
  isAllowedSyncStorageKey,
  stableSerialize,
  syncDataVersion,
} from './syncMetadata.js'

export const cloudConflictDecisions = [
  'localWins',
  'remoteWins',
  'safeMerge',
  'manualConflict',
  'identical',
  'insufficientMetadata',
  'invalidPayload',
]

export const syncCollectionMergePolicies = {
  'viktkollen.adaptiveCoach.v1': 'mergeById',
  'viktkollen.aiCoach.reports.v1': 'manual',
  'viktkollen.aiConversationMemory': 'manual',
  'viktkollen.bodyAnalysis.history': 'mergeById',
  'viktkollen.bodyAnalysis.history.v1': 'mergeById',
  'viktkollen.bodyAnalysis.latest': 'manual',
  'viktkollen.bodyMeasurements': 'mergeById',
  'viktkollen.chat': 'manual',
  'viktkollen.checkIn': 'mergeById',
  'viktkollen.demoMode': 'lastWholeKey',
  'viktkollen.dietaryPreferences.v1': 'lastWholeKey',
  'viktkollen.favoriteMeals': 'mergeById',
  'viktkollen.foods': 'mergeById',
  'viktkollen.generatedMealPlans': 'mergeById',
  'viktkollen.goalsHabits.v2': 'mergeById',
  'viktkollen.mealAnalysisHistory': 'mergeById',
  'viktkollen.mealPlans': 'mergeWeeks',
  'viktkollen.mealTemplates': 'mergeById',
  'viktkollen.meals': 'mergeById',
  'viktkollen.nutritionGoals': 'lastWholeKey',
  'viktkollen.photoMeals': 'mergeById',
  'viktkollen.profile': 'lastWholeKey',
  'viktkollen.progress.goalSettings': 'lastWholeKey',
  'viktkollen.progress.insightsSeen': 'lastWholeKey',
  'viktkollen.progress.reports.v1': 'mergeById',
  'viktkollen.progressDashboard.period': 'lastWholeKey',
  'viktkollen.progressPhotos': 'mergeById',
  'viktkollen.recipes': 'mergeById',
  'viktkollen.reminderLog': 'mergeById',
  'viktkollen.reminders': 'mergeById',
  'viktkollen.reminders.v2': 'mergeById',
  'viktkollen.scannedProducts': 'mergeById',
  'viktkollen.shoppingLists': 'mergeWeeks',
  'viktkollen.weights': 'mergeById',
}

const clockSkewMs = 2 * 60 * 1000

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasUnsafeKey(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Object.keys(value).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) return true
  if (Array.isArray(value)) return value.some((item) => hasUnsafeKey(item, seen))
  return Object.values(value).some((item) => hasUnsafeKey(item, seen))
}

function parseTime(value) {
  const time = new Date(value || '').getTime()
  return Number.isFinite(time) ? time : null
}

function recordUpdatedAt(record = {}) {
  if (!record) return ''
  return record.clientUpdatedAt || record.client_updated_at || record.updatedAt || record.serverUpdatedAt || record.server_updated_at || ''
}

function recordDeletedAt(record = {}) {
  if (!record) return ''
  return record.deletedAt || record.deleted_at || ''
}

function getPayload(record = {}) {
  if (!record) return null
  return record.deleted || recordDeletedAt(record) ? null : record.payload
}

function getChecksum(record = {}) {
  if (!record) return calculateChecksum(stableSerialize(null))
  if (record.checksum) return record.checksum
  return calculateChecksum(stableSerialize(getPayload(record)))
}

function getVersion(record = {}) {
  if (!record) return syncDataVersion
  return Number(record.dataVersion || record.data_version || syncDataVersion) || syncDataVersion
}

function summarizeReason(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 220)
}

function getCollectionItems(payload, policy) {
  if (Array.isArray(payload)) return payload
  if (policy === 'mergeById' && isObject(payload) && Array.isArray(payload.items)) return payload.items
  return null
}

function itemUpdatedAt(item = {}) {
  return parseTime(item.updatedAt || item.clientUpdatedAt || item.createdAt) || 0
}

function itemDeleted(item = {}) {
  return item.deleted === true || item.archived === true || Boolean(item.deletedAt || item.deleted_at)
}

function mergeById(localPayload, remotePayload, policy = 'mergeById') {
  const localItems = getCollectionItems(localPayload, policy)
  const remoteItems = getCollectionItems(remotePayload, policy)
  if (!localItems || !remoteItems) return { ok: false, reason: 'Payload saknar stabil objektsamling.' }
  if (![...localItems, ...remoteItems].every((item) => isObject(item) && item.id)) {
    return { ok: false, reason: 'Alla objekt behöver stabilt id för säker merge.' }
  }

  const byId = new Map()
  const conflicts = []
  ;[...localItems, ...remoteItems].forEach((item) => {
    const id = String(item.id)
    const existing = byId.get(id)
    if (!existing) {
      byId.set(id, item)
      return
    }

    const existingChecksum = calculateChecksum(stableSerialize(existing))
    const nextChecksum = calculateChecksum(stableSerialize(item))
    if (existingChecksum === nextChecksum) return

    const existingTime = itemUpdatedAt(existing)
    const nextTime = itemUpdatedAt(item)
    const deletedCollision = itemDeleted(existing) !== itemDeleted(item)
    if (!existingTime || !nextTime || Math.abs(existingTime - nextTime) <= clockSkewMs || deletedCollision) {
      conflicts.push(id)
      return
    }
    byId.set(id, nextTime > existingTime ? item : existing)
  })

  if (conflicts.length) {
    return { ok: false, reason: `Samma objekt ändrades på båda enheter: ${conflicts.slice(0, 3).join(', ')}.` }
  }

  const mergedItems = [...byId.values()].sort((first, second) =>
    String(first.id).localeCompare(String(second.id), 'sv-SE'))

  if (Array.isArray(localPayload) && Array.isArray(remotePayload)) return { ok: true, payload: mergedItems, strategy: 'mergeById' }
  return {
    ok: true,
    payload: {
      ...(isObject(localPayload) ? localPayload : {}),
      ...(isObject(remotePayload) ? remotePayload : {}),
      items: mergedItems,
    },
    strategy: 'mergeById',
  }
}

function mergeNestedDayCollections(localPayload = {}, remotePayload = {}) {
  if (!isObject(localPayload) || !isObject(remotePayload)) return { ok: false, reason: 'Veckodata behöver vara objekt.' }
  const weeks = {}
  const weekKeys = new Set([...Object.keys(localPayload.weeks || {}), ...Object.keys(remotePayload.weeks || {})])

  for (const weekStart of weekKeys) {
    const localWeek = localPayload.weeks?.[weekStart] || {}
    const remoteWeek = remotePayload.weeks?.[weekStart] || {}
    const days = {}
    const dayKeys = new Set([...Object.keys(localWeek.days || {}), ...Object.keys(remoteWeek.days || {})])
    for (const day of dayKeys) {
      const mergedDay = mergeById(localWeek.days?.[day] || [], remoteWeek.days?.[day] || [])
      if (!mergedDay.ok) return mergedDay
      days[day] = mergedDay.payload
    }
    const mergedItems = mergeById(localWeek.items || [], remoteWeek.items || [])
    if (!mergedItems.ok) return mergedItems
    weeks[weekStart] = { ...localWeek, ...remoteWeek, days, items: mergedItems.payload, weekStart }
  }

  return { ok: true, payload: { ...localPayload, ...remotePayload, weeks }, strategy: 'mergeWeeks' }
}

export function canSafelyMergeSyncPayload(storageKey, localPayload, remotePayload) {
  if (!isAllowedSyncStorageKey(storageKey)) return { ok: false, reason: 'Nyckeln ingår inte i sync allowlist.' }
  if (hasUnsafeKey(localPayload) || hasUnsafeKey(remotePayload)) return { ok: false, reason: 'Payload innehåller osäkra objektfält.' }
  const policy = syncCollectionMergePolicies[storageKey] || 'manual'
  if (policy === 'mergeById') return mergeById(localPayload, remotePayload, policy)
  if (policy === 'mergeWeeks') return mergeNestedDayCollections(localPayload, remotePayload)

  return { ok: false, reason: 'Automatisk merge är inte säker för denna datatyp.' }
}

export function resolveCloudSyncConflict({
  localMetadata = {},
  localRecord = null,
  now = null,
  previousMetadata = {},
  remoteMetadata = {},
  remoteRecord = null,
  storageKey = localRecord?.storageKey || remoteRecord?.storageKey || '',
} = {}) {
  const fallbackTimestamp = [
    recordUpdatedAt(localRecord),
    recordUpdatedAt(remoteRecord),
    previousMetadata.updatedAt,
    localMetadata.updatedAt,
    remoteMetadata.updatedAt,
  ].filter(Boolean).sort().at(-1) || new Date().toISOString()
  const timestamp = now ? (now instanceof Date ? now.toISOString() : new Date(now).toISOString()) : fallbackTimestamp
  if (!isAllowedSyncStorageKey(storageKey)) {
    return buildCloudConflictDecision({ decision: 'invalidPayload', reason: 'Nyckeln får inte synkas.', storageKey, timestamp })
  }
  if (!localRecord && !remoteRecord) {
    return buildCloudConflictDecision({ decision: 'insufficientMetadata', reason: 'Både lokal och remote data saknas.', storageKey, timestamp })
  }
  if ((localRecord && getVersion(localRecord) !== syncDataVersion) || (remoteRecord && getVersion(remoteRecord) !== syncDataVersion)) {
    return buildCloudConflictDecision({ decision: 'manualConflict', reason: 'SchemaVersion skiljer sig och kräver manuell hantering.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
  }
  if (hasUnsafeKey(getPayload(localRecord)) || hasUnsafeKey(getPayload(remoteRecord))) {
    return buildCloudConflictDecision({ decision: 'invalidPayload', reason: 'Payload innehåller osäkra objektfält.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
  }

  const localChecksum = getChecksum(localRecord)
  const remoteChecksum = getChecksum(remoteRecord)
  const previousChecksum = previousMetadata.checksum || localMetadata.checksum || remoteMetadata.checksum || ''
  if (localRecord && remoteRecord && localChecksum === remoteChecksum) {
    return buildCloudConflictDecision({ decision: 'identical', reason: 'Lokal och remote checksum är identiska.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
  }

  const localDeleted = Boolean(localRecord?.deleted || recordDeletedAt(localRecord))
  const remoteDeleted = Boolean(remoteRecord?.deleted || recordDeletedAt(remoteRecord))
  const localChanged = Boolean(localRecord && localChecksum !== previousChecksum && !(localDeleted && !previousChecksum))
  const remoteChanged = Boolean(remoteRecord && remoteChecksum !== previousChecksum)

  if (localChanged && remoteChanged) {
    if (localDeleted !== remoteDeleted) {
      return buildCloudConflictDecision({ decision: 'manualConflict', reason: 'Raderad och aktiv status kolliderar.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
    }
    const merged = canSafelyMergeSyncPayload(storageKey, getPayload(localRecord), getPayload(remoteRecord))
    if (merged.ok) {
      return buildCloudConflictDecision({
        decision: 'safeMerge',
        mergePayload: merged.payload,
        mergeStrategy: merged.strategy,
        reason: 'Olika objekt kunde mergas deterministiskt.',
        storageKey,
        timestamp,
      }, localRecord, remoteRecord, previousMetadata)
    }
    return buildCloudConflictDecision({ decision: 'manualConflict', reason: merged.reason, storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
  }

  if (localChanged && !remoteChanged) return buildCloudConflictDecision({ decision: 'localWins', reason: 'Endast lokal data har ändrats.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
  if (!localChanged && remoteChanged) return buildCloudConflictDecision({ decision: 'remoteWins', reason: 'Endast molndata har ändrats.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)

  const localTime = parseTime(recordUpdatedAt(localRecord))
  const remoteTime = parseTime(recordUpdatedAt(remoteRecord))
  if (!localTime && !remoteTime && previousChecksum) {
    return buildCloudConflictDecision({ decision: 'insufficientMetadata', reason: 'Tidsmetadata saknas för båda sidor.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
  }
  if (localTime && remoteTime && Math.abs(localTime - remoteTime) <= clockSkewMs && localChecksum !== remoteChecksum) {
    return buildCloudConflictDecision({ decision: 'manualConflict', reason: 'Tidsstämplar ligger inom clock skew-fönstret.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
  }
  if (localTime > remoteTime) return buildCloudConflictDecision({ decision: 'localWins', reason: 'Lokal data har nyare tidsstämpel.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
  if (remoteTime > localTime) return buildCloudConflictDecision({ decision: 'remoteWins', reason: 'Molndata har nyare tidsstämpel.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)

  return buildCloudConflictDecision({ decision: 'identical', reason: 'Ingen ändring kunde identifieras.', storageKey, timestamp }, localRecord, remoteRecord, previousMetadata)
}

export function buildCloudConflictDecision({ decision, mergePayload = null, mergeStrategy = '', reason = '', storageKey = '', timestamp = '' }, localRecord = null, remoteRecord = null, previousMetadata = {}) {
  const localUpdatedAt = recordUpdatedAt(localRecord)
  const remoteUpdatedAt = recordUpdatedAt(remoteRecord)
  const conflictIdSeed = [
    storageKey,
    getChecksum(localRecord),
    getChecksum(remoteRecord),
    previousMetadata.lastRemoteRevision || '',
    decision,
  ].join('|')

  return {
    conflict: decision === 'manualConflict',
    conflictId: `sync-conflict-${calculateChecksum(conflictIdSeed).replace('fnv1a-', '')}`,
    conflictReason: summarizeReason(reason),
    createdAt: timestamp,
    dataType: storageKey,
    decision,
    localDevice: String(localRecord?.deviceId || localRecord?.device_id || '').slice(0, 120),
    localUpdatedAt,
    localVersion: getVersion(localRecord),
    mergeEligibility: decision === 'safeMerge' ? 'safe' : decision === 'manualConflict' ? 'manual' : 'none',
    mergePayload,
    mergeStrategy,
    recommendedChoice: ['localWins', 'remoteWins', 'safeMerge', 'identical'].includes(decision) ? decision : '',
    remoteDevice: String(remoteRecord?.deviceId || remoteRecord?.device_id || '').slice(0, 120),
    remoteUpdatedAt,
    remoteVersion: getVersion(remoteRecord),
    resolvedAt: '',
    resolution: '',
    storageKey,
  }
}

export function toLegacySyncDecision(v3Decision = {}, localRecord = null, remoteRecord = null) {
  if (v3Decision.decision === 'identical') return { action: 'none', status: 'identical', v3Decision }
  if (v3Decision.decision === 'localWins') return { action: localRecord?.deleted ? 'upload_tombstone' : 'upload', status: 'local_changed', v3Decision }
  if (v3Decision.decision === 'remoteWins') return { action: remoteRecord?.deleted_at ? 'apply_remote_delete' : 'download', status: 'remote_changed', v3Decision }
  if (v3Decision.decision === 'safeMerge') {
    return {
      action: 'merge_upload',
      checksum: calculateChecksum(stableSerialize(v3Decision.mergePayload)),
      payload: v3Decision.mergePayload,
      status: 'conflict',
      strategy: v3Decision.mergeStrategy,
      v3Decision,
    }
  }

  return {
    action: 'conflict',
    localRecord,
    reason: v3Decision.conflictReason || 'Konflikten kräver manuell hantering.',
    remoteRecord,
    status: v3Decision.decision,
    v3Decision,
  }
}

export const cloudConflictResolverInternals = {
  clockSkewMs,
  hasUnsafeKey,
  itemUpdatedAt,
  mergeById,
  mergeNestedDayCollections,
  parseTime,
}

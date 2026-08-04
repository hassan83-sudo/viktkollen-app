import {
  canSafelyMergeSyncPayload,
  resolveCloudSyncConflict,
  toLegacySyncDecision,
} from './cloudConflictResolver.js'

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasUnsafeKey(value) {
  if (!isObject(value)) return false

  return Object.keys(value).some((key) => key === '__proto__' || key === 'constructor' || key === 'prototype')
}

function updatedTime(value) {
  const time = new Date(value?.updatedAt || value?.clientUpdatedAt || value?.createdAt || 0).getTime()

  return Number.isFinite(time) ? time : 0
}

function mergeById(local = [], remote = []) {
  const merged = canSafelyMergeSyncPayload('viktkollen.meals', local, remote)
  return merged.ok ? merged.payload : []
}

function mergeNestedDays(local = {}, remote = {}) {
  const days = {}
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])

  keys.forEach((day) => {
    days[day] = mergeById(local?.[day] || [], remote?.[day] || [])
  })

  return days
}

function mergeWeeks(local = {}, remote = {}) {
  const merged = canSafelyMergeSyncPayload('viktkollen.mealPlans', local, remote)
  return merged.ok ? merged.payload : { ...local, ...remote }
}

function looksLikeWeekPayload(localPayload, remotePayload) {
  return Boolean(localPayload?.weeks || remotePayload?.weeks)
}

function mergeLegacySimpleObject(localPayload, remotePayload) {
  if (!isObject(localPayload) || !isObject(remotePayload)) return null
  if (hasUnsafeKey(localPayload) || hasUnsafeKey(remotePayload)) return null

  const localTime = updatedTime(localPayload)
  const remoteTime = updatedTime(remotePayload)
  if (!localTime && !remoteTime) return null

  return remoteTime >= localTime ? remotePayload : localPayload
}

export function classifySyncChange({ localRecord, metadata = {}, remoteRecord } = {}) {
  if (localRecord?.deleted && !remoteRecord) return 'local_deleted'

  const decision = resolveCloudSyncConflict({
    localRecord,
    previousMetadata: metadata,
    remoteRecord,
    storageKey: localRecord?.storageKey || remoteRecord?.storageKey,
  })

  if (decision.decision === 'identical') return 'identical'
  if (decision.decision === 'localWins') return localRecord?.deleted ? 'local_deleted' : 'local_changed'
  if (decision.decision === 'remoteWins') return remoteRecord?.deleted_at ? 'remote_deleted' : 'remote_changed'
  if (decision.decision === 'safeMerge' || decision.decision === 'manualConflict') return 'conflict'

  return 'unchanged'
}

export function safeMergeSyncPayload(localPayload, remotePayload, storageKey = 'viktkollen.meals') {
  const resolvedStorageKey = storageKey === 'viktkollen.meals' && looksLikeWeekPayload(localPayload, remotePayload)
    ? 'viktkollen.mealPlans'
    : storageKey
  const legacySimpleObject = resolvedStorageKey === 'viktkollen.meals'
    ? mergeLegacySimpleObject(localPayload, remotePayload)
    : null
  if (legacySimpleObject) return { conflict: false, payload: legacySimpleObject, strategy: 'latestTimestamp' }

  const merged = canSafelyMergeSyncPayload(resolvedStorageKey, localPayload, remotePayload)

  return merged.ok
    ? { conflict: false, payload: merged.payload, strategy: merged.strategy }
    : { conflict: true, reason: merged.reason }
}

export function resolveSyncConflict({ localRecord, metadata = {}, remoteRecord } = {}) {
  const decision = resolveCloudSyncConflict({
    localRecord,
    previousMetadata: metadata,
    remoteRecord,
    storageKey: localRecord?.storageKey || remoteRecord?.storageKey,
  })

  return toLegacySyncDecision(decision, localRecord, remoteRecord)
}

export function applyConflictChoice(conflict, choice) {
  if (!conflict || conflict.action !== 'conflict') return { ok: false, reason: 'Ingen konflikt att lösa.' }
  if (choice === 'local') return { ok: true, action: 'upload', record: conflict.localRecord }
  if (choice === 'remote') return { ok: true, action: 'download', record: conflict.remoteRecord }
  if (choice === 'merge' && conflict.v3Decision?.mergePayload) {
    return { ok: true, action: 'merge_upload', record: { ...conflict.localRecord, payload: conflict.v3Decision.mergePayload } }
  }

  return { ok: false, reason: 'Välj lokal, molnversion eller säker merge.' }
}

export const syncConflictResolverInternals = {
  hasUnsafeKey,
  mergeById,
  mergeNestedDays,
  mergeWeeks,
  updatedTime,
}

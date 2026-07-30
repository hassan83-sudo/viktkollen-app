import { calculateChecksum, stableSerialize } from './syncMetadata.js'

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
  const merged = new Map()
  ;[...local, ...remote].filter(isObject).filter((item) => !hasUnsafeKey(item)).forEach((item) => {
    const id = String(item.id || '')
    if (!id) return
    const existing = merged.get(id)
    merged.set(id, !existing || updatedTime(item) >= updatedTime(existing) ? item : existing)
  })

  return [...merged.values()]
}

function canMergeArray(value) {
  return Array.isArray(value) && value.every((item) => isObject(item) && item.id)
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
  const weeks = {}
  const keys = new Set([...Object.keys(local?.weeks || {}), ...Object.keys(remote?.weeks || {})])

  keys.forEach((weekStart) => {
    const localWeek = local.weeks?.[weekStart] || {}
    const remoteWeek = remote.weeks?.[weekStart] || {}
    weeks[weekStart] = {
      ...localWeek,
      ...remoteWeek,
      days: mergeNestedDays(localWeek.days || {}, remoteWeek.days || {}),
      items: mergeById(localWeek.items || [], remoteWeek.items || []),
      weekStart,
    }
  })

  return { ...local, ...remote, weeks }
}

export function classifySyncChange({ localRecord, metadata = {}, remoteRecord } = {}) {
  const localChecksum = localRecord?.checksum || ''
  const remoteChecksum = remoteRecord?.checksum || ''
  const previousChecksum = metadata?.checksum || ''

  if (localRecord?.deleted && remoteRecord?.deleted_at) return 'identical'
  if (localChecksum && remoteChecksum && localChecksum === remoteChecksum) return 'identical'

  const localChanged = localChecksum && localChecksum !== previousChecksum && !(localRecord?.deleted && !previousChecksum)
  const remoteChanged = remoteChecksum && remoteChecksum !== previousChecksum

  if (localRecord?.deleted && !remoteChanged) return 'local_deleted'
  if (remoteRecord?.deleted_at && !localChanged) return 'remote_deleted'
  if (localChanged && !remoteChanged) return 'local_changed'
  if (!localChanged && remoteChanged) return 'remote_changed'
  if (localChanged && remoteChanged) return 'conflict'

  return 'unchanged'
}

export function safeMergeSyncPayload(localPayload, remotePayload) {
  if (hasUnsafeKey(localPayload) || hasUnsafeKey(remotePayload)) {
    return { conflict: true, reason: 'Payload innehåller osäkra objektfält.' }
  }

  if (canMergeArray(localPayload) && canMergeArray(remotePayload)) {
    return { conflict: false, payload: mergeById(localPayload, remotePayload), strategy: 'merge_by_id' }
  }

  if (isObject(localPayload) && isObject(remotePayload) && (isObject(localPayload.weeks) || isObject(remotePayload.weeks))) {
    return { conflict: false, payload: mergeWeeks(localPayload, remotePayload), strategy: 'merge_weeks' }
  }

  if (isObject(localPayload) && isObject(remotePayload)) {
    const localTime = updatedTime(localPayload)
    const remoteTime = updatedTime(remotePayload)

    if (localTime || remoteTime) {
      return {
        conflict: false,
        payload: localTime >= remoteTime ? localPayload : remotePayload,
        strategy: 'last_write_wins',
      }
    }
  }

  return { conflict: true, reason: 'Automatisk merge är inte säker för denna datatyp.' }
}

export function resolveSyncConflict({ localRecord, metadata = {}, remoteRecord } = {}) {
  const status = classifySyncChange({ localRecord, metadata, remoteRecord })

  if (status === 'identical' || status === 'unchanged') {
    return { action: 'none', status }
  }
  if (status === 'local_changed') return { action: 'upload', status }
  if (status === 'remote_changed') return { action: 'download', status }
  if (status === 'local_deleted') return { action: 'upload_tombstone', status }
  if (status === 'remote_deleted') return { action: 'apply_remote_delete', status }

  const merged = safeMergeSyncPayload(localRecord?.payload, remoteRecord?.payload)
  if (!merged.conflict) {
    return {
      action: 'merge_upload',
      checksum: calculateChecksum(stableSerialize(merged.payload)),
      payload: merged.payload,
      status,
      strategy: merged.strategy,
    }
  }

  return {
    action: 'conflict',
    localRecord,
    reason: merged.reason,
    remoteRecord,
    status,
  }
}

export function applyConflictChoice(conflict, choice) {
  if (!conflict || conflict.action !== 'conflict') return { ok: false, reason: 'Ingen konflikt att lösa.' }
  if (choice === 'local') return { ok: true, action: 'upload', record: conflict.localRecord }
  if (choice === 'remote') return { ok: true, action: 'download', record: conflict.remoteRecord }

  return { ok: false, reason: 'Välj lokal eller molnversion.' }
}

export const syncConflictResolverInternals = {
  hasUnsafeKey,
  mergeById,
  mergeNestedDays,
  mergeWeeks,
  updatedTime,
}

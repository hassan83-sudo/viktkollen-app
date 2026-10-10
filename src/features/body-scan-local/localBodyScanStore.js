// Sparar ENDAST godkända, enhetslösa analysvärden per användare.
// Aldrig bilder, bildrutor, masker, landmärken eller data-URL:er.

import { readStorage, removeStorage, writeStorage } from '../../services/appStorageService.js'
import { getActiveUserDataScope, userDataScopeVersion } from '../../services/userDataRepository.js'
import { contourMetricKeys, landmarkMetricKeys } from './localBodyMetrics.js'
import { maxSavedLocalScans } from './localBodyScanConfig.js'

export const localBodyScanStorageSuffix = 'localBodyScan.v1'

export function getLocalBodyScanStorageKey(scope = getActiveUserDataScope()) {
  const storageId = scope?.storageId || ''
  if (!storageId) return ''
  return `viktkollen.userData.v${userDataScopeVersion}.${storageId}.${localBodyScanStorageSuffix}`
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null
}

// Vitlista: allt som inte är ett känt tal kastas bort, så att bilddata
// aldrig kan smyga in i lagringen även om en anropare gör fel.
export function sanitizeLocalScanRecord(record) {
  if (!record || typeof record !== 'object' || !record.views || typeof record.views !== 'object') return null
  const createdAt = typeof record.createdAt === 'string' && !Number.isNaN(Date.parse(record.createdAt)) ? record.createdAt : ''
  if (!createdAt) return null

  const views = {}
  for (const viewId of ['front', 'side', 'back']) {
    const view = record.views[viewId]
    if (!view || typeof view !== 'object') continue
    const metrics = {}
    for (const key of [...landmarkMetricKeys[viewId], ...contourMetricKeys[viewId]]) {
      metrics[key] = finiteOrNull(view.metrics?.[key])
    }
    views[viewId] = {
      conditions: {
        bodyFraction: finiteOrNull(view.conditions?.bodyFraction),
        luminance: finiteOrNull(view.conditions?.luminance),
        roll: finiteOrNull(view.conditions?.roll),
      },
      metrics,
    }
  }
  if (!Object.keys(views).length) return null

  return {
    createdAt,
    id: typeof record.id === 'string' ? record.id.slice(0, 40) : `local-${Date.parse(createdAt).toString(36)}`,
    modelVersion: typeof record.modelVersion === 'string' ? record.modelVersion.slice(0, 80) : '',
    views,
  }
}

function normalizeList(value) {
  const list = Array.isArray(value?.scans) ? value.scans : []
  return list
    .map(sanitizeLocalScanRecord)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, maxSavedLocalScans)
}

export function loadLocalScanRecords(scope = getActiveUserDataScope()) {
  const key = getLocalBodyScanStorageKey(scope)
  if (!key) return []
  return normalizeList(readStorage(key, null))
}

export function getLatestLocalScanRecord(scope = getActiveUserDataScope()) {
  return loadLocalScanRecords(scope)[0] || null
}

export function saveLocalScanRecord(record, scope = getActiveUserDataScope()) {
  const key = getLocalBodyScanStorageKey(scope)
  const clean = sanitizeLocalScanRecord(record)
  if (!key || !clean) return { ok: false, records: loadLocalScanRecords(scope) }
  const records = normalizeList({ scans: [clean, ...loadLocalScanRecords(scope)] })
  return { ok: writeStorage(key, { scans: records, version: 1 }), records }
}

export function deleteLocalScanRecord(id, scope = getActiveUserDataScope()) {
  const key = getLocalBodyScanStorageKey(scope)
  if (!key) return []
  const records = loadLocalScanRecords(scope).filter((record) => record.id !== id)
  writeStorage(key, { scans: records, version: 1 })
  return records
}

export function clearLocalScanRecords(scope = getActiveUserDataScope()) {
  const key = getLocalBodyScanStorageKey(scope)
  return key ? removeStorage(key) : false
}

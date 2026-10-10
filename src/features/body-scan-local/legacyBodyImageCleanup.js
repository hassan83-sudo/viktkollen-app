// Rensning av gamla, automatiskt sparade kroppsbilder (BODY-SCAN-LOCAL-2).
//
// Det gamla serverflödet sparar data-URL-förhandsvisningar av kroppsbilderna
// i kroppsscanningens lokala historik. Den här modulen tar bort ENDAST
// bildsträngar (data:image/…, blob:…) ur just de nycklarna. Allt annat –
// analysvärden, datum, filnamn, vikt, framstegsbilder – lämnas orört.
//
// Körs bara efter uttryckligt godkännande i det lokala flödet. Idempotent:
// en andra körning ändrar ingenting. Varje nyckel skrivs atomiskt
// (localStorage.setItem), så en avbruten körning kan köras om.

import { userDataScopeVersion } from '../../services/userDataRepository.js'

// Kroppsscanningens historiknycklar (gamla och nuvarande format).
export const legacyBodyAnalysisKeys = Object.freeze([
  'viktkollen.bodyAnalysis.history.v1',
  'viktkollen.bodyAnalysis.history',
  'viktkollen.bodyAnalysis.latest',
])

// Synkens återställningssnapshots sparar råa kopior av historiknycklarna.
const globalSyncSnapshotKey = 'viktkollen.syncRestoreSnapshots'
const scopedSyncSnapshotSuffix = 'syncRestoreSnapshots'
export const legacyCleanupMarkerSuffix = 'legacyBodyImageCleanup.v1'
export const legacyCleanupVersion = 1

const imageStringPattern = /^\s*(data:image\/|blob:)/i
const maxDepth = 8

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return null
}

export function isImageString(value) {
  return typeof value === 'string' && imageStringPattern.test(value)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Tar bort bildsträngar rekursivt. Returnerar samma referens om inget ändrats.
function stripImages(value, counter, depth = 0) {
  if (depth > maxDepth) return value
  if (Array.isArray(value)) {
    let changed = false
    const next = []
    for (const item of value) {
      if (isImageString(item)) {
        counter.removed += 1
        changed = true
        continue
      }
      const stripped = stripImages(item, counter, depth + 1)
      if (stripped !== item) changed = true
      next.push(stripped)
    }
    return changed ? next : value
  }
  if (!isObject(value)) return value
  let changed = false
  const next = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isImageString(entry)) {
      counter.removed += 1
      changed = true
      continue
    }
    const stripped = stripImages(entry, counter, depth + 1)
    if (stripped !== entry) changed = true
    next[key] = stripped
  }
  return changed ? next : value
}

function belongsToOtherUser(record, userId) {
  const owner = isObject(record) && typeof record.userId === 'string' ? record.userId.trim() : ''
  return Boolean(owner) && owner !== String(userId || '')
}

function stripRecord(record, userId, counter) {
  if (belongsToOtherUser(record, userId)) {
    counter.skippedOtherUsers += 1
    return record
  }
  return stripImages(record, counter)
}

// Hanterar alla historikformat: lista, { analyses: [] } eller en enskild post.
export function stripBodyHistoryValue(value, userId, counter = { removed: 0, skippedOtherUsers: 0 }) {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((record) => {
      const stripped = stripRecord(record, userId, counter)
      if (stripped !== record) changed = true
      return stripped
    })
    return { counter, value: changed ? next : value }
  }
  if (isObject(value) && Array.isArray(value.analyses)) {
    const inner = stripBodyHistoryValue(value.analyses, userId, counter)
    return { counter, value: inner.value === value.analyses ? value : { ...value, analyses: inner.value } }
  }
  if (isObject(value)) return { counter, value: stripRecord(value, userId, counter) }
  return { counter, value }
}

function parseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false, value: null }
  }
}

function processRawHistory(raw, userId, counter) {
  if (typeof raw !== 'string') return { changed: false, raw }
  const parsed = parseJson(raw)
  if (!parsed.ok) {
    counter.unreadable += 1
    return { changed: false, raw }
  }
  const before = counter.removed
  const { value } = stripBodyHistoryValue(parsed.value, userId, counter)
  return counter.removed > before ? { changed: true, raw: JSON.stringify(value) } : { changed: false, raw }
}

function processRawSnapshots(raw, userId, counter) {
  if (typeof raw !== 'string') return { changed: false, raw }
  const parsed = parseJson(raw)
  if (!parsed.ok || !Array.isArray(parsed.value)) {
    if (!parsed.ok) counter.unreadable += 1
    return { changed: false, raw }
  }
  let changed = false
  const snapshots = parsed.value.map((snapshot) => {
    if (!isObject(snapshot) || !isObject(snapshot.entries)) return snapshot
    let entriesChanged = false
    const entries = { ...snapshot.entries }
    for (const key of legacyBodyAnalysisKeys) {
      const result = processRawHistory(entries[key], userId, counter)
      if (result.changed) {
        entries[key] = result.raw
        entriesChanged = true
      }
    }
    if (!entriesChanged) return snapshot
    changed = true
    return { ...snapshot, entries }
  })
  return changed ? { changed: true, raw: JSON.stringify(snapshots) } : { changed: false, raw }
}

export function getScopedKey(scope, suffix) {
  const storageId = scope?.storageId || ''
  return storageId ? `viktkollen.userData.v${userDataScopeVersion}.${storageId}.${suffix}` : ''
}

export function getLegacyCleanupMarkerKey(scope) {
  return getScopedKey(scope, legacyCleanupMarkerSuffix)
}

// Exakt vilka nycklar rensningen får röra för den här användaren.
export function getLegacyCleanupTargets(scope) {
  return [
    ...legacyBodyAnalysisKeys.map((key) => ({ key, kind: 'history' })),
    { key: globalSyncSnapshotKey, kind: 'snapshots' },
    ...(getScopedKey(scope, scopedSyncSnapshotSuffix)
      ? [{ key: getScopedKey(scope, scopedSyncSnapshotSuffix), kind: 'snapshots' }]
      : []),
  ]
}

function newCounter() {
  return { removed: 0, skippedOtherUsers: 0, unreadable: 0 }
}

function processTarget(storage, target, userId, counter) {
  const raw = storage.getItem(target.key)
  if (raw === null) return { changed: false, raw }
  return target.kind === 'snapshots'
    ? processRawSnapshots(raw, userId, counter)
    : processRawHistory(raw, userId, counter)
}

/**
 * Räknar gamla bildförhandsvisningar utan att ändra något och utan att
 * returnera själva bilddatan.
 */
export function inspectLegacyBodyImages({ scope, storage } = {}) {
  const resolved = getStorage(storage)
  const counter = newCounter()
  const keysWithImages = []
  if (!resolved) return { imageCount: 0, keysWithImages, skippedOtherUsers: 0 }
  for (const target of getLegacyCleanupTargets(scope)) {
    const before = counter.removed
    processTarget(resolved, target, scope?.userId || '', counter)
    if (counter.removed > before) keysWithImages.push(target.key)
  }
  return { imageCount: counter.removed, keysWithImages, skippedOtherUsers: counter.skippedOtherUsers }
}

export function readLegacyCleanupMarker({ scope, storage } = {}) {
  const resolved = getStorage(storage)
  const key = getLegacyCleanupMarkerKey(scope)
  if (!resolved || !key) return null
  const parsed = parseJson(resolved.getItem(key) || 'null')
  return parsed.ok && isObject(parsed.value) ? parsed.value : null
}

function writeMarker(storage, key, marker) {
  try {
    storage.setItem(key, JSON.stringify(marker))
  } catch {
    // Markören är bara information; rensningen är idempotent ändå.
  }
}

/**
 * Tar bort gamla bildförhandsvisningar ur kroppsscanningens historik.
 * Kräver approved === true (uttryckligt godkännande i UI:t).
 */
export function runLegacyBodyImageCleanup({ approved, now = new Date(), scope, storage } = {}) {
  if (approved !== true) {
    return { error: 'not-approved', ok: false, removed: 0 }
  }
  const resolved = getStorage(storage)
  const markerKey = getLegacyCleanupMarkerKey(scope)
  if (!resolved || !markerKey) {
    return { error: 'no-scope', ok: false, removed: 0 }
  }

  const userId = scope?.userId || ''
  const counter = newCounter()
  const completedKeys = []
  const failedKeys = []
  const startedAt = now.toISOString()
  writeMarker(resolved, markerKey, { completedKeys, startedAt, status: 'running', version: legacyCleanupVersion })

  for (const target of getLegacyCleanupTargets(scope)) {
    const result = processTarget(resolved, target, userId, counter)
    if (result.changed) {
      try {
        resolved.setItem(target.key, result.raw)
        // Kontrollera att inga bilder finns kvar i nyckeln efter skrivning.
        const check = processTarget(resolved, target, userId, newCounter())
        if (check.changed) throw new Error('verify-failed')
      } catch {
        failedKeys.push(target.key)
        continue
      }
    }
    completedKeys.push(target.key)
    writeMarker(resolved, markerKey, { completedKeys, startedAt, status: 'running', version: legacyCleanupVersion })
  }

  const ok = failedKeys.length === 0
  writeMarker(resolved, markerKey, {
    completedAt: ok ? now.toISOString() : '',
    completedKeys,
    failedKeys,
    removed: counter.removed,
    skippedOtherUsers: counter.skippedOtherUsers,
    startedAt,
    status: ok ? 'done' : 'partial',
    version: legacyCleanupVersion,
  })

  if (counter.removed > 0 && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('viktkollen:body-analysis-history-changed'))
  }

  return {
    failedKeys,
    ok,
    removed: counter.removed,
    skippedOtherUsers: counter.skippedOtherUsers,
    unreadable: counter.unreadable,
  }
}

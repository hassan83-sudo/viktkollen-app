import { getBodyAnalysisStorage } from './bodyAnalysisStorage.js'
import {
  bodyAnalysisSchemaVersion,
  normalizeBodyAnalysisResultModel,
} from './bodyAnalysisEstimates.js'

const HISTORY_VERSION = 1
const ANALYSIS_SCHEMA_VERSION = bodyAnalysisSchemaVersion
const MAX_ANALYSES = 10
const HISTORY_CHANGED_EVENT = 'viktkollen:body-analysis-history-changed'

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sortNewestFirst(analyses) {
  return [...analyses].sort(
    (firstAnalysis, secondAnalysis) =>
      new Date(secondAnalysis.createdAt).getTime() -
      new Date(firstAnalysis.createdAt).getTime(),
  )
}

function readStoredHistory() {
  try {
    const storedPayload = getBodyAnalysisStorage().read()
    const analyses = Array.isArray(storedPayload?.analyses)
      ? storedPayload.analyses
      : []

    return sortNewestFirst(
      analyses.map(normalizeAnalysis).filter(Boolean),
    ).slice(0, MAX_ANALYSES)
  } catch {
    return []
  }
}

function writeStoredHistory(analyses) {
  try {
    getBodyAnalysisStorage().write({
      analyses: sortNewestFirst(analyses).slice(0, MAX_ANALYSES),
      version: HISTORY_VERSION,
    })
  } catch {
    // Keep the app usable if localStorage is unavailable or full.
  }
}

function notifyHistoryChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HISTORY_CHANGED_EVENT))
  }
}

/**
 * Normalizes a body analysis object before it is stored or imported.
 *
 * @param {unknown} analysis
 * @returns {object | null}
 */
export function normalizeAnalysis(analysis) {
  if (!isObject(analysis) || typeof analysis.createdAt !== 'string') {
    return null
  }

  const createdAt = new Date(analysis.createdAt)

  if (Number.isNaN(createdAt.getTime()) || !isObject(analysis.result)) {
    return null
  }

  const updatedAt = new Date(analysis.updatedAt || analysis.createdAt)

  const normalizedResult = {
    ...analysis.result,
    ...normalizeBodyAnalysisResultModel(analysis.result, {
      generatedAt: analysis.result.generatedAt || createdAt.toISOString(),
      scanInput: analysis.result.scanInput || analysis.scanInput,
    }),
  }

  return {
    ...analysis,
    analysisNumber: Number.isFinite(Number(analysis.analysisNumber))
      ? Number(analysis.analysisNumber)
      : 1,
    createdAt: createdAt.toISOString(),
    result: normalizedResult,
    scanInput: normalizedResult.scanInput,
    schemaVersion: Number.isFinite(Number(analysis.schemaVersion))
      ? Math.max(Number(analysis.schemaVersion), ANALYSIS_SCHEMA_VERSION)
      : ANALYSIS_SCHEMA_VERSION,
    status: typeof analysis.status === 'string' ? analysis.status : 'Analys klar',
    syncStatus:
      typeof analysis.syncStatus === 'string' ? analysis.syncStatus : 'local',
    updatedAt: Number.isNaN(updatedAt.getTime())
      ? createdAt.toISOString()
      : updatedAt.toISOString(),
    userId: analysis.userId ?? null,
  }
}

/**
 * Merges two body analysis histories, newest first, with duplicates removed.
 *
 * @param {object[]} currentHistory
 * @param {object[]} incomingHistory
 * @returns {object[]}
 */
export function mergeHistories(currentHistory, incomingHistory) {
  const analysesByCreatedAt = new Map()

  ;[...currentHistory, ...incomingHistory].forEach((analysis) => {
    const normalizedAnalysis = normalizeAnalysis(analysis)

    if (normalizedAnalysis) {
      analysesByCreatedAt.set(normalizedAnalysis.createdAt, normalizedAnalysis)
    }
  })

  return sortNewestFirst([...analysesByCreatedAt.values()])
    .slice(0, MAX_ANALYSES)
    .map((analysis, index, history) => ({
      ...analysis,
      analysisNumber: history.length - index,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      syncStatus: 'local',
      updatedAt: analysis.updatedAt || new Date().toISOString(),
      userId: analysis.userId ?? null,
    }))
}

function getImportSummary(currentHistory, incomingHistory) {
  const existingIds = new Set(currentHistory.map((analysis) => analysis.createdAt))
  const normalizedIncoming = incomingHistory.map(normalizeAnalysis)
  const validIncoming = normalizedIncoming.filter(Boolean)

  return {
    duplicates: validIncoming.filter((analysis) => existingIds.has(analysis.createdAt))
      .length,
    imported: validIncoming.filter((analysis) => !existingIds.has(analysis.createdAt))
      .length,
    invalid: normalizedIncoming.length - validIncoming.length,
  }
}

function sanitizePhotoForExport(photo) {
  if (!isObject(photo)) return null

  return {
    name: typeof photo.name === 'string' ? photo.name : '',
  }
}

export function sanitizeAnalysisForExport(analysis) {
  const normalizedAnalysis = normalizeAnalysis(analysis)

  if (!normalizedAnalysis) return null

  return {
    ...normalizedAnalysis,
    backPhoto: sanitizePhotoForExport(normalizedAnalysis.backPhoto),
    frontPhoto: sanitizePhotoForExport(normalizedAnalysis.frontPhoto),
    sidePhoto: sanitizePhotoForExport(normalizedAnalysis.sidePhoto),
  }
}

export function sanitizeBodyAnalysisStorageValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeAnalysisForExport).filter(Boolean)
  }

  if (isObject(value) && Array.isArray(value.analyses)) {
    return {
      ...value,
      analyses: value.analyses.map(sanitizeAnalysisForExport).filter(Boolean),
    }
  }

  const sanitizedAnalysis = sanitizeAnalysisForExport(value)
  return sanitizedAnalysis || value
}

export const bodyAnalysisCloudStorageKeys = Object.freeze([
  'viktkollen.bodyAnalysis.history.v1',
  'viktkollen.bodyAnalysis.history',
  'viktkollen.bodyAnalysis.latest',
])

export function isBodyAnalysisCloudStorageKey(storageKey) {
  return bodyAnalysisCloudStorageKeys.includes(storageKey)
}

export function sanitizeValueForCloudTransfer(storageKey, value) {
  if (value == null || !isBodyAnalysisCloudStorageKey(storageKey)) return value
  return sanitizeBodyAnalysisStorageValue(value)
}

function listAnalysesFromStorageValue(value) {
  if (Array.isArray(value)) return value
  if (isObject(value) && Array.isArray(value.analyses)) return value.analyses
  if (isObject(value) && typeof value.createdAt === 'string') return [value]
  return []
}

function localPhotoPreviewIndex(localValue) {
  const index = new Map()

  listAnalysesFromStorageValue(localValue).forEach((analysis) => {
    if (typeof analysis?.createdAt !== 'string') return
    index.set(analysis.createdAt, {
      backPhoto: analysis.backPhoto,
      frontPhoto: analysis.frontPhoto,
      sidePhoto: analysis.sidePhoto,
    })
  })

  return index
}

function withLocalPreview(photo, localPhoto) {
  if (!isObject(photo)) return photo
  const preview = localPhoto?.preview
  if (typeof preview !== 'string' || !preview) return photo
  return { ...photo, preview }
}

function attachLocalPreviewsToAnalysis(analysis, localPhotos) {
  if (!isObject(analysis) || typeof analysis.createdAt !== 'string') return analysis
  const local = localPhotos.get(analysis.createdAt)
  if (!local) return analysis

  return {
    ...analysis,
    backPhoto: withLocalPreview(analysis.backPhoto, local.backPhoto),
    frontPhoto: withLocalPreview(analysis.frontPhoto, local.frontPhoto),
    sidePhoto: withLocalPreview(analysis.sidePhoto, local.sidePhoto),
  }
}

export function restoreLocalBodyAnalysisPreviews(cloudValue, localValue) {
  const localPhotos = localPhotoPreviewIndex(localValue)

  if (Array.isArray(cloudValue)) {
    return cloudValue.map((analysis) => attachLocalPreviewsToAnalysis(analysis, localPhotos))
  }

  if (isObject(cloudValue) && Array.isArray(cloudValue.analyses)) {
    return {
      ...cloudValue,
      analyses: cloudValue.analyses.map((analysis) => attachLocalPreviewsToAnalysis(analysis, localPhotos)),
    }
  }

  return attachLocalPreviewsToAnalysis(cloudValue, localPhotos)
}

export function mergeBodyAnalysisCloudValueForLocalWrite(storageKey, incomingValue, existingLocalValue) {
  const sanitized = sanitizeValueForCloudTransfer(storageKey, incomingValue)
  if (!isBodyAnalysisCloudStorageKey(storageKey)) return sanitized
  return restoreLocalBodyAnalysisPreviews(sanitized, existingLocalValue)
}

/**
 * Adds a body analysis to local history with newest item first.
 *
 * @param {object} analysis
 * @returns {object[]}
 */
export function addAnalysis(analysis) {
  const nextHistory = mergeHistories(readStoredHistory(), [analysis])

  writeStoredHistory(nextHistory)
  notifyHistoryChanged()

  return nextHistory
}

/**
 * Gets stored body analysis history.
 *
 * @returns {object[]}
 */
export function getAnalysisHistory() {
  return readStoredHistory()
}

/**
 * Gets the latest stored body analysis.
 *
 * @returns {object | null}
 */
export function getLatestAnalysis() {
  return readStoredHistory()[0] ?? null
}

/**
 * Removes one stored body analysis by creation timestamp.
 *
 * @param {string} createdAt
 * @returns {object[]}
 */
export function deleteAnalysis(createdAt) {
  const nextHistory = readStoredHistory().filter(
    (analysis) => analysis.createdAt !== createdAt,
  )

  writeStoredHistory(nextHistory)
  notifyHistoryChanged()

  return nextHistory
}

/**
 * Creates statistics for stored body analysis history.
 *
 * @param {object[]} history
 * @returns {{ai: number, averageIntervalDays: number | null, daysSinceLatest: number | null, latestDate: string | null, mock: number, total: number}}
 */
export function getHistoryStats(history = readStoredHistory()) {
  const sortedHistory = sortNewestFirst(history)
  const latestDate = sortedHistory[0]?.createdAt ?? null
  const intervals = sortedHistory
    .slice(0, -1)
    .map((analysis, index) => {
      const currentTime = new Date(analysis.createdAt).getTime()
      const previousTime = new Date(sortedHistory[index + 1].createdAt).getTime()

      return Math.abs(currentTime - previousTime) / (24 * 60 * 60 * 1000)
    })
    .filter((interval) => Number.isFinite(interval))

  return {
    ai: sortedHistory.filter((analysis) => analysis.result?.source === 'ai').length,
    averageIntervalDays:
      intervals.length > 0
        ? Math.round(
            intervals.reduce((sum, interval) => sum + interval, 0) /
              intervals.length,
          )
        : null,
    daysSinceLatest: latestDate
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(latestDate).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : null,
    latestDate,
    mock: sortedHistory.filter((analysis) => analysis.result?.source === 'mock')
      .length,
    total: sortedHistory.length,
  }
}

/**
 * Creates a JSON-safe export payload for stored body analysis history.
 *
 * @returns {{analyses: object[], exportedAt: string, version: number}}
 */
export function exportHistory() {
  return {
    analyses: readStoredHistory().map(sanitizeAnalysisForExport).filter(Boolean),
    app: 'Viktkollen',
    exportedAt: new Date().toISOString(),
    feature: 'AI Body Analysis',
    version: HISTORY_VERSION,
  }
}

/**
 * Imports an exported body analysis history payload.
 *
 * @param {unknown} payload
 * @returns {object[]}
 */
export function importHistory(payload) {
  const incomingHistory = Array.isArray(payload?.analyses)
    ? payload.analyses
    : []
  const currentHistory = readStoredHistory()
  const summary = getImportSummary(currentHistory, incomingHistory)
  const nextHistory = mergeHistories(currentHistory, incomingHistory)

  writeStoredHistory(nextHistory)
  notifyHistoryChanged()

  return {
    history: nextHistory,
    summary,
  }
}

/**
 * Clears stored body analysis history.
 *
 * @returns {object[]}
 */
export function clearAnalysisHistory() {
  writeStoredHistory([])
  notifyHistoryChanged()

  return []
}

export { HISTORY_CHANGED_EVENT as bodyAnalysisHistoryChangedEvent }

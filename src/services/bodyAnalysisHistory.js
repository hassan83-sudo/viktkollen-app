import { getBodyAnalysisStorage } from './bodyAnalysisStorage'

const HISTORY_VERSION = 1
const ANALYSIS_SCHEMA_VERSION = 1
const MAX_ANALYSES = 10

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

  return {
    ...analysis,
    analysisNumber: Number.isFinite(Number(analysis.analysisNumber))
      ? Number(analysis.analysisNumber)
      : 1,
    createdAt: createdAt.toISOString(),
    schemaVersion: Number.isFinite(Number(analysis.schemaVersion))
      ? Number(analysis.schemaVersion)
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

/**
 * Adds a body analysis to local history with newest item first.
 *
 * @param {object} analysis
 * @returns {object[]}
 */
export function addAnalysis(analysis) {
  const nextHistory = mergeHistories(readStoredHistory(), [analysis])

  writeStoredHistory(nextHistory)

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
    analyses: readStoredHistory(),
    exportedAt: new Date().toISOString(),
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
  const nextHistory = mergeHistories(readStoredHistory(), incomingHistory)

  writeStoredHistory(nextHistory)

  return nextHistory
}

/**
 * Clears stored body analysis history.
 *
 * @returns {object[]}
 */
export function clearAnalysisHistory() {
  writeStoredHistory([])

  return []
}

const HISTORY_VERSION = 1
const MAX_ANALYSES = 10
const STORAGE_KEY = 'viktkollen.bodyAnalysis.history.v1'

function isAnalysis(value) {
  return (
    value &&
    typeof value.createdAt === 'string' &&
    value.result &&
    typeof value.result === 'object'
  )
}

function readStoredHistory() {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY)

    if (!storedValue) {
      return []
    }

    const parsedValue = JSON.parse(storedValue)
    const analyses = Array.isArray(parsedValue?.analyses)
      ? parsedValue.analyses
      : []

    return analyses.filter(isAnalysis).slice(0, MAX_ANALYSES)
  } catch {
    return []
  }
}

function writeStoredHistory(analyses) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        analyses: analyses.slice(0, MAX_ANALYSES),
        version: HISTORY_VERSION,
      }),
    )
  } catch {
    // Keep the app usable if localStorage is unavailable or full.
  }
}

/**
 * Adds a body analysis to local history with newest item first.
 *
 * @param {object} analysis
 * @returns {object[]}
 */
export function addAnalysis(analysis) {
  const nextHistory = [analysis, ...readStoredHistory()].slice(0, MAX_ANALYSES)

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
 * Creates a JSON-safe export payload for stored body analysis history.
 *
 * @returns {{analyses: object[], exportedAt: string, version: number}}
 */
export function exportAnalysisHistory() {
  return {
    analyses: readStoredHistory(),
    exportedAt: new Date().toISOString(),
    version: HISTORY_VERSION,
  }
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

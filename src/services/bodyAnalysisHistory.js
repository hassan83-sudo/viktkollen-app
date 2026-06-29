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
 * Clears stored body analysis history.
 *
 * @returns {object[]}
 */
export function clearAnalysisHistory() {
  writeStoredHistory([])

  return []
}

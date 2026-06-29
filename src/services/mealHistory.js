const MEAL_HISTORY_KEY = 'viktkollen.mealAnalysisHistory'
const MAX_MEAL_ANALYSES = 20

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sortNewestFirst(entries) {
  return [...entries].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  )
}

/**
 * Normalizes a stored meal analysis entry.
 *
 * @param {unknown} entry
 * @returns {object | null}
 */
export function normalizeMealEntry(entry) {
  if (!isObject(entry) || !isObject(entry.analysis)) {
    return null
  }

  const createdAt = new Date(entry.createdAt || Date.now())

  if (Number.isNaN(createdAt.getTime())) {
    return null
  }

  return {
    ...entry,
    createdAt: createdAt.toISOString(),
    id: entry.id || createdAt.getTime(),
    image: typeof entry.image === 'string' ? entry.image : '',
    source: entry.source || entry.analysis.source || 'mock',
  }
}

/**
 * Gets locally stored meal analysis history.
 *
 * @returns {object[]}
 */
export function getMealHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEAL_HISTORY_KEY) || '[]')
    const entries = Array.isArray(parsed) ? parsed : parsed?.entries

    return sortNewestFirst(
      (Array.isArray(entries) ? entries : [])
        .map(normalizeMealEntry)
        .filter(Boolean),
    ).slice(0, MAX_MEAL_ANALYSES)
  } catch {
    return []
  }
}

/**
 * Stores a new meal analysis entry locally.
 *
 * @param {object} entry
 * @returns {object[]}
 */
export function addMealAnalysis(entry) {
  const normalizedEntry = normalizeMealEntry(entry)

  if (!normalizedEntry) {
    return getMealHistory()
  }

  const nextHistory = sortNewestFirst([
    normalizedEntry,
    ...getMealHistory().filter((item) => item.id !== normalizedEntry.id),
  ]).slice(0, MAX_MEAL_ANALYSES)

  localStorage.setItem(MEAL_HISTORY_KEY, JSON.stringify(nextHistory))

  return nextHistory
}

/**
 * Replaces local meal analysis history.
 *
 * @param {object[]} entries
 * @returns {object[]}
 */
export function setMealHistory(entries) {
  const nextHistory = sortNewestFirst(
    entries.map(normalizeMealEntry).filter(Boolean),
  ).slice(0, MAX_MEAL_ANALYSES)

  localStorage.setItem(MEAL_HISTORY_KEY, JSON.stringify(nextHistory))

  return nextHistory
}

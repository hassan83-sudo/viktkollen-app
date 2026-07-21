const MEAL_HISTORY_KEY = 'viktkollen.mealAnalysisHistory'
const MEAL_HISTORY_VERSION = 1
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

function includesAny(value, keywords) {
  const text = String(value || '').toLocaleLowerCase('sv-SE')

  return keywords.some((keyword) => text.includes(keyword))
}

function isWithinLastDays(date, days) {
  const time = new Date(date).getTime()

  if (Number.isNaN(time)) {
    return false
  }

  return time >= Date.now() - days * 24 * 60 * 60 * 1000
}

function getMostCommon(values, fallback) {
  const counts = new Map()

  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1)
  })

  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] || fallback
}

function normalizeStatus(value, allowed, fallback) {
  const text = String(value || '').trim().toLocaleLowerCase('sv-SE')
  const match = allowed.find((item) => item.toLocaleLowerCase('sv-SE') === text)

  return match || fallback
}

function getAnalysisMealType(analysis = {}, fallback = 'Lunch') {
  return normalizeStatus(
    analysis.mealType || analysis.type,
    ['Frukost', 'Lunch', 'Middag', 'Mellanmål'],
    fallback,
  )
}

function getAnalysisProteinStatus(analysis = {}) {
  return normalizeStatus(
    analysis.proteinStatus,
    ['Lågt', 'Medel', 'Högt'],
    includesAny(analysis.proteinStatus || analysis.likelyProtein, ['hög', 'kyckling', 'lax', 'fisk', 'keso', 'kvarg'])
      ? 'Högt'
      : includesAny(analysis.proteinStatus || analysis.likelyProtein, ['protein', 'ägg', 'bön', 'linser', 'tofu'])
        ? 'Medel'
        : 'Lågt',
  )
}

function getAnalysisVegetableStatus(analysis = {}) {
  return normalizeStatus(
    analysis.vegetableStatus,
    ['Lågt', 'Bra', 'Mycket bra'],
    includesAny(analysis.vegetableStatus || analysis.likelyVegetables, ['mycket'])
      ? 'Mycket bra'
      : includesAny(analysis.vegetableStatus || analysis.likelyVegetables, ['grön', 'sallad', 'frukt', 'tomat', 'gurka'])
        ? 'Bra'
        : 'Lågt',
  )
}

function getAnalysisPortionSize(analysis = {}) {
  return normalizeStatus(
    analysis.portionSize || analysis.portionEstimate,
    ['Liten', 'Lagom', 'Stor'],
    includesAny(analysis.portionSize || analysis.portionEstimate, ['liten'])
      ? 'Liten'
      : includesAny(analysis.portionSize || analysis.portionEstimate, ['stor'])
        ? 'Stor'
        : 'Lagom',
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

  const analysis = {
    ...entry.analysis,
    mealType: getAnalysisMealType(entry.analysis, entry.type || 'Lunch'),
    portionEstimate: getAnalysisPortionSize(entry.analysis),
    portionSize: getAnalysisPortionSize(entry.analysis),
    proteinStatus: getAnalysisProteinStatus(entry.analysis),
    vegetableStatus: getAnalysisVegetableStatus(entry.analysis),
  }
  const improvement =
    analysis.improvement ||
    analysis.improvementSuggestion ||
    'Lägg till en enkel proteinkälla eller mer grönsaker.'

  return {
    ...entry,
    analysis: {
      ...analysis,
      improvement,
      improvementSuggestion: improvement,
    },
    createdAt: createdAt.toISOString(),
    date: createdAt.toISOString(),
    id: entry.id || createdAt.getTime(),
    image: typeof entry.image === 'string' ? entry.image : '',
    improvement,
    mealType: analysis.mealType,
    portionSize: analysis.portionSize,
    proteinStatus: analysis.proteinStatus,
    source: entry.source || entry.analysis.source || 'mock',
    vegetableStatus: analysis.vegetableStatus,
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

/**
 * Clears local meal analysis history.
 *
 * @returns {object[]}
 */
export function clearMealHistory() {
  localStorage.setItem(MEAL_HISTORY_KEY, JSON.stringify([]))

  return []
}

/**
 * Exports meal history as a JSON-safe payload.
 *
 * @returns {{app: string, entries: object[], exportedAt: string, feature: string, version: number}}
 */
export function exportMealHistory() {
  return {
    app: 'Viktkollen',
    entries: getMealHistory(),
    exportedAt: new Date().toISOString(),
    feature: 'AI Matcoach',
    version: MEAL_HISTORY_VERSION,
  }
}

/**
 * Imports meal history from a JSON payload.
 *
 * @param {unknown} payload
 * @returns {{history: object[], summary: {duplicates: number, imported: number, invalid: number}}}
 */
export function importMealHistory(payload) {
  const incomingEntries = Array.isArray(payload?.entries)
    ? payload.entries
    : Array.isArray(payload)
      ? payload
      : []
  const currentHistory = getMealHistory()
  const currentIds = new Set(currentHistory.map((entry) => String(entry.id)))
  const normalizedIncoming = incomingEntries.map(normalizeMealEntry)
  const validIncoming = normalizedIncoming.filter(Boolean)
  const importedEntries = validIncoming.filter(
    (entry) => !currentIds.has(String(entry.id)),
  )
  const nextHistory = setMealHistory([...importedEntries, ...currentHistory])

  return {
    history: nextHistory,
    summary: {
      duplicates: validIncoming.length - importedEntries.length,
      imported: importedEntries.length,
      invalid: normalizedIncoming.length - validIncoming.length,
    },
  }
}

/**
 * Builds weekly meal analysis statistics.
 *
 * @param {object[]} history
 * @returns {{analysisCount: number, bestPattern: string, commonImprovement: string, commonMealType: string, proteinTrend: string, vegetableTrend: string}}
 */
export function getMealWeekSummary(history) {
  const weekEntries = history.filter((entry) => isWithinLastDays(entry.createdAt, 7))
  const proteinCount = weekEntries.filter((entry) =>
    ['Medel', 'Högt'].includes(entry.proteinStatus || entry.analysis?.proteinStatus),
  ).length
  const vegetableCount = weekEntries.filter((entry) =>
    ['Bra', 'Mycket bra'].includes(entry.vegetableStatus || entry.analysis?.vegetableStatus),
  ).length

  return {
    analysisCount: weekEntries.length,
    bestPattern:
      weekEntries.length >= 3
        ? 'Du bygger ett tydligt mönster genom att analysera flera måltider.'
        : 'Fler analyser gör mönstret tydligare.',
    commonImprovement: getMostCommon(
      weekEntries.map((entry) => entry.improvement || entry.analysis?.improvementSuggestion),
      'Lägg till en enkel proteinkälla eller mer grönsaker.',
    ),
    commonMealType: getMostCommon(
      weekEntries.map((entry) => entry.mealType || entry.analysis?.mealType),
      'Saknas ännu',
    ),
    proteinTrend:
      proteinCount >= Math.max(1, Math.ceil(weekEntries.length / 2))
        ? 'Protein syns ofta i veckans analyser.'
        : 'Protein kan bli ett bra fokus i fler måltider.',
    vegetableTrend:
      vegetableCount >= Math.max(1, Math.ceil(weekEntries.length / 2))
        ? 'Grönsaker/frukt syns i flera analyser.'
        : 'Grönsaker eller frukt kan läggas till oftare.',
  }
}

/**
 * Creates demo entries for a full meal day.
 *
 * @returns {object[]}
 */
export function createDemoMealDay() {
  const now = Date.now()
  const meals = [
    {
      image: '',
      summary: 'Frukost med yoghurt, bär och havre.',
      type: 'Frukost',
    },
    {
      image: '',
      summary: 'Lunch med kyckling, ris och sallad.',
      type: 'Lunch',
    },
    {
      image: '',
      summary: 'Middag med ägg, potatis och frysta grönsaker.',
      type: 'Middag',
    },
  ]

  return meals.map((meal, index) => ({
    analysis: {
      calories: 450 + index * 70,
      carbs: 45 + index * 8,
      cheapNextMealSuggestion:
        'Billigt nästa mål: ägg, potatis, bönor eller frysta grönsaker.',
      confidence: 'låg',
      explanation: 'Demoanalys för lokal testning av Matcoachens historik.',
      fat: 14 + index * 2,
      fiberCarbBalance:
        'Balansen ser rimlig ut. Mer fullkorn eller grönsaker kan stärka fibret.',
      foods: [meal.summary],
      improvement:
        index === 0
          ? 'Lägg till mer protein.'
          : 'Lägg till lite mer grönsaker.',
      improvementSuggestion:
        index === 0
          ? 'Lägg till mer protein.'
          : 'Lägg till lite mer grönsaker.',
      likelyCarbs: 'trolig kolhydratkälla',
      likelyProtein: 'trolig proteinkälla',
      likelyVegetables: 'troliga grönsaker eller frukt',
      mealType: meal.type,
      portionEstimate: 'Lagom',
      portionSize: 'Lagom',
      positiveFeedback: 'Bra enkel måltidsstruktur.',
      protein: 24 + index * 5,
      proteinStatus: index === 0 ? 'Medel' : 'Högt',
      source: 'mock',
      summary: meal.summary,
      vegetableStatus: index === 0 ? 'Bra' : 'Mycket bra',
    },
    createdAt: new Date(now - index * 3 * 60 * 60 * 1000).toISOString(),
    id: `demo-meal-${now}-${index}`,
    image: meal.image,
    mealType: meal.type,
    source: 'mock',
    type: meal.type,
  }))
}

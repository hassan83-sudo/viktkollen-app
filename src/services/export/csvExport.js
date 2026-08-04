const formulaPrefixPattern = /^[=+\-@\t\r]/

function safeText(value) {
  const text = String(value ?? '').replace(/\0/g, '').trim()
  return formulaPrefixPattern.test(text) ? `'${text}` : text
}

function formatNumber(value, decimalSeparator = ',') {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  const text = Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)))
  return decimalSeparator === ',' ? text.replace('.', ',') : text
}

function quoteCsv(value, delimiter) {
  const text = safeText(value)
  const escaped = text.replace(/"/g, '""')
  return /["\r\n]/.test(escaped) || escaped.includes(delimiter)
    ? `"${escaped}"`
    : escaped
}

function toCsv(headers, rows, options = {}) {
  const delimiter = options.delimiter || ';'
  const bom = options.bom === false ? '' : '\uFEFF'
  const lines = [
    headers.join(delimiter),
    ...rows.map((row) => headers.map((header) => quoteCsv(row[header], delimiter)).join(delimiter)),
  ]

  return `${bom}${lines.join('\n')}\n`
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mealRows(meals = [], options = {}) {
  return (Array.isArray(meals) ? meals : []).filter(isObject).map((meal) => ({
    calories: formatNumber(meal.calories, options.decimalSeparator),
    carbohydrates: formatNumber(meal.carbohydrates ?? meal.carbs, options.decimalSeparator),
    date: meal.date || '',
    fat: formatNumber(meal.fat, options.decimalSeparator),
    id: meal.id || '',
    mealType: meal.type || meal.mealType || '',
    name: meal.text || meal.name || meal.title || '',
    photoAnalysisConfidence: meal.photoAnalysis?.confidence?.level || meal.photoAnalysis?.confidence || '',
    photoAnalysisProvider: meal.photoAnalysis?.provider?.type || meal.photoAnalysis?.provider || '',
    photoAnalysisUserEdited: meal.photoAnalysis?.userEdited === true ? 'ja' : meal.photoAnalysis ? 'nej' : '',
    plannedActual: meal.planned === true || meal.status === 'planned' ? 'planned' : 'actual',
    protein: formatNumber(meal.protein, options.decimalSeparator),
    source: meal.source || '',
    time: meal.time || '',
  }))
}

function weightRows(weights = [], options = {}) {
  return (Array.isArray(weights) ? weights : []).filter(isObject).map((weight) => ({
    date: weight.date || '',
    id: weight.id || '',
    note: weight.note || '',
    unit: weight.unit || 'kg',
    weight: formatNumber(weight.value ?? weight.weight, options.decimalSeparator),
  }))
}

function checkInRows(checkIn = {}, options = {}) {
  const entries = Array.isArray(checkIn) ? checkIn : checkIn && Object.keys(checkIn).length ? [checkIn] : []
  return entries.filter(isObject).map((entry) => ({
    date: entry.date || '',
    energy: formatNumber(entry.energy, options.decimalSeparator),
    mood: entry.mood || '',
    steps: formatNumber(entry.steps, options.decimalSeparator),
    training: entry.workoutType || entry.trainingType || (entry.workout === true ? 'Träning markerad' : ''),
  }))
}

export function buildMealsCsv(meals = [], options = {}) {
  return toCsv([
    'id',
    'date',
    'time',
    'mealType',
    'name',
    'calories',
    'protein',
    'carbohydrates',
    'fat',
    'plannedActual',
    'source',
    'photoAnalysisConfidence',
    'photoAnalysisProvider',
    'photoAnalysisUserEdited',
  ], mealRows(meals, options), options)
}

export function buildWeightCsv(weights = [], options = {}) {
  return toCsv(['id', 'date', 'weight', 'unit', 'note'], weightRows(weights, options), options)
}

export function buildCheckInsCsv(checkIn = {}, options = {}) {
  return toCsv(['date', 'energy', 'mood', 'steps', 'training'], checkInRows(checkIn, options), options)
}

export const csvExportInternals = {
  checkInRows,
  formulaPrefixPattern,
  formatNumber,
  mealRows,
  quoteCsv,
  safeText,
  toCsv,
  weightRows,
}

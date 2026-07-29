import { analyzeMealText } from './mealAnalyzer.js'
import { evaluateMealNutritionConfidence } from './nutritionConfidence.js'

const macroFields = ['calories', 'protein', 'carbs', 'fat', 'fiber']
const coreMacroFields = ['calories', 'protein', 'carbs', 'fat']
const validMealTypes = new Set([
  '',
  'Automatiskt',
  'Frukost',
  'Mellanmål',
  'Lunch',
  'Middag',
  'Kvällsmål',
  'Nattmål',
  'Måltid',
  'Dryck',
  'Annat',
])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getLocalTimeString(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function parseCorrectionNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const text = String(value).trim().replace(',', '.')

  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    return null
  }

  const parsed = Number(text)

  return Number.isFinite(parsed) ? Math.min(parsed, 100000) : null
}

function normalizeOverride(override) {
  if (!isObject(override)) return {}

  return macroFields.reduce((result, field) => {
    const parsed = parseCorrectionNumber(override[field])

    if (parsed !== null) {
      result[field] = parsed
    }

    return result
  }, {})
}

export function normalizeNutritionOverride(override) {
  return normalizeOverride(override)
}

function getMealText(meal) {
  return [
    meal?.name,
    meal?.description,
    meal?.text,
    meal?.title,
    meal?.note,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function normalizeMealType(value) {
  const text = String(value || '').trim()

  if (!text) return ''

  return [...validMealTypes].find(
    (type) => type.toLocaleLowerCase('sv-SE') === text.toLocaleLowerCase('sv-SE'),
  ) || 'Måltid'
}

export function normalizeMealRecord(meal) {
  if (!isObject(meal)) return null

  const createdDate = parseDate(meal.createdAt || meal.date)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(meal.date || ''))
    ? meal.date
    : createdDate
      ? getLocalDateString(createdDate)
      : ''
  const time = /^\d{2}:\d{2}$/.test(String(meal.time || ''))
    ? meal.time
    : createdDate
      ? getLocalTimeString(createdDate)
      : ''
  const createdAt = parseDate(meal.createdAt)?.toISOString() || new Date().toISOString()
  const updatedAt = parseDate(meal.updatedAt)?.toISOString() || createdAt
  const override = normalizeOverride(meal.nutritionOverride)

  return {
    ...meal,
    correctionNote: typeof meal.correctionNote === 'string' ? meal.correctionNote.trim() : '',
    createdAt,
    date,
    id: String(meal.id || `meal-${createdAt}`),
    mealType: normalizeMealType(meal.mealType || meal.type),
    nutritionOverride: override,
    nutritionSource: Object.keys(override).length > 0 ? 'manual' : 'automatic',
    text: getMealText(meal),
    time,
    updatedAt,
  }
}

function getLegacyOverride(meal) {
  if (isObject(meal?.nutritionOverride) && Object.keys(meal.nutritionOverride).length > 0) {
    return {}
  }

  return macroFields.reduce((result, field) => {
    const parsed = parseCorrectionNumber(meal?.[field])

    if (parsed !== null) {
      result[field] = parsed
    }

    return result
  }, {})
}

export function getEffectiveMealNutrition(meal, options = {}) {
  const record = normalizeMealRecord(meal)
  const automatic = analyzeMealText(record?.text || '', options)
  const explicitOverride = normalizeOverride(record?.nutritionOverride)
  const legacyOverride = getLegacyOverride(meal)
  const override = Object.keys(explicitOverride).length > 0 ? explicitOverride : legacyOverride
  const manualFields = macroFields.filter((field) => Object.prototype.hasOwnProperty.call(override, field))
  const totals = macroFields.reduce((result, field) => {
    const value = manualFields.includes(field)
      ? override[field]
      : automatic.totals[field] || 0

    if (field !== 'fiber' || value > 0 || manualFields.includes(field)) {
      result[field] = value
    }

    return result
  }, {})
  const source = manualFields.length === 0
    ? 'automatic'
    : coreMacroFields.every((field) => manualFields.includes(field))
      ? 'manual'
      : 'partial_manual'
  const result = {
    analysis: automatic,
    estimatedFields: macroFields.filter((field) => !manualFields.includes(field) && totals[field] > 0),
    manualFields,
    source,
    totals,
  }

  result.confidence = evaluateMealNutritionConfidence(record, result)

  return result
}

export function validateMealEditDraft(draft) {
  const errors = {}
  const text = String(draft?.description || draft?.text || draft?.name || '').trim()

  if (!text) {
    errors.description = 'Ange en beskrivning av måltiden.'
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft?.date || '')) || !parseDate(draft.date)) {
    errors.date = 'Ange ett giltigt datum.'
  }

  if (draft?.time && !/^\d{2}:\d{2}$/.test(String(draft.time))) {
    errors.time = 'Ange en giltig tid.'
  }

  macroFields.forEach((field) => {
    const value = draft?.nutritionOverride?.[field] ?? draft?.[field]

    if (value === '' || value === null || value === undefined) return

    const parsed = parseCorrectionNumber(value)
    const label = {
      calories: 'Kalorier',
      carbs: 'Kolhydrater',
      fat: 'Fett',
      fiber: 'Fibrer',
      protein: 'Protein',
    }[field]

    if (parsed === null) {
      errors[field] = String(value).trim().startsWith('-')
        ? `${label} får inte vara negativt.`
        : `${label} måste vara ett giltigt tal.`
    }
  })

  return errors
}

export function createUpdatedMealRecord(existingMeal, draft, now = new Date().toISOString()) {
  const errors = validateMealEditDraft(draft)

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      meal: null,
    }
  }

  const existing = normalizeMealRecord(existingMeal) || {}
  const override = normalizeOverride(draft.nutritionOverride || draft)
  const hasOverride = Object.keys(override).length > 0
  const next = {
    ...existingMeal,
    correctionNote: String(draft.correctionNote || '').trim(),
    createdAt: existing.createdAt || now,
    date: draft.date,
    description: String(draft.description || draft.text || draft.name || '').trim(),
    mealType: normalizeMealType(draft.mealType || draft.type),
    name: String(draft.name || draft.description || draft.text || 'Måltid').trim(),
    note: String(draft.note || '').trim(),
    nutritionOverride: override,
    nutritionSource: hasOverride ? 'manual' : 'automatic',
    text: String(draft.description || draft.text || draft.name || '').trim(),
    time: draft.time || '',
    type: normalizeMealType(draft.mealType || draft.type) || 'Annat',
    updatedAt: now,
  }

  macroFields.forEach((field) => {
    next[field] = Object.prototype.hasOwnProperty.call(override, field) ? override[field] : null
  })

  return {
    errors: {},
    meal: next,
  }
}

export function resetMealNutritionOverride(meal, now = new Date().toISOString()) {
  return {
    ...meal,
    calories: null,
    carbs: null,
    correctionNote: '',
    fat: null,
    fiber: null,
    nutritionOverride: {},
    nutritionSource: 'automatic',
    protein: null,
    updatedAt: now,
  }
}

export function createMealEditDraft(meal) {
  const record = normalizeMealRecord(meal)
  const override = normalizeOverride(meal?.nutritionOverride)
  const legacy = getLegacyOverride(meal)
  const nutritionOverride = Object.keys(override).length > 0 ? override : legacy

  return {
    correctionNote: record?.correctionNote || '',
    date: record?.date || '',
    description: record?.text || '',
    id: record?.id || '',
    mealType: record?.mealType || 'Automatiskt',
    name: meal?.name || record?.text || '',
    note: meal?.note || '',
    nutritionOverride,
    time: record?.time || '',
    type: record?.mealType || 'Automatiskt',
  }
}

export const mealCorrectionFields = macroFields

import {
  getEffectiveMealNutrition,
  normalizeMealRecord,
  normalizeNutritionOverride,
  parseCorrectionNumber,
} from './mealCorrections.js'

export const mealTemplateStorageKey = 'viktkollen.mealTemplates'
export const mealTemplateTypes = [
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
]

const maxTextLength = 1000
const timePattern = /^\d{2}:\d{2}$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function isValidTime(value) {
  if (!timePattern.test(String(value || ''))) return false

  const [hours, minutes] = String(value).split(':').map(Number)

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

function createId(prefix = 'meal-template', seed = Date.now()) {
  return `${prefix}-${seed}-${Math.random().toString(36).slice(2, 8)}`
}

function cloneOverride(override) {
  return normalizeNutritionOverride(override)
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxTextLength)
}

function normalizeMealType(value) {
  const text = normalizeText(value)
  const match = mealTemplateTypes.find(
    (type) => type.toLocaleLowerCase('sv-SE') === text.toLocaleLowerCase('sv-SE'),
  )

  return match || 'Automatiskt'
}

function normalizeIso(value, fallback = null) {
  const date = parseDate(value)

  return date ? date.toISOString() : fallback
}

function templatePreviewMeal(template) {
  return {
    calories: template?.nutritionOverride?.calories,
    carbs: template?.nutritionOverride?.carbs,
    description: template?.text || template?.description || template?.name || '',
    fat: template?.nutritionOverride?.fat,
    name: template?.name || '',
    nutritionOverride: template?.nutritionOverride || {},
    protein: template?.nutritionOverride?.protein,
    text: template?.text || template?.description || template?.name || '',
    type: template?.mealType || template?.type || 'Annat',
  }
}

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

export function getMealTemplatePreview(template) {
  return getEffectiveMealNutrition(templatePreviewMeal(template))
}

export function normalizeMealTemplate(template, options = {}) {
  if (!isObject(template)) return null

  const text = normalizeText(template.text || template.description)
  const name = normalizeText(template.name || text.split(',')[0] || 'Måltidsmall')

  if (!text && !name) return null

  const now = options.now || new Date().toISOString()
  const createdAt = normalizeIso(template.createdAt, now)
  const useCount = parseCorrectionNumber(template.useCount) ?? 0

  return {
    id: normalizeText(template.id) || createId('meal-template', createdAt),
    name: name || 'Måltidsmall',
    text: text || name,
    mealType: normalizeMealType(template.mealType || template.type),
    defaultTime: isValidTime(template.defaultTime) ? template.defaultTime : '',
    nutritionOverride: cloneOverride(template.nutritionOverride),
    correctionNote: normalizeText(template.correctionNote || template.note),
    isFavorite: Boolean(template.isFavorite),
    createdAt,
    updatedAt: normalizeIso(template.updatedAt, createdAt),
    lastUsedAt: normalizeIso(template.lastUsedAt),
    useCount,
  }
}

export function normalizeMealTemplates(templates) {
  const seen = new Set()

  return (Array.isArray(templates) ? templates : [])
    .map((template) => normalizeMealTemplate(template))
    .filter(Boolean)
    .filter((template) => {
      if (seen.has(template.id)) return false

      seen.add(template.id)
      return true
    })
    .sort(sortMealTemplates)
}

export function sortMealTemplates(first, second) {
  if (first.isFavorite !== second.isFavorite) {
    return first.isFavorite ? -1 : 1
  }

  const firstUsed = parseDate(first.lastUsedAt)?.getTime() || 0
  const secondUsed = parseDate(second.lastUsedAt)?.getTime() || 0

  if (firstUsed !== secondUsed) return secondUsed - firstUsed
  if (first.useCount !== second.useCount) return second.useCount - first.useCount

  return first.name.localeCompare(second.name, 'sv-SE')
}

export function filterMealTemplates(templates, filters = {}) {
  const search = normalizeText(filters.search).toLocaleLowerCase('sv-SE')
  const type = normalizeText(filters.type || 'Alla')

  return normalizeMealTemplates(templates).filter((template) => {
    if (type === 'Favoriter' && !template.isFavorite) return false
    if (!['Alla', 'Favoriter'].includes(type) && template.mealType !== type) return false
    if (!search) return true

    return [template.name, template.text, template.mealType]
      .join(' ')
      .toLocaleLowerCase('sv-SE')
      .includes(search)
  })
}

export function readMealTemplates(storage) {
  const resolvedStorage = getStorage(storage)

  if (!resolvedStorage) return []

  try {
    return normalizeMealTemplates(JSON.parse(resolvedStorage.getItem(mealTemplateStorageKey) || '[]'))
  } catch {
    return []
  }
}

export function writeMealTemplates(templates, storage) {
  const resolvedStorage = getStorage(storage)
  const normalized = normalizeMealTemplates(templates)

  if (!resolvedStorage) return normalized

  try {
    resolvedStorage.setItem(mealTemplateStorageKey, JSON.stringify(normalized))
  } catch {
    return normalized
  }

  return normalized
}

export function validateMealTemplateDraft(draft = {}) {
  const errors = {}

  if (!normalizeText(draft.name)) {
    errors.name = 'Ge mallen ett namn.'
  }

  if (!normalizeText(draft.text || draft.description)) {
    errors.text = 'Skriv vad måltiden brukar innehålla.'
  }

  if (draft.defaultTime && !isValidTime(draft.defaultTime)) {
    errors.defaultTime = 'Välj en giltig tid.'
  }

  ;['calories', 'protein', 'carbs', 'fat'].forEach((field) => {
    const value = draft.nutritionOverride?.[field]

    if (value !== '' && value !== null && value !== undefined && parseCorrectionNumber(value) === null) {
      errors[field] = String(value).trim().startsWith('-')
        ? 'Värdet får inte vara negativt.'
        : 'Ange ett giltigt tal eller lämna tomt.'
    }
  })

  return errors
}

export function buildMealTemplateDraft(seed = {}) {
  return {
    name: normalizeText(seed.name),
    text: normalizeText(seed.text || seed.description),
    mealType: normalizeMealType(seed.mealType || seed.type),
    defaultTime: isValidTime(seed.defaultTime || seed.time) ? seed.defaultTime || seed.time : '',
    nutritionOverride: {
      calories: seed.nutritionOverride?.calories ?? '',
      protein: seed.nutritionOverride?.protein ?? '',
      carbs: seed.nutritionOverride?.carbs ?? '',
      fat: seed.nutritionOverride?.fat ?? '',
    },
    correctionNote: normalizeText(seed.correctionNote || seed.note),
    isFavorite: Boolean(seed.isFavorite),
  }
}

export function createMealTemplate(draft = {}, now = new Date().toISOString()) {
  const errors = validateMealTemplateDraft(draft)

  if (Object.keys(errors).length > 0) {
    return { errors, template: null }
  }

  return {
    errors: {},
    template: normalizeMealTemplate({
      ...draft,
      createdAt: now,
      id: createId('meal-template', now),
      updatedAt: now,
      useCount: 0,
    }),
  }
}

export function createMealTemplateFromMeal(meal, draft = {}, now = new Date().toISOString()) {
  const normalizedMeal = normalizeMealRecord(meal)

  if (!normalizedMeal) {
    return {
      errors: { meal: 'Måltiden kunde inte läsas.' },
      template: null,
    }
  }

  const effective = getEffectiveMealNutrition(normalizedMeal)
  const hasOverride = Object.keys(normalizedMeal.nutritionOverride || {}).length > 0
  const nutritionOverride = hasOverride
    ? cloneOverride(normalizedMeal.nutritionOverride)
    : cloneOverride({
      calories: effective.totals.calories,
      carbs: effective.totals.carbs,
      fat: effective.totals.fat,
      protein: effective.totals.protein,
    })

  return createMealTemplate({
    ...draft,
    name: draft.name || normalizedMeal.name,
    text: draft.text || meal.text || meal.description || normalizedMeal.description || normalizedMeal.name,
    mealType: draft.mealType || normalizedMeal.mealType || normalizedMeal.type,
    defaultTime: draft.defaultTime || normalizedMeal.time,
    nutritionOverride: draft.nutritionOverride || nutritionOverride,
    correctionNote: draft.correctionNote || normalizedMeal.correctionNote,
    isFavorite: draft.isFavorite,
  }, now)
}

export function updateMealTemplate(existingTemplate, draft = {}, now = new Date().toISOString()) {
  const existing = normalizeMealTemplate(existingTemplate)

  if (!existing) {
    return {
      errors: { template: 'Mallen kunde inte läsas.' },
      template: null,
    }
  }

  const errors = validateMealTemplateDraft(draft)

  if (Object.keys(errors).length > 0) {
    return { errors, template: null }
  }

  return {
    errors: {},
    template: normalizeMealTemplate({
      ...existing,
      ...draft,
      createdAt: existing.createdAt,
      id: existing.id,
      lastUsedAt: existing.lastUsedAt,
      updatedAt: now,
      useCount: existing.useCount,
    }),
  }
}

export function addMealTemplate(draft, storage) {
  const result = createMealTemplate(draft)

  if (!result.template) return result

  const templates = writeMealTemplates([result.template, ...readMealTemplates(storage)], storage)

  return {
    errors: {},
    template: templates.find((template) => template.id === result.template.id) || result.template,
    templates,
  }
}

export function updateStoredMealTemplate(templateId, draft, storage) {
  const templates = readMealTemplates(storage)
  const existing = templates.find((template) => template.id === templateId)
  const result = updateMealTemplate(existing, draft)

  if (!result.template) return result

  const nextTemplates = writeMealTemplates([
    result.template,
    ...templates.filter((template) => template.id !== templateId),
  ], storage)

  return {
    errors: {},
    template: result.template,
    templates: nextTemplates,
  }
}

export function deleteMealTemplate(templateId, storage) {
  const templates = readMealTemplates(storage)
  const nextTemplates = writeMealTemplates(
    templates.filter((template) => template.id !== templateId),
    storage,
  )

  return nextTemplates
}

export function toggleMealTemplateFavorite(templateId, storage) {
  const templates = readMealTemplates(storage)
  const nextTemplates = templates.map((template) =>
    template.id === templateId
      ? { ...template, isFavorite: !template.isFavorite, updatedAt: new Date().toISOString() }
      : template,
  )

  return writeMealTemplates(nextTemplates, storage)
}

export function markMealTemplateUsed(templateId, storage, now = new Date().toISOString()) {
  const templates = readMealTemplates(storage)
  const nextTemplates = templates.map((template) =>
    template.id === templateId
      ? { ...template, lastUsedAt: now, updatedAt: now, useCount: (template.useCount || 0) + 1 }
      : template,
  )

  return writeMealTemplates(nextTemplates, storage)
}

export function createMealFromTemplate(template, options = {}, now = new Date().toISOString()) {
  const normalizedTemplate = normalizeMealTemplate(template)
  const fallbackDate = formatDate(parseDate(now) || new Date())

  if (!normalizedTemplate) return null

  const meal = normalizeMealRecord({
    createdAt: now,
    date: datePattern.test(String(options.date || '')) ? options.date : fallbackDate,
    description: normalizedTemplate.text,
    id: createId('meal', now),
    name: normalizedTemplate.name,
    nutritionOverride: cloneOverride(normalizedTemplate.nutritionOverride),
    nutritionSource: Object.keys(normalizedTemplate.nutritionOverride).length > 0 ? 'manual' : 'automatic',
    correctionNote: normalizedTemplate.correctionNote,
    source: 'Snabbval',
    sourceCategory: 'template',
    text: normalizedTemplate.text,
    time: isValidTime(options.time)
      ? options.time
      : normalizedTemplate.defaultTime || formatTime(parseDate(now) || new Date()),
    type: normalizedTemplate.mealType === 'Automatiskt' ? 'Annat' : normalizedTemplate.mealType,
    updatedAt: now,
  })

  return meal
    ? {
      ...meal,
      description: normalizedTemplate.text,
      text: normalizedTemplate.text,
    }
    : null
}

export function createMealCopy(meal, options = {}, now = new Date().toISOString()) {
  const normalizedMeal = normalizeMealRecord(meal)
  const fallbackDate = formatDate(parseDate(now) || new Date())

  if (!normalizedMeal) return null

  return normalizeMealRecord({
    ...normalizedMeal,
    createdAt: now,
    date: datePattern.test(String(options.date || '')) ? options.date : fallbackDate,
    id: createId('meal', now),
    nutritionOverride: cloneOverride(normalizedMeal.nutritionOverride),
    source: normalizedMeal.source || 'Snabbval',
    sourceCategory: normalizedMeal.photoAnalysis ? 'photo_analysis' : 'quick_add',
    time: isValidTime(options.time) ? options.time : formatTime(parseDate(now) || new Date()),
    updatedAt: now,
  })
}

export function getRecentUniqueMeals(meals, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : 5
  const today = datePattern.test(String(options.today || '')) ? options.today : formatDate()
  const seen = new Set()

  return (Array.isArray(meals) ? meals : [])
    .map(normalizeMealRecord)
    .filter(Boolean)
    .filter((meal) => datePattern.test(meal.date) && meal.date <= today)
    .sort((first, second) => `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`))
    .filter((meal) => {
      const key = [
        normalizeText(meal.text || meal.description || meal.name).toLocaleLowerCase('sv-SE'),
        meal.type,
      ].join('|')

      if (!key.trim() || seen.has(key)) return false

      seen.add(key)
      return true
    })
    .slice(0, limit)
}

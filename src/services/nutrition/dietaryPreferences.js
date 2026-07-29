export const dietaryPreferencesStorageKey = 'viktkollen.dietaryPreferences.v1'

export const dietTypes = ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'custom']

const animalTerms = [
  'kyckling',
  'nötkött',
  'notkott',
  'fläsk',
  'flask',
  'lax',
  'torsk',
  'tonfisk',
  'fisk',
  'ägg',
  'agg',
  'mjölk',
  'mjolk',
  'ost',
  'kvarg',
  'keso',
  'yoghurt',
  'yogurt',
  'hamburgare',
]
const meatTerms = ['kyckling', 'nötkött', 'notkott', 'fläsk', 'flask', 'hamburgare', 'kött', 'kott']
const fishTerms = ['lax', 'torsk', 'tonfisk', 'fisk']
const dairyTerms = ['mjölk', 'mjolk', 'ost', 'kvarg', 'keso', 'yoghurt', 'yogurt', 'grekisk yoghurt']
const eggTerms = ['ägg', 'agg']
const glutenTerms = ['bröd', 'brod', 'pasta', 'vete', 'mjöl', 'mjol', 'pizza', 'hamburgare']
const porkTerms = ['fläsk', 'flask', 'bacon', 'skinka', 'gris']
const alcoholTerms = ['alkohol', 'vin', 'öl', 'ol', 'cider']

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('sv-SE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeFoodList(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
      .split(/[,\n]/)

  return [...new Set(list
    .map((item) => String(item || '').trim())
    .filter(Boolean))]
}

function nowIso() {
  return new Date().toISOString()
}

function hasAny(text, terms) {
  const normalized = normalizeText(text)

  return terms.some((term) => normalized.includes(normalizeText(term)))
}

function getSuggestionText(suggestion = {}) {
  const source = suggestion && typeof suggestion === 'object' ? suggestion : {}

  return [
    source.name,
    source.description,
    source.text,
    source.mealType,
    ...(Array.isArray(source.tags) ? source.tags : []),
  ].join(' ')
}

function getTemplateText(template = {}) {
  const source = template && typeof template === 'object' ? template : {}

  return [
    source.name,
    source.text,
    source.description,
    source.mealType,
    ...(Array.isArray(source.tags) ? source.tags : []),
  ].join(' ')
}

export function normalizeDietaryPreferences(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const nested = source.preferences && typeof source.preferences === 'object'
    ? source.preferences
    : {}
  const dietType = dietTypes.includes(source.dietType) ? source.dietType : 'omnivore'
  const createdAt = typeof source.createdAt === 'string' ? source.createdAt : ''
  const updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : ''

  return {
    avoidedFoods: normalizeFoodList(source.avoidedFoods),
    createdAt,
    dietType,
    notes: String(source.notes || '').trim(),
    preferences: {
      glutenFree: nested.glutenFree === true,
      halalPreferred: nested.halalPreferred === true,
      lactoseFree: nested.lactoseFree === true,
    },
    preferredFoods: normalizeFoodList(source.preferredFoods),
    updatedAt,
  }
}

export function validateDietaryPreferences(value = {}) {
  const normalized = normalizeDietaryPreferences(value)
  const errors = {}

  if (!dietTypes.includes(normalized.dietType)) {
    errors.dietType = 'Välj en giltig kosttyp.'
  }

  if (normalized.avoidedFoods.length > 30) {
    errors.avoidedFoods = 'Spara högst 30 livsmedel att undvika.'
  }

  if (normalized.preferredFoods.length > 30) {
    errors.preferredFoods = 'Spara högst 30 föredragna livsmedel.'
  }

  if (normalized.notes.length > 500) {
    errors.notes = 'Anteckningen är för lång.'
  }

  return errors
}

export function createUpdatedDietaryPreferences(current = {}, patch = {}) {
  const base = normalizeDietaryPreferences(current)
  const next = normalizeDietaryPreferences({
    ...base,
    ...patch,
    preferences: {
      ...base.preferences,
      ...(patch.preferences || {}),
    },
  })
  const timestamp = nowIso()

  return {
    ...next,
    createdAt: next.createdAt || base.createdAt || timestamp,
    updatedAt: timestamp,
  }
}

export function readDietaryPreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(dietaryPreferencesStorageKey)

    if (!raw) return normalizeDietaryPreferences()

    return normalizeDietaryPreferences(JSON.parse(raw))
  } catch {
    return normalizeDietaryPreferences()
  }
}

export function writeDietaryPreferences(value, storage = globalThis.localStorage) {
  const normalized = createUpdatedDietaryPreferences(readDietaryPreferences(storage), value)

  storage?.setItem?.(dietaryPreferencesStorageKey, JSON.stringify(normalized))
  return normalized
}

export function updateDietaryPreferences(patch, storage = globalThis.localStorage) {
  return writeDietaryPreferences(createUpdatedDietaryPreferences(readDietaryPreferences(storage), patch), storage)
}

export function clearDietaryPreferences(storage = globalThis.localStorage) {
  storage?.removeItem?.(dietaryPreferencesStorageKey)
  return normalizeDietaryPreferences()
}

export function hasDietaryPreferences(value = {}) {
  const preferences = normalizeDietaryPreferences(value)

  return preferences.dietType !== 'omnivore' ||
    preferences.preferences.glutenFree ||
    preferences.preferences.halalPreferred ||
    preferences.preferences.lactoseFree ||
    preferences.avoidedFoods.length > 0 ||
    preferences.preferredFoods.length > 0 ||
    Boolean(preferences.notes)
}

export function getDietaryPreferencesSummary(value = {}) {
  const preferences = normalizeDietaryPreferences(value)
  const parts = []

  if (preferences.dietType !== 'omnivore') parts.push({
    pescatarian: 'pescetariskt',
    vegan: 'veganskt',
    vegetarian: 'vegetariskt',
    custom: 'egna val',
  }[preferences.dietType])
  if (preferences.preferences.lactoseFree) parts.push('laktosfritt')
  if (preferences.preferences.glutenFree) parts.push('glutenfritt')
  if (preferences.preferences.halalPreferred) parts.push('halal prioriteras')
  if (preferences.avoidedFoods.length) parts.push(`undviker ${preferences.avoidedFoods.join(', ')}`)
  if (preferences.preferredFoods.length) parts.push(`föredrar ${preferences.preferredFoods.join(', ')}`)

  return parts.join(', ')
}

function getIncompatibilityReasons(text, preferences) {
  const reasons = []

  if (preferences.dietType === 'vegan') {
    if (hasAny(text, animalTerms)) reasons.push('innehåller animaliska livsmedel')
  } else if (preferences.dietType === 'vegetarian') {
    if (hasAny(text, [...meatTerms, ...fishTerms])) reasons.push('innehåller kött eller fisk')
  } else if (preferences.dietType === 'pescatarian') {
    if (hasAny(text, meatTerms)) reasons.push('innehåller kött')
  }

  if (preferences.preferences.lactoseFree && hasAny(text, dairyTerms)) {
    reasons.push('innehåller mejeri/laktos')
  }

  if (preferences.preferences.glutenFree && hasAny(text, glutenTerms)) {
    reasons.push('kan innehålla gluten')
  }

  if (preferences.preferences.halalPreferred && hasAny(text, [...porkTerms, ...alcoholTerms])) {
    reasons.push('matchar inte halalpreferensen')
  }

  const avoided = preferences.avoidedFoods.filter((food) => hasAny(text, [food]))

  if (avoided.length) {
    reasons.push(`innehåller ${avoided.join(', ')}`)
  }

  return [...new Set(reasons)]
}

export function isMealSuggestionCompatible(suggestion = {}, preferences = {}) {
  const normalized = normalizeDietaryPreferences(preferences)

  if (!hasDietaryPreferences(normalized)) return true

  return getIncompatibilityReasons(getSuggestionText(suggestion), normalized).length === 0
}

export function explainSuggestionCompatibility(suggestion = {}, preferences = {}) {
  const normalized = normalizeDietaryPreferences(preferences)
  const reasons = getIncompatibilityReasons(getSuggestionText(suggestion), normalized)

  if (!hasDietaryPreferences(normalized)) {
    return 'Inga sparade matpreferenser påverkar förslaget.'
  }

  if (!reasons.length) {
    return 'Förslaget matchar dina sparade matpreferenser.'
  }

  return `Förslaget filtreras bort eftersom det ${reasons.join(' och ')}.`
}

export function filterMealSuggestionsByPreferences(suggestions = [], preferences = {}) {
  return (Array.isArray(suggestions) ? suggestions : [])
    .filter(Boolean)
    .filter((suggestion) => isMealSuggestionCompatible(suggestion, preferences))
}

export function rankMealSuggestionsByPreferences(suggestions = [], preferences = {}) {
  const normalized = normalizeDietaryPreferences(preferences)

  return filterMealSuggestionsByPreferences(suggestions, normalized)
    .map((suggestion, index) => {
      const text = getSuggestionText(suggestion)
      const preferredScore = normalized.preferredFoods.filter((food) => hasAny(text, [food])).length

      return { index, preferredScore, suggestion }
    })
    .sort((first, second) => second.preferredScore - first.preferredScore || first.index - second.index)
    .map((entry) => entry.suggestion)
}

export function evaluateMealTemplateCompatibility(template = {}, preferences = {}) {
  const normalized = normalizeDietaryPreferences(preferences)
  const text = getTemplateText(template)
  const reasons = getIncompatibilityReasons(text, normalized)
  const preferredMatches = normalized.preferredFoods.filter((food) => hasAny(text, [food]))

  return {
    compatible: reasons.length === 0,
    explanation: reasons.length
      ? `Mallen filtreras bort eftersom den ${reasons.join(' och ')}.`
      : 'Mallen matchar dina sparade matpreferenser.',
    preferredMatches,
    reasons,
    template,
  }
}

export function filterTemplatesByDietaryPreferences(templates = [], preferences = {}) {
  const normalized = normalizeDietaryPreferences(preferences)

  if (!hasDietaryPreferences(normalized)) {
    return Array.isArray(templates) ? templates.filter(Boolean) : []
  }

  return (Array.isArray(templates) ? templates : [])
    .filter(Boolean)
    .filter((template) => evaluateMealTemplateCompatibility(template, normalized).compatible)
}

export const dietaryPreferencesInternals = {
  dairyTerms,
  eggTerms,
  glutenTerms,
  meatTerms,
  normalizeText,
}

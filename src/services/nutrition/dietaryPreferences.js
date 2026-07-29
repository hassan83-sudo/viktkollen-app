export const dietaryPreferencesStorageKey = 'viktkollen.dietaryPreferences.v1'

export const dietTypes = ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'custom']
const maxFoodEntries = 30
const maxFoodLength = 60
const maxNoteLength = 500

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
const meatTerms = ['kyckling', 'nötkött', 'notkott', 'fläsk', 'flask', 'hamburgare', 'kött', 'kott', 'meat', 'poultry']
const fishTerms = ['lax', 'torsk', 'tonfisk', 'fisk', 'fish']
const dairyTerms = ['mjölk', 'mjolk', 'ost', 'kvarg', 'keso', 'yoghurt', 'yogurt', 'grekisk yoghurt', 'dairy', 'contains dairy', 'lactose']
const eggTerms = ['ägg', 'agg']
const glutenTerms = ['bröd', 'brod', 'pasta', 'vete', 'mjöl', 'mjol', 'pizza', 'hamburgare', 'gluten', 'contains gluten']
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
  const seen = new Set()
  const normalized = []

  for (const item of list) {
    const trimmed = String(item || '').replace(/\s+/g, ' ').trim()
    const key = normalizeText(trimmed)

    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
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
  const avoidedKeys = new Map(normalized.avoidedFoods.map((food) => [normalizeText(food), food]))

  if (!dietTypes.includes(normalized.dietType)) {
    errors.dietType = 'Välj en giltig kosttyp.'
  }

  if (normalized.avoidedFoods.length > maxFoodEntries) {
    errors.avoidedFoods = `Spara högst ${maxFoodEntries} livsmedel att undvika.`
  }

  if (normalized.preferredFoods.length > maxFoodEntries) {
    errors.preferredFoods = `Spara högst ${maxFoodEntries} föredragna livsmedel.`
  }

  if (normalized.notes.length > maxNoteLength) {
    errors.notes = 'Anteckningen är för lång.'
  }

  const longAvoided = normalized.avoidedFoods.find((food) => food.length > maxFoodLength)
  const longPreferred = normalized.preferredFoods.find((food) => food.length > maxFoodLength)
  const conflict = normalized.preferredFoods.find((food) => avoidedKeys.has(normalizeText(food)))

  if (longAvoided) errors.avoidedFoods = `"${longAvoided}" är för långt.`
  if (longPreferred) errors.preferredFoods = `"${longPreferred}" är för långt.`
  if (conflict) {
    const display = avoidedKeys.get(normalizeText(conflict)) || conflict

    errors.foodConflict = `"${display}" kan inte finnas både bland föredragna och undvikna matvaror.`
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

  try {
    storage?.setItem?.(dietaryPreferencesStorageKey, JSON.stringify(normalized))
  } catch {
    return normalized
  }

  return normalized
}

export function updateDietaryPreferences(patch, storage = globalThis.localStorage) {
  return writeDietaryPreferences(createUpdatedDietaryPreferences(readDietaryPreferences(storage), patch), storage)
}

export function clearDietaryPreferences(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(dietaryPreferencesStorageKey)
  } catch {
    return normalizeDietaryPreferences()
  }

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
  const hasText = normalizeText(text).length > 0
  const reasons = getIncompatibilityReasons(text, normalized)
  const preferredMatches = normalized.preferredFoods.filter((food) => hasAny(text, [food]))
  const status = reasons.length
    ? 'incompatible'
    : hasText
      ? 'compatible'
      : 'unknown'

  return {
    compatible: status === 'compatible',
    explanation: status === 'incompatible'
      ? `Mallen filtreras bort eftersom den ${reasons.join(' och ')}.`
      : status === 'unknown'
        ? 'Mallen föreslås inte automatiskt eftersom innehållet är oklart.'
        : 'Mallen matchar dina sparade matpreferenser.',
    preferredMatches,
    reasons,
    status,
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
    .map((template, index) => ({
      evaluation: evaluateMealTemplateCompatibility(template, normalized),
      index,
      template,
    }))
    .filter((entry) => entry.evaluation.compatible)
    .sort((first, second) => second.evaluation.preferredMatches.length - first.evaluation.preferredMatches.length || first.index - second.index)
    .map((entry) => entry.template)
}

export const dietaryPreferencesInternals = {
  dairyTerms,
  eggTerms,
  glutenTerms,
  meatTerms,
  normalizeText,
}

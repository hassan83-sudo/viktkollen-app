import { getNutritionAliases } from './nutrition/nutritionDatabase.js'

export const photoIngredientMatchStatuses = ['exactMatch', 'normalizedMatch', 'multipleMatches', 'noMatch']

const conservativeAliases = [
  { alias: 'french fries', foodAlias: 'pommes' },
  { alias: 'fries', foodAlias: 'pommes' },
  { alias: 'pommes frites', foodAlias: 'pommes' },
]

const ambiguousSauceTerms = [
  'aioli',
  'creme fraiche',
  'creme fraîche',
  'crème fraiche',
  'crème fraîche',
  'dressing',
  'hummus',
  'majonnas',
  'majonnäs',
  'sas',
  'sås',
  'tahini',
  'vitlokssas',
  'vitlökssås',
]

const cookingSpecificChickenTerms = [
  'breaded',
  'fried',
  'friterad',
  'panerad',
]

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizePhotoIngredientName(value) {
  return stripDiacritics(value)
    .toLocaleLowerCase('sv-SE')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\b(och|med|utan|lite|mycket|ca|cirka)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toSuggestion(food) {
  return {
    category: food.category,
    defaultServing: food.defaultServing,
    id: food.id,
    name: food.name,
    nutritionPer100g: {
      calories: food.caloriesPer100g,
      carbs: food.carbsPer100g,
      fat: food.fatPer100g,
      protein: food.proteinPer100g,
    },
    source: 'nutritionDatabase',
  }
}

function uniqueFoods(entries) {
  const seen = new Set()

  return entries
    .map((entry) => entry.food)
    .filter((food) => {
      if (!food || seen.has(food.id)) return false
      seen.add(food.id)
      return true
    })
}

function hasAmbiguousSauceAlternatives(item = {}, normalizedName = '') {
  const candidates = [
    normalizedName,
    ...(Array.isArray(item.alternatives) ? item.alternatives.map(normalizePhotoIngredientName) : []),
    normalizePhotoIngredientName(item.uncertainty?.reason),
  ].filter(Boolean)
  const hits = new Set(candidates.flatMap((candidate) =>
    ambiguousSauceTerms.filter((term) => candidate.includes(normalizePhotoIngredientName(term)))))

  return hits.size > 1 || (hits.size > 0 && normalizePhotoIngredientName(item.category).includes('sauce'))
}

function addConservativeAliases(aliases) {
  const byAlias = new Map(aliases.map((entry) => [entry.normalizedAlias, entry.food]))
  const additions = conservativeAliases
    .map((entry) => {
      const food = byAlias.get(normalizePhotoIngredientName(entry.foodAlias))
      return food ? {
        alias: entry.alias,
        food,
        normalizedAlias: normalizePhotoIngredientName(entry.alias),
      } : null
    })
    .filter(Boolean)

  return [...aliases, ...additions]
}

function isUnsafePlainChickenMatch(item = {}, normalizedName = '', food = {}) {
  if (food.id !== 'kyckling') return false
  const candidates = [
    normalizedName,
    ...(Array.isArray(item.alternatives) ? item.alternatives.map(normalizePhotoIngredientName) : []),
    normalizePhotoIngredientName(item.uncertainty?.reason),
  ].filter(Boolean).join(' ')

  return cookingSpecificChickenTerms.some((term) => candidates.includes(normalizePhotoIngredientName(term)))
}

export function matchPhotoIngredientToDatabase(item = {}, options = {}) {
  const maxSuggestions = options.maxSuggestions || 4
  const name = String(item.name || '')
  const normalizedName = normalizePhotoIngredientName(name)
  if (!normalizedName) {
    return { matchedFood: null, status: 'noMatch', suggestions: [] }
  }

  const baseAliases = getNutritionAliases().map((entry) => ({
    ...entry,
    normalizedAlias: normalizePhotoIngredientName(entry.alias),
  }))
  const aliases = addConservativeAliases(baseAliases)
  if (hasAmbiguousSauceAlternatives(item, normalizedName)) {
    const suggestions = uniqueFoods(aliases.filter((entry) =>
      normalizedName.includes(entry.normalizedAlias) || entry.normalizedAlias.includes(normalizedName)))
    return suggestions.length
      ? { matchedFood: null, status: 'multipleMatches', suggestions: suggestions.map(toSuggestion).slice(0, maxSuggestions) }
      : { matchedFood: null, status: 'noMatch', suggestions: [] }
  }
  const exact = uniqueFoods(baseAliases.filter((entry) => entry.alias.toLocaleLowerCase('sv-SE') === name.toLocaleLowerCase('sv-SE')))
  if (exact.length === 1) {
    return { matchedFood: toSuggestion(exact[0]), status: 'exactMatch', suggestions: [toSuggestion(exact[0])] }
  }
  if (exact.length > 1) {
    return { matchedFood: null, status: 'multipleMatches', suggestions: exact.map(toSuggestion).slice(0, maxSuggestions) }
  }

  const normalized = uniqueFoods(aliases.filter((entry) => entry.normalizedAlias === normalizedName))
  if (normalized.length === 1) {
    return { matchedFood: toSuggestion(normalized[0]), status: 'normalizedMatch', suggestions: [toSuggestion(normalized[0])] }
  }
  if (normalized.length > 1) {
    return { matchedFood: null, status: 'multipleMatches', suggestions: normalized.map(toSuggestion).slice(0, maxSuggestions) }
  }

  const contained = uniqueFoods(aliases.filter((entry) =>
    (normalizedName.includes(entry.normalizedAlias) || entry.normalizedAlias.includes(normalizedName))
      && !isUnsafePlainChickenMatch(item, normalizedName, entry.food)))

  return contained.length === 1
    ? { matchedFood: toSuggestion(contained[0]), status: 'normalizedMatch', suggestions: contained.map(toSuggestion) }
    : contained.length > 1
      ? { matchedFood: null, status: 'multipleMatches', suggestions: contained.map(toSuggestion).slice(0, maxSuggestions) }
    : { matchedFood: null, status: 'noMatch', suggestions: [] }
}

export function buildPhotoIngredientMatchSummary(items = []) {
  const matches = items.map((item) => ({
    id: item.id,
    name: item.name,
    ...matchPhotoIngredientToDatabase(item),
  }))
  const counts = matches.reduce((summary, match) => {
    summary[match.status] = (summary[match.status] || 0) + 1
    return summary
  }, { exactMatch: 0, multipleMatches: 0, noMatch: 0, normalizedMatch: 0 })

  return { counts, matches }
}

export function buildPhotoIngredientMatchStatusCounts(items = [], matches = []) {
  return items.filter(Boolean).reduce((counts, item) => {
    const match = matches.find((entry) => entry.id === item.id)
    if (item.dataSource === 'nutritionDatabase') counts.manualDatabase += 1
    else if (match?.status === 'exactMatch') counts.exactMatch += 1
    else if (match?.status === 'normalizedMatch') counts.normalizedMatch += 1
    else if (match?.status === 'multipleMatches') counts.needsSelection += 1
    else counts.aiEstimate += 1
    counts.total += 1
    return counts
  }, {
    aiEstimate: 0,
    exactMatch: 0,
    manualDatabase: 0,
    needsSelection: 0,
    normalizedMatch: 0,
    total: 0,
  })
}

export function applyPhotoIngredientDatabaseSuggestion(item = {}, suggestion = {}) {
  if (!suggestion?.nutritionPer100g || item.userEdited) return item
  const amount = Number(item.estimatedAmount)
  const factor = Number.isFinite(amount) && amount > 0 ? amount / 100 : 1

  return {
    ...item,
    calories: Number((suggestion.nutritionPer100g.calories * factor).toFixed(1)),
    carbohydrates: Number((suggestion.nutritionPer100g.carbs * factor).toFixed(1)),
    dataSource: 'nutritionDatabase',
    fat: Number((suggestion.nutritionPer100g.fat * factor).toFixed(1)),
    name: suggestion.name,
    protein: Number((suggestion.nutritionPer100g.protein * factor).toFixed(1)),
  }
}

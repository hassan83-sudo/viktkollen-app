import { getNutritionAliases } from './nutrition/nutritionDatabase.js'

export const photoIngredientMatchStatuses = ['exactMatch', 'normalizedMatch', 'multipleMatches', 'noMatch']

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

export function matchPhotoIngredientToDatabase(item = {}, options = {}) {
  const maxSuggestions = options.maxSuggestions || 4
  const name = String(item.name || '')
  const normalizedName = normalizePhotoIngredientName(name)
  if (!normalizedName) {
    return { matchedFood: null, status: 'noMatch', suggestions: [] }
  }

  const aliases = getNutritionAliases().map((entry) => ({
    ...entry,
    normalizedAlias: normalizePhotoIngredientName(entry.alias),
  }))
  const exact = uniqueFoods(aliases.filter((entry) => entry.alias.toLocaleLowerCase('sv-SE') === name.toLocaleLowerCase('sv-SE')))
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
    normalizedName.includes(entry.normalizedAlias) || entry.normalizedAlias.includes(normalizedName)))

  return contained.length
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

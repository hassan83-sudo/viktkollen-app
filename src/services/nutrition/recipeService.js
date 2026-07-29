import { evaluateMealTemplateCompatibility, filterTemplatesByDietaryPreferences } from './dietaryPreferences.js'
import { getEffectiveMealNutrition, normalizeNutritionOverride, parseCorrectionNumber } from './mealCorrections.js'
import { createPlannedMealFromDraft } from './mealPlanner.js'

export const recipeStorageKey = 'viktkollen.recipes'
export const recipeCategories = ['Frukost', 'Lunch', 'Middag', 'Mellanmål', 'Kvällsmål', 'Vegetariskt', 'Snabbt', 'Annat']
export const recipeUnits = ['g', 'kg', 'ml', 'l', 'dl', 'st', 'msk', 'tsk', 'paket']

const maxTextLength = 2000
const maxShortTextLength = 160
const dateFallback = '1970-01-01T00:00:00.000Z'

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function normalizeText(value, maxLength = maxShortTextLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function normalizeLongText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxTextLength)
}

function normalizeComparableText(value) {
  return normalizeText(value, 500)
    .toLocaleLowerCase('sv-SE')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
}

function createId(prefix = 'recipe', seed = Date.now()) {
  return `${prefix}-${seed}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeIso(value, fallback = new Date().toISOString()) {
  const date = new Date(value || fallback)

  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function normalizePositiveNumber(value, fallback = 0) {
  const parsed = parseCorrectionNumber(value)

  return parsed !== null && parsed >= 0 ? parsed : fallback
}

function normalizeServings(value) {
  const parsed = normalizePositiveNumber(value, 1)

  return parsed > 0 ? Math.min(50, Math.round(parsed)) : 1
}

function normalizeCategory(value) {
  const text = normalizeText(value)
  const match = recipeCategories.find((category) => category.toLocaleLowerCase('sv-SE') === text.toLocaleLowerCase('sv-SE'))

  return match || 'Annat'
}

function normalizeUnit(value) {
  const unit = normalizeText(value, 20).toLocaleLowerCase('sv-SE')

  return recipeUnits.includes(unit) ? unit : ''
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,\n]/)
  const seen = new Set()

  return source
    .map((tag) => normalizeText(tag, 40))
    .filter(Boolean)
    .filter((tag) => {
      const key = normalizeComparableText(tag)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 20)
}

export function parseRecipeIngredient(value = {}) {
  if (isObject(value)) return normalizeRecipeIngredient(value)

  const text = normalizeText(value, 240)
  if (!text) return null

  const match = text.match(/^(\d+(?:[,.]\d+)?)\s*(kg|g|ml|l|dl|st|msk|tsk|paket)\s+(.+)$/i) ||
    text.match(/^(\d+(?:[,.]\d+)?)\s+(.+)$/i)
  const amount = match ? normalizePositiveNumber(match[1], 0) : 0
  const unit = match?.[3] ? normalizeUnit(match[2]) : match ? 'st' : ''
  const name = normalizeText(match?.[3] || match?.[2] || text)

  return normalizeRecipeIngredient({ amount, name, unit })
}

export function normalizeRecipeIngredient(ingredient = {}) {
  if (!isObject(ingredient)) return null

  const name = normalizeText(ingredient.name)
  if (!name) return null

  return {
    amount: normalizePositiveNumber(ingredient.amount, 0),
    comment: normalizeText(ingredient.comment, 240),
    name,
    unit: normalizeUnit(ingredient.unit),
  }
}

function normalizeIngredientList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,]/)

  return source
    .map((ingredient) => parseRecipeIngredient(ingredient))
    .filter(Boolean)
    .slice(0, 80)
}

export function formatRecipeIngredient(ingredient = {}) {
  const normalized = normalizeRecipeIngredient(ingredient)
  if (!normalized) return ''

  const amount = normalized.amount > 0 ? `${normalized.amount.toLocaleString('sv-SE')}${normalized.unit ? ` ${normalized.unit}` : ''} ` : ''

  return `${amount}${normalized.name}${normalized.comment ? ` (${normalized.comment})` : ''}`.trim()
}

function recipeIngredientNutritionText(recipe = {}) {
  return normalizeIngredientList(recipe.ingredients).map(formatRecipeIngredient).filter(Boolean).join(', ')
}

function recipeAsTemplate(recipe = {}) {
  const normalized = normalizeRecipe(recipe)
  if (!normalized) return null

  return {
    id: normalized.id,
    isFavorite: normalized.favorite,
    mealType: normalized.category,
    name: normalized.name,
    tags: normalized.tags,
    text: [normalized.description, recipeIngredientNutritionText(normalized), normalized.instructions].filter(Boolean).join(', '),
  }
}

export function calculateRecipeNutrition(recipe = {}) {
  const normalized = normalizeRecipe(recipe)
  if (!normalized) {
    return {
      known: false,
      perServing: { calories: 0, carbs: 0, fat: 0, protein: 0 },
      totals: { calories: 0, carbs: 0, fat: 0, protein: 0 },
    }
  }

  const text = recipeIngredientNutritionText(normalized) || normalized.description || normalized.name
  const effective = getEffectiveMealNutrition({
    description: text,
    name: normalized.name,
    nutritionOverride: normalized.nutritionOverride,
    text,
    type: normalized.category,
  })
  const totals = ['calories', 'protein', 'carbs', 'fat'].reduce((result, field) => {
    const value = effective.totals[field]
    result[field] = Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0
    return result
  }, {})
  const perServing = Object.fromEntries(Object.entries(totals).map(([field, value]) => [
    field,
    Math.round((value / normalized.servings) * 10) / 10,
  ]))

  return {
    known: Object.values(totals).some((value) => value > 0),
    perServing,
    source: effective.source,
    totals,
  }
}

export function calculateRecipeNutritionPerServing(recipe = {}) {
  return calculateRecipeNutrition(recipe)
}

export function normalizeRecipe(recipe = {}, options = {}) {
  if (!isObject(recipe)) return null

  const name = normalizeText(recipe.name || recipe.namn)
  if (!name) return null

  const now = options.now || new Date().toISOString()
  const createdAt = normalizeIso(recipe.createdAt, now)
  const updatedAt = normalizeIso(recipe.updatedAt, createdAt)

  return {
    category: normalizeCategory(recipe.category || recipe.kategori),
    cookingTimeMinutes: normalizePositiveNumber(recipe.cookingTimeMinutes ?? recipe.cookingTime ?? recipe.tillagningstid, 0),
    createdAt: createdAt || dateFallback,
    description: normalizeLongText(recipe.description || recipe.beskrivning),
    favorite: Boolean(recipe.favorite || recipe.isFavorite || recipe.favorit),
    id: normalizeText(recipe.id, 120) || createId('recipe', createdAt),
    ingredients: normalizeIngredientList(recipe.ingredients || recipe.ingredienser),
    instructions: normalizeLongText(recipe.instructions || recipe.instruktioner),
    name,
    nutritionOverride: normalizeNutritionOverride(recipe.nutritionOverride),
    servings: normalizeServings(recipe.servings ?? recipe.portions ?? recipe.portioner),
    tags: normalizeTags(recipe.tags || recipe.taggar),
    updatedAt: updatedAt || createdAt || dateFallback,
  }
}

export function normalizeRecipes(recipes = []) {
  const seen = new Set()

  return (Array.isArray(recipes) ? recipes : [])
    .map((recipe) => normalizeRecipe(recipe))
    .filter(Boolean)
    .filter((recipe) => {
      if (seen.has(recipe.id)) return false
      seen.add(recipe.id)
      return true
    })
    .sort(sortRecipes)
}

export function sortRecipes(first, second, mode = 'updated') {
  if (mode === 'name') return first.name.localeCompare(second.name, 'sv-SE')
  if (mode === 'protein') {
    return calculateRecipeNutrition(second).perServing.protein - calculateRecipeNutrition(first).perServing.protein
  }
  if (mode === 'time') return first.cookingTimeMinutes - second.cookingTimeMinutes || first.name.localeCompare(second.name, 'sv-SE')
  if (first.favorite !== second.favorite) return first.favorite ? -1 : 1

  return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime() || first.name.localeCompare(second.name, 'sv-SE')
}

export function filterRecipes(recipes = [], filters = {}) {
  const normalized = normalizeRecipes(recipes)
  const search = normalizeComparableText(filters.search)
  const category = normalizeText(filters.category || 'Alla')
  const favoriteOnly = filters.favoriteOnly || category === 'Favoriter'
  const source = favoriteOnly ? normalized.filter((recipe) => recipe.favorite) : normalized

  return source
    .filter((recipe) => category === 'Alla' || category === 'Favoriter' || recipe.category === category)
    .filter((recipe) => {
      if (!search) return true

      return normalizeComparableText([
        recipe.name,
        recipe.description,
        recipe.category,
        recipe.instructions,
        recipe.tags.join(' '),
        recipe.ingredients.map((ingredient) => ingredient.name).join(' '),
      ].join(' ')).includes(search)
    })
    .sort((first, second) => sortRecipes(first, second, filters.sort || 'updated'))
}

export function readRecipes(storage) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return []

  try {
    return normalizeRecipes(JSON.parse(resolvedStorage.getItem(recipeStorageKey) || '[]'))
  } catch {
    return []
  }
}

export function writeRecipes(recipes, storage) {
  const normalized = normalizeRecipes(recipes)
  const resolvedStorage = getStorage(storage)

  if (!resolvedStorage) return normalized

  try {
    resolvedStorage.setItem(recipeStorageKey, JSON.stringify(normalized))
  } catch {
    return normalized
  }

  return normalized
}

export function validateRecipeDraft(draft = {}) {
  const errors = {}

  if (!normalizeText(draft.name)) errors.name = 'Ge receptet ett namn.'
  if (normalizeServings(draft.servings ?? draft.portioner) <= 0) errors.servings = 'Ange minst en portion.'
  if (draft.cookingTimeMinutes && normalizePositiveNumber(draft.cookingTimeMinutes, -1) < 0) errors.cookingTimeMinutes = 'Ange en giltig tid.'
  if (!normalizeIngredientList(draft.ingredients).length) errors.ingredients = 'Lägg till minst en ingrediens.'

  return errors
}

export function createRecipe(draft = {}, options = {}) {
  const errors = validateRecipeDraft(draft)
  if (Object.keys(errors).length) return { errors, recipe: null }

  const now = options.now || new Date().toISOString()
  return {
    errors: {},
    recipe: normalizeRecipe({
      ...draft,
      createdAt: now,
      id: draft.id || createId('recipe', now),
      updatedAt: now,
    }, { now }),
  }
}

export function updateRecipe(recipes = [], recipeId, patch = {}, options = {}) {
  const now = options.now || new Date().toISOString()
  const normalized = normalizeRecipes(recipes)
  const existing = normalized.find((recipe) => recipe.id === recipeId)
  if (!existing) return normalized

  const nextRecipe = normalizeRecipe({ ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: now }, { now })
  const errors = validateRecipeDraft(nextRecipe)
  if (Object.keys(errors).length) return normalized

  return normalizeRecipes([nextRecipe, ...normalized.filter((recipe) => recipe.id !== recipeId)])
}

export function deleteRecipe(recipes = [], recipeId) {
  return normalizeRecipes(recipes).filter((recipe) => recipe.id !== recipeId)
}

export function duplicateRecipe(recipes = [], recipeId, options = {}) {
  const normalized = normalizeRecipes(recipes)
  const existing = normalized.find((recipe) => recipe.id === recipeId)
  if (!existing) return normalized

  const now = options.now || new Date().toISOString()
  const copy = normalizeRecipe({
    ...existing,
    createdAt: now,
    favorite: false,
    id: createId('recipe', now),
    name: `${existing.name} kopia`,
    updatedAt: now,
  }, { now })

  return normalizeRecipes([copy, ...normalized])
}

export function toggleRecipeFavorite(recipes = [], recipeId, options = {}) {
  const normalized = normalizeRecipes(recipes)
  const existing = normalized.find((recipe) => recipe.id === recipeId)
  if (!existing) return normalized

  return updateRecipe(normalized, recipeId, { favorite: !existing.favorite }, options)
}

export function recipeToMealTemplateDraft(recipe = {}) {
  const normalized = normalizeRecipe(recipe)
  if (!normalized) return null

  const nutrition = calculateRecipeNutrition(normalized)

  return {
    correctionNote: 'Skapad från recept.',
    defaultTime: '',
    isFavorite: normalized.favorite,
    mealType: normalized.category,
    name: normalized.name,
    nutritionOverride: nutrition.perServing,
    text: [normalized.description, recipeIngredientNutritionText(normalized)].filter(Boolean).join(', ') || normalized.name,
  }
}

export function recipeToPlannedMeal(recipe = {}, options = {}) {
  const normalized = normalizeRecipe(recipe)
  if (!normalized) return { errors: { recipe: 'Receptet kunde inte läsas.' }, meal: null }

  const draft = recipeToMealTemplateDraft(normalized)

  return createPlannedMealFromDraft({
    ...draft,
    date: options.date,
    ingredients: recipeToShoppingIngredients(normalized).map(formatRecipeIngredient),
    notes: options.notes || 'Planerad från recept.',
    scheduledTime: options.scheduledTime || '',
    sourceId: normalized.id,
    sourceType: 'recipe',
    title: normalized.name,
  }, options.now || new Date().toISOString())
}

export function recipeToShoppingIngredients(recipe = {}) {
  return normalizeIngredientList(recipe.ingredients)
}

export function filterRecipesByDietaryPreferences(recipes = [], dietaryPreferences = {}) {
  const templates = normalizeRecipes(recipes).map(recipeAsTemplate).filter(Boolean)
  const compatibleIds = new Set(filterTemplatesByDietaryPreferences(templates, dietaryPreferences).map((template) => template.id))

  return normalizeRecipes(recipes).filter((recipe) => compatibleIds.has(recipe.id))
}

export function evaluateRecipeDietaryCompatibility(recipe = {}, dietaryPreferences = {}) {
  const template = recipeAsTemplate(recipe)

  return evaluateMealTemplateCompatibility(template || {}, dietaryPreferences)
}

export function buildRecipeAiSummary(recipes = [], dietaryPreferences = {}) {
  const normalized = normalizeRecipes(recipes)
  const compatible = filterRecipesByDietaryPreferences(normalized, dietaryPreferences)
  const favorites = normalized.filter((recipe) => recipe.favorite)
  const proteinRich = [...normalized]
    .sort((first, second) => calculateRecipeNutrition(second).perServing.protein - calculateRecipeNutrition(first).perServing.protein)
    .filter((recipe) => calculateRecipeNutrition(recipe).perServing.protein >= 20)

  return {
    compatible,
    favorites,
    proteinRich,
    recipes: normalized,
  }
}

export const recipeServiceInternals = {
  normalizeComparableText,
  recipeIngredientNutritionText,
  recipeAsTemplate,
}

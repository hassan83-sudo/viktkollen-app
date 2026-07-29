import { describe, expect, it, vi } from 'vitest'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  buildRecipeAiSummary,
  calculateRecipeNutrition,
  createRecipe,
  deleteRecipe,
  duplicateRecipe,
  evaluateRecipeDietaryCompatibility,
  filterRecipes,
  filterRecipesByDietaryPreferences,
  formatRecipeIngredient,
  normalizeRecipe,
  normalizeRecipeIngredient,
  normalizeRecipes,
  parseRecipeIngredient,
  readRecipes,
  recipeServiceInternals,
  recipeStorageKey,
  recipeToMealTemplateDraft,
  recipeToPlannedMeal,
  recipeToShoppingIngredients,
  toggleRecipeFavorite,
  updateRecipe,
  validateRecipeDraft,
  writeRecipes,
} from './nutritionEngine.js'

function createStorage(seed = {}) {
  const data = new Map(Object.entries(seed))

  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    removeItem: vi.fn((key) => data.delete(key)),
    setItem: vi.fn((key, value) => data.set(key, value)),
  }
}

const chickenRecipe = {
  category: 'Middag',
  cookingTimeMinutes: 35,
  createdAt: '2026-01-01T10:00:00.000Z',
  description: 'Enkel vardagslåda',
  favorite: true,
  id: 'recipe-chicken',
  ingredients: [
    { amount: 200, name: 'kyckling', unit: 'g' },
    { amount: 300, name: 'potatis', unit: 'g' },
    { amount: 100, name: 'broccoli', unit: 'g' },
  ],
  instructions: 'Tillaga och fördela i lådor.',
  name: 'Kyckling med potatis',
  servings: 2,
  tags: ['proteinrik', 'vardag'],
  updatedAt: '2026-01-02T10:00:00.000Z',
}

const veggieRecipe = {
  ...chickenRecipe,
  category: 'Vegetariskt',
  favorite: false,
  id: 'recipe-veggie',
  ingredients: [
    { amount: 2, name: 'ägg', unit: 'st' },
    { amount: 200, name: 'potatis', unit: 'g' },
    { amount: 150, name: 'broccoli', unit: 'g' },
  ],
  name: 'Ägg och potatis',
  tags: ['vegetarisk'],
  updatedAt: '2026-01-03T10:00:00.000Z',
}

const fastRecipe = {
  ...chickenRecipe,
  favorite: false,
  id: 'recipe-burger',
  ingredients: ['2 hamburgare', '150 g pommes', '500 ml läsk'],
  name: 'Hamburgare med pommes',
  tags: ['helg'],
  updatedAt: '2026-01-04T10:00:00.000Z',
}

describe('Recipe storage and normalization', () => {
  it('uses its own storage key', () => {
    expect(recipeStorageKey).toBe('viktkollen.recipes')
  })

  it('normalizes a recipe without mutating meal/template shape', () => {
    const recipe = normalizeRecipe(chickenRecipe)

    expect(recipe.id).toBe('recipe-chicken')
    expect(recipe.ingredients).toHaveLength(3)
    expect(recipe).not.toHaveProperty('mealType')
    expect(recipe).not.toHaveProperty('text')
  })

  it('drops invalid recipes', () => {
    expect(normalizeRecipes([null, {}, { name: '' }])).toEqual([])
  })

  it('deduplicates recipe ids', () => {
    expect(normalizeRecipes([chickenRecipe, { ...chickenRecipe, name: 'Kopia' }])).toHaveLength(1)
  })

  it('keeps favorites before updated sort', () => {
    expect(normalizeRecipes([veggieRecipe, chickenRecipe])[0].id).toBe('recipe-chicken')
  })

  it('reads recipes from storage', () => {
    const storage = createStorage({ [recipeStorageKey]: JSON.stringify([chickenRecipe]) })

    expect(readRecipes(storage)[0].name).toBe('Kyckling med potatis')
  })

  it('returns empty list for malformed storage', () => {
    expect(readRecipes(createStorage({ [recipeStorageKey]: '{bad' }))).toEqual([])
  })

  it('returns empty list when storage is missing', () => {
    expect(readRecipes(null)).toEqual([])
  })

  it('survives storage get errors', () => {
    const storage = { getItem: vi.fn(() => { throw new Error('bad storage') }) }

    expect(readRecipes(storage)).toEqual([])
  })

  it('writes normalized recipes to storage', () => {
    const storage = createStorage()
    const written = writeRecipes([chickenRecipe], storage)

    expect(written).toHaveLength(1)
    expect(storage.setItem).toHaveBeenCalledWith(recipeStorageKey, expect.stringContaining('Kyckling med potatis'))
  })

  it('returns normalized recipes when storage write fails', () => {
    const storage = { setItem: vi.fn(() => { throw new Error('full') }) }

    expect(writeRecipes([chickenRecipe], storage)).toHaveLength(1)
  })

  it.each([
    ['Swedish aliases', { namn: 'Svenskt recept', kategori: 'Lunch', portioner: 3, tillagningstid: 15, ingredienser: ['200 g torsk'] }, 'Svenskt recept'],
    ['unknown category', { ...chickenRecipe, category: 'Brunch' }, 'Kyckling med potatis'],
    ['string tags', { ...chickenRecipe, tags: 'proteinrik, vardag, proteinrik' }, 'Kyckling med potatis'],
    ['long text', { ...chickenRecipe, description: 'a'.repeat(3000) }, 'Kyckling med potatis'],
    ['invalid dates', { ...chickenRecipe, createdAt: 'bad', updatedAt: 'bad' }, 'Kyckling med potatis'],
  ])('normalizes %s', (_, input, expectedName) => {
    expect(normalizeRecipe(input).name).toBe(expectedName)
  })

  it('normalizes Swedish recipe aliases into canonical fields', () => {
    const recipe = normalizeRecipe({ namn: 'Fisk', kategori: 'Lunch', portioner: 2, ingredienser: ['200 g torsk'] })

    expect(recipe.category).toBe('Lunch')
    expect(recipe.servings).toBe(2)
    expect(recipe.ingredients[0].name).toBe('torsk')
  })

  it('keeps tag values unique', () => {
    expect(normalizeRecipe({ ...chickenRecipe, tags: ['Vardag', 'vardag', 'Protein'] }).tags).toEqual(['Vardag', 'Protein'])
  })

  it('limits large ingredient lists', () => {
    const recipe = normalizeRecipe({ ...chickenRecipe, ingredients: Array.from({ length: 100 }, (_, index) => `${index + 1} g ris`) })

    expect(recipe.ingredients).toHaveLength(80)
  })
})

describe('Recipe ingredient parsing', () => {
  it.each([
    ['200 g kyckling', 'kyckling', 200, 'g'],
    ['1 kg potatis', 'potatis', 1, 'kg'],
    ['300 ml mjölk', 'mjölk', 300, 'ml'],
    ['2 dl ris', 'ris', 2, 'dl'],
    ['2 ägg', 'ägg', 2, 'st'],
    ['1 msk olivolja', 'olivolja', 1, 'msk'],
    ['1 tsk salt', 'salt', 1, 'tsk'],
    ['1 paket torsk', 'torsk', 1, 'paket'],
    ['broccoli', 'broccoli', 0, ''],
    ['0,5 kg lax', 'lax', 0.5, 'kg'],
    ['150 g pommes', 'pommes', 150, 'g'],
    ['500 ml läsk', 'läsk', 500, 'ml'],
  ])('parses "%s"', (line, name, amount, unit) => {
    const ingredient = parseRecipeIngredient(line)

    expect(ingredient.name).toBe(name)
    expect(ingredient.amount).toBe(amount)
    expect(ingredient.unit).toBe(unit)
  })

  it.each([
    [{ name: ' Kyckling ', amount: '200', unit: 'g', comment: 'stekt' }, '200 g Kyckling (stekt)'],
    [{ name: 'Ägg', amount: 2, unit: 'st' }, '2 st Ägg'],
    [{ name: 'Salt', amount: 0, unit: 'tsk' }, 'Salt'],
    [{ name: 'Ris', amount: '1,5', unit: 'dl' }, '1,5 dl Ris'],
  ])('formats ingredient %#', (input, expected) => {
    expect(formatRecipeIngredient(input)).toBe(expected)
  })

  it('rejects empty ingredient objects', () => {
    expect(normalizeRecipeIngredient({ amount: 1 })).toBeNull()
  })

  it('limits unsupported units to empty unit', () => {
    expect(normalizeRecipeIngredient({ amount: 2, name: 'kyckling', unit: 'skopa' }).unit).toBe('')
  })
})

describe('Recipe CRUD', () => {
  it('validates required name', () => {
    expect(validateRecipeDraft({ ingredients: ['200 g kyckling'] }).name).toBeTruthy()
  })

  it('validates required ingredient', () => {
    expect(validateRecipeDraft({ name: 'Tomt' }).ingredients).toBeTruthy()
  })

  it('creates a recipe', () => {
    const result = createRecipe(chickenRecipe, { now: '2026-02-01T10:00:00.000Z' })

    expect(result.errors).toEqual({})
    expect(result.recipe.createdAt).toBe('2026-02-01T10:00:00.000Z')
  })

  it('does not create invalid recipes', () => {
    expect(createRecipe({ name: '' }).recipe).toBeNull()
  })

  it('updates a recipe', () => {
    const recipes = updateRecipe([chickenRecipe], 'recipe-chicken', { name: 'Ny kyckling' }, { now: '2026-02-02T10:00:00.000Z' })

    expect(recipes[0].name).toBe('Ny kyckling')
    expect(recipes[0].updatedAt).toBe('2026-02-02T10:00:00.000Z')
  })

  it('ignores update for missing recipe', () => {
    expect(updateRecipe([chickenRecipe], 'missing', { name: 'Nope' })[0].name).toBe(chickenRecipe.name)
  })

  it('deletes a recipe', () => {
    expect(deleteRecipe([chickenRecipe, veggieRecipe], 'recipe-chicken')).toHaveLength(1)
  })

  it('duplicates a recipe without keeping favorite state', () => {
    const recipes = duplicateRecipe([chickenRecipe], 'recipe-chicken', { now: '2026-02-03T10:00:00.000Z' })

    expect(recipes).toHaveLength(2)
    expect(recipes.find((recipe) => recipe.name.includes('kopia')).favorite).toBe(false)
  })

  it('ignores duplicate for missing recipe', () => {
    expect(duplicateRecipe([chickenRecipe], 'missing')).toHaveLength(1)
  })

  it('toggles favorite', () => {
    expect(toggleRecipeFavorite([veggieRecipe], 'recipe-veggie')[0].favorite).toBe(true)
  })
})

describe('Recipe filtering and sorting', () => {
  const recipes = [fastRecipe, veggieRecipe, chickenRecipe]

  it.each([
    ['searches by name', { search: 'potatis' }, 2],
    ['searches by ingredient', { search: 'pommes' }, 1],
    ['filters category', { category: 'Vegetariskt' }, 1],
    ['filters favorites', { category: 'Favoriter' }, 1],
    ['handles empty search', { search: '' }, 3],
  ])('%s', (_, filters, count) => {
    expect(filterRecipes(recipes, filters)).toHaveLength(count)
  })

  it('sorts by name', () => {
    expect(filterRecipes(recipes, { sort: 'name' })[0].name).toBe('Hamburgare med pommes')
  })

  it('sorts by cooking time', () => {
    expect(filterRecipes([{ ...chickenRecipe, cookingTimeMinutes: 45 }, { ...veggieRecipe, cookingTimeMinutes: 10 }], { sort: 'time' })[0].id).toBe('recipe-veggie')
  })

  it('sorts by protein per serving', () => {
    expect(filterRecipes(recipes, { sort: 'protein' })[0].id).toBe('recipe-chicken')
  })
})

describe('Recipe nutrition', () => {
  it.each([
    ['chicken recipe', chickenRecipe, 30],
    ['egg recipe', veggieRecipe, 8],
    ['fast food recipe', fastRecipe, 20],
    ['manual override', { ...veggieRecipe, nutritionOverride: { calories: 400, protein: 40 } }, 20],
  ])('calculates protein for %s', (_, recipe, minimumProtein) => {
    expect(calculateRecipeNutrition(recipe).perServing.protein).toBeGreaterThanOrEqual(minimumProtein)
  })

  it('calculates total and per-serving values', () => {
    const nutrition = calculateRecipeNutrition(chickenRecipe)

    expect(nutrition.totals.protein).toBeGreaterThan(nutrition.perServing.protein)
    expect(nutrition.perServing.calories).toBeGreaterThan(100)
  })

  it('returns safe empty nutrition for invalid recipe', () => {
    expect(calculateRecipeNutrition(null).known).toBe(false)
  })

  it('does not expose NaN in calculated values', () => {
    const nutrition = calculateRecipeNutrition({ ...chickenRecipe, servings: 0 })

    expect(Object.values(nutrition.perServing).every(Number.isFinite)).toBe(true)
  })
})

describe('Recipe integrations', () => {
  it('creates a meal template draft from recipe', () => {
    const draft = recipeToMealTemplateDraft(chickenRecipe)

    expect(draft.name).toBe(chickenRecipe.name)
    expect(draft.nutritionOverride.protein).toBeGreaterThan(30)
  })

  it('creates a planned meal from recipe', () => {
    const result = recipeToPlannedMeal(chickenRecipe, { date: '2026-02-04', now: '2026-02-04T10:00:00.000Z' })

    expect(result.meal.sourceType).toBe('recipe')
    expect(result.meal.sourceId).toBe('recipe-chicken')
    expect(result.meal.ingredients).toContain('200 g kyckling')
  })

  it('returns recipe ingredients for shopping list integration', () => {
    expect(recipeToShoppingIngredients(chickenRecipe).map((ingredient) => ingredient.name)).toContain('potatis')
  })

  it('builds recipe AI summary', () => {
    const summary = buildRecipeAiSummary([chickenRecipe, veggieRecipe], {})

    expect(summary.favorites[0].id).toBe('recipe-chicken')
    expect(summary.proteinRich[0].id).toBe('recipe-chicken')
  })

  it.each([
    ['vegetarian allows egg recipe', veggieRecipe, { dietType: 'vegetarian' }, true],
    ['vegetarian blocks chicken', chickenRecipe, { dietType: 'vegetarian' }, false],
    ['lactose free allows chicken', chickenRecipe, { preferences: { lactoseFree: true } }, true],
    ['gluten free blocks burger', fastRecipe, { preferences: { glutenFree: true } }, false],
    ['avoided food blocks potato', veggieRecipe, { avoidedFoods: ['potatis'] }, false],
  ])('%s', (_, recipe, preferences, compatible) => {
    expect(evaluateRecipeDietaryCompatibility(recipe, preferences).compatible).toBe(compatible)
  })

  it('filters recipes by dietary preferences', () => {
    expect(filterRecipesByDietaryPreferences([chickenRecipe, veggieRecipe], { dietType: 'vegetarian' }).map((recipe) => recipe.id)).toEqual(['recipe-veggie'])
  })

  it('exposes recipe text for compatibility tests', () => {
    expect(recipeServiceInternals.recipeIngredientNutritionText(chickenRecipe)).toContain('kyckling')
  })

  it.each([
    ['template keeps favorite', recipeToMealTemplateDraft(chickenRecipe), true],
    ['template keeps category', recipeToMealTemplateDraft(chickenRecipe), 'Middag'],
    ['template includes ingredient text', recipeToMealTemplateDraft(chickenRecipe), 'kyckling'],
    ['shopping keeps amount', recipeToShoppingIngredients(chickenRecipe)[0], 200],
    ['shopping keeps unit', recipeToShoppingIngredients(chickenRecipe)[0], 'g'],
    ['planner keeps recipe note', recipeToPlannedMeal(chickenRecipe, { date: '2026-02-04' }).meal, 'Planerad från recept.'],
    ['planner keeps nutrition preview', recipeToPlannedMeal(chickenRecipe, { date: '2026-02-04' }).meal.nutritionPreview, 'protein'],
  ])('maps %s', (_, value, expected) => {
    if (expected === true) expect(value.isFavorite).toBe(true)
    else if (expected === 'Middag') expect(value.mealType).toBe('Middag')
    else if (expected === 'kyckling') expect(value.text).toContain('kyckling')
    else if (expected === 200) expect(value.amount).toBe(200)
    else if (expected === 'g') expect(value.unit).toBe('g')
    else if (expected === 'Planerad från recept.') expect(value.notes).toBe(expected)
    else expect(value[expected]).toBeGreaterThan(0)
  })

  it.each([
    ['omnivore keeps all', {}, 2],
    ['vegetarian keeps egg recipe', { dietType: 'vegetarian' }, 1],
    ['vegan blocks egg and chicken', { dietType: 'vegan' }, 0],
    ['preferred broccoli keeps order stable', { preferredFoods: ['broccoli'] }, 2],
    ['avoid chicken removes chicken', { avoidedFoods: ['kyckling'] }, 1],
  ])('filters dietary scenario %s', (_, preferences, count) => {
    expect(filterRecipesByDietaryPreferences([chickenRecipe, veggieRecipe], preferences)).toHaveLength(count)
  })
})

describe('AI Coach recipe integration', () => {
  function coach(message, recipes = [chickenRecipe, veggieRecipe]) {
    return createDeterministicAiCoachReply({
      context: {
        dietaryPreferences: { dietType: 'vegetarian' },
        recipes,
      },
      message,
    })
  }

  it.each([
    ['Vilka favoritrecept har jag?', 'Kyckling med potatis'],
    ['Har jag något proteinrikt recept?', 'proteinrika recept'],
    ['Vilka vegetariska recept har jag?', 'Ägg och potatis'],
    ['Vilka recept matchar mina matval?', 'matchar dina matval'],
    ['Mina recept', 'sparade recept'],
  ])('answers "%s"', (message, expected) => {
    expect(coach(message)).toContain(expected)
  })

  it('handles empty recipe library', () => {
    expect(coach('Vilka recept har jag?', [])).toContain('inga sparade recept')
  })

  it('does not answer recipe intent for pizza logging', () => {
    expect(coach('Jag åt pizza idag.')).not.toContain('sparade recept')
  })
})

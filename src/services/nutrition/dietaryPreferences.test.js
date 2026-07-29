import { describe, expect, it } from 'vitest'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  buildMealSuggestions,
  buildNutritionActionPlan,
  clearDietaryPreferences,
  createUpdatedDietaryPreferences,
  dietaryPreferencesStorageKey,
  evaluateMealTemplateCompatibility,
  explainSuggestionCompatibility,
  filterMealSuggestionsByPreferences,
  filterTemplatesByDietaryPreferences,
  getDietaryPreferencesSummary,
  hasDietaryPreferences,
  isMealSuggestionCompatible,
  normalizeDietaryPreferences,
  rankMealSuggestionsByPreferences,
  readDietaryPreferences,
  updateDietaryPreferences,
  validateDietaryPreferences,
  writeDietaryPreferences,
} from './nutritionEngine.js'

function createStorage(initial = {}) {
  const state = new Map(Object.entries(initial))

  return {
    getItem: (key) => state.get(key) || null,
    removeItem: (key) => state.delete(key),
    setItem: (key, value) => state.set(key, value),
  }
}

const veganPreferences = { dietType: 'vegan' }
const vegetarianPreferences = { dietType: 'vegetarian' }
const pescatarianPreferences = { dietType: 'pescatarian' }
const lactoseFreePreferences = { preferences: { lactoseFree: true } }
const glutenFreePreferences = { preferences: { glutenFree: true } }
const halalPreferences = { preferences: { halalPreferred: true } }

const suggestions = [
  { description: 'Kyckling med ris', name: 'Kycklinglåda', tags: ['protein'] },
  { description: 'Bönor, tofu och ris', name: 'Tofuskål', tags: ['vegan', 'protein'] },
  { description: 'Kvarg med bär', name: 'Kvargskål', tags: ['protein', 'dairy'] },
  { description: 'Bröd med ost', name: 'Ostmacka', tags: ['gluten', 'dairy'] },
  { description: 'Lax med potatis', name: 'Laxmiddag', tags: ['fish'] },
  { description: 'Fläsk med potatis', name: 'Fläskmiddag', tags: ['pork'] },
]

const templates = [
  {
    id: 'chicken',
    mealType: 'Lunch',
    name: 'Kycklinglåda',
    nutritionOverride: { calories: 520, protein: 42 },
    text: 'Kyckling, ris och broccoli',
    useCount: 3,
  },
  {
    id: 'tofu',
    mealType: 'Middag',
    name: 'Tofu och ris',
    nutritionOverride: { calories: 480, protein: 28 },
    text: 'Tofu, ris och broccoli',
    useCount: 2,
  },
  {
    id: 'kvarg',
    mealType: 'Mellanmål',
    name: 'Kvargskål',
    nutritionOverride: { calories: 260, protein: 30 },
    text: 'Kvarg och bär',
    useCount: 4,
  },
  {
    id: 'salmon',
    mealType: 'Middag',
    name: 'Laxmiddag',
    nutritionOverride: { calories: 560, protein: 40 },
    text: 'Lax, potatis och gurka',
    useCount: 1,
  },
]

const lowProteinMeal = {
  date: '2026-07-29',
  id: 'low',
  name: 'Lätt frukost',
  nutritionOverride: { calories: 220, protein: 15 },
  time: '08:00',
  type: 'Frukost',
}

function coach(message, context = {}) {
  return createDeterministicAiCoachReply({
    context: {
      dietaryPreferences: veganPreferences,
      mealTemplates: templates,
      nutritionGoals: { protein: 110 },
      ...context,
    },
    message,
  })
}

describe('dietary preferences storage and normalization', () => {
  it('normalizes empty preferences', () => {
    expect(normalizeDietaryPreferences().dietType).toBe('omnivore')
  })

  it('normalizes invalid diet type to omnivore', () => {
    expect(normalizeDietaryPreferences({ dietType: 'bad' }).dietType).toBe('omnivore')
  })

  it('deduplicates avoided foods', () => {
    expect(normalizeDietaryPreferences({ avoidedFoods: ['mjölk', 'mjölk'] }).avoidedFoods).toEqual(['mjölk'])
  })

  it('parses avoided foods from comma text', () => {
    expect(normalizeDietaryPreferences({ avoidedFoods: 'mjölk, fläsk' }).avoidedFoods).toEqual(['mjölk', 'fläsk'])
  })

  it('parses preferred foods from comma text', () => {
    expect(normalizeDietaryPreferences({ preferredFoods: 'tofu, lax' }).preferredFoods).toEqual(['tofu', 'lax'])
  })

  it('normalizes nested boolean preferences', () => {
    expect(normalizeDietaryPreferences({ preferences: { glutenFree: true } }).preferences.glutenFree).toBe(true)
  })

  it('keeps notes as trimmed text', () => {
    expect(normalizeDietaryPreferences({ notes: '  enkelt  ' }).notes).toBe('enkelt')
  })

  it('detects no saved preferences for default omnivore', () => {
    expect(hasDietaryPreferences({})).toBe(false)
  })

  it.each([
    [{ dietType: 'vegan' }],
    [{ preferences: { lactoseFree: true } }],
    [{ preferences: { glutenFree: true } }],
    [{ preferences: { halalPreferred: true } }],
    [{ avoidedFoods: ['mjölk'] }],
    [{ preferredFoods: ['tofu'] }],
    [{ notes: 'Undviker stark mat' }],
  ])('detects saved preference %#', (preferences) => {
    expect(hasDietaryPreferences(preferences)).toBe(true)
  })

  it('builds readable summary', () => {
    expect(getDietaryPreferencesSummary({ dietType: 'vegan', avoidedFoods: ['mjölk'] })).toContain('veganskt')
  })

  it('returns empty summary for default preferences', () => {
    expect(getDietaryPreferencesSummary({})).toBe('')
  })

  it('creates updated preferences with timestamps', () => {
    const updated = createUpdatedDietaryPreferences({}, { dietType: 'vegetarian' })

    expect(updated.createdAt).toBeTruthy()
    expect(updated.updatedAt).toBeTruthy()
  })

  it('validates too many avoided foods', () => {
    const errors = validateDietaryPreferences({ avoidedFoods: Array.from({ length: 31 }, (_, index) => `mat-${index}`) })

    expect(errors.avoidedFoods).toBeTruthy()
  })

  it('validates too many preferred foods', () => {
    const errors = validateDietaryPreferences({ preferredFoods: Array.from({ length: 31 }, (_, index) => `mat-${index}`) })

    expect(errors.preferredFoods).toBeTruthy()
  })

  it('validates long note', () => {
    expect(validateDietaryPreferences({ notes: 'a'.repeat(501) }).notes).toBeTruthy()
  })

  it('reads default preferences when storage is empty', () => {
    expect(readDietaryPreferences(createStorage()).dietType).toBe('omnivore')
  })

  it('reads stored preferences', () => {
    const storage = createStorage({ [dietaryPreferencesStorageKey]: JSON.stringify({ dietType: 'vegan' }) })

    expect(readDietaryPreferences(storage).dietType).toBe('vegan')
  })

  it('handles broken storage JSON', () => {
    const storage = createStorage({ [dietaryPreferencesStorageKey]: '{bad' })

    expect(readDietaryPreferences(storage).dietType).toBe('omnivore')
  })

  it('writes preferences to storage', () => {
    const storage = createStorage()

    expect(writeDietaryPreferences({ dietType: 'vegetarian' }, storage).dietType).toBe('vegetarian')
    expect(readDietaryPreferences(storage).dietType).toBe('vegetarian')
  })

  it('updates preferences in storage', () => {
    const storage = createStorage()

    writeDietaryPreferences({ dietType: 'vegetarian' }, storage)
    expect(updateDietaryPreferences({ preferences: { glutenFree: true } }, storage).preferences.glutenFree).toBe(true)
  })

  it('clears preferences from storage', () => {
    const storage = createStorage()

    writeDietaryPreferences({ dietType: 'vegan' }, storage)
    expect(clearDietaryPreferences(storage).dietType).toBe('omnivore')
    expect(readDietaryPreferences(storage).dietType).toBe('omnivore')
  })
})

describe('dietary preference suggestion compatibility', () => {
  it.each([
    [veganPreferences, 'Kycklinglåda', false],
    [veganPreferences, 'Tofuskål', true],
    [veganPreferences, 'Kvargskål', false],
    [vegetarianPreferences, 'Kycklinglåda', false],
    [vegetarianPreferences, 'Tofuskål', true],
    [vegetarianPreferences, 'Laxmiddag', false],
    [pescatarianPreferences, 'Kycklinglåda', false],
    [pescatarianPreferences, 'Laxmiddag', true],
    [lactoseFreePreferences, 'Kvargskål', false],
    [glutenFreePreferences, 'Ostmacka', false],
    [halalPreferences, 'Fläskmiddag', false],
    [{ avoidedFoods: ['ris'] }, 'Tofuskål', false],
    [{ preferredFoods: ['tofu'] }, 'Tofuskål', true],
  ])('evaluates %s for %s', (preferences, name, expected) => {
    expect(isMealSuggestionCompatible(suggestions.find((suggestion) => suggestion.name === name), preferences)).toBe(expected)
  })

  it.each([
    [veganPreferences, ['Tofuskål']],
    [vegetarianPreferences, ['Tofuskål', 'Kvargskål', 'Ostmacka']],
    [pescatarianPreferences, ['Tofuskål', 'Kvargskål', 'Ostmacka', 'Laxmiddag']],
    [lactoseFreePreferences, ['Kycklinglåda', 'Tofuskål', 'Laxmiddag', 'Fläskmiddag']],
    [glutenFreePreferences, ['Kycklinglåda', 'Tofuskål', 'Kvargskål', 'Laxmiddag', 'Fläskmiddag']],
    [halalPreferences, ['Kycklinglåda', 'Tofuskål', 'Kvargskål', 'Ostmacka', 'Laxmiddag']],
    [{ avoidedFoods: ['ris'] }, ['Kvargskål', 'Ostmacka', 'Laxmiddag', 'Fläskmiddag']],
  ])('filters suggestions for %#', (preferences, expectedNames) => {
    expect(filterMealSuggestionsByPreferences(suggestions, preferences).map((suggestion) => suggestion.name)).toEqual(expectedNames)
  })

  it('explains compatible suggestions', () => {
    expect(explainSuggestionCompatibility(suggestions[1], veganPreferences)).toContain('matchar')
  })

  it('explains incompatible suggestions', () => {
    expect(explainSuggestionCompatibility(suggestions[0], veganPreferences)).toContain('filtreras bort')
  })

  it('ranks preferred foods first', () => {
    expect(rankMealSuggestionsByPreferences(suggestions, { preferredFoods: ['lax'] })[0].name).toBe('Laxmiddag')
  })

  it('keeps original order without preferred matches', () => {
    expect(rankMealSuggestionsByPreferences(suggestions, {}).map((suggestion) => suggestion.name)).toEqual(suggestions.map((suggestion) => suggestion.name))
  })

  it('handles malformed suggestion arrays', () => {
    expect(filterMealSuggestionsByPreferences([null, suggestions[1]], veganPreferences)).toHaveLength(1)
  })

  it('handles missing preferences without filtering', () => {
    expect(filterMealSuggestionsByPreferences(suggestions, {})).toHaveLength(suggestions.length)
  })
})

describe('dietary preference template compatibility', () => {
  it.each([
    [veganPreferences, 'chicken', false],
    [veganPreferences, 'tofu', true],
    [veganPreferences, 'kvarg', false],
    [vegetarianPreferences, 'chicken', false],
    [vegetarianPreferences, 'tofu', true],
    [vegetarianPreferences, 'salmon', false],
    [pescatarianPreferences, 'chicken', false],
    [pescatarianPreferences, 'salmon', true],
    [lactoseFreePreferences, 'kvarg', false],
    [{ avoidedFoods: ['broccoli'] }, 'tofu', false],
    [{ preferredFoods: ['tofu'] }, 'tofu', true],
  ])('evaluates template %# %s', (preferences, id, expected) => {
    expect(evaluateMealTemplateCompatibility(templates.find((template) => template.id === id), preferences).compatible).toBe(expected)
  })

  it.each([
    [veganPreferences, ['tofu']],
    [vegetarianPreferences, ['tofu', 'kvarg']],
    [pescatarianPreferences, ['tofu', 'kvarg', 'salmon']],
    [lactoseFreePreferences, ['chicken', 'tofu', 'salmon']],
    [{ avoidedFoods: ['ris'] }, ['kvarg', 'salmon']],
    [{}, ['chicken', 'tofu', 'kvarg', 'salmon']],
  ])('filters templates for %#', (preferences, expectedIds) => {
    expect(filterTemplatesByDietaryPreferences(templates, preferences).map((template) => template.id)).toEqual(expectedIds)
  })

  it('explains incompatible template', () => {
    expect(evaluateMealTemplateCompatibility(templates[0], veganPreferences).explanation).toContain('filtreras bort')
  })

  it('keeps preferred matches on template evaluation', () => {
    expect(evaluateMealTemplateCompatibility(templates[1], { preferredFoods: ['tofu'] }).preferredMatches).toEqual(['tofu'])
  })

  it('handles malformed templates safely', () => {
    expect(filterTemplatesByDietaryPreferences([null, templates[1]], veganPreferences)).toHaveLength(1)
  })
})

describe('dietary preferences in recommendation engine', () => {
  it('returns vegan meal suggestions for vegan preferences', () => {
    expect(buildMealSuggestions({ dietaryPreferences: veganPreferences }).map((item) => item.name).join(' ')).toMatch(/Bönor|Linsgryta/)
  })

  it('does not return egg suggestion for vegan preferences', () => {
    expect(buildMealSuggestions({ dietaryPreferences: veganPreferences }).map((item) => item.name).join(' ')).not.toContain('Ägg')
  })

  it('does not return dairy suggestion for lactose free preferences', () => {
    expect(buildMealSuggestions({ dietaryPreferences: lactoseFreePreferences }).map((item) => item.name).join(' ')).not.toMatch(/Kvarg|Keso/)
  })

  it('does not return pizza or bread style suggestion for gluten free preferences', () => {
    expect(buildMealSuggestions({ dietaryPreferences: glutenFreePreferences }).map((item) => item.description).join(' ')).not.toMatch(/bröd|pizza/i)
  })

  it('prioritizes compatible templates before library suggestions', () => {
    expect(buildMealSuggestions({ dietaryPreferences: veganPreferences, remainingProtein: 28, templates })[0].template.id).toBe('tofu')
  })

  it('skips incompatible template before library suggestions', () => {
    const chickenOnly = [templates[0]]

    expect(buildMealSuggestions({ dietaryPreferences: veganPreferences, remainingProtein: 42, templates: chickenOnly })[0].template).toBeUndefined()
  })

  it('action plan filters incompatible template suggestions', () => {
    const plan = buildNutritionActionPlan({
      date: '2026-07-29',
      dietaryPreferences: veganPreferences,
      meals: [lowProteinMeal],
      nutritionGoals: { protein: 110 },
      templates,
    })

    expect(JSON.stringify(plan.today)).not.toContain('Kycklinglåda')
  })

  it('action plan can use compatible template suggestion', () => {
    const plan = buildNutritionActionPlan({
      date: '2026-07-29',
      dietaryPreferences: veganPreferences,
      meals: [lowProteinMeal],
      nutritionGoals: { protein: 43 },
      templates,
    })

    expect(JSON.stringify(plan.today)).toContain('Tofu')
  })

  it('preferences do not change nutrition values', () => {
    const withoutPreferences = buildNutritionActionPlan({
      date: '2026-07-29',
      meals: [lowProteinMeal],
      nutritionGoals: { protein: 110 },
      templates,
    }).today.find((item) => item.relatedGoal === 'protein')
    const withPreferences = buildNutritionActionPlan({
      date: '2026-07-29',
      dietaryPreferences: veganPreferences,
      meals: [lowProteinMeal],
      nutritionGoals: { protein: 110 },
      templates,
    }).today.find((item) => item.relatedGoal === 'protein')

    expect(withPreferences.message).toBe(withoutPreferences.message)
  })

  it('weekly template recommendation uses compatible template count', () => {
    const meals = Array.from({ length: 6 }, (_, index) => ({
      ...lowProteinMeal,
      date: `2026-07-${String(20 + index).padStart(2, '0')}`,
      id: `meal-${index}`,
      nutritionOverride: { calories: 520, protein: 120 },
    }))
    const plan = buildNutritionActionPlan({
      date: '2026-07-25',
      dietaryPreferences: veganPreferences,
      meals,
      nutritionGoals: { protein: 110 },
      templates: [templates[0]],
    })

    expect(JSON.stringify(plan.thisWeek)).toContain('Skapa en snabb mall')
  })
})

describe('AI Coach dietary preference replies', () => {
  it.each([
    ['Vilka matpreferenser har jag sparat?', /veganskt|Måltidscenter/],
    ['Ge mig ett veganskt proteinförslag', /Bönor|Linsgryta|Tofu/],
    ['Ge mig vegetariska rekommendationer', /passar|Exempel/],
    ['Jag vill ha förslag utan laktos', /förslag|passar/],
    ['Jag vill ha förslag utan gluten', /förslag|passar/],
    ['Vilka måltidsmallar passar mina matval?', /Tofu/],
    ['Varför föreslår du inte min favoritmall?', /filtreras|matchar|mall/],
    ['Vilka matvaror ska jag undvika?', /inte sparat|undvika/],
    ['Kan jag ändra mina matpreferenser?', /Måltidscenter/],
    ['Jag har allergi, kan du filtrera?', /dubbelkolla/],
  ])('answers dietary preference question: %s', (message, expected) => {
    expect(coach(message)).toMatch(expected)
  })

  it('lists avoided foods from context', () => {
    expect(coach('Vilka matvaror ska jag undvika?', { dietaryPreferences: { avoidedFoods: ['mjölk'] } })).toContain('mjölk')
  })

  it('does not suggest chicken for vegan template question', () => {
    expect(coach('Vilka måltidsmallar passar mina matval?')).not.toContain('Kyckling')
  })

  it('combines preference and recommendation intents without raw placeholders', () => {
    expect(coach('Ge mig veganskt proteinförslag och vad bör jag fokusera på idag?')).not.toMatch(/NaN|undefined|null|\[object Object\]/)
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  addMealTemplate,
  buildMealTemplateDraft,
  createMealCopy,
  createMealFromTemplate,
  createMealTemplate,
  createMealTemplateFromMeal,
  deleteMealTemplate,
  filterMealTemplates,
  getMealTemplatePreview,
  getRecentUniqueMeals,
  markMealTemplateUsed,
  mealTemplateStorageKey,
  normalizeMealTemplate,
  normalizeMealTemplates,
  readMealTemplates,
  toggleMealTemplateFavorite,
  updateMealTemplate,
  updateStoredMealTemplate,
  validateMealTemplateDraft,
  writeMealTemplates,
} from './nutritionEngine.js'
import { calculateDailyNutritionSummary } from './dailyNutritionSummary.js'

function storageWith(value) {
  const state = { [mealTemplateStorageKey]: value }

  return {
    getItem: vi.fn((key) => state[key] ?? null),
    removeItem: vi.fn((key) => {
      delete state[key]
    }),
    setItem: vi.fn((key, nextValue) => {
      state[key] = nextValue
    }),
    state,
  }
}

const baseTemplate = {
  id: 'template-1',
  name: 'Kycklinglåda',
  text: 'Kyckling, ris och broccoli',
  mealType: 'Lunch',
  defaultTime: '12:15',
  nutritionOverride: {
    calories: 520,
    protein: 42,
    carbs: 54,
    fat: 12,
  },
  correctionNote: 'Standardlåda',
  isFavorite: true,
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
  lastUsedAt: '2026-07-03T10:00:00.000Z',
  useCount: 2,
}

const baseMeal = {
  id: 'meal-1',
  name: 'Pizza',
  description: 'Jag åt pizza',
  text: 'Jag åt pizza',
  type: 'Middag',
  date: '2026-07-20',
  time: '18:30',
  nutritionOverride: {
    calories: 850,
    protein: 32,
    carbs: 98,
    fat: 34,
  },
  correctionNote: 'Rättad',
  createdAt: '2026-07-20T16:30:00.000Z',
  updatedAt: '2026-07-20T16:30:00.000Z',
}

describe('Meal Templates V1 data model', () => {
  it('normalizes the required template fields', () => {
    expect(normalizeMealTemplate(baseTemplate)).toMatchObject(baseTemplate)
  })

  it('uses text as fallback name', () => {
    expect(normalizeMealTemplate({ text: 'Två ägg' }).name).toBe('Två ägg')
  })

  it('uses name as fallback text', () => {
    expect(normalizeMealTemplate({ name: 'Frukostmall' }).text).toBe('Frukostmall')
  })

  it('ignores broken template objects', () => {
    expect(normalizeMealTemplate(null)).toBeNull()
  })

  it('normalizes unknown meal type to automatic', () => {
    expect(normalizeMealTemplate({ name: 'Test', text: 'Test', mealType: 'Brunch' }).mealType).toBe('Automatiskt')
  })

  it('keeps valid Swedish meal type', () => {
    expect(normalizeMealTemplate({ name: 'Kväll', text: 'Kvarg', mealType: 'Kvällsmål' }).mealType).toBe('Kvällsmål')
  })

  it('clears invalid default time', () => {
    expect(normalizeMealTemplate({ name: 'Test', text: 'Test', defaultTime: '99:99' }).defaultTime).toBe('')
  })

  it('keeps valid default time', () => {
    expect(normalizeMealTemplate({ name: 'Test', text: 'Test', defaultTime: '09:05' }).defaultTime).toBe('09:05')
  })

  it('normalizes comma decimal nutrition override', () => {
    expect(normalizeMealTemplate({
      name: 'Test',
      text: 'Test',
      nutritionOverride: { protein: '42,5' },
    }).nutritionOverride.protein).toBe(42.5)
  })

  it('drops negative nutrition override', () => {
    expect(normalizeMealTemplate({
      name: 'Test',
      text: 'Test',
      nutritionOverride: { protein: -5 },
    }).nutritionOverride.protein).toBeUndefined()
  })

  it('deduplicates templates by id', () => {
    expect(normalizeMealTemplates([baseTemplate, { ...baseTemplate, name: 'Dubblett' }])).toHaveLength(1)
  })

  it('sorts favorites before other templates', () => {
    const result = normalizeMealTemplates([
      { ...baseTemplate, id: 'a', isFavorite: false, name: 'A' },
      { ...baseTemplate, id: 'b', isFavorite: true, name: 'B' },
    ])

    expect(result[0].id).toBe('b')
  })

  it('sorts recently used templates before older templates', () => {
    const result = normalizeMealTemplates([
      { ...baseTemplate, id: 'old', isFavorite: false, lastUsedAt: '2026-07-01T10:00:00.000Z' },
      { ...baseTemplate, id: 'new', isFavorite: false, lastUsedAt: '2026-07-05T10:00:00.000Z' },
    ])

    expect(result[0].id).toBe('new')
  })

  it('sorts by use count when last used is equal', () => {
    const result = normalizeMealTemplates([
      { ...baseTemplate, id: 'low', isFavorite: false, useCount: 1 },
      { ...baseTemplate, id: 'high', isFavorite: false, useCount: 7 },
    ])

    expect(result[0].id).toBe('high')
  })

  it('sorts by Swedish name as final fallback', () => {
    const result = normalizeMealTemplates([
      { ...baseTemplate, id: 'b', isFavorite: false, useCount: 0, lastUsedAt: null, name: 'Övrigt' },
      { ...baseTemplate, id: 'a', isFavorite: false, useCount: 0, lastUsedAt: null, name: 'Ägg' },
    ])

    expect(result.map((template) => template.name)).toEqual(['Ägg', 'Övrigt'])
  })
})

describe('Meal Templates V1 storage', () => {
  it('reads templates from localStorage key', () => {
    const storage = storageWith(JSON.stringify([baseTemplate]))

    expect(readMealTemplates(storage)).toHaveLength(1)
    expect(storage.getItem).toHaveBeenCalledWith(mealTemplateStorageKey)
  })

  it('returns empty list for broken JSON', () => {
    expect(readMealTemplates(storageWith('{trasig json'))).toEqual([])
  })

  it('returns empty list when storage is missing', () => {
    expect(readMealTemplates(null)).toEqual([])
  })

  it('writes normalized templates', () => {
    const storage = storageWith('[]')
    const written = writeMealTemplates([baseTemplate], storage)

    expect(written).toHaveLength(1)
    expect(JSON.parse(storage.state[mealTemplateStorageKey])[0].name).toBe('Kycklinglåda')
  })

  it('survives storage write errors', () => {
    const storage = {
      getItem: () => '[]',
      setItem: () => {
        throw new Error('full')
      },
    }

    expect(writeMealTemplates([baseTemplate], storage)).toHaveLength(1)
  })

  it('adds a template to storage', () => {
    const storage = storageWith('[]')
    const result = addMealTemplate({ name: 'Ägg', text: 'Två ägg', mealType: 'Frukost' }, storage)

    expect(result.template.name).toBe('Ägg')
    expect(readMealTemplates(storage)).toHaveLength(1)
  })

  it('updates a stored template', () => {
    const storage = storageWith(JSON.stringify([baseTemplate]))
    const result = updateStoredMealTemplate('template-1', { ...baseTemplate, name: 'Ny låda' }, storage)

    expect(result.template.name).toBe('Ny låda')
    expect(readMealTemplates(storage)[0].name).toBe('Ny låda')
  })

  it('deletes a template without touching meals', () => {
    const storage = storageWith(JSON.stringify([baseTemplate]))

    expect(deleteMealTemplate('template-1', storage)).toEqual([])
  })

  it('toggles favorite state immediately', () => {
    const storage = storageWith(JSON.stringify([{ ...baseTemplate, isFavorite: false }]))

    expect(toggleMealTemplateFavorite('template-1', storage)[0].isFavorite).toBe(true)
  })

  it('marks a template as used', () => {
    const storage = storageWith(JSON.stringify([baseTemplate]))
    const [used] = markMealTemplateUsed('template-1', storage, '2026-07-08T10:00:00.000Z')

    expect(used.useCount).toBe(3)
    expect(used.lastUsedAt).toBe('2026-07-08T10:00:00.000Z')
  })

  it('does not create a template when validation fails', () => {
    expect(addMealTemplate({ name: '', text: '' }, storageWith('[]')).template).toBeNull()
  })
})

describe('Meal Templates V1 validation', () => {
  it('requires a name', () => {
    expect(validateMealTemplateDraft({ name: '', text: 'Ägg' }).name).toBeTruthy()
  })

  it('requires meal text', () => {
    expect(validateMealTemplateDraft({ name: 'Ägg', text: '' }).text).toBeTruthy()
  })

  it('rejects invalid time', () => {
    expect(validateMealTemplateDraft({ name: 'Ägg', text: 'Ägg', defaultTime: 'lunch' }).defaultTime).toBeTruthy()
  })

  it('rejects negative protein', () => {
    expect(validateMealTemplateDraft({
      name: 'Ägg',
      text: 'Ägg',
      nutritionOverride: { protein: '-1' },
    }).protein).toBeTruthy()
  })

  it('accepts empty nutrition fields', () => {
    expect(validateMealTemplateDraft({
      name: 'Ägg',
      text: 'Ägg',
      nutritionOverride: { protein: '' },
    })).toEqual({})
  })

  it('accepts Swedish comma decimal values', () => {
    expect(validateMealTemplateDraft({
      name: 'Ägg',
      text: 'Ägg',
      nutritionOverride: { protein: '12,5' },
    })).toEqual({})
  })

  it('builds a blank draft safely', () => {
    expect(buildMealTemplateDraft()).toMatchObject({
      defaultTime: '',
      mealType: 'Automatiskt',
      name: '',
      text: '',
    })
  })

  it('builds a draft from a meal seed', () => {
    expect(buildMealTemplateDraft(baseMeal)).toMatchObject({
      defaultTime: '18:30',
      mealType: 'Middag',
      name: 'Pizza',
      text: 'Jag åt pizza',
    })
  })
})

describe('Meal Templates V1 creation and updates', () => {
  it('creates a template from a draft', () => {
    const result = createMealTemplate({
      name: 'Frukost',
      text: 'Ägg och bröd',
      mealType: 'Frukost',
    }, '2026-07-02T08:00:00.000Z')

    expect(result.template).toMatchObject({
      createdAt: '2026-07-02T08:00:00.000Z',
      mealType: 'Frukost',
      name: 'Frukost',
      useCount: 0,
    })
  })

  it('does not create invalid template', () => {
    expect(createMealTemplate({ name: '', text: '' }).template).toBeNull()
  })

  it('creates a template from an existing meal', () => {
    const result = createMealTemplateFromMeal(baseMeal, { isFavorite: true }, '2026-07-21T10:00:00.000Z')

    expect(result.template).toMatchObject({
      name: 'Pizza',
      text: 'Jag åt pizza',
      mealType: 'Middag',
      isFavorite: true,
    })
  })

  it('copies meal override into template', () => {
    const result = createMealTemplateFromMeal(baseMeal)

    expect(result.template.nutritionOverride.protein).toBe(32)
  })

  it('does not copy the meal id into template id', () => {
    const result = createMealTemplateFromMeal(baseMeal)

    expect(result.template.id).not.toBe(baseMeal.id)
  })

  it('does not copy meal date into template', () => {
    const result = createMealTemplateFromMeal(baseMeal)

    expect(result.template.date).toBeUndefined()
  })

  it('updates template content while preserving id', () => {
    const result = updateMealTemplate(baseTemplate, { ...baseTemplate, name: 'Uppdaterad' }, '2026-07-05T10:00:00.000Z')

    expect(result.template.id).toBe('template-1')
    expect(result.template.name).toBe('Uppdaterad')
  })

  it('preserves createdAt when updating', () => {
    const result = updateMealTemplate(baseTemplate, { ...baseTemplate, name: 'Uppdaterad' }, '2026-07-05T10:00:00.000Z')

    expect(result.template.createdAt).toBe(baseTemplate.createdAt)
  })

  it('preserves use count when updating', () => {
    const result = updateMealTemplate(baseTemplate, { ...baseTemplate, useCount: 99 }, '2026-07-05T10:00:00.000Z')

    expect(result.template.useCount).toBe(2)
  })

  it('returns validation errors on invalid update', () => {
    expect(updateMealTemplate(baseTemplate, { ...baseTemplate, text: '' }).template).toBeNull()
  })

  it('returns an error for broken source meal', () => {
    expect(createMealTemplateFromMeal(null).template).toBeNull()
  })
})

describe('Meal Templates V1 quick add meals', () => {
  it('creates a meal from a template for selected date', () => {
    const meal = createMealFromTemplate(baseTemplate, { date: '2026-07-28' }, '2026-07-28T07:00:00.000Z')

    expect(meal).toMatchObject({
      date: '2026-07-28',
      name: 'Kycklinglåda',
      text: 'Kyckling, ris och broccoli',
      time: '12:15',
    })
  })

  it('creates a new meal id when using a template', () => {
    const meal = createMealFromTemplate(baseTemplate, { date: '2026-07-28' }, '2026-07-28T07:00:00.000Z')

    expect(meal.id).not.toBe(baseTemplate.id)
  })

  it('copies nutrition override from template into meal', () => {
    const meal = createMealFromTemplate(baseTemplate, { date: '2026-07-28' })

    expect(meal.nutritionOverride.protein).toBe(42)
    expect(meal.sourceCategory).toBe('template')
    expect(meal.nutritionProvenance).toBe('derived')
  })

  it('uses requested time over default time', () => {
    const meal = createMealFromTemplate(baseTemplate, { date: '2026-07-28', time: '13:45' })

    expect(meal.time).toBe('13:45')
  })

  it('maps automatic meal type to Annat for saved meals', () => {
    const meal = createMealFromTemplate({ ...baseTemplate, mealType: 'Automatiskt' }, { date: '2026-07-28' })

    expect(meal.type).toBe('Annat')
  })

  it('does not count templates in daily summaries before use', () => {
    const summary = calculateDailyNutritionSummary([], '2026-07-28', { protein: 120 })

    expect(summary.totals.protein).toBe(0)
  })

  it('counts the meal after the template is used', () => {
    const meal = createMealFromTemplate(baseTemplate, { date: '2026-07-28' })
    const summary = calculateDailyNutritionSummary([meal], '2026-07-28', { protein: 120 })

    expect(summary.totals.protein).toBe(42)
  })

  it('creates a meal copy for another day', () => {
    const meal = createMealCopy(baseMeal, { date: '2026-07-29', time: '19:00' })

    expect(meal).toMatchObject({
      date: '2026-07-29',
      time: '19:00',
      name: 'Pizza',
    })
  })

  it('keeps override when copying a meal', () => {
    expect(createMealCopy(baseMeal, { date: '2026-07-29' }).nutritionOverride.calories).toBe(850)
  })

  it('creates a new id when copying a meal', () => {
    expect(createMealCopy(baseMeal, { date: '2026-07-29' }).id).not.toBe(baseMeal.id)
  })

  it('returns null for broken template quick add', () => {
    expect(createMealFromTemplate(null, { date: '2026-07-29' })).toBeNull()
  })

  it('returns null for broken meal copy', () => {
    expect(createMealCopy(null, { date: '2026-07-29' })).toBeNull()
  })
})

describe('Meal Templates V1 recent meals and filtering', () => {
  it('finds recent unique meals newest first', () => {
    const meals = [
      { ...baseMeal, id: 'old', date: '2026-07-18', time: '18:00', text: 'Ägg' },
      { ...baseMeal, id: 'new', date: '2026-07-20', time: '18:00', text: 'Kyckling' },
    ]

    expect(getRecentUniqueMeals(meals, { today: '2026-07-20' }).map((meal) => meal.id)).toEqual(['new', 'old'])
  })

  it('deduplicates recent meals by text and type', () => {
    const meals = [
      { ...baseMeal, id: 'new', date: '2026-07-20', time: '18:00', text: 'Pizza' },
      { ...baseMeal, id: 'old', date: '2026-07-18', time: '18:00', text: 'Pizza' },
    ]

    expect(getRecentUniqueMeals(meals, { today: '2026-07-20' })).toHaveLength(1)
  })

  it('keeps same text as unique when meal type differs', () => {
    const meals = [
      { ...baseMeal, id: 'dinner', type: 'Middag', text: 'Pizza' },
      { ...baseMeal, id: 'lunch', type: 'Lunch', text: 'Pizza' },
    ]

    expect(getRecentUniqueMeals(meals, { today: '2026-07-20' })).toHaveLength(2)
  })

  it('limits recent meals to five', () => {
    const meals = Array.from({ length: 7 }, (_, index) => ({
      ...baseMeal,
      id: `meal-${index}`,
      text: `Måltid ${index}`,
    }))

    expect(getRecentUniqueMeals(meals, { today: '2026-07-20' })).toHaveLength(5)
  })

  it('ignores future meals in recent meals', () => {
    const meals = [
      { ...baseMeal, id: 'future', date: '2026-07-30', text: 'Framtid' },
      { ...baseMeal, id: 'today', date: '2026-07-20', text: 'Idag' },
    ]

    expect(getRecentUniqueMeals(meals, { today: '2026-07-20' }).map((meal) => meal.id)).toEqual(['today'])
  })

  it('ignores broken meals in recent meals', () => {
    expect(getRecentUniqueMeals([null, 'mat', baseMeal], { today: '2026-07-20' })).toHaveLength(1)
  })

  it('filters templates by search text', () => {
    expect(filterMealTemplates([baseTemplate], { search: 'ris' })).toHaveLength(1)
  })

  it('filters templates by meal type', () => {
    expect(filterMealTemplates([baseTemplate], { type: 'Lunch' })).toHaveLength(1)
  })

  it('filters templates by favorite state', () => {
    expect(filterMealTemplates([{ ...baseTemplate, isFavorite: false }], { type: 'Favoriter' })).toHaveLength(0)
  })

  it('returns empty filter result safely', () => {
    expect(filterMealTemplates(null, { search: 'pizza' })).toEqual([])
  })
})

describe('Meal Templates V1 nutrition preview', () => {
  it('uses effective nutrition override for preview', () => {
    expect(getMealTemplatePreview(baseTemplate).totals.protein).toBe(42)
  })

  it('uses nutrition engine analysis when override is missing', () => {
    expect(getMealTemplatePreview({
      name: 'Ägg',
      text: 'Jag åt två ägg',
      mealType: 'Frukost',
    }).totals.protein).toBeGreaterThan(10)
  })

  it('does not expose unsafe preview values for broken input', () => {
    const preview = getMealTemplatePreview(null)

    expect(JSON.stringify(preview)).not.toMatch(/NaN|undefined|\[object Object\]/i)
  })

  it('previews pizza specifically', () => {
    expect(getMealTemplatePreview({ name: 'Pizza', text: 'Pizza' }).totals.calories).toBeGreaterThan(500)
  })

  it('previews composed meals', () => {
    const preview = getMealTemplatePreview({ name: 'Lunch', text: 'Kyckling och ris' })

    expect(preview.totals.protein).toBeGreaterThan(20)
    expect(preview.totals.calories).toBeGreaterThan(300)
  })

  it('keeps manual zero values in preview', () => {
    expect(getMealTemplatePreview({
      name: 'Zero',
      text: 'Vatten',
      nutritionOverride: { calories: 0, protein: 0 },
    }).totals.calories).toBe(0)
  })
})

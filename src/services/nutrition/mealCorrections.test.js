import { describe, expect, it } from 'vitest'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import { createNutritionDashboardModel } from '../../components/nutritionDashboard/nutritionDashboardViewModel.js'
import {
  createMealEditDraft,
  createUpdatedMealRecord,
  getEffectiveMealNutrition,
  normalizeMealRecord,
  parseCorrectionNumber,
  resetMealNutritionOverride,
  validateMealEditDraft,
} from './nutritionEngine.js'

const today = new Date().toISOString().slice(0, 10)
const fixedNow = '2026-07-28T10:15:00.000Z'

function coachReply(message, meals) {
  return createDeterministicAiCoachReply({
    context: {
      meals,
      nutritionGoals: {
        calories: 2100,
        protein: '108–144 g',
      },
      profile: {
        goalWeight: '78 kg',
        startWeight: '91,8 kg',
      },
      weights: [
        { date: '2026-07-01', id: 'start', value: 91.8 },
        { date: today, id: 'latest', value: 90.1 },
      ],
    },
    message,
  })
}

describe('Meal Editing V1 data model', () => {
  it('normalizes old meal format', () => {
    const meal = normalizeMealRecord({
      date: today,
      id: 'old',
      text: 'två ägg',
      type: 'Frukost',
    })

    expect(meal.id).toBe('old')
    expect(meal.mealType).toBe('Frukost')
    expect(meal.nutritionSource).toBe('automatic')
  })

  it('normalizes new meal format', () => {
    const meal = normalizeMealRecord({
      date: today,
      id: 'new',
      mealType: 'Lunch',
      nutritionOverride: { protein: '45,5' },
      text: 'kyckling',
    })

    expect(meal.nutritionOverride.protein).toBe(45.5)
    expect(meal.nutritionSource).toBe('manual')
  })

  it('preserves createdAt and changes updatedAt on edit', () => {
    const result = createUpdatedMealRecord({
      createdAt: '2026-07-01T08:00:00.000Z',
      date: today,
      id: 'meal',
      text: 'kyckling',
      updatedAt: '2026-07-01T08:00:00.000Z',
    }, {
      date: today,
      description: 'kyckling och ris',
      mealType: 'Lunch',
      time: '12:00',
    }, fixedNow)

    expect(result.meal.createdAt).toBe('2026-07-01T08:00:00.000Z')
    expect(result.meal.updatedAt).toBe(fixedNow)
  })

  it('creates an id when it is missing', () => {
    const meal = normalizeMealRecord({ date: today, text: 'ägg' })

    expect(meal.id).toContain('meal-')
  })

  it('ignores broken override values', () => {
    const meal = normalizeMealRecord({
      date: today,
      nutritionOverride: { calories: '-10', protein: 'abc' },
      text: 'ägg',
    })

    expect(meal.nutritionOverride).toEqual({})
  })

  it('keeps empty override automatic', () => {
    const meal = normalizeMealRecord({
      date: today,
      nutritionOverride: {},
      text: 'ägg',
    })

    expect(meal.nutritionSource).toBe('automatic')
  })

  it('creates an edit draft from legacy top-level nutrition', () => {
    const draft = createMealEditDraft({
      calories: 300,
      date: today,
      id: 'legacy',
      protein: 22,
      text: 'Hemlagat',
    })

    expect(draft.nutritionOverride.protein).toBe(22)
    expect(draft.nutritionOverride.calories).toBe(300)
  })
})

describe('Meal Editing V1 effective nutrition', () => {
  it('uses automatic nutrition without override', () => {
    const effective = getEffectiveMealNutrition({ date: today, text: 'två ägg' })

    expect(effective.source).toBe('automatic')
    expect(effective.totals.protein).toBe(12)
  })

  it('uses full override', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { calories: 610, carbs: 60, fat: 14, protein: 45 },
      text: 'kyckling och ris',
    })

    expect(effective.source).toBe('manual')
    expect(effective.totals).toEqual({ calories: 610, carbs: 60, fat: 14, protein: 45 })
  })

  it('uses only protein override', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { protein: 45 },
      text: 'kyckling',
    })

    expect(effective.source).toBe('partial_manual')
    expect(effective.totals.protein).toBe(45)
    expect(effective.totals.calories).toBe(165)
  })

  it('uses only calorie override', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { calories: 610 },
      text: 'kyckling och ris',
    })

    expect(effective.manualFields).toEqual(['calories'])
    expect(effective.totals.calories).toBe(610)
    expect(effective.totals.protein).toBeGreaterThan(0)
  })

  it('uses several override fields', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { calories: 610, protein: 40 },
      text: 'kyckling och ris',
    })

    expect(effective.manualFields).toEqual(['calories', 'protein'])
    expect(effective.totals.carbs).toBeGreaterThan(0)
  })

  it('keeps manual zero values', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { calories: 0, protein: 0 },
      text: 'kyckling',
    })

    expect(effective.totals.calories).toBe(0)
    expect(effective.totals.protein).toBe(0)
  })

  it('ignores negative override values', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { protein: -5 },
      text: 'kyckling',
    })

    expect(effective.source).toBe('automatic')
    expect(effective.totals.protein).toBe(31)
  })

  it('ignores NaN override values', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { protein: Number.NaN },
      text: 'kyckling',
    })

    expect(effective.source).toBe('automatic')
  })

  it('ignores Infinity override values', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { calories: Infinity },
      text: 'kyckling',
    })

    expect(effective.source).toBe('automatic')
  })

  it('falls back to automatic values for empty override', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: {},
      text: 'kyckling',
    })

    expect(effective.totals.protein).toBe(31)
  })

  it('uses legacy top-level nutrition as manual compatibility', () => {
    const effective = getEffectiveMealNutrition({
      calories: 500,
      date: today,
      protein: 33,
      text: 'Hemlagat',
    })

    expect(effective.source).toBe('partial_manual')
    expect(effective.totals.protein).toBe(33)
  })
})

describe('Meal Editing V1 validation and updates', () => {
  it('accepts Swedish decimals', () => {
    expect(parseCorrectionNumber('45,5')).toBe(45.5)
  })

  it('accepts point decimals', () => {
    expect(parseCorrectionNumber('45.5')).toBe(45.5)
  })

  it('rejects letters in numeric fields', () => {
    const errors = validateMealEditDraft({
      date: today,
      description: 'kyckling',
      nutritionOverride: { protein: 'abc' },
      time: '12:00',
    })

    expect(errors.protein).toBe('Protein måste vara ett giltigt tal.')
  })

  it('rejects empty text', () => {
    expect(validateMealEditDraft({ date: today, description: '   ', time: '12:00' }).description).toBe('Ange en beskrivning av måltiden.')
  })

  it('rejects invalid date', () => {
    expect(validateMealEditDraft({ date: 'bad', description: 'kyckling', time: '12:00' }).date).toBe('Ange ett giltigt datum.')
  })

  it('rejects invalid time', () => {
    expect(validateMealEditDraft({ date: today, description: 'kyckling', time: '99' }).time).toBe('Ange en giltig tid.')
  })

  it('rejects negative protein', () => {
    expect(validateMealEditDraft({ date: today, description: 'kyckling', nutritionOverride: { protein: '-1' }, time: '12:00' }).protein).toBe('Protein får inte vara negativt.')
  })

  it('rejects negative calories', () => {
    expect(validateMealEditDraft({ date: today, description: 'kyckling', nutritionOverride: { calories: '-1' }, time: '12:00' }).calories).toBe('Kalorier får inte vara negativt.')
  })

  it('rejects negative fat', () => {
    expect(validateMealEditDraft({ date: today, description: 'kyckling', nutritionOverride: { fat: '-1' }, time: '12:00' }).fat).toBe('Fett får inte vara negativt.')
  })

  it('trims whitespace on save', () => {
    const result = createUpdatedMealRecord({ date: today, id: 'meal', text: 'ägg' }, {
      date: today,
      description: '  kyckling  ',
      mealType: 'Lunch',
      time: '12:00',
    }, fixedNow)

    expect(result.meal.description).toBe('kyckling')
  })

  it('does not save when validation fails', () => {
    const result = createUpdatedMealRecord({ date: today, id: 'meal', text: 'ägg' }, {
      date: 'bad',
      description: '',
      time: '12:00',
    }, fixedNow)

    expect(result.meal).toBeNull()
    expect(result.errors.date).toBeTruthy()
  })

  it('changes text date time and type', () => {
    const result = createUpdatedMealRecord({ date: today, id: 'meal', text: 'ägg' }, {
      date: '2026-07-29',
      description: 'lax med potatis',
      mealType: 'Middag',
      time: '18:30',
    }, fixedNow)

    expect(result.meal.description).toBe('lax med potatis')
    expect(result.meal.date).toBe('2026-07-29')
    expect(result.meal.time).toBe('18:30')
    expect(result.meal.mealType).toBe('Middag')
  })

  it('changes all macro fields', () => {
    const result = createUpdatedMealRecord({ date: today, id: 'meal', text: 'ägg' }, {
      date: today,
      description: 'ägg',
      nutritionOverride: { calories: '100', carbs: '1', fat: '5', protein: '10' },
      time: '08:00',
    }, fixedNow)

    expect(result.meal.nutritionOverride).toEqual({ calories: 100, carbs: 1, fat: 5, protein: 10 })
  })

  it('resets automatic analysis without changing text date or time', () => {
    const meal = {
      date: today,
      id: 'meal',
      nutritionOverride: { calories: 100, protein: 10 },
      text: 'två ägg',
      time: '08:00',
    }
    const reset = resetMealNutritionOverride(meal, fixedNow)

    expect(reset.text).toBe('två ägg')
    expect(reset.date).toBe(today)
    expect(reset.time).toBe('08:00')
    expect(reset.nutritionOverride).toEqual({})
  })

  it('handles very large values safely', () => {
    const result = createUpdatedMealRecord({ date: today, id: 'meal', text: 'ris' }, {
      date: today,
      description: 'ris',
      nutritionOverride: { calories: '999999999' },
      time: '12:00',
    }, fixedNow)

    expect(result.meal.nutritionOverride.calories).toBe(100000)
  })
})

describe('Meal Editing V1 dashboard consistency', () => {
  it('shows manual protein in dashboard totals', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'meal', nutritionOverride: { protein: 45 }, text: 'kyckling' }],
      nutritionGoals: { protein: 100 },
    })

    expect(model.summary.protein).toBe('45 g')
  })

  it('shows manual calories in dashboard totals', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'meal', nutritionOverride: { calories: 610 }, text: 'kyckling' }],
      nutritionGoals: { calories: 1000 },
    })

    expect(model.summary.calories).toBe('610 kcal')
  })

  it('shows partial manual status', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'meal', nutritionOverride: { calories: 610 }, text: 'kyckling' }],
    })

    expect(model.timeline[0].status.label).toBe('Delvis manuellt korrigerad')
  })

  it('shows fully manual status', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'meal', nutritionOverride: { calories: 610, carbs: 60, fat: 14, protein: 45 }, text: 'kyckling' }],
    })

    expect(model.timeline[0].status.label).toBe('Manuellt korrigerad')
  })

  it('shows automatic status after reset', () => {
    const reset = resetMealNutritionOverride({
      date: today,
      id: 'meal',
      nutritionOverride: { protein: 45 },
      text: 'kyckling',
    })
    const model = createNutritionDashboardModel({ date: today, meals: [reset] })

    expect(model.timeline[0].status.label).toBe('Automatisk uppskattning')
  })

  it('removes meal from selected day when moved', () => {
    const updated = createUpdatedMealRecord({ date: today, id: 'meal', text: 'ägg' }, {
      date: '2026-07-30',
      description: 'ägg',
      time: '08:00',
    }, fixedNow).meal
    const model = createNutritionDashboardModel({ date: today, meals: [updated] })

    expect(model.summary.mealCount).toBe(0)
  })

  it('updates comparisons from overrides', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [
        { date: today, id: 'breakfast', text: 'Frukost två ägg' },
        { date: today, id: 'lunch', nutritionOverride: { protein: 80 }, text: 'Lunch ris' },
      ],
    })

    expect(model.comparisons.find((item) => item.label === 'Mest protein')?.text).toContain('Lunch')
  })

  it('updates progress from overrides', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'meal', nutritionOverride: { protein: 120 }, text: 'ris' }],
      nutritionGoals: { protein: 100 },
    })

    expect(model.progress.protein.status).toBe('reached')
  })
})

describe('Meal Editing V1 AI Coach consistency', () => {
  it('uses override for protein today', () => {
    const response = coachReply('Hur mycket protein har jag ätit idag?', [
      { date: today, id: 'meal', nutritionOverride: { protein: 45 }, text: 'kyckling' },
    ])

    expect(response).toContain('45 g protein idag')
  })

  it('uses override for calories today', () => {
    const response = coachReply('Hur många kalorier har jag fått i mig?', [
      { date: today, id: 'meal', nutritionOverride: { calories: 610 }, text: 'kyckling' },
    ])

    expect(response).toContain('610 kcal idag')
  })

  it('uses override for protein remaining', () => {
    const response = coachReply('Hur mycket protein har jag kvar?', [
      { date: today, id: 'meal', nutritionOverride: { protein: 45 }, text: 'kyckling' },
    ])

    expect(response).toContain('63 g kvar')
  })

  it('uses override for most protein meal', () => {
    const response = coachReply('Vilken måltid innehöll mest protein?', [
      { date: today, id: 'breakfast', text: 'Frukost två ägg' },
      { date: today, id: 'lunch', nutritionOverride: { protein: 80 }, text: 'Lunch ris' },
    ])

    expect(response).toContain('Lunch')
    expect(response).toContain('80 g')
  })

  it('uses override for lunch analysis', () => {
    const response = coachReply('Hur såg min lunch ut?', [
      { date: today, id: 'lunch', nutritionOverride: { calories: 610, protein: 45 }, text: 'Lunch ris' },
    ])

    expect(response).toContain('45 g protein')
    expect(response).toContain('610 kcal')
  })

  it('uses automatic analysis after reset', () => {
    const reset = resetMealNutritionOverride({
      date: today,
      id: 'meal',
      nutritionOverride: { protein: 80 },
      text: 'kyckling',
    })
    const response = coachReply('Hur mycket protein har jag ätit idag?', [reset])

    expect(response).toContain('31 g protein idag')
  })
})

describe('Meal Editing V1 robustness', () => {
  it('does not expose unsafe values in effective nutrition', () => {
    const effective = getEffectiveMealNutrition({
      date: today,
      nutritionOverride: { calories: 'abc', protein: Infinity },
      text: '',
    })

    expect(JSON.stringify(effective)).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
  })

  it('handles duplicate ids through dashboard model', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [
        { date: today, id: 'same', text: 'ägg' },
        { date: today, id: 'same', text: 'kyckling' },
      ],
    })

    expect(model.summary.mealCount).toBe(1)
  })
})

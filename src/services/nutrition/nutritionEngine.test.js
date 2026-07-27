import { describe, expect, it } from 'vitest'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  analyzeMealText,
  analyzeNutritionMessage,
  getNutritionFoodById,
  nutritionFoods,
  parseProteinGoal,
} from './nutritionEngine.js'

const requiredFoodIds = [
  'kyckling',
  'notkott',
  'flask',
  'lax',
  'torsk',
  'tonfisk',
  'agg',
  'kvarg',
  'keso',
  'grekisk-yoghurt',
  'mjolk',
  'ost',
  'havregryn',
  'ris',
  'potatis',
  'pasta',
  'brod',
  'banan',
  'apple',
  'apelsin',
  'avokado',
  'broccoli',
  'morotter',
  'tomat',
  'gurka',
  'pizza',
  'hamburgare',
  'pommes',
  'godis',
  'choklad',
  'chips',
  'lask',
  'glass',
]

const coachContext = {
  checkIn: {
    energy: 6,
    mood: 'Fokuserad',
    steps: 7200,
  },
  meals: [],
  nutritionGoals: {
    protein: '108–144 g',
  },
  profile: {
    goalWeight: '78 kg',
    startWeight: '91,8 kg',
  },
  weights: [
    {
      date: '2026-07-01',
      id: 'start',
      value: 91.8,
    },
    {
      date: '2026-07-27',
      id: 'latest',
      value: 90.1,
    },
  ],
}

function coachReply(message, chatHistory = []) {
  return createDeterministicAiCoachReply({
    chatHistory,
    context: {
      ...coachContext,
      chatHistory,
    },
    message,
  })
}

describe('Nutrition Engine V1 database', () => {
  it.each(requiredFoodIds)('contains %s with complete nutrition fields', (id) => {
    const food = getNutritionFoodById(id)

    expect(food).toBeTruthy()
    expect(food.name).toBeTruthy()
    expect(food.category).toBeTruthy()
    expect(food.defaultServing).toBeTruthy()
    expect(Number.isFinite(food.protein)).toBe(true)
    expect(Number.isFinite(food.carbs)).toBe(true)
    expect(Number.isFinite(food.fat)).toBe(true)
    expect(Number.isFinite(food.calories)).toBe(true)
  })

  it('keeps the required Swedish food database broad enough', () => {
    expect(nutritionFoods.length).toBeGreaterThanOrEqual(33)
  })
})

describe('Nutrition Engine V1 meal analyzer', () => {
  it('identifies two eggs and calculates approximate protein and calories', () => {
    const analysis = analyzeMealText('Jag åt två ägg.')

    expect(analysis.items).toHaveLength(1)
    expect(analysis.items[0].food.id).toBe('agg')
    expect(analysis.items[0].quantity).toBe(2)
    expect(analysis.totals.protein).toBe(12)
    expect(analysis.totals.calories).toBe(150)
  })

  it('understands "Jag har ätit" as a natural meal statement', () => {
    const analysis = analyzeMealText('Jag har ätit kyckling och ris.')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['kyckling', 'ris'])
    expect(analysis.flags.proteinRich).toBe(true)
  })

  it('understands "Åt precis" with snacks', () => {
    const analysis = analyzeMealText('Åt precis chips.')

    expect(analysis.items[0].food.id).toBe('chips')
    expect(analysis.flags.containsSweets).toBe(true)
  })

  it('detects lunch meal type', () => {
    const analysis = analyzeMealText('Till lunch åt jag lax och potatis.')

    expect(analysis.mealType).toBe('lunch')
    expect(analysis.items.map((item) => item.food.id)).toEqual(['lax', 'potatis'])
  })

  it('detects dinner meal type from "Till middag blev det"', () => {
    const analysis = analyzeMealText('Till middag blev det torsk, ris och broccoli.')

    expect(analysis.mealType).toBe('middag')
    expect(analysis.items.map((item) => item.food.id)).toEqual(['broccoli', 'ris', 'torsk'])
  })

  it('detects breakfast label', () => {
    const analysis = analyzeMealText('Frukost: havregryn, kvarg och banan.')

    expect(analysis.mealType).toBe('frukost')
    expect(analysis.items.map((item) => item.food.id)).toEqual(['banan', 'havregryn', 'kvarg'])
  })

  it('detects snack label', () => {
    const analysis = analyzeMealText('Mellanmål keso och äpple.')

    expect(analysis.mealType).toBe('mellanmål')
    expect(analysis.items.map((item) => item.food.id)).toEqual(['apple', 'keso'])
  })

  it('detects evening snack label', () => {
    const analysis = analyzeMealText('Kvällsmål grekisk yoghurt.')

    expect(analysis.mealType).toBe('kvällsmål')
    expect(analysis.items[0].food.id).toBe('grekisk-yoghurt')
  })

  it('flags pizza as fast food and energy dense', () => {
    const analysis = analyzeMealText('Jag åt pizza.')

    expect(analysis.items[0].food.id).toBe('pizza')
    expect(analysis.flags.containsFastFood).toBe(true)
    expect(analysis.flags.energyDense).toBe(true)
  })

  it('flags two hamburgers with fries and soda as a larger meal', () => {
    const analysis = analyzeMealText('Jag åt två hamburgare, pommes och läsk.')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['hamburgare', 'lask', 'pommes'])
    expect(analysis.totals.calories).toBeGreaterThan(1400)
    expect(analysis.flags.largeMeal).toBe(true)
    expect(analysis.flags.containsFastFood).toBe(true)
    expect(analysis.flags.containsSweets).toBe(true)
  })

  it('calculates protein goal contribution from a goal range', () => {
    const analysis = analyzeMealText('Jag åt två ägg.', {
      proteinGoal: '108–144 g',
    })

    expect(analysis.proteinContribution.percent).toBe(11)
    expect(analysis.proteinContribution.goal.lower).toBe(108)
  })

  it('parses numeric protein goals', () => {
    expect(parseProteinGoal(120)).toEqual({
      label: '120 g',
      lower: 120,
      target: 120,
      upper: 120,
    })
  })

  it('returns no items for unknown food without unsafe values', () => {
    const analysis = analyzeMealText('Jag åt något oklart.')

    expect(analysis.items).toEqual([])
    expect(analysis.totals).toEqual({
      calories: 0,
      carbs: 0,
      fat: 0,
      protein: 0,
    })
  })

  it('handles accents and plain Swedish characters consistently', () => {
    const analysis = analyzeMealText('Jag åt nötkött och morötter.')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['morotter', 'notkott'])
  })

  it('recognizes candy and chocolate as sweets', () => {
    const analysis = analyzeMealText('Jag åt godis och choklad.')

    expect(analysis.flags.containsSweets).toBe(true)
    expect(analysis.totals.calories).toBeGreaterThan(800)
  })

  it('recognizes soda aliases', () => {
    const analysis = analyzeMealText('Jag drack cola.')

    expect(analysis.items[0].food.id).toBe('lask')
  })
})

describe('Nutrition Engine V1 advice', () => {
  it('gives richer pizza advice with estimate and balancing step', () => {
    const { advice } = analyzeNutritionMessage('Jag åt pizza.', {
      proteinGoal: '108–144 g',
    })

    expect(advice).toContain('En pizza förstör inte dina framsteg')
    expect(advice).toContain('cirka 25 g protein')
    expect(advice).toContain('750 kcal')
    expect(advice).toContain('protein och grönsaker')
    expect(advice).toContain('proteinmål 108–144 g')
  })

  it('varies repeated pizza advice without losing the food context', () => {
    const { advice } = analyzeNutritionMessage('Jag åt pizza.', {
      repeatedPizza: true,
    })

    expect(advice).toContain('Som vi var inne på tidigare')
    expect(advice).toContain('pizza')
  })

  it('gives non-shaming advice for a larger fast-food meal', () => {
    const { advice } = analyzeNutritionMessage('Jag åt två hamburgare, pommes och läsk.', {
      proteinGoal: '108–144 g',
    })

    expect(advice).toContain('större snabbmatsmåltid')
    expect(advice).toContain('nästa konkreta steg')
    expect(advice).toContain('proteinmål 108–144 g')
  })

  it('keeps chips and soda advice specific', () => {
    const { advice } = analyzeNutritionMessage('chips och läsk')

    expect(advice).toContain('Godis, chips eller läsk')
    expect(advice).toContain('blodsocker')
  })

  it('calls protein-rich meals protein-rich', () => {
    const { advice } = analyzeNutritionMessage('Kyckling med keso.')

    expect(advice).toContain('proteinrikt')
    expect(advice).toContain('mättnad')
  })

  it('does not expose unsafe placeholder values in advice', () => {
    const { advice } = analyzeNutritionMessage('Jag åt pizza.', {
      proteinGoal: '108–144 g',
    })

    expect(advice).not.toMatch(/NaN|undefined|null|\[object Object\]/)
  })
})

describe('AI Coach nutrition integration', () => {
  it('uses Nutrition Engine for pizza replies', () => {
    const response = coachReply('Jag åt pizza idag.')

    expect(response).toContain('En pizza förstör inte dina framsteg')
    expect(response).toContain('cirka 25 g protein')
    expect(response).toContain('750 kcal')
    expect(response).not.toContain('Vill du att vi fokuserar')
  })

  it('uses Nutrition Engine for a larger fast-food meal', () => {
    const response = coachReply('Jag åt två hamburgare, pommes och läsk.')

    expect(response).toContain('större snabbmatsmåltid')
    expect(response).toContain('nästa konkreta steg')
    expect(response).not.toMatch(/NaN|undefined|null|\[object Object\]/)
  })

  it('keeps pizza follow-up grounded in context', () => {
    const response = coachReply('Var det dumt?', [
      {
        role: 'user',
        text: 'Jag åt pizza.',
      },
    ])

    expect(response).toContain('pizza')
    expect(response).toContain('förstör inte dina framsteg')
  })
})

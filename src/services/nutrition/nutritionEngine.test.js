import { describe, expect, it } from 'vitest'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  analyzeMealText,
  analyzeNutritionMessage,
  calculateDailyNutritionSummary,
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

describe('Nutrition Engine V2 units and quantities', () => {
  it('calculates grams with a space', () => {
    const analysis = analyzeMealText('Jag åt 250 gram kyckling.')

    expect(analysis.items[0].grams).toBe(250)
    expect(analysis.totals.protein).toBe(77.5)
    expect(analysis.totals.calories).toBe(412.5)
  })

  it('calculates compact grams without a space', () => {
    const analysis = analyzeMealText('Jag åt 150g ris.')

    expect(analysis.items[0].food.id).toBe('ris')
    expect(analysis.items[0].grams).toBe(150)
    expect(analysis.totals.calories).toBe(205.5)
  })

  it('handles approximate gram wording', () => {
    const analysis = analyzeMealText('cirka 200 g lax')

    expect(analysis.items[0].grams).toBe(200)
    expect(analysis.totals.protein).toBe(40)
  })

  it('converts deciliter havregryn', () => {
    const analysis = analyzeMealText('1 dl havregryn')

    expect(analysis.items[0].grams).toBe(35)
    expect(analysis.totals.protein).toBe(4.9)
  })

  it('converts deciliter milk', () => {
    const analysis = analyzeMealText('2 dl mjölk')

    expect(analysis.items[0].grams).toBe(200)
    expect(analysis.totals.protein).toBe(7)
  })

  it('handles comma decimal deciliter', () => {
    const analysis = analyzeMealText('1,5 dl ris')

    expect(analysis.items[0].grams).toBe(127.5)
  })

  it('handles point decimal deciliter', () => {
    const analysis = analyzeMealText('1.5 dl ris')

    expect(analysis.items[0].grams).toBe(127.5)
  })

  it('handles half deciliter wording', () => {
    const analysis = analyzeMealText('en halv dl kvarg')

    expect(analysis.items[0].grams).toBe(50)
    expect(analysis.totals.protein).toBe(6)
  })

  it('converts tablespoons', () => {
    const analysis = analyzeMealText('1 msk majonnäs')

    expect(analysis.items[0].food.id).toBe('majonnas')
    expect(analysis.items[0].grams).toBe(15)
  })

  it('converts Swedish tablespoon wording', () => {
    const analysis = analyzeMealText('2 matskedar olivolja')

    expect(analysis.items[0].grams).toBe(28)
    expect(analysis.totals.fat).toBe(28)
  })

  it('converts teaspoons', () => {
    const analysis = analyzeMealText('1 tsk smör')

    expect(analysis.items[0].grams).toBe(5)
  })

  it('converts Swedish teaspoon wording', () => {
    const analysis = analyzeMealText('en tesked socker')

    expect(analysis.items[0].grams).toBe(4)
    expect(analysis.totals.carbs).toBe(4)
  })

  it('converts slices of bread', () => {
    const analysis = analyzeMealText('2 skivor bröd')

    expect(analysis.items[0].grams).toBe(80)
    expect(analysis.totals.protein).toBe(8)
  })

  it('converts slices of cheese', () => {
    const analysis = analyzeMealText('3 skivor ost')

    expect(analysis.items[0].grams).toBe(60)
    expect(analysis.totals.protein).toBe(16.2)
  })

  it('converts pieces with Swedish number words', () => {
    const analysis = analyzeMealText('tre bananer')

    expect(analysis.items[0].grams).toBe(360)
  })

  it('converts four potatoes as pieces', () => {
    const analysis = analyzeMealText('fyra potatisar')

    expect(analysis.items[0].grams).toBe(320)
  })

  it('converts portions', () => {
    const analysis = analyzeMealText('en portion pasta')

    expect(analysis.items[0].grams).toBe(150)
  })

  it('converts two portions', () => {
    const analysis = analyzeMealText('två portioner ris')

    expect(analysis.items[0].grams).toBe(300)
  })

  it('handles large portion size', () => {
    const analysis = analyzeMealText('en stor portion pommes')

    expect(analysis.items[0].grams).toBe(220)
    expect(analysis.flags.energyDense).toBe(true)
  })

  it('handles small pizza size', () => {
    const analysis = analyzeMealText('en liten pizza')

    expect(analysis.items[0].grams).toBe(250)
    expect(analysis.totals.calories).toBe(535)
  })
})

describe('Nutrition Engine V2 composed meals', () => {
  it('sums chicken, rice and broccoli with explicit grams', () => {
    const analysis = analyzeMealText('Jag åt 200 g kyckling, 150 g ris och broccoli.')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['broccoli', 'kyckling', 'ris'])
    expect(analysis.totals.protein).toBe(69.1)
    expect(analysis.totals.calories).toBe(580.5)
    expect(analysis.totals.carbs).toBe(52)
  })

  it('sums eggs and bread', () => {
    const analysis = analyzeMealText('två ägg och två skivor bröd')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['agg', 'brod'])
    expect(analysis.totals.protein).toBe(20)
    expect(analysis.totals.calories).toBe(390)
  })

  it('sums oats, milk and banana', () => {
    const analysis = analyzeMealText('havregryn med mjölk och banan')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['banan', 'havregryn', 'mjolk'])
    expect(analysis.flags.containsFruit).toBe(true)
  })

  it('sums hamburger, fries and soda', () => {
    const analysis = analyzeMealText('hamburgare, pommes och läsk')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['hamburgare', 'lask', 'pommes'])
    expect(analysis.flags.containsFastFood).toBe(true)
    expect(analysis.flags.containsSweets).toBe(true)
  })

  it('sums salmon and potatoes', () => {
    const analysis = analyzeMealText('lax med potatis')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['lax', 'potatis'])
    expect(analysis.flags.proteinRich).toBe(true)
  })

  it('sums quark and banana', () => {
    const analysis = analyzeMealText('kvarg med banan')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['banan', 'kvarg'])
  })

  it('sums pizza and soda', () => {
    const analysis = analyzeMealText('pizza och läsk')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['lask', 'pizza'])
    expect(analysis.flags.energyDense).toBe(true)
  })

  it('keeps known foods when unknown food is present', () => {
    const analysis = analyzeMealText('Jag åt 200 g kyckling och hemlagad sås.')

    expect(analysis.items.map((item) => item.food.id)).toEqual(['kyckling'])
    expect(analysis.unknownFoods).toContain('hemlagad sås')
  })
})

describe('Nutrition Engine V2 longest match and validation', () => {
  it('counts Greek yoghurt only once', () => {
    const analysis = analyzeMealText('grekisk yoghurt')

    expect(analysis.items).toHaveLength(1)
    expect(analysis.items[0].food.id).toBe('grekisk-yoghurt')
  })

  it('counts chicken breast as chicken once', () => {
    const analysis = analyzeMealText('kycklingbröst')

    expect(analysis.items).toHaveLength(1)
    expect(analysis.items[0].food.id).toBe('kyckling')
  })

  it('does not count pommes as potato', () => {
    const analysis = analyzeMealText('pommes frites')

    expect(analysis.items).toHaveLength(1)
    expect(analysis.items[0].food.id).toBe('pommes')
  })

  it('does not double count protein bread and bread', () => {
    const analysis = analyzeMealText('proteinbröd')

    expect(analysis.items).toHaveLength(1)
    expect(analysis.items[0].food.id).toBe('brod')
  })

  it('does not double count cola zero and cola soda aliases', () => {
    const analysis = analyzeMealText('cola zero')

    expect(analysis.items).toHaveLength(1)
    expect(analysis.items[0].food.id).toBe('lask')
  })

  it('has unique food ids and valid numbers', () => {
    const ids = nutritionFoods.map((food) => food.id)

    expect(new Set(ids).size).toBe(ids.length)
    nutritionFoods.forEach((food) => {
      expect(food.aliases.length).toBeGreaterThan(0)
      expect(food.defaultPortionGrams).toBeGreaterThan(0)
      expect(food.caloriesPer100g).toBeGreaterThanOrEqual(0)
      expect(food.proteinPer100g).toBeGreaterThanOrEqual(0)
      expect(food.carbsPer100g).toBeGreaterThanOrEqual(0)
      expect(food.fatPer100g).toBeGreaterThanOrEqual(0)
      expect(Number.isNaN(food.caloriesPer100g)).toBe(false)
    })
  })
})

describe('Nutrition Engine V2 daily summary', () => {
  const today = '2026-07-27'
  const meals = [
    {
      date: today,
      id: 'breakfast',
      name: 'Frukost: havregryn med mjölk och banan',
    },
    {
      date: today,
      id: 'lunch',
      name: 'Till lunch åt jag 200 g kyckling, 150 g ris och broccoli',
    },
    {
      date: today,
      id: 'partial',
      name: 'Kvällsmål kvarg och hemlagad sås',
    },
    {
      date: '2026-07-28',
      id: 'future',
      name: 'pizza',
    },
    {
      date: 'trasigt',
      id: 'broken',
      name: 'hamburgare',
    },
  ]

  it('summarizes only today and ignores future and broken dates', () => {
    const summary = calculateDailyNutritionSummary(meals, today, {
      nutritionGoals: {
        protein: '108–144 g',
      },
    })

    expect(summary.mealCount).toBe(3)
    expect(summary.totals.protein).toBeGreaterThan(90)
    expect(summary.unknownFoods).toContain('hemlagad sås')
  })

  it('reports partially analyzed meals', () => {
    const summary = calculateDailyNutritionSummary(meals, today)

    expect(summary.partiallyAnalyzedMealCount).toBe(1)
  })

  it('returns empty totals for empty meal lists', () => {
    const summary = calculateDailyNutritionSummary([], today)

    expect(summary.mealCount).toBe(0)
    expect(summary.totals.calories).toBe(0)
  })

  it('calculates protein goal remaining and percent', () => {
    const summary = calculateDailyNutritionSummary(meals, today, {
      nutritionGoals: {
        protein: '108–144 g',
      },
    })

    expect(summary.proteinGoal.lower).toBe(108)
    expect(summary.proteinPercent).toBeGreaterThan(80)
    expect(summary.proteinRemaining).toBeGreaterThanOrEqual(0)
  })

  it('handles missing protein goal without inventing one', () => {
    const summary = calculateDailyNutritionSummary(meals, today)

    expect(summary.proteinGoal).toBeNull()
    expect(summary.proteinRemaining).toBeNull()
  })

  it('calculates calories remaining when a calorie goal exists', () => {
    const summary = calculateDailyNutritionSummary(meals, today, {
      nutritionGoals: {
        calories: 2200,
      },
    })

    expect(summary.caloriesGoal).toBe(2200)
    expect(summary.caloriesRemaining).toBeGreaterThan(0)
  })

  it('does not invent a calorie goal', () => {
    const summary = calculateDailyNutritionSummary(meals, today)

    expect(summary.caloriesGoal).toBeNull()
    expect(summary.caloriesRemaining).toBeNull()
  })

  it('deduplicates meals with the same id', () => {
    const summary = calculateDailyNutritionSummary([meals[0], meals[0]], today)

    expect(summary.mealCount).toBe(1)
  })
})

describe('Nutrition Engine V2 AI Coach replies', () => {
  const today = new Date().toISOString().slice(0, 10)
  const context = {
    ...coachContext,
    meals: [
      {
        date: today,
        id: 'breakfast',
        name: 'Frukost: två ägg och två skivor bröd',
      },
      {
        date: today,
        id: 'lunch',
        name: 'Till lunch åt jag 200 g kyckling, 150 g ris och broccoli',
      },
    ],
    nutritionGoals: {
      calories: 2200,
      protein: '108–144 g',
    },
  }
  const ask = (message) => createDeterministicAiCoachReply({
    context,
    message,
  })

  it('answers protein eaten today from real meal data', () => {
    const response = ask('Hur mycket protein har jag ätit idag?')

    expect(response).toContain('protein idag')
    expect(response).toContain('proteinmålet 108–144 g')
  })

  it('answers calories eaten today from real meal data', () => {
    const response = ask('Hur många kalorier har jag fått i mig?')

    expect(response).toContain('kcal idag')
  })

  it('answers protein remaining', () => {
    const response = ask('Hur mycket protein har jag kvar?')

    expect(response).toContain('kvar')
    expect(response).toContain('proteinmålet')
  })

  it('answers lunch analysis', () => {
    const response = ask('Hur såg min lunch ut?')

    expect(response).toContain('Lunch')
    expect(response).toContain('protein')
    expect(response).toContain('kcal')
  })

  it('analyzes a text meal without saving it', () => {
    const response = ask('Jag åt 200 g kyckling och 150 g ris.')

    expect(response).toContain('cirka')
    expect(response).toContain('protein')
    expect(context.meals).toHaveLength(2)
  })

  it('answers pizza and soda without blame', () => {
    const response = ask('Jag åt pizza och drack läsk, har jag förstört allt?')

    expect(response).toContain('En pizza förstör inte dina framsteg')
    expect(response).not.toContain('hela dagen är förstörd')
  })
})

describe('Nutrition Engine V2 robustness', () => {
  it('does not expose unsafe values for empty text', () => {
    const analysis = analyzeMealText('')

    expect(analysis.items).toEqual([])
    expect(JSON.stringify(analysis)).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
  })

  it('ignores negative gram amounts', () => {
    const analysis = analyzeMealText('-100 g kyckling')

    expect(analysis.items).toEqual([])
  })

  it('ignores zero gram amounts', () => {
    const analysis = analyzeMealText('0 gram kyckling')

    expect(analysis.items).toEqual([])
  })

  it('handles very large amounts without unsafe output', () => {
    const analysis = analyzeMealText('9999 g ris')

    expect(analysis.totals.calories).toBeGreaterThan(0)
    expect(JSON.stringify(analysis)).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
  })

  it('handles broken meal list input in daily summary', () => {
    const summary = calculateDailyNutritionSummary(null, '2026-07-27')

    expect(summary.mealCount).toBe(0)
    expect(summary.totals.protein).toBe(0)
  })
})

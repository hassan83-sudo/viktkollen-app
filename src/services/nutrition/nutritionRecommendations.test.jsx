import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NutritionActionPlan from '../../components/NutritionActionPlan.jsx'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  buildDailyNutritionRecommendations,
  buildMealSuggestions,
  buildMonthlyNutritionRecommendations,
  buildNutritionActionPlan,
  buildRecommendationExplanation,
  buildWeeklyNutritionRecommendations,
  dedupeNutritionRecommendations,
  nutritionRecommendationInternals,
  prioritizeNutritionActions,
} from './nutritionEngine.js'

const date = '2026-07-29'
const goals = { calories: 2100, protein: 110 }
const clearMeal = {
  date,
  description: '200 g kyckling, 150 g ris och 100 g broccoli',
  id: 'clear',
  name: 'Kyckling och ris',
  time: '12:00',
  type: 'Lunch',
}
const proteinMeal = {
  date,
  id: 'protein',
  name: 'Proteinmåltid',
  nutritionOverride: { calories: 600, carbs: 40, fat: 20, protein: 115 },
  time: '12:00',
  type: 'Lunch',
}
const lowProteinMeal = {
  date,
  id: 'low',
  name: 'Ägg',
  nutritionOverride: { calories: 200, protein: 20 },
  time: '08:00',
  type: 'Frukost',
}
const calorieHighMeal = {
  date,
  id: 'cal-high',
  name: 'Stor middag',
  nutritionOverride: { calories: 2300, protein: 80 },
  time: '19:00',
  type: 'Middag',
}
const vagueMeal = {
  date,
  description: 'Middag',
  id: 'vague',
  name: 'Middag',
  time: '18:00',
  type: 'Middag',
}
const template = {
  id: 'template-1',
  isFavorite: true,
  mealType: 'Mellanmål',
  name: 'Vanlig frukost',
  nutritionOverride: { calories: 320, protein: 28 },
  text: 'kvarg och ägg',
  useCount: 4,
}
const weekMeals = [
  clearMeal,
  { ...lowProteinMeal, date: '2026-07-28', id: 'low-2' },
  { ...vagueMeal, date: '2026-07-27', id: 'vague-2' },
  { ...clearMeal, date: '2026-07-26', id: 'clear-2' },
]
const monthMeals = Array.from({ length: 12 }, (_, index) => ({
  ...(index % 3 === 0 ? vagueMeal : clearMeal),
  date: `2026-07-${String(index + 1).padStart(2, '0')}`,
  id: `month-${index}`,
}))

function daily(options = {}) {
  return buildDailyNutritionRecommendations({
    date,
    meals: [lowProteinMeal],
    nutritionGoals: goals,
    now: new Date(`${date}T15:00:00`),
    templates: [template],
    ...options,
  })
}

function coach(message, meals = [lowProteinMeal, vagueMeal]) {
  return createDeterministicAiCoachReply({
    context: {
      meals,
      nutritionGoals: goals,
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights: [
        { date: '2026-07-01', value: 91.8 },
        { date, value: 90.1 },
      ],
    },
    message,
  })
}

describe('daily nutrition recommendations', () => {
  it('returns empty state recommendation for no data', () => {
    expect(daily({ meals: [] })[0].title).toBe('Ingen nutritiondata idag')
  })

  it('returns goal setup recommendation when no goal exists', () => {
    expect(daily({ nutritionGoals: {}, meals: [clearMeal] }).some((item) => item.relatedGoal === 'goals')).toBe(true)
  })

  it('returns protein remaining recommendation', () => {
    expect(daily().some((item) => item.relatedGoal === 'protein')).toBe(true)
  })

  it('handles little protein remaining', () => {
    const recommendation = daily({ meals: [{ ...lowProteinMeal, nutritionOverride: { protein: 95, calories: 500 } }] }).find((item) => item.relatedGoal === 'protein')

    expect(recommendation.title).toBe('Lite protein kvar')
  })

  it('handles much protein remaining', () => {
    const recommendation = daily({ meals: [{ ...lowProteinMeal, nutritionOverride: { protein: 10, calories: 200 } }] }).find((item) => item.relatedGoal === 'protein')

    expect(recommendation.priority).toBe('high')
  })

  it('does not suggest more protein when goal is reached', () => {
    expect(daily({ meals: [proteinMeal] }).find((item) => item.title === 'Proteinmålet är uppnått')).toBeTruthy()
  })

  it('keeps protein action neutral when goal is reached', () => {
    expect(daily({ meals: [proteinMeal] }).find((item) => item.relatedGoal === 'protein').action).toContain('Ingen extra')
  })

  it('returns near calorie goal recommendation', () => {
    const items = daily({ meals: [{ ...lowProteinMeal, nutritionOverride: { calories: 1850, protein: 40 } }] })

    expect(items.some((item) => item.title === 'Kalorimålet är nära')).toBe(true)
  })

  it('returns neutral calorie over goal recommendation', () => {
    const items = daily({ meals: [calorieHighMeal] })

    expect(items.find((item) => item.relatedGoal === 'calories').message).toContain('passerat')
  })

  it('does not use failure wording for over calorie goal', () => {
    expect(daily({ meals: [calorieHighMeal] }).map((item) => item.message).join(' ')).not.toMatch(/misslyck|förbjud|farlig/i)
  })

  it('returns quality recommendation for vague meals', () => {
    expect(daily({ meals: [vagueMeal] }).some((item) => item.category === 'quality')).toBe(true)
  })

  it('marks clear data recommendation as high or medium confidence', () => {
    const confidence = daily({ meals: [clearMeal] })[0].confidence

    expect(['high', 'medium']).toContain(confidence)
  })

  it('marks vague data as low or medium confidence', () => {
    const confidence = daily({ meals: [vagueMeal] })[0].confidence

    expect(['low', 'medium']).toContain(confidence)
  })

  it('ignores future meals for today recommendations', () => {
    const items = daily({ meals: [{ ...proteinMeal, date: '2999-01-01' }] })

    expect(items.some((item) => item.relatedGoal === 'protein')).toBe(false)
  })

  it('does not show negative remaining goal', () => {
    expect(JSON.stringify(daily({ meals: [proteinMeal] }))).not.toMatch(/-\d/)
  })

  it('keeps max three daily recommendations', () => {
    expect(daily({ meals: [vagueMeal], nutritionGoals: {} }).length).toBeLessThanOrEqual(3)
  })
})

describe('meal suggestions and templates', () => {
  it('returns protein suggestions', () => {
    expect(buildMealSuggestions({ remainingProtein: 25 })[0].tags).toContain('protein')
  })

  it('uses estimated ranges', () => {
    expect(buildMealSuggestions({ remainingProtein: 25 })[0].estimatedProteinRange).toContain('cirka')
  })

  it('returns max three suggestions', () => {
    expect(buildMealSuggestions({ remainingProtein: 25 })).toHaveLength(3)
  })

  it('avoids decimal false precision', () => {
    expect(buildMealSuggestions({ remainingProtein: 25 })[0].estimatedProteinRange).not.toMatch(/\d+[,.]\d/)
  })

  it('filters suitable meal type', () => {
    expect(buildMealSuggestions({ mealType: 'middag' }).some((item) => item.suitableMealTypes.includes('middag'))).toBe(true)
  })

  it('prioritizes matching templates', () => {
    expect(buildMealSuggestions({ remainingProtein: 28, templates: [template] })[0].template.id).toBe(template.id)
  })

  it('falls back when no matching template exists', () => {
    expect(buildMealSuggestions({ remainingProtein: 100, templates: [template] })[0].template).toBeUndefined()
  })

  it('respects manual template override', () => {
    expect(buildMealSuggestions({ remainingProtein: 28, templates: [template] })[0].estimatedProteinRange).toContain('28')
  })

  it('creates Quick Add template action on daily recommendation', () => {
    expect(daily().find((item) => item.template)?.template.id).toBe(template.id)
  })
})

describe('weekly nutrition recommendations', () => {
  it('recommends more registration for limited week', () => {
    expect(buildWeeklyNutritionRecommendations({ date, meals: [clearMeal], nutritionGoals: goals }).some((item) => item.relatedGoal === 'logging')).toBe(true)
  })

  it('recommends protein consistency when goal is not stable', () => {
    expect(buildWeeklyNutritionRecommendations({ date, meals: weekMeals, nutritionGoals: goals }).some((item) => item.relatedGoal === 'protein')).toBe(true)
  })

  it('recommends quality improvement for missing quantities', () => {
    expect(buildWeeklyNutritionRecommendations({ date, meals: weekMeals, nutritionGoals: goals }).some((item) => item.category === 'quality')).toBe(true)
  })

  it('keeps max three weekly recommendations', () => {
    expect(buildWeeklyNutritionRecommendations({ date, meals: weekMeals, nutritionGoals: goals }).length).toBeLessThanOrEqual(3)
  })

  it('does not duplicate weekly advice', () => {
    const items = buildWeeklyNutritionRecommendations({ date, meals: weekMeals, nutritionGoals: goals })

    expect(new Set(items.map((item) => `${item.category}-${item.relatedGoal}`)).size).toBe(items.length)
  })

  it('does not recommend more protein when stable', () => {
    const meals = [0, 1, 2, 3].map((index) => ({ ...proteinMeal, date: `2026-07-${String(26 + index).padStart(2, '0')}`, id: `p-${index}` }))

    expect(buildWeeklyNutritionRecommendations({ date, meals, nutritionGoals: goals }).some((item) => item.relatedGoal === 'protein')).toBe(false)
  })
})

describe('monthly nutrition recommendations', () => {
  it('recommends limited coverage action', () => {
    expect(buildMonthlyNutritionRecommendations({ date, meals: [clearMeal], nutritionGoals: goals }).some((item) => item.relatedGoal === 'logging')).toBe(true)
  })

  it('recommends quality action', () => {
    expect(buildMonthlyNutritionRecommendations({ date, meals: monthMeals, nutritionGoals: goals }).some((item) => item.category === 'quality')).toBe(true)
  })

  it('keeps max four monthly recommendations', () => {
    expect(buildMonthlyNutritionRecommendations({ date, meals: monthMeals, nutritionGoals: goals }).length).toBeLessThanOrEqual(4)
  })

  it('does not use causation language about weight', () => {
    const text = buildMonthlyNutritionRecommendations({ date, meals: monthMeals, nutritionGoals: goals, weights: [{ date, value: 90 }] }).map((item) => item.message).join(' ')

    expect(text).not.toMatch(/orsakade|leder till|garanterar/i)
  })

  it('mentions template usage when templates exist', () => {
    expect(buildMonthlyNutritionRecommendations({ date, meals: monthMeals, nutritionGoals: goals, templates: [template] }).some((item) => item.category === 'template')).toBe(true)
  })
})

describe('priority and deduplication', () => {
  const items = [
    { category: 'protein', id: 'p1', priority: 'high', relatedGoal: 'protein', scope: 'day', title: 'Protein' },
    { category: 'quality', id: 'q1', priority: 'medium', relatedGoal: 'quality', scope: 'day', title: 'Quality' },
    { category: 'empty', id: 'e1', priority: 'high', relatedGoal: 'data', scope: 'day', title: 'Data' },
  ]

  it('puts quality before goals/protein', () => {
    expect(prioritizeNutritionActions(items)[0].category).toBe('quality')
  })

  it('puts no data before goals', () => {
    expect(prioritizeNutritionActions(items)[1].category).toBe('empty')
  })

  it('keeps deterministic ordering', () => {
    expect(prioritizeNutritionActions(items)).toEqual(prioritizeNutritionActions(items))
  })

  it('limits recommendations', () => {
    expect(prioritizeNutritionActions(items, { limit: 2 })).toHaveLength(2)
  })

  it('avoids duplicate high priority overload', () => {
    expect(prioritizeNutritionActions(items).filter((item) => item.priority === 'high').length).toBeLessThanOrEqual(1)
  })

  it('deduplicates same category and goal', () => {
    expect(dedupeNutritionRecommendations([items[0], { ...items[0], id: 'p2' }])).toHaveLength(1)
  })

  it('retains unrelated advice', () => {
    expect(dedupeNutritionRecommendations([items[0], items[1]])).toHaveLength(2)
  })
})

describe('nutrition action plan', () => {
  it('builds today recommendations', () => {
    expect(buildNutritionActionPlan({ date, meals: [lowProteinMeal], nutritionGoals: goals }).today.length).toBeGreaterThan(0)
  })

  it('builds weekly recommendations', () => {
    expect(buildNutritionActionPlan({ date, meals: weekMeals, nutritionGoals: goals }).thisWeek.length).toBeGreaterThan(0)
  })

  it('builds monthly recommendations', () => {
    expect(buildNutritionActionPlan({ date, meals: monthMeals, nutritionGoals: goals }).nextMonth.length).toBeGreaterThan(0)
  })

  it('updates when goals update', () => {
    const before = buildNutritionActionPlan({ date, meals: [lowProteinMeal], nutritionGoals: goals }).today.map((item) => item.relatedGoal)
    const after = buildNutritionActionPlan({ date, meals: [lowProteinMeal], nutritionGoals: {} }).today.map((item) => item.relatedGoal)

    expect(before).not.toEqual(after)
  })

  it('updates when meal is deleted', () => {
    expect(buildNutritionActionPlan({ date, meals: [], nutritionGoals: goals }).today[0].category).toBe('empty')
  })

  it('does not mutate meal data', () => {
    const meal = { ...lowProteinMeal }

    buildNutritionActionPlan({ date, meals: [meal], nutritionGoals: goals })
    expect(meal).toEqual(lowProteinMeal)
  })
})

describe('recommendation UI', () => {
  function renderPlan(props = {}) {
    return renderToStaticMarkup(
      <NutritionActionPlan
        date={date}
        meals={[lowProteinMeal, vagueMeal]}
        nutritionGoals={goals}
        templates={[template]}
        weights={[]}
        onAddTemplate={() => true}
        {...props}
      />,
    )
  }

  it('renders action plan', () => {
    expect(renderPlan()).toContain('Rekommendationer')
  })

  it('renders recommendation card', () => {
    expect(renderPlan()).toContain('Nästa steg')
  })

  it('renders show why button', () => {
    expect(renderPlan()).toContain('Visa varför')
  })

  it('renders hide session button', () => {
    expect(renderPlan()).toContain('Dölj')
  })

  it('renders Quick Add template button', () => {
    expect(renderPlan()).toContain('Lägg till från mall')
  })

  it('renders confidence text', () => {
    expect(renderPlan()).toMatch(/Begränsat underlag|Delvis tydligt underlag/)
  })

  it('renders priority text', () => {
    expect(renderPlan()).toContain('prioritet')
  })

  it('has aria-expanded', () => {
    expect(renderPlan()).toContain('aria-expanded')
  })

  it('has Quick Add aria-label', () => {
    expect(renderPlan()).toContain('aria-label')
  })

  it('does not render unsafe placeholders', () => {
    expect(renderPlan()).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})

describe('AI Coach recommendations', () => {
  it('answers focus today', () => {
    expect(coach('Vad bör jag fokusera på idag?')).toMatch(/Protein|underlag|Registrera|Nästa/)
  })

  it('answers protein food suggestion', () => {
    expect(coach('Vad kan jag äta för att nå proteinmålet?')).toContain('protein')
  })

  it('answers matching template question', () => {
    expect(coach('Finns det någon måltidsmall som passar?')).toContain('mall')
  })

  it('answers weekly focus', () => {
    expect(coach('Vad är viktigast denna vecka?')).toContain('vecko')
  })

  it('answers monthly focus', () => {
    expect(coach('Vad kan jag förbättra nästa månad?')).toMatch(/månad|underlag|registrera/i)
  })

  it('answers recommendation reason', () => {
    expect(coach('Varför föreslår du detta?').length).toBeGreaterThan(10)
  })

  it('answers remaining goals', () => {
    expect(coach('Vad återstår av mina mål?')).toMatch(/protein|mål/i)
  })

  it('answers data quality need', () => {
    expect(coach('Behöver jag registrera mer data?')).toMatch(/registrera|underlag|måltider/i)
  })

  it('answers highest priority', () => {
    expect(coach('Vilka rekommendationer har högst prioritet?').length).toBeGreaterThan(10)
  })

  it('does not write storage wording', () => {
    expect(coach('Vad bör jag fokusera på idag?')).not.toContain('sparar')
  })
})

describe('recommendation robustness', () => {
  it.each([
    [[null, lowProteinMeal]],
    [[{ date, id: 'bad', description: '' }]],
    [[{ date: 'bad', id: 'bad-date', description: 'kyckling' }]],
    [[{ ...lowProteinMeal, nutritionOverride: { protein: 'abc' } }]],
  ])('does not crash for malformed meals %#', (meals) => {
    expect(() => buildNutritionActionPlan({ date, meals, nutritionGoals: goals })).not.toThrow()
  })

  it('handles malformed goals', () => {
    expect(() => buildNutritionActionPlan({ date, meals: [lowProteinMeal], nutritionGoals: 'bad' })).not.toThrow()
  })

  it('handles malformed templates', () => {
    expect(() => buildMealSuggestions({ remainingProtein: 25, templates: ['bad'] })).not.toThrow()
  })

  it('handles extreme values', () => {
    expect(JSON.stringify(buildNutritionActionPlan({ date, meals: [{ ...calorieHighMeal, nutritionOverride: { calories: 99999, protein: 999 } }], nutritionGoals: goals }))).not.toContain('Infinity')
  })

  it('handles 1000 meals', () => {
    const meals = Array.from({ length: 1000 }, (_, index) => ({ ...lowProteinMeal, id: `d-${index}` }))

    expect(buildDailyNutritionRecommendations({ date, meals, nutritionGoals: goals }).length).toBeLessThanOrEqual(3)
  })

  it('handles 5000 monthly meals', () => {
    const meals = Array.from({ length: 5000 }, (_, index) => ({ ...clearMeal, date: `2026-07-${String((index % 29) + 1).padStart(2, '0')}`, id: `m-${index}` }))

    expect(buildMonthlyNutritionRecommendations({ date, meals, nutritionGoals: goals }).length).toBeLessThanOrEqual(4)
  }, 10000)

  it('does not produce duplicate recommendations', () => {
    const items = buildNutritionActionPlan({ date, meals: [vagueMeal], nutritionGoals: {} }).today

    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
  })

  it('does not produce contradictory protein recommendations', () => {
    const text = buildDailyNutritionRecommendations({ date, meals: [proteinMeal], nutritionGoals: goals }).map((item) => item.action).join(' ')

    expect(text).not.toContain('proteinrikt mellanmål')
  })

  it('exposes confidence labels through internals', () => {
    expect(nutritionRecommendationInternals.confidenceLabel('low')).toBe('Begränsat underlag')
  })

  it('does not render invalid date text in action plan UI', () => {
    const html = renderToStaticMarkup(<NutritionActionPlan date="bad" meals={[lowProteinMeal]} nutritionGoals={goals} templates={[]} weights={[]} />)

    expect(html).not.toContain('Invalid')
  })

  it('keeps low confidence recommendations cautious', () => {
    const text = buildDailyNutritionRecommendations({ date, meals: [vagueMeal], nutritionGoals: goals }).map((item) => item.action).join(' ')

    expect(text).toMatch(/gärna|kan|om du/i)
  })

  it('does not promise weight loss in monthly recommendations', () => {
    const text = buildMonthlyNutritionRecommendations({ date, meals: monthMeals, nutritionGoals: goals }).map((item) => `${item.message} ${item.action}`).join(' ')

    expect(text).not.toMatch(/går ner|kommer gå ner|garanterar/i)
  })

  it('keeps recommendation explanations without raw JSON', () => {
    expect(buildRecommendationExplanation(daily()[0])).not.toContain('{')
  })

  it('keeps action plan recommendations bounded across scopes', () => {
    const plan = buildNutritionActionPlan({ date, meals: monthMeals, nutritionGoals: goals, templates: [template] })

    expect(plan.today.length + plan.thisWeek.length + plan.nextMonth.length).toBeLessThanOrEqual(10)
  })
})

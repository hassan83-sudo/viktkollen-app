import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import NutritionGoalsPanel from '../../components/nutrition/NutritionGoalsPanel.jsx'
import { createNutritionDashboardModel } from '../../components/nutritionDashboard/nutritionDashboardViewModel.js'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import { userDataKeys } from '../userDataRepository.js'
import {
  buildProteinDistributionPlan,
  calculateSuggestedCalorieGoal,
  calculateSuggestedProteinGoal,
  createUpdatedNutritionGoals,
  makeNutritionGoalProgress,
  normalizeNutritionGoals,
  validateNutritionGoals,
} from './nutritionEngine.js'

const profile = {
  activityLevel: 'måttlig',
  age: 35,
  gender: 'man',
  goal: 'gå ner i vikt',
  goalWeight: 78,
  height: 180,
}

const weights = [
  { date: '2026-07-01', weight: 91.8 },
  { date: '2026-07-28', weight: 90.1 },
]

const meals = [
  {
    date: '2026-07-28',
    id: 'lunch',
    name: 'Lunch',
    text: '200 g kyckling och 150 g ris',
    time: '12:00',
  },
]

function coach(message, nutritionGoals = { protein: 110, calories: 2050 }) {
  return createDeterministicAiCoachReply({
    context: {
      meals,
      nutritionGoals,
      profile,
      todayMeals: meals,
      weights,
    },
    message,
  })
}

function panelHtml(props = {}) {
  return renderToStaticMarkup(
    <NutritionGoalsPanel
      draft={{ protein: 110, proteinGoalSource: 'manual' }}
      errors={{}}
      onCancel={vi.fn()}
      onChange={vi.fn()}
      onClear={vi.fn()}
      onSave={vi.fn()}
      onUseSuggestedCalorieGoal={vi.fn()}
      onUseSuggestedProteinGoal={vi.fn()}
      proteinDistributionPlan={buildProteinDistributionPlan(110, meals, { date: '2026-07-28' })}
      suggestedCalorieGoal={calculateSuggestedCalorieGoal(profile, { weights })}
      suggestedProteinGoal={calculateSuggestedProteinGoal(profile, { weights })}
      {...props}
    />,
  )
}

describe('Nutrition Goals & Smart Targets V1 goal model', () => {
  it('normalizes empty goals', () => {
    expect(normalizeNutritionGoals({})).toEqual({})
  })

  it('normalizes old protein format', () => {
    expect(normalizeNutritionGoals({ protein: 108 }).protein).toBe(108)
  })

  it('keeps old protein range format', () => {
    expect(normalizeNutritionGoals({ protein: '108–144 g' }).protein).toBe('108–144 g')
  })

  it('normalizes old calorie format', () => {
    expect(normalizeNutritionGoals({ calories: '2050' }).calories).toBe(2050)
  })

  it('normalizes new protein grams alias', () => {
    expect(normalizeNutritionGoals({ proteinGoalGrams: 120 }).protein).toBe(120)
  })

  it('normalizes new calorie kcal alias', () => {
    expect(normalizeNutritionGoals({ calorieGoalKcal: 2100 }).calories).toBe(2100)
  })

  it('preserves manual source', () => {
    expect(normalizeNutritionGoals({ protein: 110, proteinGoalSource: 'manual' }).proteinGoalSource).toBe('manual')
  })

  it('preserves suggested source', () => {
    expect(normalizeNutritionGoals({ protein: 110, proteinGoalSource: 'suggested' }).proteinGoalSource).toBe('suggested')
  })

  it('defaults source to manual', () => {
    expect(normalizeNutritionGoals({ protein: 110 }).proteinGoalSource).toBe('manual')
  })

  it('preserves createdAt', () => {
    expect(normalizeNutritionGoals({ protein: 110, createdAt: '2026-07-01T10:00:00.000Z' }).createdAt).toBe('2026-07-01T10:00:00.000Z')
  })

  it('preserves updatedAt', () => {
    expect(normalizeNutritionGoals({ protein: 110, updatedAt: '2026-07-02T10:00:00.000Z' }).updatedAt).toBe('2026-07-02T10:00:00.000Z')
  })

  it('drops negative values', () => {
    expect(normalizeNutritionGoals({ protein: -1 }).protein).toBeUndefined()
  })

  it('drops NaN values', () => {
    expect(normalizeNutritionGoals({ protein: NaN }).protein).toBeUndefined()
  })

  it('drops Infinity values', () => {
    expect(normalizeNutritionGoals({ protein: Infinity }).protein).toBeUndefined()
  })

  it('accepts Swedish decimal', () => {
    expect(normalizeNutritionGoals({ protein: '110,5' }).protein).toBe(110.5)
  })

  it('accepts point decimal', () => {
    expect(normalizeNutritionGoals({ protein: '110.5' }).protein).toBe(110.5)
  })

  it('does not turn empty fields into zero', () => {
    expect(normalizeNutritionGoals({ protein: '' }).protein).toBeUndefined()
  })

  it('validates positive protein', () => {
    expect(validateNutritionGoals({ protein: 110 })).toEqual({})
  })

  it('rejects zero protein', () => {
    expect(validateNutritionGoals({ protein: 0 }).protein).toBeTruthy()
  })

  it('rejects zero calories', () => {
    expect(validateNutritionGoals({ calories: 0 }).calories).toBeTruthy()
  })

  it('allows zero carbs', () => {
    expect(validateNutritionGoals({ carbs: 0 })).toEqual({})
  })

  it('allows zero fat', () => {
    expect(validateNutritionGoals({ fat: 0 })).toEqual({})
  })

  it('allows zero fiber', () => {
    expect(validateNutritionGoals({ fiber: 0 })).toEqual({})
  })

  it('rejects letters', () => {
    expect(validateNutritionGoals({ protein: 'abc' }).protein).toBeTruthy()
  })

  it('rejects extreme protein', () => {
    expect(validateNutritionGoals({ protein: 9999 }).protein).toBeTruthy()
  })

  it('creates updated manual goals', () => {
    const result = createUpdatedNutritionGoals({}, { protein: 110 }, { now: '2026-07-28T10:00:00.000Z' })

    expect(result.goals.protein).toBe(110)
    expect(result.goals.proteinGoalSource).toBe('manual')
  })

  it('creates updated suggested goals', () => {
    const result = createUpdatedNutritionGoals({}, { protein: 115, proteinGoalSource: 'suggested' }, { source: 'suggested' })

    expect(result.goals.proteinGoalSource).toBe('suggested')
  })

  it('does not overwrite manual goal from suggestions unless requested', () => {
    const result = createUpdatedNutritionGoals({ protein: 110, proteinGoalSource: 'manual' }, { calories: 2050 }, { source: 'suggested' })

    expect(result.goals.protein).toBeUndefined()
    expect(result.goals.caloriesGoalSource).toBe('suggested')
  })
})

describe('Nutrition Goals & Smart Targets V1 protein suggestions', () => {
  it('suggests protein when weight exists', () => {
    expect(calculateSuggestedProteinGoal(profile, { weights }).recommendedGrams).toBeGreaterThan(100)
  })

  it('returns null when weight is missing', () => {
    expect(calculateSuggestedProteinGoal(profile, { weights: [] })).toBeNull()
  })

  it('raises suggestion for active user', () => {
    const active = calculateSuggestedProteinGoal({ ...profile, activityLevel: 'hög' }, { weights })
    const low = calculateSuggestedProteinGoal({ ...profile, activityLevel: 'låg' }, { weights })

    expect(active.recommendedGrams).toBeGreaterThan(low.recommendedGrams)
  })

  it('handles weight loss direction', () => {
    expect(calculateSuggestedProteinGoal({ ...profile, goalWeight: 78 }, { weights }).assumptions.join(' ')).toContain('viktnedgång')
  })

  it('handles gain direction', () => {
    expect(calculateSuggestedProteinGoal({ ...profile, goal: 'gå upp i vikt', goalWeight: 95 }, { weights }).assumptions.join(' ')).toContain('viktuppgång')
  })

  it('rounds to five grams', () => {
    expect(calculateSuggestedProteinGoal(profile, { weights }).recommendedGrams % 5).toBe(0)
  })

  it('rejects extreme weight', () => {
    expect(calculateSuggestedProteinGoal(profile, { weights: [{ date: '2026-07-28', weight: 900 }] })).toBeNull()
  })

  it('ignores future weight', () => {
    expect(calculateSuggestedProteinGoal(profile, { weights: [...weights, { date: '2999-01-01', weight: 50 }] }).recommendedGrams).toBeGreaterThan(100)
  })

  it('contains general advice wording', () => {
    expect(calculateSuggestedProteinGoal(profile, { weights }).explanation).toContain('generellt')
  })
})

describe('Nutrition Goals & Smart Targets V1 calorie suggestions', () => {
  it('suggests calories from complete profile', () => {
    expect(calculateSuggestedCalorieGoal(profile, { weights }).suggestedGoal).toBeGreaterThan(1500)
  })

  it('reports missing weight', () => {
    expect(calculateSuggestedCalorieGoal(profile, { weights: [] }).missingFields).toContain('vikt')
  })

  it('reports missing height', () => {
    expect(calculateSuggestedCalorieGoal({ ...profile, height: '' }, { weights }).missingFields).toContain('längd')
  })

  it('reports missing age', () => {
    expect(calculateSuggestedCalorieGoal({ ...profile, age: '' }, { weights }).missingFields).toContain('ålder')
  })

  it('works without gender using neutral estimate', () => {
    expect(calculateSuggestedCalorieGoal({ ...profile, gender: '' }, { weights }).suggestedGoal).toBeGreaterThan(1300)
  })

  it('uses lower goal for weight loss than maintenance', () => {
    const suggestion = calculateSuggestedCalorieGoal(profile, { weights })

    expect(suggestion.suggestedGoal).toBeLessThan(suggestion.maintenanceEstimate)
  })

  it('uses higher goal for weight gain', () => {
    const suggestion = calculateSuggestedCalorieGoal({ ...profile, goal: 'gå upp i vikt', goalWeight: 95 }, { weights })

    expect(suggestion.suggestedGoal).toBeGreaterThan(suggestion.maintenanceEstimate)
  })

  it('does not create extreme low goal', () => {
    expect(calculateSuggestedCalorieGoal({ ...profile, height: 121, age: 89, gender: 'kvinna' }, { weights: [{ date: '2026-07-28', weight: 35 }] }).suggestedGoal).toBeNull()
  })

  it('returns cautious explanation for insufficient data', () => {
    expect(calculateSuggestedCalorieGoal({}, {}).explanation).toContain('inte tillräckligt')
  })
})

describe('Nutrition Goals & Smart Targets V1 protein distribution', () => {
  it('builds four meal plan', () => {
    expect(buildProteinDistributionPlan(120, [], { date: '2026-07-28', mealCount: 4 }).targets).toHaveLength(4)
  })

  it('builds three meal plan', () => {
    expect(buildProteinDistributionPlan(120, [], { date: '2026-07-28', mealCount: 3 }).targets).toHaveLength(3)
  })

  it('returns null without goal', () => {
    expect(buildProteinDistributionPlan(null, [])).toBeNull()
  })

  it('does not push more protein when achieved', () => {
    expect(buildProteinDistributionPlan(30, meals, { date: '2026-07-28' }).achieved).toBe(true)
  })

  it('handles little remaining protein', () => {
    expect(buildProteinDistributionPlan(80, meals, { date: '2026-07-28' }).explanation).toContain('kvar')
  })

  it('uses effective meal nutrition', () => {
    const plan = buildProteinDistributionPlan(120, [{ ...meals[0], nutritionOverride: { protein: 60 } }], { date: '2026-07-28' })

    expect(plan.eatenProtein).toBe(60)
  })

  it('ignores broken meals', () => {
    expect(buildProteinDistributionPlan(120, [null, 'mat'], { date: '2026-07-28' }).remainingProtein).toBe(120)
  })
})

describe('Nutrition Goals & Smart Targets V1 dashboard and AI', () => {
  it('builds protein progress', () => {
    expect(makeNutritionGoalProgress(78, 110, 'g', 'Protein').text).toContain('kvar')
  })

  it('builds reached progress', () => {
    expect(makeNutritionGoalProgress(120, 110, 'g', 'Protein').status).toBe('reached')
  })

  it('dashboard uses carb fat and fiber goals', () => {
    const model = createNutritionDashboardModel({
      date: '2026-07-28',
      meals,
      nutritionGoals: { carbs: 200, fat: 70, fiber: 30, protein: 110 },
    })

    expect(model.progress.carbs.hasGoal).toBe(true)
    expect(model.progress.fat.hasGoal).toBe(true)
    expect(model.progress.fiber.hasGoal).toBe(true)
  })

  it('AI answers protein goal', () => {
    expect(coach('Vad är mitt proteinmål?')).toContain('proteinmål')
  })

  it('AI answers calorie goal', () => {
    expect(coach('Vad är mitt kalorimål?')).toContain('kalorimål')
  })

  it('AI answers protein remaining', () => {
    expect(coach('Hur mycket protein har jag kvar?')).toContain('kvar')
  })

  it('AI answers calories remaining', () => {
    expect(coach('Hur många kalorier har jag kvar?')).toContain('kcal')
  })

  it('AI suggests protein goal', () => {
    expect(coach('Kan du föreslå ett proteinmål?', {})).toContain('generellt')
  })

  it('AI suggests calorie goal', () => {
    expect(coach('Kan du föreslå ett kalorimål?', {})).toContain('uppskattning')
  })

  it('AI explains suggested source', () => {
    expect(coach('Hur sattes mitt proteinmål?', { protein: 115, proteinGoalSource: 'suggested' })).toContain('profil')
  })

  it('AI explains manual source', () => {
    expect(coach('Hur sattes mitt kalorimål?', { calories: 2050, caloriesGoalSource: 'manual' })).toContain('manuellt')
  })

  it('AI builds protein distribution', () => {
    expect(coach('Hur bör jag fördela proteinet idag?')).toContain('fördelning')
  })
})

describe('Nutrition Goals & Smart Targets V1 UI and storage shape', () => {
  it('renders without goals', () => {
    expect(panelHtml({ draft: {} })).toContain('Inget mål satt')
  })

  it('renders manual source', () => {
    expect(panelHtml()).toContain('Manuellt mål')
  })

  it('renders suggested source', () => {
    expect(panelHtml({ draft: { protein: 115, proteinGoalSource: 'suggested' } })).toContain('Förslag baserat på profil')
  })

  it('renders save button', () => {
    expect(panelHtml()).toContain('Spara mål')
  })

  it('renders reset button', () => {
    expect(panelHtml()).toContain('Återställ mål')
  })

  it('renders suggested protein button', () => {
    expect(panelHtml()).toContain('Föreslaget proteinmål')
  })

  it('renders suggested calorie button', () => {
    expect(panelHtml()).toContain('Föreslaget kalorimål')
  })

  it('renders validation error', () => {
    expect(panelHtml({ errors: { protein: 'Proteinmålet måste vara ett giltigt tal.' } })).toContain('Proteinmålet måste vara ett giltigt tal.')
  })

  it('uses the existing nutrition goals storage key', () => {
    expect(userDataKeys.nutritionGoals).toBe('viktkollen.nutritionGoals')
  })

  it('does not render unsafe values', () => {
    expect(panelHtml({ draft: { protein: NaN, calories: Infinity } })).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})

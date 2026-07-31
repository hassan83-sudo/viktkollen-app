import { describe, expect, it } from 'vitest'
import { buildAiCoachAppContextFromData } from './aiCoach/coachAppContext.js'
import { buildAiCoachFacts } from './aiCoach/coachFacts.js'
import { createAiCoachV2Report } from './aiCoachV2Service.js'
import { createDashboardData } from './dashboardService.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import { buildProgressDashboardAnalytics } from './progress/progressAnalytics.js'

const today = '2026-07-31'
const profile = { goalWeight: 78, startWeight: 91.8 }
const baseWeights = [
  { date: '2026-07-01', id: 'start', value: 91.8 },
  { date: '2026-07-30', id: 'previous', value: 90.1 },
]
const lunch = {
  calories: 520,
  date: today,
  id: 'lunch-1',
  name: 'Kyckling och ris',
  protein: 44,
  time: '12:05',
  type: 'Lunch',
}

function snapshot(overrides = {}) {
  return buildHealthSnapshot({
    checkIn: {},
    meals: [],
    nutritionGoals: { calories: 2000, fiber: 30, protein: 120 },
    profile,
    today,
    weights: baseWeights,
    ...overrides,
  })
}

describe('health snapshot freshness integration', () => {
  it('reflects a newly added weight immediately without stale storage data', () => {
    const fresh = snapshot({
      weights: [...baseWeights, { date: today, id: 'current', time: '20:30', value: 89.6 }],
    })

    expect(fresh.weight.current).toBe(89.6)
    expect(fresh.weight.totalChange).toBe(-2.2)
    expect(fresh.weight.facts.goalRemaining).toBe(11.6)
  })

  it('reflects an edited weight immediately', () => {
    const before = snapshot({
      weights: [...baseWeights, { date: today, id: 'current', time: '20:30', value: 90.1 }],
    })
    const after = snapshot({
      weights: [...baseWeights, { date: today, id: 'current', time: '20:30', value: 89.6 }],
    })

    expect(before.weight.current).toBe(90.1)
    expect(after.weight.current).toBe(89.6)
    expect(after.weight.totalChange).toBe(-2.2)
  })

  it('removes a deleted weight from derived facts immediately', () => {
    const withCurrent = snapshot({
      weights: [...baseWeights, { date: today, id: 'current', time: '20:30', value: 89.6 }],
    })
    const afterDelete = snapshot({ weights: baseWeights })

    expect(withCurrent.weight.current).toBe(89.6)
    expect(afterDelete.weight.current).toBe(90.1)
  })

  it("updates today's nutrition when a new meal is added", () => {
    const fresh = snapshot({ meals: [lunch] })

    expect(fresh.nutrition.mealCountToday).toBe(1)
    expect(fresh.nutrition.caloriesToday).toBe(520)
    expect(fresh.nutrition.proteinToday).toBe(44)
  })

  it('counts the same meal from meals and mealHistory once after a pending submit', () => {
    const fresh = snapshot({
      mealHistory: [{ ...lunch }],
      meals: [{ ...lunch }],
    })

    expect(fresh.nutrition.actualMeals).toHaveLength(1)
    expect(fresh.nutrition.mealCountToday).toBe(1)
  })

  it('removes deleted meals from the daily snapshot', () => {
    const withMeal = snapshot({ meals: [lunch] })
    const afterDelete = snapshot({ meals: [] })

    expect(withMeal.nutrition.mealCountToday).toBe(1)
    expect(afterDelete.nutrition.mealCountToday).toBe(0)
    expect(afterDelete.nutrition.proteinToday).toBe(0)
  })

  it('uses the latest check-in on the same day for dashboard and AI data', () => {
    const fresh = snapshot({
      checkIns: [
        { date: today, energy: 3, mood: 'low', steps: 3000, time: '08:00' },
        { date: today, energy: 8, mood: 'good', steps: 9000, time: '21:00' },
      ],
    })

    expect(fresh.checkIn.energy).toBe(8)
    expect(fresh.checkIn.steps).toBe(9000)
    expect(fresh.checkIn.display.mood).toBe('Positiv')
  })

  it('updates goal progress immediately when the goal changes', () => {
    const firstGoal = snapshot({
      weights: [...baseWeights, { date: today, value: 89.6 }],
    })
    const nextGoal = snapshot({
      profile: { goalWeight: 82, startWeight: 91.8 },
      weights: [...baseWeights, { date: today, value: 89.6 }],
    })

    expect(firstGoal.weight.facts.goalRemaining).toBe(11.6)
    expect(nextGoal.weight.facts.goalRemaining).toBe(7.6)
  })

  it('changes today meals deterministically when selectedMealDate changes', () => {
    const meals = [
      { ...lunch, date: '2026-07-30', id: 'yesterday' },
      { ...lunch, id: 'today' },
    ]

    expect(snapshot({ meals, today: '2026-07-30' }).nutrition.mealCountToday).toBe(1)
    expect(snapshot({ meals, today }).nutrition.mealsToday[0].id).toBe('today')
  })

  it('lets AI Coach context and dashboard prioritize the supplied fresh snapshot', () => {
    const staleWeights = [...baseWeights, { date: today, value: 90.1 }]
    const fresh = snapshot({
      meals: [lunch],
      weights: [...baseWeights, { date: today, value: 89.6 }],
    })
    const data = {
      healthSnapshot: fresh,
      meals: [],
      nutritionGoals: { protein: 120 },
      profile,
      today,
      weights: staleWeights,
    }
    const context = buildAiCoachAppContextFromData(data, { today })
    const facts = buildAiCoachFacts(context)
    const coach = createAiCoachV2Report(data)
    const dashboard = createDashboardData(data)

    expect(context.healthSnapshot.weight.current).toBe(89.6)
    expect(facts.latestWeight).toBe(89.6)
    expect(coach.coachProfile.currentWeight).toBe(89.6)
    expect(dashboard.goals.currentWeight).toBe(89.6)
    expect(facts.todayMeals).toHaveLength(1)
  })

  it('keeps progress dashboard analytics aligned with supplied snapshot data', () => {
    const fresh = snapshot({
      meals: [lunch],
      weights: [
        { date: '2026-07-01', value: 91.8 },
        { date: '2026-07-30', value: 90.1 },
        { date: today, value: 89.6 },
      ],
    })
    const analysis = buildProgressDashboardAnalytics({
      healthSnapshot: fresh,
      meals: [],
      nutritionGoals: {},
      profile,
      weights: [{ date: today, value: 90.1 }],
    }, { period: '30d', today })

    expect(analysis.weight.currentWeight).toBe(89.6)
    expect(analysis.weight.totalChangeKg).toBe(-2.2)
    expect(analysis.nutrition.mealCount).toBe(1)
  })
})

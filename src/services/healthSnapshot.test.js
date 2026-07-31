import { describe, expect, it } from 'vitest'
import { buildAiCoachFacts } from './aiCoach/coachFacts.js'
import { createAiCoachV2Report } from './aiCoachV2Service.js'
import { createDashboardData } from './dashboardService.js'
import { buildHealthSnapshot, mergeActualMealEntries } from './healthSnapshot.js'
import { createMonthlyHealthReport } from './monthlyReportService.js'
import { buildProgressDashboardAnalytics } from './progress/progressAnalytics.js'
import { makeWeeklyReportFallback } from './weeklyReportService.js'

const today = '2026-07-31'
const profile = { goalWeight: 78, startWeight: 91.8 }
const weights = [
  { date: '2026-07-01', value: 91.8 },
  { date: '2026-07-24', value: 90.1 },
  { date: '2026-07-31', time: '08:00', value: 90.1 },
  { date: '2026-07-31', time: '20:30', value: 89.6 },
  { date: '2026-08-01', value: 88 },
]
const baseMeal = {
  calories: 500,
  date: today,
  id: 'meal-1',
  name: 'Kyckling och ris',
  protein: 45,
  time: '12:00',
  type: 'Lunch',
}
const checkIns = [
  { date: today, energy: 4, mood: 'low', sleep: 6, steps: 5000, time: '08:00', workout: true },
  { date: today, energy: 8, mood: 'good', sleep: 7.5, steps: 10250, time: '21:00', workout: { type: 'promenad' } },
  { date: '2026-08-01', energy: 10, mood: 'great', steps: 20000 },
]

describe('health snapshot', () => {
  it('counts the same meal in meals and mealHistory once', () => {
    const snapshot = buildHealthSnapshot({
      mealHistory: [{ ...baseMeal }],
      meals: [{ ...baseMeal }],
      profile,
      today,
      weights,
    })

    expect(snapshot.nutrition.mealCountToday).toBe(1)
    expect(snapshot.nutrition.proteinToday).toBe(45)
  })

  it('keeps two truly separate similar meals', () => {
    const meals = [
      { ...baseMeal, id: 'meal-a', time: '12:00' },
      { ...baseMeal, id: 'meal-b', time: '18:00' },
    ]

    expect(mergeActualMealEntries([meals])).toHaveLength(2)
    expect(buildHealthSnapshot({ meals, today }).nutrition.mealCountToday).toBe(2)
  })

  it('does not count planned meals as intake', () => {
    const snapshot = buildHealthSnapshot({
      meals: [{ ...baseMeal, id: 'planned-meal-1', isPlanned: true }],
      today,
    })

    expect(snapshot.nutrition.mealCountToday).toBe(0)
  })

  it('keeps historical meals out of today', () => {
    const historicalMeals = [
      { ...baseMeal, date: '2026-07-26', id: 'old-1' },
      { ...baseMeal, date: '2026-07-26', id: 'old-2' },
      { ...baseMeal, date: '2026-07-26', id: 'old-3' },
    ]

    const snapshot = buildHealthSnapshot({ meals: historicalMeals, today })

    expect(snapshot.nutrition.mealCountToday).toBe(0)
    expect(snapshot.nutrition.caloriesToday).toBe(0)
    expect(snapshot.nutrition.proteinToday).toBe(0)
  })

  it('uses latest daily weight and latest daily check-in', () => {
    const snapshot = buildHealthSnapshot({ checkIns, profile, today, weights })

    expect(snapshot.weight.current).toBe(89.6)
    expect(snapshot.weight.start).toBe(91.8)
    expect(snapshot.weight.totalChange).toBe(-2.2)
    expect(snapshot.checkIn.energy).toBe(8)
    expect(snapshot.checkIn.steps).toBe(10250)
    expect(snapshot.checkIn.display.sleep).toBe('7 h 30 min')
  })

  it('filters future calendar days but keeps today later clock time', () => {
    const snapshot = buildHealthSnapshot({
      checkIns,
      meals: [
        { ...baseMeal, id: 'later', time: '23:59' },
        { ...baseMeal, date: '2026-08-01', id: 'future' },
      ],
      today: '2026-07-31T08:00:00',
      weights,
    })

    expect(snapshot.nutrition.mealsToday.map((meal) => meal.id)).toEqual(['later'])
    expect(snapshot.checkIn.steps).toBe(10250)
    expect(snapshot.weight.current).toBe(89.6)
  })

  it('does not mutate input arrays objects or Date anchors', () => {
    const date = new Date('2026-07-31T08:00:00')
    const originalWeights = weights.map((entry) => ({ ...entry }))
    const originalMeals = [{ ...baseMeal }]

    buildHealthSnapshot({ meals: originalMeals, today: date, weights: originalWeights })

    expect(date.toISOString()).toBe(new Date('2026-07-31T08:00:00').toISOString())
    expect(originalWeights).toEqual(weights)
    expect(originalMeals).toEqual([{ ...baseMeal }])
  })

  it("aligns AI Coach and dashboard on current weight and today's meals", () => {
    const data = { checkIns, meals: [baseMeal], profile, today, weights }
    const snapshot = buildHealthSnapshot(data)
    const coach = createAiCoachV2Report({ ...data, healthSnapshot: snapshot })
    const facts = buildAiCoachFacts({ ...data, healthSnapshot: snapshot })
    const dashboard = createDashboardData({ ...data, healthSnapshot: snapshot })

    expect(coach.coachProfile.currentWeight).toBe(snapshot.weight.current)
    expect(facts.latestWeight).toBe(snapshot.weight.current)
    expect(dashboard.goals.currentWeight).toBe(snapshot.weight.current)
    expect(coach.dailyAnalysis.mealCount).toBe(snapshot.nutrition.mealCountToday)
    expect(facts.todayMeals).toHaveLength(snapshot.nutrition.mealCountToday)
  })

  it('aligns weekly and monthly report period values with progress analytics', () => {
    const data = { checkIns, meals: [baseMeal], profile, today, weights }
    const snapshot = buildHealthSnapshot(data)
    const progress7 = buildProgressDashboardAnalytics(data, { period: '7d', today }).weight.changeKg
    const progress30 = buildProgressDashboardAnalytics(data, { period: '30d', today }).weight.changeKg
    const weekly = makeWeeklyReportFallback({ ...data, healthSnapshot: snapshot })
    const monthly = createMonthlyHealthReport({ ...data, healthSnapshot: snapshot })

    expect(snapshot.periods.sevenDays.weightChange).toBe(progress7)
    expect(snapshot.periods.thirtyDays.weightChange).toBe(progress30)
    expect(weekly.weightTrend).toContain('ned')
    expect(monthly.weightChange).toBe(progress30)
  })

  it('uses stable fallback availability and display values for missing data', () => {
    const snapshot = buildHealthSnapshot({ today })

    expect(snapshot.availability.weight).toBe(false)
    expect(snapshot.availability.mealsToday).toBe(false)
    expect(JSON.stringify(snapshot.display)).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})

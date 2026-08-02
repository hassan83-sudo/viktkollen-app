import { describe, expect, it } from 'vitest'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import { buildAiCoachFacts } from '../aiCoach/coachFacts.js'
import {
  normalizeCheckInMetrics,
  normalizeEnergy,
  normalizeMood,
  normalizeSleepMetrics,
  normalizeStepMetrics,
  normalizeWorkout,
} from '../checkInNormalization.js'
import {
  buildProgressDashboardAnalytics,
  formatProgressChange,
  getProgressPeriodRange,
  progressAnalyticsInternals,
  progressPeriods,
} from './progressAnalytics.js'

const today = new Date('2026-03-31T12:00:00.000Z')
const weights = [
  { date: '2026-01-01', value: 92 },
  { date: '2026-02-01', value: 91 },
  { date: '2026-03-01', value: 90.5 },
  { date: '2026-03-10', value: 90.2 },
  { date: '2026-03-20', value: 89.9 },
  { date: '2026-03-31', value: 89.5 },
  { date: '2026-04-01', value: 88 },
  { date: 'bad', value: 95 },
]
const meals = [
  { calories: 500, carbs: 45, date: '2026-03-25', fat: 12, id: 'meal-1', name: 'Frukost', protein: 35, time: '08:00', type: 'Frukost' },
  { calories: 650, carbs: 70, date: '2026-03-25', fat: 18, id: 'meal-2', name: 'Lunch', protein: 45, time: '12:00', type: 'Lunch' },
  { calories: 600, carbs: 55, date: '2026-03-26', fat: 16, id: 'meal-3', name: 'Middag', protein: 55, time: '18:00', type: 'Middag' },
  { calories: 450, carbs: 40, date: '2026-03-27', fat: 10, id: 'meal-4', name: 'Lunch', protein: 25, time: '12:00', type: 'Lunch' },
  { calories: 700, carbs: 80, date: '2026-03-01', fat: 20, id: 'meal-old', name: 'Old', protein: 40, time: '12:00', type: 'Lunch' },
]
const checkIns = [
  { date: '2026-03-25', energy: 7, mood: 'Fokuserad', steps: 8000, workout: true, workoutType: 'gym' },
  { date: '2026-03-26', energy: 6, mood: 'Fokuserad', steps: 7500, training: 'promenad' },
  { date: '2026-03-27', energy: 5, mood: 'Trött', steps: 5000, workout: false },
]
const foods = [
  { done: true, id: 'protein', label: 'Protein' },
  { done: true, id: 'veg', label: 'Grönt' },
  { done: false, id: 'water', label: 'Vatten' },
]
const nutritionGoals = { calories: 1800, protein: 80 }
const profile = { goalWeight: '78 kg', startWeight: '92 kg' }
const plannedMeal = {
  date: '2026-03-30',
  id: 'planned-1',
  ingredients: ['200 g kyckling'],
  mealType: 'Lunch',
  nutritionPreview: { calories: 500, protein: 40 },
  title: 'Planerad lunch',
}
const mealPlans = {
  weeks: {
    '2026-03-30': {
      days: {
        '2026-03-30': [plannedMeal],
      },
      weekStart: '2026-03-30',
    },
  },
}
const generatedMealPlans = {
  history: [{ days: [{ date: '2026-03-31', meals: [plannedMeal] }], id: 'generated-1', mode: 'day' }],
  latestPlanId: 'generated-1',
}

function analytics(overrides = {}, period = '7d') {
  return buildProgressDashboardAnalytics({
    checkIn: {},
    checkIns,
    foods,
    generatedMealPlans,
    mealPlans,
    meals,
    nutritionGoals,
    profile,
    today,
    weeklyReportData: { summary: 'Veckan hade jämnare rutiner.' },
    weights,
    ...overrides,
  }, { period, today })
}

describe('progress period ranges', () => {
  it.each([
    ['7d', '2026-03-25', '2026-03-31'],
    ['30d', '2026-03-02', '2026-03-31'],
    ['90d', '2026-01-01', '2026-03-31'],
    ['180d', '2025-10-03', '2026-03-31'],
    ['365d', '2025-04-01', '2026-03-31'],
    ['all', '', '2026-03-31'],
    ['bad', '2026-03-02', '2026-03-31'],
  ])('builds %s range', (period, start, end) => {
    const range = getProgressPeriodRange(period, today)

    expect(range.start).toBe(start)
    expect(range.end).toBe(end)
  })

  it('defines selectable periods', () => {
    expect(progressPeriods.map((period) => period.id)).toEqual(['7d', '30d', '90d', '180d', '365d', 'all'])
  })
})

describe('weight progress analytics', () => {
  it.each([
    ['7 day first weight', '7d', (result) => result.weight.firstWeight === 89.5],
    ['30 day latest weight', '30d', (result) => result.weight.latestWeight === 89.5],
    ['90 day start weight', '90d', (result) => result.weight.startWeight === 92],
    ['180 day native period', '180d', (result) => result.period.days === 180 && result.period.start === '2025-10-03'],
    ['365 day native period', '365d', (result) => result.period.days === 365 && result.period.start === '2025-04-01'],
    ['all period goal weight', 'all', (result) => result.weight.goalWeight === 78],
    ['future date excluded', 'all', (result) => result.weight.currentWeight === 89.5],
    ['invalid entry excluded', 'all', (result) => result.weight.registrationCount === 6],
  ])('%s', (_, period, assertion) => {
    expect(assertion(analytics({}, period))).toBe(true)
  })

  it('calculates weight change in kg', () => {
    expect(analytics({}, '30d').weight.changeKg).toBe(-0.7)
  })

  it('calculates percentage weight change', () => {
    expect(analytics({}, '30d').weight.percentChange).toBeLessThan(0)
  })

  it('calculates weekly average change', () => {
    expect(analytics({}, '30d').weight.weeklyAverageChange).toBeLessThan(0)
  })

  it('handles one weight registration', () => {
    expect(analytics({ weights: [weights[0]] }, 'all').weight.changeKg).toBe(0)
  })

  it('handles empty weight data', () => {
    expect(analytics({ weights: [] }, '7d').weight.registrationCount).toBe(0)
  })

  it('handles duplicate same-day weights', () => {
    expect(analytics({ weights: [...weights, { date: '2026-03-31T09:00:00', value: 89.4 }] }, '7d').weight.registrationCount).toBe(1)
  })

  it('uses central total weight facts separately from period trend', () => {
    const result = buildProgressDashboardAnalytics({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile: { goalWeight: '78 kg', startWeight: '78 kg' },
      weights: [
        { date: '2026-07-01', source: 'Manuell', time: '08:00', value: 91.8 },
        { date: '2026-07-10', source: 'Manuell', time: '08:00', value: 90.6 },
        { date: '2026-07-31', source: 'Manuell', time: '08:00', value: 89.6 },
        { date: '2026-07-31', source: 'Manuell', time: '08:04', value: 89.6 },
      ],
    }, { period: '30d', today: new Date('2026-07-31T12:00:00.000Z') })

    expect(result.weight.startWeight).toBe(91.8)
    expect(result.weight.currentWeight).toBe(89.6)
    expect(result.weight.totalChangeKg).toBe(-2.2)
    expect(result.weight.goalRemaining).toBe(11.6)
    expect(result.weight.periodChangeKg).toBe(-1)
    expect(result.weight.changeKg).toBe(-1)
    expect(result.weight.weeklyAverageChange).toBeCloseTo(-0.33)
    expect(result.weight.weeklyAverageChange).not.toBe(7)
  })

  it('keeps central current weight when latest same-day entry is later than the analysis clock', () => {
    const result = buildProgressDashboardAnalytics({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights: [
        { date: '2026-07-01', source: 'Manuell', time: '08:00', value: 91.8 },
        { date: '2026-07-10', source: 'Manuell', time: '08:00', value: 88.6 },
        { date: '2026-07-27', source: 'Manuell', time: '04:09', value: 90.1 },
        { date: '2026-07-31', source: 'Manuell', time: '04:09', value: 89.6 },
      ],
    }, { period: '30d', today: new Date('2026-07-31T01:00:00.000Z') })

    expect(result.weight.currentWeight).toBe(89.6)
    expect(result.weight.startWeight).toBe(91.8)
    expect(result.weight.totalChangeKg).toBe(-2.2)
    expect(result.weight.goalWeight).toBe(78)
    expect(result.weight.goalRemaining).toBe(11.6)
    expect(result.weight.periodChangeKg).toBe(1)
    expect(result.weight.latestWeight).toBe(89.6)
  })
})

describe('nutrition progress analytics', () => {
  it('calculates average calories per logged day', () => {
    expect(analytics().nutrition.averageCalories).toBeGreaterThan(500)
  })

  it('calculates average protein per logged day', () => {
    expect(analytics().nutrition.averageProtein).toBeGreaterThan(30)
  })

  it('calculates calorie goal days', () => {
    expect(analytics().nutrition.calorieGoalDays).toBeGreaterThan(0)
  })

  it('calculates protein goal days', () => {
    expect(analytics().nutrition.proteinGoalDays).toBeGreaterThan(0)
  })

  it('calculates calorie goal percent', () => {
    expect(analytics().nutrition.calorieGoalPercent).toBeGreaterThan(0)
  })

  it('calculates protein goal percent', () => {
    expect(analytics().nutrition.proteinGoalPercent).toBeGreaterThan(0)
  })

  it('counts logged meals only as actual nutrition', () => {
    expect(analytics().nutrition.mealCount).toBe(4)
  })

  it('keeps planned meals separate', () => {
    const result = analytics()

    expect(result.planning.plannedMealCount).toBe(1)
    expect(result.nutrition.mealCount).toBe(4)
  })

  it('finds most common meal type', () => {
    expect(analytics().nutrition.mostCommonMealType).toBe('Lunch')
  })

  it('handles empty meal data', () => {
    expect(analytics({ meals: [] }).nutrition.averageProtein).toBe(0)
  })
})

describe('habit progress analytics', () => {
  it.each([
    ['check-ins', (result) => result.habits.checkInCount === 3],
    ['average energy', (result) => result.habits.averageEnergy === 6],
    ['average mood', (result) => result.habits.averageMood === 'Fokuserad'],
    ['average steps', (result) => result.habits.averageSteps > 6000],
    ['training days', (result) => result.habits.trainingDays === 2],
    ['training form', (result) => result.habits.trainingForm === 'Gym'],
    ['active habits', (result) => result.habits.activeHabits === 3],
    ['completed habits', (result) => result.habits.completedHabits === 2],
    ['best streak', (result) => result.habits.bestStreak === 3],
  ])('calculates %s', (_, assertion) => {
    expect(assertion(analytics())).toBe(true)
  })

  it('uses single current check-in when history is missing', () => {
    expect(analytics({ checkIn: { energy: 8, mood: 'Glad', steps: 9000, workout: true }, checkIns: [] }).habits.checkInCount).toBe(1)
  })

  it('deduplicates check-ins by day', () => {
    expect(analytics({ checkIns: [...checkIns, checkIns[0]] }).habits.checkInCount).toBe(3)
  })

  it('normalizes boolean workout without leaking true as a training form', () => {
    const result = analytics({
      checkIns: [{ date: '2026-03-25', energy: 7, mood: 'Fokuserad', steps: 8000, workout: true }],
    })

    expect(result.habits.trainingDays).toBe(1)
    expect(result.habits.trainingForm).toBe('Träning markerad')
    expect(JSON.stringify(result.habits)).not.toMatch(/"true"|"false"|\[object Object\]/)
  })

  it('does not count workout false as a training day', () => {
    const result = analytics({
      checkIns: [{ date: '2026-03-25', energy: 7, mood: 'Fokuserad', workout: false }],
    })

    expect(result.habits.trainingDays).toBe(0)
    expect(result.habits.trainingForm).toBe('')
  })

  it('normalizes string workout type labels', () => {
    expect(normalizeWorkout({ training: 'promenad' })).toEqual({
      completed: true,
      displayLabel: 'Promenad',
      type: 'Promenad',
    })
  })

  it('normalizes workout objects', () => {
    expect(normalizeWorkout({ workout: { completed: true, type: 'styrketräning' } })).toEqual({
      completed: true,
      displayLabel: 'Styrketräning',
      type: 'Styrketräning',
    })
  })

  it('handles mixed legacy check-in formats and counts completed training only', () => {
    const result = analytics({
      checkIns: [
        { date: '2026-03-25', workout: true },
        { date: '2026-03-26', workout: false, workoutType: '' },
        { date: '2026-03-27', training: 'gym' },
        { date: '2026-03-28', workout: { done: true, name: 'cykling' } },
      ],
    })

    expect(result.habits.trainingDays).toBe(3)
    expect(result.habits.trainingForm).not.toMatch(/true|false|undefined|null|\[object Object\]/)
  })

  it('chooses the most common training from completed days only', () => {
    const result = analytics({
      checkIns: [
        { date: '2026-03-25', workout: false, workoutType: 'gym' },
        { date: '2026-03-26', training: 'promenad' },
        { date: '2026-03-27', workoutType: 'promenad' },
      ],
    })

    expect(result.habits.trainingDays).toBe(2)
    expect(result.habits.trainingForm).toBe('Promenad')
  })

  it('normalizes energy on a 1 to 10 scale', () => {
    expect(normalizeEnergy(8)).toMatchObject({
      displayLabel: '8 av 10',
      level: 'high',
      value: 8,
    })
  })

  it('normalizes legacy energy objects with explicit 1 to 5 scale', () => {
    expect(normalizeEnergy({ scale: 5, value: '4' })).toMatchObject({
      displayLabel: '4 av 5',
      level: 'high',
      value: 8,
    })
  })

  it('normalizes numeric energy strings', () => {
    expect(normalizeEnergy('6/10')).toMatchObject({
      displayLabel: '6 av 10',
      level: 'medium',
      value: 6,
    })
  })

  it('normalizes Swedish mood strings', () => {
    expect(normalizeMood('trött')).toMatchObject({
      displayLabel: 'Trött',
      score: 2,
    })
  })

  it('normalizes English mood enums without exposing raw values', () => {
    expect(normalizeMood('good')).toMatchObject({
      displayLabel: 'Positiv',
      key: 'positiv',
      score: 4,
    })
  })

  it('normalizes emoji mood values', () => {
    expect(normalizeMood('🙂')).toMatchObject({
      displayLabel: 'Glad',
      score: 5,
    })
  })

  it('normalizes object based legacy check-in formats', () => {
    const metrics = normalizeCheckInMetrics({
      energy: { scale: 5, value: 2 },
      mood: { key: 'low' },
      sleepHours: '5,5',
      steps: '7200',
      workout: { done: true, name: 'gym' },
    })

    expect(metrics.energy.value).toBe(4)
    expect(metrics.mood.displayLabel).toBe('Låg')
    expect(metrics.sleep).toBe(5.5)
    expect(metrics.sleepLabel).toBe('5 h 30 min')
    expect(metrics.steps).toBe(7200)
    expect(metrics.stepsLabel).toContain('200 steg')
    expect(metrics.workout.displayLabel).toBe('Gym')
  })

  it('returns neutral fallback for invalid energy and mood values', () => {
    expect(normalizeEnergy({ value: 'nope' }).displayLabel).toBe('Saknas')
    expect(normalizeMood({ value: true }).displayLabel).toBe('Saknas')
  })

  it('normalizes steps from numbers strings with spaces and objects', () => {
    expect(normalizeStepMetrics(7200).value).toBe(7200)
    expect(normalizeStepMetrics('10 250').value).toBe(10250)
    expect(normalizeStepMetrics({ count: '8 100' }).value).toBe(8100)
  })

  it('rejects negative invalid and extreme step values', () => {
    expect(normalizeStepMetrics(-1).value).toBeNull()
    expect(normalizeStepMetrics(Number.NaN).value).toBeNull()
    expect(normalizeStepMetrics(Number.POSITIVE_INFINITY).value).toBeNull()
    expect(normalizeStepMetrics(200000).value).toBeNull()
  })

  it('normalizes sleep decimal time text and objects', () => {
    expect(normalizeSleepMetrics(7.5)).toMatchObject({ displayLabel: '7 h 30 min', hours: 7.5, minutes: 450 })
    expect(normalizeSleepMetrics('7:30')).toMatchObject({ displayLabel: '7 h 30 min', hours: 7.5, minutes: 450 })
    expect(normalizeSleepMetrics('7 timmar 30 minuter')).toMatchObject({ displayLabel: '7 h 30 min', hours: 7.5, minutes: 450 })
    expect(normalizeSleepMetrics({ hours: 6, minutes: 45 })).toMatchObject({ displayLabel: '6 h 45 min', hours: 6.75, minutes: 405 })
  })

  it('rejects invalid sleep values', () => {
    expect(normalizeSleepMetrics(-1).hours).toBeNull()
    expect(normalizeSleepMetrics(Number.POSITIVE_INFINITY).hours).toBeNull()
    expect(normalizeSleepMetrics(30).hours).toBeNull()
  })

  it('uses normalized numeric energy for averages and trend data', () => {
    const result = analytics({
      checkIns: [
        { date: '2026-03-25', energy: { scale: 5, value: 2 }, mood: 'neutral' },
        { date: '2026-03-26', energy: '8', mood: 'good' },
        { date: '2026-03-27', energy: 6, mood: 'good' },
      ],
    })

    expect(result.habits.averageEnergy).toBe(6)
    expect(result.habits.averageEnergyLabel).toBe('6 av 10')
    expect(result.habits.moodTrend).toEqual([3, 4, 4])
    expect(result.habits.averageMood).toBe('Positiv')
  })

  it('keeps AI Coach facts and Progress Dashboard aligned on mood labels', () => {
    const checkInData = { date: '2026-03-31', energy: '8', mood: 'good', steps: '7200' }
    const progress = analytics({ checkIn: checkInData, checkIns: [] }).habits
    const facts = buildAiCoachFacts({ checkIn: checkInData, checkIns: [], meals: [], profile: {}, weights: [] })

    expect(progress.averageMood).toBe('Positiv')
    expect(facts.mood).toBe('Positiv')
    expect(facts.energy).toBe(8)
  })

  it('uses local same-day latest check-in consistently', () => {
    const result = analytics({
      checkIns: [
        { date: '2026-03-25', energy: 2, mood: 'low', sleep: '5 h', steps: '1 000', time: '08:00' },
        { date: '2026-03-25', energy: 8, mood: 'good', sleep: '7:30', steps: '10 250', time: '20:00' },
      ],
    })

    expect(result.habits.checkInCount).toBe(1)
    expect(result.habits.averageEnergy).toBe(8)
    expect(result.habits.averageMood).toBe('Positiv')
    expect(result.habits.averageSteps).toBe(10250)
    expect(result.habits.averageSleep).toBe(7.5)
  })

  it('keeps today check-ins even when the time is later than the analysis clock', () => {
    const result = buildProgressDashboardAnalytics({
      checkIn: {},
      checkIns: [{ date: '2026-03-31', energy: 7, mood: 'good', time: '23:59' }],
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile: {},
      weights: [],
    }, { period: '7d', today })

    expect(result.habits.checkInCount).toBe(1)
    expect(result.habits.averageEnergy).toBe(7)
  })

  it('filters future calendar day check-ins', () => {
    const result = analytics({
      checkIns: [
        { date: '2026-03-31', energy: 7, mood: 'good' },
        { date: '2026-04-01', energy: 1, mood: 'bad' },
      ],
    })

    expect(result.habits.checkInCount).toBe(1)
    expect(result.habits.averageEnergy).toBe(7)
  })

  it('uses one representative day value for weekly step totals and averages', () => {
    const result = analytics({
      checkIns: [
        { date: '2026-03-25', steps: '1 000', time: '08:00' },
        { date: '2026-03-25', steps: '4 000', time: '20:00' },
        { date: '2026-03-26', steps: { count: '6 000' } },
      ],
    })

    expect(result.habits.checkInCount).toBe(2)
    expect(result.habits.totalSteps).toBe(10000)
    expect(result.habits.averageSteps).toBe(5000)
  })

  it('uses one representative day value for average sleep', () => {
    const result = analytics({
      checkIns: [
        { date: '2026-03-25', sleep: '5 h', time: '08:00' },
        { date: '2026-03-25', sleep: '7:30', time: '20:00' },
        { date: '2026-03-26', sleepHours: 6.5 },
      ],
    })

    expect(result.habits.checkInCount).toBe(2)
    expect(result.habits.averageSleep).toBe(7)
    expect(result.habits.averageSleepLabel).toBe('7 h')
  })

  it('keeps AI Coach facts and Progress Dashboard aligned on steps and sleep', () => {
    const checkInData = { date: '2026-03-31', sleep: '7:30', steps: '10 250' }
    const progress = analytics({ checkIn: checkInData, checkIns: [] }).habits
    const facts = buildAiCoachFacts({ checkIn: checkInData, checkIns: [], meals: [], profile: {}, weights: [] })

    expect(progress.averageSteps).toBe(10250)
    expect(facts.steps).toBe(10250)
    expect(progress.averageSleep).toBe(7.5)
    expect(facts.sleepHours).toBe(7.5)
    expect(facts.sleepLabel).toBe('7 h 30 min')
  })
})

describe('comparison, forecast and insights', () => {
  it('compares with previous period', () => {
    expect(analytics({}, '7d').comparison.hasComparison).toBe(true)
  })

  it('does not compare whole period', () => {
    expect(analytics({}, 'all').comparison.hasComparison).toBe(false)
  })

  it('builds forecast', () => {
    expect(analytics({}, '90d').forecast.status).toMatch(/projected|insufficient_data|not_moving/)
  })

  it('includes weekly summary', () => {
    expect(analytics().weeklySummary).toContain('Veckan')
  })

  it('builds neutral or positive insights', () => {
    expect(analytics().insights.length).toBeGreaterThan(0)
  })

  it('limits insights', () => {
    expect(analytics().insights.length).toBeLessThanOrEqual(5)
  })

  it('formats downward progress change', () => {
    expect(formatProgressChange(-1.2)).toContain('ned')
  })

  it('formats upward progress change', () => {
    expect(formatProgressChange(1.2)).toContain('upp')
  })

  it('formats stable progress change', () => {
    expect(formatProgressChange(0)).toBe('Oförändrat')
  })
})

describe('progress analytics robustness', () => {
  it.each([
    ['empty object', {}, '30d'],
    ['null meals', { meals: null }, '30d'],
    ['invalid checkins', { checkIns: [null, { date: 'bad' }] }, '30d'],
    ['invalid foods', { foods: [null] }, '30d'],
    ['invalid plans', { mealPlans: { bad: true } }, '30d'],
    ['invalid generated plans', { generatedMealPlans: { history: [null] } }, '30d'],
    ['invalid goals', { nutritionGoals: { protein: 'bad' } }, '30d'],
    ['large data', { meals: Array.from({ length: 1000 }, (_, index) => ({ ...meals[0], id: `m-${index}` })) }, 'all'],
  ])('handles %s', (_, overrides, period) => {
    expect(() => analytics(overrides, period)).not.toThrow()
  })

  it('exposes internals for focused testing', () => {
    expect(progressAnalyticsInternals.bestLoggingStreak([{ date: '2026-01-01' }, { date: '2026-01-02' }])).toBe(2)
  })

  it('filters dates by range', () => {
    expect(progressAnalyticsInternals.isInRange('2026-03-25', getProgressPeriodRange('7d', today))).toBe(true)
  })

  it('excludes dates outside range', () => {
    expect(progressAnalyticsInternals.isInRange('2026-03-01', getProgressPeriodRange('7d', today))).toBe(false)
  })
})

describe('progress analytics additional regressions', () => {
  it.each([
    ['7d label', '7d', '7 dagar'],
    ['30d label', '30d', '30 dagar'],
    ['90d label', '90d', '90 dagar'],
    ['180d label', '180d', '180 dagar'],
    ['365d label', '365d', '365 dagar'],
    ['all label', 'all', 'Hela perioden'],
  ])('keeps %s', (_, period, label) => {
    expect(getProgressPeriodRange(period, today).label).toBe(label)
  })

  it.each([
    ['calorie goal source', (result) => result.nutrition.goalComparison.caloriesGoal === 1800],
    ['protein goal source', (result) => result.nutrition.goalComparison.proteinGoal === 80],
    ['planned week start', (result) => result.planning.plannedWeekStart === '2026-03-30'],
    ['generated plan count', (result) => result.planning.generatedPlanCount === 1],
    ['latest generated plan', (result) => result.planning.latestGeneratedPlan.id === 'generated-1'],
    ['comparison meal delta numeric', (result) => Number.isFinite(result.comparison.mealCountDelta)],
    ['comparison training delta numeric', (result) => Number.isFinite(result.comparison.trainingDaysDelta)],
    ['comparison checkin delta numeric', (result) => Number.isFinite(result.comparison.checkInDelta)],
  ])('keeps %s', (_, assertion) => {
    expect(assertion(analytics())).toBe(true)
  })
})

describe('AI Coach progress dashboard integration', () => {
  function coach(message) {
    return createDeterministicAiCoachReply({
      context: {
        checkIn: checkIns[0],
        checkIns,
        foods,
        meals,
        nutritionGoals,
        profile,
        weights,
      },
      message,
    })
  }

  it.each([
    ['Hur går min utveckling?', 'utveckling'],
    ['Vad är min vikttrend?', 'Vikttrenden'],
    ['Vad är min målprognos?', 'trend'],
    ['Vad är mitt genomsnittliga protein?', 'protein'],
    ['Vad är min kalorimåluppfyllelse?', 'Kalorimålet'],
    ['Hur ofta har jag tränat?', 'träningsdagar'],
    ['Hur ser mina check-ins ut?', 'check-ins'],
    ['Hur går mina vanor?', 'aktiva vanor'],
    ['Skillnaden mot föregående period?', 'Jämfört'],
    ['Vilken framstegsinsikt är viktigast?', 'viktdata'],
  ])('answers "%s"', (message, expected) => {
    expect(coach(message)).toContain(expected)
  })
})

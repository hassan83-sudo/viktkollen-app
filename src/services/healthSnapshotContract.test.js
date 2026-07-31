import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createAiCoachV2Report } from './aiCoachV2Service.js'
import { createDashboardData } from './dashboardService.js'
import {
  assertHealthSnapshotIntegrity,
  buildHealthSnapshot,
  mergeActualMealEntries,
  sanitizeHealthSnapshotDisplay,
  validateHealthSnapshot,
} from './healthSnapshot.js'
import { createMonthlyHealthReport } from './monthlyReportService.js'

const today = '2026-07-31'
const profile = { goalWeight: 78, startWeight: 91.8 }
const weights = [
  { date: '2026-07-01', id: 'start', value: 91.8 },
  { date: '2026-07-31', id: 'morning', time: '08:00', value: 90.1 },
  { date: '2026-07-31', id: 'evening', time: '20:00', value: 89.6 },
  { date: '2026-08-01', id: 'future', value: 88 },
]
const meal = {
  calories: 500,
  date: today,
  fiber: 6,
  id: 'meal-1',
  name: 'Kyckling och ris',
  protein: 45,
  time: '12:00',
  type: 'Lunch',
}

function validSnapshot(overrides = {}) {
  return buildHealthSnapshot({
    checkIns: [
      { date: today, energy: 5, mood: 'neutral', sleep: 6, steps: 5000, time: '08:00', workout: false },
      { date: today, energy: 8, mood: 'good', sleep: 7.5, steps: 9200, time: '21:00', workout: { type: 'promenad' } },
    ],
    meals: [meal],
    nutritionGoals: { calories: 2000, fiber: 30, protein: 120 },
    profile,
    today,
    weights,
    ...overrides,
  })
}

describe('health snapshot contract', () => {
  it('accepts a complete valid snapshot', () => {
    const snapshot = validSnapshot()
    const result = validateHealthSnapshot(snapshot)

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(() => assertHealthSnapshotIntegrity(snapshot)).not.toThrow()
  })

  it('keeps missing data as a valid snapshot with nulls and fallbacks', () => {
    const snapshot = buildHealthSnapshot({ today })

    expect(validateHealthSnapshot(snapshot).ok).toBe(true)
    expect(snapshot.weight.current).toBeNull()
    expect(snapshot.display.currentWeight).toBe('Saknas')
    expect(snapshot.nutrition.mealCountToday).toBe(0)
  })

  it('detects incorrect totalChange', () => {
    const snapshot = validSnapshot()
    const invalid = {
      ...snapshot,
      weight: { ...snapshot.weight, totalChange: 12.1 },
    }

    expect(validateHealthSnapshot(invalid).errors.some((error) => error.path === 'weight.totalChange')).toBe(true)
    expect(() => assertHealthSnapshotIntegrity(invalid)).toThrow(/totalChange/)
  })

  it('detects incorrect goalRemaining', () => {
    const snapshot = validSnapshot()
    const invalid = {
      ...snapshot,
      weight: {
        ...snapshot.weight,
        facts: { ...snapshot.weight.facts, goalRemaining: 1.7 },
      },
    }

    expect(validateHealthSnapshot(invalid).errors.some((error) => error.path === 'weight.facts.goalRemaining')).toBe(true)
  })

  it('normalizes duplicate meals from two sources correctly', () => {
    const merged = mergeActualMealEntries([[meal], [{ ...meal }]])
    const snapshot = validSnapshot({ mealHistory: [{ ...meal }], meals: [{ ...meal }] })

    expect(merged).toHaveLength(1)
    expect(snapshot.nutrition.actualMeals).toHaveLength(1)
    expect(validateHealthSnapshot(snapshot).ok).toBe(true)
  })

  it('keeps planned meals out of actual intake', () => {
    const snapshot = validSnapshot({
      meals: [{ ...meal, id: 'planned', isPlanned: true }],
    })

    expect(snapshot.nutrition.actualMeals).toHaveLength(0)
    expect(snapshot.nutrition.mealCountToday).toBe(0)
  })

  it('detects NaN and Infinity in raw values', () => {
    const snapshot = validSnapshot()
    const invalid = {
      ...snapshot,
      nutrition: { ...snapshot.nutrition, caloriesToday: Number.NaN },
      weight: { ...snapshot.weight, current: Number.POSITIVE_INFINITY },
    }
    const errors = validateHealthSnapshot(invalid).errors.map((error) => error.path)

    expect(errors).toContain('weight.current')
    expect(errors).toContain('nutrition.caloriesToday')
  })

  it('detects technical display values', () => {
    const snapshot = validSnapshot()
    const invalid = {
      ...snapshot,
      checkIn: {
        ...snapshot.checkIn,
        display: { ...snapshot.checkIn.display, workout: 'true' },
      },
      display: { ...snapshot.display, currentWeight: 'undefined kg' },
      nutrition: {
        ...snapshot.nutrition,
        display: { ...snapshot.nutrition.display, proteinToday: '[object Object]' },
      },
    }
    const paths = validateHealthSnapshot(invalid).errors.map((error) => error.path)

    expect(paths).toContain('display.currentWeight')
    expect(paths).toContain('nutrition.display.proteinToday')
    expect(paths).toContain('checkIn.display.workout')
  })

  it('sanitizes display values for production-safe fallback without changing raw values', () => {
    const snapshot = validSnapshot()
    const sanitized = sanitizeHealthSnapshotDisplay({
      ...snapshot,
      display: { ...snapshot.display, currentWeight: 'undefined kg' },
      weight: {
        ...snapshot.weight,
        display: { ...snapshot.weight.display, current: '[object Object]' },
      },
    })

    expect(sanitized.weight.current).toBe(89.6)
    expect(sanitized.display.currentWeight).toBe('Saknas')
    expect(sanitized.weight.display.current).toBe('Saknas')
  })

  it('does not mutate input arrays objects or Date anchors', () => {
    const date = new Date('2026-07-31T23:00:00')
    const input = {
      checkIns: [{ date: today, energy: { value: 8, label: 'Pigg' }, mood: { value: 'good' } }],
      meals: [{ ...meal, nested: { note: 'behåll' } }],
      nutritionGoals: { protein: 120 },
      profile: { ...profile, nested: { source: 'test' } },
      today: date,
      weights: weights.map((entry) => ({ ...entry })),
    }
    const beforeDate = date.toISOString()
    const before = JSON.stringify(input, (_key, value) => value instanceof Date ? value.toISOString() : value)

    buildHealthSnapshot(input)

    expect(JSON.stringify(input, (_key, value) => value instanceof Date ? value.toISOString() : value)).toBe(before)
    expect(date.toISOString()).toBe(beforeDate)
  })

  it('throws a clear development/test signal on contract breaks', () => {
    const invalid = {
      ...validSnapshot(),
      display: { currentWeight: 'undefined' },
    }

    expect(() => assertHealthSnapshotIntegrity(invalid)).toThrow(/Health snapshot contract violation/)
  })

  it('keeps period ranges anchored to the selected local date', () => {
    const snapshot = validSnapshot()

    expect(snapshot.periods.sevenDays).toMatchObject({
      days: 7,
      end: today,
      start: '2026-07-25',
    })
    expect(snapshot.periods.thirtyDays).toMatchObject({
      days: 30,
      end: today,
      start: '2026-07-02',
    })
    expect(snapshot.weight.dailyWeights.map((entry) => entry.id)).not.toContain('future')
  })

  it('lets AI Coach dashboard and reports consume the same snapshot', () => {
    const snapshot = validSnapshot()
    const data = {
      healthSnapshot: snapshot,
      meals: [],
      profile,
      today,
      weights: [],
    }
    const coach = createAiCoachV2Report(data)
    const dashboard = createDashboardData(data)
    const monthly = createMonthlyHealthReport(data)

    expect(coach.coachProfile.currentWeight).toBe(snapshot.weight.current)
    expect(dashboard.goals.currentWeight).toBe(snapshot.weight.current)
    expect(monthly.weightChange).toBe(snapshot.periods.thirtyDays.weightChange)
  })

  it('documents every exported top-level contract section', () => {
    const docs = readFileSync(new URL('../../docs/health-snapshot-contract.md', import.meta.url), 'utf8')

    ;['date', 'weight', 'nutrition', 'checkIn', 'periods', 'availability', 'display'].forEach((section) => {
      expect(docs).toContain(section)
    })
  })
})

import { describe, expect, it } from 'vitest'
import { buildWeeklyProgress } from '../../services/dashboard/weeklyProgressModel.js'

describe('WeeklyProgressSection model', () => {
  it('averages Health Score only across days with valid data', () => {
    const model = buildWeeklyProgress({
      checkIn: { date: '2026-08-11', energy: 7, steps: 0 },
      healthSnapshot: { date: '2026-08-11', checkIn: { dailyEntries: [] }, weight: { dailyWeights: [] } },
      meals: [],
      nutritionGoals: {},
      selectedDate: '2026-08-11',
    })

    expect(model.coverage.healthScore).toBe(1)
    expect(model.averageHealthScore).toBeGreaterThan(0)
  })

  it('keeps real zero values but does not turn missing nutrition days into zero', () => {
    const model = buildWeeklyProgress({
      checkIn: {},
      healthSnapshot: { date: '2026-08-11', checkIn: { dailyEntries: [] }, weight: { dailyWeights: [] } },
      meals: [
        {
          calories: 0,
          date: '2026-08-10',
          id: 'zero-calorie-entry',
          name: 'Registrerad nolla',
          protein: 0,
        },
      ],
      nutritionGoals: { protein: 100 },
      selectedDate: '2026-08-11',
    })

    const missingDay = model.days.find((day) => day.date === '2026-08-11')
    const zeroDay = model.days.find((day) => day.date === '2026-08-10')

    expect(missingDay.calories).toBeNull()
    expect(zeroDay.calories).toBe(0)
    expect(zeroDay.protein).toBe(0)
  })

  it('marks weight trend as insufficient when fewer than two weight days exist', () => {
    const model = buildWeeklyProgress({
      checkIn: {},
      healthSnapshot: {
        date: '2026-08-11',
        checkIn: { dailyEntries: [] },
        weight: { dailyWeights: [{ date: '2026-08-11', value: 88 }] },
      },
      meals: [],
      nutritionGoals: {},
      selectedDate: '2026-08-11',
    })

    expect(model.coverage.weight).toBe(1)
    expect(model.weightTrend).toBeNull()
  })
})

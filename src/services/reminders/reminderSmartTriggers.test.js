import { describe, expect, it } from 'vitest'
import { buildSmartReminderSuggestions } from './reminderSmartTriggers.js'

describe('reminderSmartTriggers', () => {
  it('suggests check-in, weight and meal reminders only for enabled categories with missing data', () => {
    const suggestions = buildSmartReminderSuggestions({
      checkIns: [],
      meals: [],
      weights: [],
    }, {
      enabledCategories: { check_in: true, meal_log: true, weight: true },
      today: '2026-07-31',
    })

    expect(suggestions.map((item) => item.type)).toEqual(['check_in', 'weight', 'meal_log'])
  })

  it('does not suggest disabled categories', () => {
    const suggestions = buildSmartReminderSuggestions({}, {
      enabledCategories: { check_in: false, meal_log: false, weight: false },
      today: '2026-07-31',
    })

    expect(suggestions).toEqual([])
  })

  it('does not count planned meals as actual intake', () => {
    const suggestions = buildSmartReminderSuggestions({
      meals: [{ date: '2026-07-31', planned: true, text: 'Lunchplan' }],
    }, {
      enabledCategories: { meal_log: true },
      today: '2026-07-31',
    })

    expect(suggestions.map((item) => item.type)).toContain('meal_log')
  })

  it('adds a habit suggestion from existing goals and habits reminder fields', () => {
    const suggestions = buildSmartReminderSuggestions({
      goalsHabits: {
        habits: [{ id: 'h1', reminder: { enabled: true, time: '18:30' }, status: 'active', title: 'Kvällspromenad' }],
      },
    }, {
      enabledCategories: { habit: true },
      today: '2026-07-31',
    })

    expect(suggestions.find((item) => item.type === 'habit')).toMatchObject({ title: 'Kvällspromenad', time: '18:30' })
  })
})

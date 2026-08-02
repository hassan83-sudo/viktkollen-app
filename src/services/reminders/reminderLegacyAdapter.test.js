import { describe, expect, it } from 'vitest'
import { syncLegacyReminderSettingsToV2 } from './reminderLegacyAdapter.js'

describe('reminderLegacyAdapter', () => {
  it('mirrors user-enabled legacy settings into V2 reminders', () => {
    const state = syncLegacyReminderSettingsToV2({}, {
      enabled: true,
      meal: true,
      mealTime: '12:30',
      water: false,
      waterTime: '15:00',
      weight: true,
      weightTime: '08:00',
    }, { now: '2026-07-31T08:00:00.000Z' })

    expect(state.reminders.find((reminder) => reminder.id === 'legacy-weight-reminder')).toMatchObject({ enabled: true, time: '08:00', type: 'weight' })
    expect(state.reminders.find((reminder) => reminder.id === 'legacy-meal-reminder')).toMatchObject({ enabled: true, time: '12:30', type: 'meal_log' })
    expect(state.reminders.find((reminder) => reminder.id === 'legacy-water-reminder')).toMatchObject({ enabled: false })
  })

  it('updates existing legacy reminders without duplicates', () => {
    const first = syncLegacyReminderSettingsToV2({}, { enabled: true, weight: true, weightTime: '08:00' }, { now: '2026-07-31T08:00:00.000Z' })
    const second = syncLegacyReminderSettingsToV2(first, { enabled: true, weight: true, weightTime: '09:00' }, { now: '2026-07-31T09:00:00.000Z' })

    expect(second.reminders.filter((reminder) => reminder.id === 'legacy-weight-reminder')).toHaveLength(1)
    expect(second.reminders.find((reminder) => reminder.id === 'legacy-weight-reminder').time).toBe('09:00')
  })
})

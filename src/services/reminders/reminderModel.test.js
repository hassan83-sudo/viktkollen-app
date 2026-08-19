import { describe, expect, it } from 'vitest'
import { normalizeReminder, normalizeReminderState, reminderMaxCount, validateReminder } from './reminderModel.js'

describe('reminderModel', () => {
  it('normalizes a versioned reminder state for new users', () => {
    const state = normalizeReminderState(null, { now: '2026-07-31T08:00:00.000Z' })

    expect(state).toMatchObject({ schemaVersion: 2, reminders: [], history: [] })
  })

  it('creates stable ids from existing ids and safe defaults', () => {
    const reminder = normalizeReminder({ id: 'habit-1', type: 'habit' }, { now: '2026-07-31T08:00:00.000Z' })

    expect(reminder.id).toBe('habit-1')
    expect(reminder.title).toBe('Vanepåminnelse')
  })

  it('marks unsafe wording for review and replaces display text', () => {
    const reminder = normalizeReminder({ title: 'Du måste träna akut', description: 'Straff om du misslyckas' })

    expect(reminder.needsReview).toBe(true)
    expect(reminder.title).toBe('Egen påminnelse')
    expect(reminder.description).toBe('En neutral påminnelse från Viktkollen.')
  })

  it('rejects unsafe interval reminders below one hour', () => {
    const result = validateReminder({ scheduleType: 'interval', intervalMinutes: 15, title: 'Kort paus' })

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('Intervall')
  })

  it('limits the number of reminders', () => {
    const reminders = Array.from({ length: reminderMaxCount + 5 }, (_, index) => ({ id: `r-${index}`, title: `Reminder ${index}` }))

    expect(normalizeReminderState({ reminders }).reminders).toHaveLength(reminderMaxCount)
  })

  it('preserves Notifications V3 data inside the synced reminder state', () => {
    const state = normalizeReminderState({
      notificationsV3: {
        history: [{ at: '2026-08-04T10:00:00.000Z', id: 'n1', sourceIdMasked: 'ref-1', status: 'delivered', title: 'Måltid' }],
        settings: { batchingWindowMinutes: 45, quietHours: { end: '06:30', start: '21:30' } },
      },
    })

    expect(state.notificationsV3.version).toBe(3)
    expect(state.notificationsV3.history).toHaveLength(1)
    expect(state.notificationsV3.settings.quietHours.start).toBe('21:30')
  })

  it('normalizes routine plan history and selected weekday schedules compatibly', () => {
    const state = normalizeReminderState({
      reminders: [{ daysOfWeek: ['friday'], id: 'r1', scheduleType: 'selected_weekdays', title: 'Fredag' }],
      routinePlan: {
        checklist: [{ id: 'sb12', title: 'SB12' }],
        history: [{
          action: 'completed',
          at: '2026-07-31T08:05:00.000Z',
          routineId: 'checklist:sb12',
          scheduledAt: '2026-07-31T08:00:00.000Z',
        }],
      },
    }, { now: '2026-07-31T08:00:00.000Z' })

    expect(state.reminders[0].scheduleType).toBe('selected_weekdays')
    expect(state.routinePlan.checklist[0].title).toBe('SB12')
    expect(state.routinePlan.history[0]).toMatchObject({
      action: 'completed',
      date: '2026-07-31',
      routineId: 'checklist:sb12',
    })
  })
})

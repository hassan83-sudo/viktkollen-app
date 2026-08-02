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
})

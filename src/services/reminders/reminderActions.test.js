import { describe, expect, it } from 'vitest'
import { archiveReminder, completeReminder, restoreReminder, skipReminder, snoozeReminder } from './reminderActions.js'
import { normalizeReminderState } from './reminderModel.js'

function state() {
  return normalizeReminderState({ reminders: [{ id: 'r1', title: 'Logga måltid', time: '12:00' }] }, { now: '2026-07-31T08:00:00.000Z' })
}

describe('reminderActions', () => {
  it('marks a reminder complete without creating domain data', () => {
    const next = completeReminder(state(), 'r1', { now: '2026-07-31T12:05:00.000Z' })

    expect(next.reminders[0].lastCompletedAt).toBe('2026-07-31T12:05:00.000Z')
    expect(next.history.at(-1).action).toBe('completed')
  })

  it('snoozes without duplicate reminders', () => {
    const next = snoozeReminder(state(), 'r1', 30, { now: '2026-07-31T12:00:00.000Z' })

    expect(next.reminders).toHaveLength(1)
    expect(next.reminders[0].snoozedUntil).toBe('2026-07-31T12:30:00.000Z')
  })

  it('skips neutrally', () => {
    const next = skipReminder(state(), 'r1', { now: '2026-07-31T12:00:00.000Z' })

    expect(next.reminders[0].lastSkippedAt).toBe('2026-07-31T12:00:00.000Z')
  })

  it('archives instead of deleting', () => {
    const next = archiveReminder(state(), 'r1', { now: '2026-07-31T12:00:00.000Z' })

    expect(next.reminders).toHaveLength(1)
    expect(next.reminders[0].archivedAt).toBe('2026-07-31T12:00:00.000Z')
    expect(next.reminders[0].enabled).toBe(false)
  })

  it('restores archived reminders disabled', () => {
    const archived = archiveReminder(state(), 'r1', { now: '2026-07-31T12:00:00.000Z' })
    const restored = restoreReminder(archived, 'r1', { now: '2026-08-01T12:00:00.000Z' })

    expect(restored.reminders[0].archivedAt).toBe('')
    expect(restored.reminders[0].enabled).toBe(false)
  })
})

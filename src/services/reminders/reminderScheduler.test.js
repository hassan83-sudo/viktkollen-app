import { describe, expect, it, vi } from 'vitest'
import { normalizeReminderState } from './reminderModel.js'
import { buildReminderStatus, createReminderScheduler, getDueReminders, getNextReminderAt } from './reminderScheduler.js'

const now = '2026-07-31T06:00:00.000Z'
const afterDue = '2026-07-31T10:00:00.000Z'

describe('reminderScheduler', () => {
  it('calculates the next daily trigger deterministically', () => {
    const reminder = normalizeReminderState({ reminders: [{ id: 'r1', time: '11:00', title: 'Check-in' }] }, { now }).reminders[0]

    expect(getNextReminderAt(reminder, { now })).toBe('2026-07-31T09:00:00.000Z')
  })

  it('finds due reminders without archived or snoozed reminders', () => {
    const state = normalizeReminderState({
      reminders: [
        { id: 'due', time: '09:00', title: 'Due' },
        { archivedAt: now, id: 'archived', time: '09:00', title: 'Archived' },
        { id: 'snoozed', snoozedUntil: '2026-07-31T11:00:00.000Z', time: '09:00', title: 'Snoozed' },
      ],
    }, { now })

    expect(getDueReminders(state, { now: afterDue }).map((reminder) => reminder.id)).toEqual(['due'])
  })

  it('does not trigger the same reminder twice the same day', () => {
    const state = normalizeReminderState({
      reminders: [{ id: 'due', lastTriggeredAt: '2026-07-31T09:00:00.000Z', time: '09:00', title: 'Due' }],
    }, { now })

    expect(getDueReminders(state, { now: afterDue })).toHaveLength(0)
  })

  it('summarizes reminder status', () => {
    const status = buildReminderStatus(normalizeReminderState({ reminders: [{ id: 'r1', time: '12:00', title: 'Lunch' }] }, { now }), { now })

    expect(status.enabledCount).toBe(1)
    expect(status.nextReminderAt).toBeTruthy()
  })

  it('uses a single timer and cleans up', () => {
    const setTimer = vi.fn(() => 7)
    const clearTimer = vi.fn()
    const scheduler = createReminderScheduler({
      clearTimer,
      getState: () => normalizeReminderState({ reminders: [] }),
      onDue: vi.fn(),
      now: () => new Date(now),
      setTimer,
    })

    scheduler.start()
    scheduler.stop()

    expect(setTimer).toHaveBeenCalledTimes(1)
    expect(clearTimer).toHaveBeenCalledWith(7)
  })
})

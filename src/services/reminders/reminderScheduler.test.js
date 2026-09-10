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

  it('supports weekday weekend and selected weekday recurrence', () => {
    const state = normalizeReminderState({
      reminders: [
        { id: 'weekday', scheduleType: 'weekdays', time: '09:00', title: 'Vardag' },
        { id: 'weekend', scheduleType: 'weekends', time: '09:00', title: 'Helg' },
        { daysOfWeek: ['friday'], id: 'selected', scheduleType: 'selected_weekdays', time: '09:00', title: 'Fredag' },
      ],
    }, { now })

    expect(getDueReminders(state, { now: afterDue }).map((reminder) => reminder.id)).toEqual(['weekday', 'selected'])
  })

  it('keeps DST boundary reminders on local calendar days', () => {
    const state = normalizeReminderState({
      reminders: [{ daysOfWeek: ['sunday'], id: 'dst', scheduleType: 'selected_weekdays', time: '02:30', title: 'Söndag' }],
    }, { now: '2026-03-28T12:00:00.000Z' })

    const next = getNextReminderAt(state.reminders[0], { now: '2026-03-28T12:00:00.000Z' })

    expect(new Date(next).getDay()).toBe(0)
    expect(Number.isNaN(new Date(next).getTime())).toBe(false)
  })

  it('does not throw when interval reminder history contains a corrupt timestamp', () => {
    const state = normalizeReminderState({
      reminders: [{ id: 'r1', intervalMinutes: 90, lastTriggeredAt: 'trasigt-datum', scheduleType: 'interval', title: 'Vatten' }],
    }, { now })

    expect(() => buildReminderStatus(state, { now })).not.toThrow()
    expect(getDueReminders(state, { now })).toHaveLength(0)
  })

  it('fires an interval reminder after the first interval from createdAt', () => {
    const createdAt = '2026-07-31T08:00:00.000Z'
    const state = normalizeReminderState({
      reminders: [{ createdAt, id: 'water', intervalMinutes: 60, scheduleType: 'interval', title: 'Vatten' }],
    }, { now: createdAt })

    expect(getDueReminders(state, { now: createdAt })).toHaveLength(0)
    expect(getDueReminders(state, { now: '2026-07-31T09:05:00.000Z' }).map((reminder) => reminder.id)).toEqual(['water'])
    expect(new Date(getNextReminderAt(state.reminders[0], { now: createdAt })).getTime())
      .toBe(new Date('2026-07-31T09:00:00.000Z').getTime())
  })

  it('allows interval reminders to fire more than once on the same calendar day', () => {
    const state = normalizeReminderState({
      reminders: [{
        createdAt: '2026-07-31T08:00:00.000Z',
        id: 'water',
        intervalMinutes: 60,
        lastTriggeredAt: '2026-07-31T09:00:00.000Z',
        scheduleType: 'interval',
        title: 'Vatten',
      }],
    }, { now: '2026-07-31T09:00:00.000Z' })

    expect(getDueReminders(state, { now: '2026-07-31T10:05:00.000Z' }).map((reminder) => reminder.id)).toEqual(['water'])
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

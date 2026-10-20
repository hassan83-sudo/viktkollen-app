import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../supabaseClient.js', () => ({ supabase: null }))
vi.mock('../../features/place/placePushService.js', () => ({ ensurePlacePushSubscription: vi.fn() }))

const { normalizeReminderState } = await import('./reminderModel.js')
const { buildReminderPushRow } = await import('./reminderPushSync.js')

function reminder(fields, now) {
  return normalizeReminderState({
    reminders: [{ id: 'r1', timezone: 'Europe/Stockholm', title: 'Test', ...fields }],
  }, { now }).reminders[0]
}

function row(fields, now, existingRow) {
  return buildReminderPushRow('user-1', reminder(fields, now), existingRow, { now: new Date(now).getTime() })
}

describe('reminder push sync rows', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'Europe/Stockholm')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('moves an overdue daily reminder to the chosen time later today', () => {
    const now = '2026-10-20T08:30:00.000Z'
    const result = row({ scheduleType: 'daily', startDate: '2026-09-25', time: '21:09' }, now, {
      next_run_at: '2026-10-19T19:09:00+00:00',
      reminder_id: 'r1',
    })
    expect(result.next_run_at).toBe('2026-10-20T19:09:00.000Z')
    expect(result.reminder_time).toBe('21:09')
    expect(result.snoozed_until).toBeNull()
  })

  it('uses tomorrow when the daily time has already passed today', () => {
    const result = row({ scheduleType: 'daily', startDate: '2026-09-25', time: '21:09' }, '2026-10-20T19:30:00.000Z')
    expect(result.next_run_at).toBe('2026-10-21T19:09:00.000Z')
  })

  it('keeps the local clock time across the autumn and spring time changes', () => {
    const autumn = row({ scheduleType: 'daily', startDate: '2026-09-25', time: '21:09' }, '2026-10-25T10:00:00.000Z')
    expect(autumn.next_run_at).toBe('2026-10-25T20:09:00.000Z')
    const spring = row({ scheduleType: 'daily', startDate: '2026-01-01', time: '21:09' }, '2026-03-29T10:00:00.000Z')
    expect(spring.next_run_at).toBe('2026-03-29T19:09:00.000Z')
  })

  it('only uses the chosen weekdays', () => {
    const result = row({
      daysOfWeek: ['monday'],
      scheduleType: 'selected_weekdays',
      startDate: '2026-09-25',
      time: '07:30',
    }, '2026-10-20T08:30:00.000Z')
    expect(result.next_run_at).toBe('2026-10-26T06:30:00.000Z')
    expect(result.days_of_week).toEqual(['monday'])
  })

  it('moves an interval reminder that started long ago to its next future slot in the same rhythm', () => {
    const now = '2026-10-20T08:30:00.000Z'
    const result = row({ intervalMinutes: 2880, scheduleType: 'interval', startDate: '2026-10-18', time: '19:00' }, now)
    expect(result.next_run_at).toBe('2026-10-20T17:00:00.000Z')
    expect(result.interval_minutes).toBe(2880)
  })

  it('moves an interval reminder forward after the app was closed for weeks', () => {
    const result = row({
      intervalMinutes: 120,
      lastTriggeredAt: '2026-09-28T07:51:37.336Z',
      scheduleType: 'interval',
      startDate: '2026-09-28',
      time: '11:33',
    }, '2026-10-20T08:30:00.000Z')
    expect(result.next_run_at).toBe('2026-10-20T09:51:37.336Z')
  })

  it('ignores an expired local snooze instead of writing it back', () => {
    const result = row({
      intervalMinutes: 120,
      lastTriggeredAt: '2026-09-28T07:51:37.336Z',
      scheduleType: 'interval',
      snoozedUntil: '2026-09-28T09:51:37.336Z',
      startDate: '2026-09-28',
      time: '11:33',
    }, '2026-10-20T08:30:00.000Z', {
      next_run_at: '2026-09-28T09:51:37.336+00:00',
      reminder_id: 'r1',
      snoozed_until: '2026-09-28T09:51:37.336+00:00',
    })
    expect(result.snoozed_until).toBeNull()
    expect(new Date(result.next_run_at).getTime()).toBeGreaterThan(new Date('2026-10-20T08:30:00.000Z').getTime())
  })

  it('keeps an active snooze from the app or from a push action', () => {
    const now = '2026-10-20T08:30:00.000Z'
    const local = row({ scheduleType: 'daily', snoozedUntil: '2026-10-20T08:40:00.000Z', time: '21:09' }, now)
    expect(local.snoozed_until).toBe('2026-10-20T08:40:00.000Z')
    expect(local.next_run_at).toBe('2026-10-20T08:40:00.000Z')

    const server = row({ scheduleType: 'daily', time: '21:09' }, now, {
      reminder_id: 'r1',
      snoozed_until: '2026-10-20T08:45:00+00:00',
    })
    expect(server.next_run_at).toBe('2026-10-20T08:45:00.000Z')
  })

  it('does not pull back a time the server already moved forward after sending', () => {
    const now = '2026-10-20T10:00:00.000Z'
    const fields = { intervalMinutes: 120, lastTriggeredAt: '2026-10-20T07:51:37.336Z', scheduleType: 'interval', startDate: '2026-09-28', time: '11:33' }
    const existing = {
      days_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      interval_minutes: 120,
      last_sent_at: '2026-10-20T09:51:40+00:00',
      next_run_at: '2026-10-20T11:51:40+00:00',
      reminder_id: 'r1',
      reminder_time: '11:33:00',
      schedule_type: 'interval',
      start_date: '2026-09-28',
    }
    expect(row(fields, now, existing).next_run_at).toBe('2026-10-20T11:51:40.000Z')

    const edited = row({ ...fields, intervalMinutes: 60 }, now, existing)
    expect(edited.next_run_at).not.toBe('2026-10-20T11:51:40.000Z')
    expect(new Date(edited.next_run_at).getTime()).toBeGreaterThan(new Date(now).getTime())
  })

  it('never writes a time in the past for any schedule', () => {
    const now = '2026-10-20T08:30:00.000Z'
    const schedules = [
      { scheduleType: 'daily', startDate: '2026-01-01', time: '06:00' },
      { scheduleType: 'weekdays', startDate: '2026-01-01', time: '06:00' },
      { scheduleType: 'weekends', startDate: '2026-01-01', time: '06:00' },
      { intervalMinutes: 60, scheduleType: 'interval', startDate: '2026-01-01', time: '06:00' },
      { intervalMinutes: 4320, lastTriggeredAt: '2026-08-01T10:00:00.000Z', scheduleType: 'interval', time: '06:00' },
      { scheduleType: 'once', startDate: '2026-10-01', time: '06:00' },
    ]
    schedules.forEach((fields) => {
      const result = row(fields, now)
      if (result.next_run_at !== null) {
        expect(new Date(result.next_run_at).getTime()).toBeGreaterThan(new Date(now).getTime())
      }
    })
    expect(row(schedules[5], now).next_run_at).toBeNull()
  })

  it('does not schedule an interval reminder after its end date', () => {
    const result = row({
      endDate: '2026-10-01',
      intervalMinutes: 120,
      lastTriggeredAt: '2026-09-28T07:51:37.336Z',
      scheduleType: 'interval',
      startDate: '2026-09-28',
      time: '11:33',
    }, '2026-10-20T08:30:00.000Z')
    expect(result.next_run_at).toBeNull()
  })
  it('keeps today\'s daily time after a late push made the server skip a day', () => {
    // Snooze över midnatt: servern skickade 00:03 och räknade nästa tid från i morgon.
    const result = row({ scheduleType: 'daily', startDate: '2026-09-25', time: '21:09' }, '2026-10-20T22:10:00.000Z', {
      days_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      interval_minutes: 0,
      last_sent_at: '2026-10-20T22:03:00+00:00',
      next_run_at: '2026-10-22T19:09:00+00:00',
      reminder_id: 'r1',
      reminder_time: '21:09:00',
      schedule_type: 'daily',
      start_date: '2026-09-25',
    })
    expect(result.next_run_at).toBe('2026-10-21T19:09:00.000Z')
  })

  it('does not schedule a daily reminder again right after the server sent it', () => {
    const existing = {
      days_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      interval_minutes: 0,
      last_sent_at: '2026-10-20T19:09:02+00:00',
      next_run_at: '2026-10-21T19:09:00+00:00',
      reminder_id: 'r1',
      reminder_time: '21:09:00',
      schedule_type: 'daily',
      start_date: '2026-09-25',
    }
    const fields = { scheduleType: 'daily', startDate: '2026-09-25', time: '21:09' }
    // Synk sekunder efter pushen och senare samma kväll: nästa körning är i morgon, inte nu.
    expect(row(fields, '2026-10-20T19:09:05.000Z', existing).next_run_at).toBe('2026-10-21T19:09:00.000Z')
    expect(row(fields, '2026-10-20T21:00:00.000Z', existing).next_run_at).toBe('2026-10-21T19:09:00.000Z')
    // Synk strax före klockslaget behåller dagens tid, så servern skickar en gång.
    expect(row(fields, '2026-10-20T19:08:30.000Z', { ...existing, last_sent_at: null, next_run_at: '2026-10-20T19:09:00+00:00' }).next_run_at)
      .toBe('2026-10-20T19:09:00.000Z')
  })

  it('does not keep a later server time for chosen weekdays either', () => {
    const result = row({
      daysOfWeek: ['monday', 'wednesday'],
      scheduleType: 'selected_weekdays',
      startDate: '2026-09-25',
      time: '07:30',
    }, '2026-10-19T22:10:00.000Z', {
      days_of_week: ['monday', 'wednesday'],
      interval_minutes: 0,
      last_sent_at: '2026-10-19T22:03:00+00:00',
      next_run_at: '2026-10-26T06:30:00+00:00',
      reminder_id: 'r1',
      reminder_time: '07:30:00',
      schedule_type: 'selected_weekdays',
      start_date: '2026-09-25',
    })
    expect(result.next_run_at).toBe('2026-10-21T05:30:00.000Z')
  })
})

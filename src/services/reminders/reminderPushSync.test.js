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
  describe('server time that is due but not yet sent', () => {
    const everyDay = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    const daily = { scheduleType: 'daily', startDate: '2026-09-25', time: '21:09' }
    const dailyRow = (nextRunAt, extra = {}) => ({
      days_of_week: everyDay,
      interval_minutes: 0,
      next_run_at: nextRunAt,
      reminder_id: 'r1',
      reminder_time: '21:09:00',
      schedule_type: 'daily',
      start_date: '2026-09-25',
      ...extra,
    })
    const interval = { intervalMinutes: 120, lastTriggeredAt: '2026-10-20T07:51:37.336Z', scheduleType: 'interval', startDate: '2026-09-28', time: '11:33' }
    const intervalRow = (nextRunAt, extra = {}) => ({
      days_of_week: everyDay,
      interval_minutes: 120,
      last_sent_at: '2026-10-20T09:52:00+00:00',
      next_run_at: nextRunAt,
      reminder_id: 'r1',
      reminder_time: '11:33:00',
      schedule_type: 'interval',
      start_date: '2026-09-28',
      ...extra,
    })

    it('keeps a daily time that is at most 2 minutes old and moves on after that', () => {
      const existing = dailyRow('2026-10-20T19:09:00+00:00')
      expect(row(daily, '2026-10-20T19:08:30.000Z', existing).next_run_at).toBe('2026-10-20T19:09:00.000Z')
      expect(row(daily, '2026-10-20T19:09:00.000Z', existing).next_run_at).toBe('2026-10-20T19:09:00.000Z')
      expect(row(daily, '2026-10-20T19:09:30.000Z', existing).next_run_at).toBe('2026-10-20T19:09:00.000Z')
      expect(row(daily, '2026-10-20T19:11:00.000Z', existing).next_run_at).toBe('2026-10-20T19:09:00.000Z')
      expect(row(daily, '2026-10-20T19:11:00.001Z', existing).next_run_at).toBe('2026-10-21T19:09:00.000Z')
    })

    it('keeps an interval time that is at most 2 minutes old and moves on after that', () => {
      const existing = intervalRow('2026-10-20T11:52:00+00:00')
      expect(row(interval, '2026-10-20T11:52:30.000Z', existing).next_run_at).toBe('2026-10-20T11:52:00.000Z')
      expect(row(interval, '2026-10-20T11:54:00.000Z', existing).next_run_at).toBe('2026-10-20T11:52:00.000Z')
      expect(new Date(row(interval, '2026-10-20T11:54:01.000Z', existing).next_run_at).getTime())
        .toBeGreaterThan(new Date('2026-10-20T11:54:01.000Z').getTime())
    })

    it('keeps the server interval time when the app rhythm passed just before it', () => {
      // Appens rytm 11:51:37 har passerat, serverns 11:52:00 har inte det: serverns tid gäller.
      const existing = intervalRow('2026-10-20T11:52:00+00:00')
      expect(row(interval, '2026-10-20T11:51:45.000Z', existing).next_run_at).toBe('2026-10-20T11:52:00.000Z')
    })

    it('never brings back the old September times', () => {
      const now = '2026-10-20T08:30:00.000Z'
      const old = row(interval, now, intervalRow('2026-09-28T09:51:37.336+00:00', {
        last_sent_at: null,
        snoozed_until: '2026-09-28T09:51:37.336+00:00',
      }))
      expect(old.snoozed_until).toBeNull()
      expect(new Date(old.next_run_at).getTime()).toBeGreaterThan(new Date(now).getTime())
      expect(row(daily, now, dailyRow('2026-09-28T19:09:00+00:00')).next_run_at).toBe('2026-10-20T19:09:00.000Z')
      expect(row(daily, now, dailyRow('2026-10-19T19:09:00+00:00')).next_run_at).toBe('2026-10-20T19:09:00.000Z')
    })

    it('does not keep a due server time for a paused, archived or edited reminder', () => {
      const existing = dailyRow('2026-10-20T19:09:00+00:00')
      expect(row({ ...daily, pausedAt: '2026-10-20T19:00:00.000Z' }, '2026-10-20T19:09:30.000Z', existing).next_run_at).toBeNull()
      expect(row({ ...daily, archivedAt: '2026-10-20T19:00:00.000Z' }, '2026-10-20T19:09:30.000Z', existing).next_run_at).toBeNull()
      expect(row({ ...daily, time: '22:00' }, '2026-10-20T19:09:30.000Z', existing).next_run_at).toBe('2026-10-20T20:00:00.000Z')
    })
  })

  describe('sync and server together, minute by minute', () => {
    const MIN = 60000
    // Serverns beteende efter en push, som i den rättade Edge-funktionen: nästa lokala klockslag
    // efter pushen för dagliga påminnelser, och pushtiden plus intervallet för intervall.
    function serverNext(rowState, sentAt) {
      if (rowState.schedule_type === 'interval') return new Date(sentAt + rowState.interval_minutes * MIN).toISOString()
      const [hours, minutes] = rowState.reminder_time.split(':').map(Number)
      for (let offset = 0; offset < 3; offset += 1) {
        const candidate = new Date(sentAt + offset * 86400000)
        candidate.setHours(hours, minutes, 0, 0)
        if (candidate.getTime() > sentAt) return candidate.toISOString()
      }
      return null
    }

    function simulate(fields, existing, { start, end, syncs }) {
      const syncTimes = new Set(syncs.map((at) => new Date(at).getTime()))
      let state = { enabled: true, paused: false, archived: false, ...existing }
      const sends = []
      for (let now = new Date(start).getTime(); now <= new Date(end).getTime(); now += 1000) {
        if (now === new Date(start).getTime() || syncTimes.has(now)) {
          const built = row(fields, new Date(now).toISOString(), state)
          state = { ...state, ...built, reminder_time: `${built.reminder_time}:00`, last_sent_at: state.last_sent_at }
        }
        // Schemajobbet körs varje hel minut.
        if (now % MIN !== 0) continue
        if (state.next_run_at && new Date(state.next_run_at).getTime() <= now) {
          sends.push(now)
          state = { ...state, last_sent_at: new Date(now).toISOString(), next_run_at: serverNext(state, now), snoozed_until: null }
        }
      }
      return sends
    }

    const localDay = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })

    it('sends a daily reminder once a day with syncs just before, at and just after the time', () => {
      const syncs = []
      for (let day = 20; day <= 27; day += 1) {
        const hour = day >= 25 ? 20 : 19
        for (const second of ['08:30', '08:59', '09:00', '09:01', '09:30', '10:30', '11:01']) {
          syncs.push(`2026-10-${day}T${hour}:${second}.000Z`)
        }
        syncs.push(`2026-10-${day}T22:05:00.000Z`)
      }
      const sends = simulate(
        { scheduleType: 'daily', startDate: '2026-09-25', time: '21:09' },
        { days_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], interval_minutes: 0, next_run_at: '2026-10-19T19:09:00+00:00', reminder_id: 'r1', reminder_time: '21:09:00', schedule_type: 'daily', start_date: '2026-09-25' },
        { start: '2026-10-20T08:30:00.000Z', end: '2026-10-27T23:00:00.000Z', syncs },
      )
      expect(sends.map(localDay)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
      sends.forEach((ms) => {
        expect(new Date(ms).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm' }).slice(0, 5)).toBe('21:09')
      })
    })

    it('sends an interval reminder every interval with syncs just before and after each push', () => {
      const syncs = []
      for (let hour = 9; hour <= 19; hour += 2) {
        const h = String(hour).padStart(2, '0')
        for (const second of ['51:30', '51:45', '51:59', '52:00', '52:01', '52:30', '53:59', '54:30']) syncs.push(`2026-10-20T${h}:${second}.000Z`)
      }
      const sends = simulate(
        { intervalMinutes: 120, lastTriggeredAt: '2026-09-28T07:51:37.336Z', scheduleType: 'interval', snoozedUntil: '2026-09-28T09:51:37.336Z', startDate: '2026-09-28', time: '11:33' },
        { days_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], interval_minutes: 120, next_run_at: '2026-09-28T09:51:37.336+00:00', reminder_id: 'r1', reminder_time: '11:33:00', schedule_type: 'interval', snoozed_until: '2026-09-28T09:51:37.336+00:00', start_date: '2026-09-28' },
        { start: '2026-10-20T08:30:00.000Z', end: '2026-10-20T21:00:00.000Z', syncs },
      )
      // Ingen push direkt för den gamla raden, sedan exakt var 2:a timme.
      expect(sends[0]).toBeGreaterThan(new Date('2026-10-20T08:30:00.000Z').getTime())
      expect(sends.map((ms) => new Date(ms).toISOString().slice(11, 16))).toEqual(['09:52', '11:52', '13:52', '15:52', '17:52', '19:52'])
    })
  })
})

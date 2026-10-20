import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { nextRun } from './nextRun.ts'

const everyDay = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function row(fields) {
  return { days_of_week: everyDay, reminder_time: '21:09:00', schedule_type: 'daily', timezone: 'Europe/Stockholm', ...fields }
}

function next(fields, after) {
  return nextRun(row(fields), new Date(after))
}

describe('reminder-push nextRun', () => {
  // Supabase Edge-miljön kör i UTC.
  beforeAll(() => {
    vi.stubEnv('TZ', 'UTC')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('moves a daily reminder to tomorrow after the push at its time, so it is not sent twice', () => {
    expect(next({}, '2026-10-20T19:09:00.000Z')).toBe('2026-10-21T19:09:00.000Z')
    expect(next({}, '2026-10-20T19:09:05.000Z')).toBe('2026-10-21T19:09:00.000Z')
  })

  it('keeps today after a push just after midnight', () => {
    // 00:03 svensk tid den 21 oktober, efter en snooze över midnatt.
    expect(next({}, '2026-10-20T22:03:00.000Z')).toBe('2026-10-21T19:09:00.000Z')
  })

  it('keeps today after a late push in the morning', () => {
    expect(next({}, '2026-10-20T08:00:00.000Z')).toBe('2026-10-20T19:09:00.000Z')
  })

  it('moves to tomorrow after a snoozed push later in the evening', () => {
    expect(next({}, '2026-10-20T19:14:00.000Z')).toBe('2026-10-21T19:09:00.000Z')
  })

  it('handles weekdays, weekends and chosen weekdays', () => {
    // Fredag 23 oktober 07:30 svensk tid skickad: nästa vardag är måndag.
    expect(next({ reminder_time: '07:30:00', schedule_type: 'weekdays' }, '2026-10-23T05:30:05.000Z')).toBe('2026-10-26T06:30:00.000Z')
    // Lördag morgon skickad: söndag samma tid.
    expect(next({ reminder_time: '10:00:00', schedule_type: 'weekends' }, '2026-10-24T08:00:05.000Z')).toBe('2026-10-25T09:00:00.000Z')
    // Måndag och onsdag 07:30. Push 00:03 natten till onsdag: onsdagens tid ska inte hoppas över.
    expect(next({ days_of_week: ['monday', 'wednesday'], reminder_time: '07:30:00', schedule_type: 'selected_weekdays' }, '2026-10-20T22:03:00.000Z'))
      .toBe('2026-10-21T05:30:00.000Z')
    // Onsdag skickad på tiden: nästa är måndag.
    expect(next({ days_of_week: ['monday', 'wednesday'], reminder_time: '07:30:00', schedule_type: 'weekly' }, '2026-10-21T05:30:05.000Z'))
      .toBe('2026-10-26T06:30:00.000Z')
  })

  it('keeps the local clock time across the autumn change to winter time', () => {
    expect(next({}, '2026-10-24T19:09:05.000Z')).toBe('2026-10-25T20:09:00.000Z')
    expect(next({}, '2026-10-25T20:09:05.000Z')).toBe('2026-10-26T20:09:00.000Z')
  })

  it('keeps the local clock time across the spring change to summer time', () => {
    expect(next({}, '2026-03-28T20:09:05.000Z')).toBe('2026-03-29T19:09:00.000Z')
    expect(next({ reminder_time: '07:00:00' }, '2026-03-28T06:00:05.000Z')).toBe('2026-03-29T05:00:00.000Z')
  })

  it('handles night times on the days the clock changes', () => {
    // 01:30 natten till 25 oktober är fortfarande sommartid (UTC+2).
    expect(next({ reminder_time: '01:30:00' }, '2026-10-24T12:00:00.000Z')).toBe('2026-10-24T23:30:00.000Z')
    // 03:30 natten till 29 mars är sommartid (UTC+2).
    expect(next({ reminder_time: '03:30:00' }, '2026-03-28T12:00:00.000Z')).toBe('2026-03-29T01:30:00.000Z')
  })

  it('sends exactly once per local day through both clock changes', () => {
    const localDate = (date) => date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
    const periods = [['2026-10-21T12:00:00.000Z', '2026-10-29'], ['2026-03-25T12:00:00.000Z', '2026-04-02']]
    for (const time of ['01:30:00', '02:30:00', '03:30:00', '21:09:00']) {
      for (const [startAt, lastDay] of periods) {
        const days = []
        let at = new Date(nextRun(row({ reminder_time: time }), new Date(startAt)))
        while (localDate(at) <= lastDay) {
          days.push(localDate(at))
          // Servern skickar vid tiden (några sekunder senare) och räknar fram nästa.
          at = new Date(nextRun(row({ reminder_time: time }), new Date(at.getTime() + 5000)))
        }
        const expected = []
        for (let day = new Date(`${days[0]}T12:00:00Z`); day.toISOString().slice(0, 10) <= lastDay; day = new Date(day.getTime() + 86400000)) {
          expected.push(day.toISOString().slice(0, 10))
        }
        expect(days).toEqual(expected)
      }
    }
  })

  it('never returns a time at or before the push and never skips a day', () => {
    const start = new Date('2026-10-19T00:00:00.000Z').getTime()
    for (let minutes = 0; minutes < 4 * 24 * 60; minutes += 17) {
      const after = new Date(start + minutes * 60000)
      const result = new Date(nextRun(row({}), after))
      expect(result.getTime()).toBeGreaterThan(after.getTime())
      expect(result.getTime() - after.getTime()).toBeLessThanOrEqual(25 * 60 * 60000)
    }
  })

  it('keeps interval and one-time behaviour unchanged', () => {
    expect(nextRun({ interval_minutes: 120, schedule_type: 'interval' }, new Date('2026-10-20T09:51:40.000Z'))).toBe('2026-10-20T11:51:40.000Z')
    expect(nextRun({ schedule_type: 'once' }, new Date('2026-10-20T09:51:40.000Z'))).toBeNull()
  })
})

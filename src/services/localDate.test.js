import { describe, expect, it } from 'vitest'
import {
  filterEntriesThroughLocalToday,
  getEntryLocalDate,
  getEntrySortTime,
  getLocalCalendarDayDiff,
  getLocalDateRange,
  getLocalDateString,
  isEntryOnLocalDate,
  isFutureLocalDate,
  latestEntryPerLocalDate,
  parseDateValue,
} from './localDate.js'

describe('central local date utilities', () => {
  it('converts UTC ISO timestamps to the local calendar day', () => {
    expect(getLocalDateString('2026-07-30T22:30:00.000Z')).toBe('2026-07-31')
    expect(getLocalDateString('2026-12-31T23:30:00.000Z')).toBe('2027-01-01')
  })

  it('handles entries just before and after local midnight', () => {
    expect(getEntryLocalDate({ createdAt: '2026-07-30T21:59:00.000Z' })).toBe('2026-07-30')
    expect(getEntryLocalDate({ createdAt: '2026-07-30T22:01:00.000Z' })).toBe('2026-07-31')
  })

  it('keeps today entries with later clock time but filters future calendar days', () => {
    const entries = [
      { date: '2026-07-31', id: 'later', time: '23:59' },
      { date: '2026-08-01', id: 'future', time: '00:01' },
    ]

    expect(filterEntriesThroughLocalToday(entries, '2026-07-31T08:00:00').map((entry) => entry.id)).toEqual(['later'])
    expect(isFutureLocalDate('2026-08-01', '2026-07-31T23:59:00')).toBe(true)
  })

  it('selects the latest entry per local calendar day from date and time fields', () => {
    const entries = [
      { date: '2026-07-31', id: 'morning', time: '08:00' },
      { date: '2026-07-31', id: 'evening', time: '20:00' },
    ]

    expect(latestEntryPerLocalDate(entries)[0].entry.id).toBe('evening')
  })

  it('uses updatedAt before createdAt when selecting latest same-day entries', () => {
    const entries = [
      { createdAt: '2026-07-31T08:00:00', id: 'created-late' },
      { createdAt: '2026-07-31T07:00:00', id: 'updated-late', updatedAt: '2026-07-31T21:00:00' },
    ]

    expect(getEntrySortTime(entries[1])).toBeGreaterThan(getEntrySortTime(entries[0]))
    expect(latestEntryPerLocalDate(entries)[0].entry.id).toBe('updated-late')
  })

  it('ignores invalid dates safely', () => {
    expect(parseDateValue('bad')).toBeNull()
    expect(getEntryLocalDate({ date: 'bad' })).toBe('')
    expect(latestEntryPerLocalDate([{ date: 'bad', id: 'bad' }])).toEqual([])
  })

  it('clones Date objects so consumers cannot mutate the original date anchor', () => {
    const today = new Date('2026-03-31T12:00:00.000Z')
    const parsed = parseDateValue(today)

    parsed.setDate(parsed.getDate() + 7)

    expect(getLocalDateString(today)).toBe('2026-03-31')
  })

  it('builds exact seven and thirty local calendar day ranges', () => {
    expect(getLocalDateRange(7, '2026-07-31T23:59:00')).toMatchObject({
      end: '2026-07-31',
      start: '2026-07-25',
    })
    expect(getLocalDateRange(30, '2026-07-31T23:59:00')).toMatchObject({
      end: '2026-07-31',
      start: '2026-07-02',
    })
  })

  it('handles month and year boundaries in period ranges', () => {
    expect(getLocalDateRange(7, '2026-03-02T12:00:00')).toMatchObject({
      end: '2026-03-02',
      start: '2026-02-24',
    })
    expect(getLocalDateRange(7, '2027-01-03T12:00:00')).toMatchObject({
      end: '2027-01-03',
      start: '2026-12-28',
    })
  })

  it('handles daylight saving transitions with calendar days', () => {
    expect(getLocalDateRange(7, '2026-03-29T12:00:00')).toMatchObject({
      end: '2026-03-29',
      start: '2026-03-23',
    })
    expect(getLocalDateRange(7, '2026-10-25T12:00:00')).toMatchObject({
      end: '2026-10-25',
      start: '2026-10-19',
    })
  })

  it('calculates calendar day differences across daylight saving changes', () => {
    expect(getLocalCalendarDayDiff('2026-03-28', '2026-03-30')).toBe(2)
    expect(getLocalCalendarDayDiff('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('lets weight meals and check-ins interpret the same timestamp as the same local day', () => {
    const timestamp = '2026-07-30T22:30:00.000Z'

    expect(getEntryLocalDate({ createdAt: timestamp, value: 89.6 })).toBe('2026-07-31')
    expect(getEntryLocalDate({ createdAt: timestamp, name: 'Kvarg' })).toBe('2026-07-31')
    expect(getEntryLocalDate({ createdAt: timestamp, energy: 7 })).toBe('2026-07-31')
  })

  it('keeps raw history entries available outside daily representative helpers', () => {
    const entries = [
      { date: '2026-07-31', id: 'a', time: '08:00' },
      { date: '2026-07-31', id: 'b', time: '09:00' },
    ]

    expect(entries).toHaveLength(2)
    expect(latestEntryPerLocalDate(entries)).toHaveLength(1)
    expect(isEntryOnLocalDate(entries[0], '2026-07-31')).toBe(true)
  })
})

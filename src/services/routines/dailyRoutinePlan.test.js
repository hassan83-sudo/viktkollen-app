import { describe, expect, it } from 'vitest'
import {
  buildDailyRoutinePlan,
  buildRoutineCoachContext,
  buildRoutineStreak,
  normalizeDailyRoutine,
  recordRoutineAction,
  toggleChecklistItem,
  upsertChecklistItem,
} from './dailyRoutinePlan.js'

const now = '2026-07-31T10:00:00.000Z'

describe('dailyRoutinePlan', () => {
  it('normalizes a simple daily routine model safely', () => {
    const routine = normalizeDailyRoutine({
      category: 'oral_care',
      id: 'routine-oral',
      recurrence: 'weekdays',
      targetTime: '07:30',
      title: 'SB12',
    }, { now })

    expect(routine).toMatchObject({
      category: 'oral_care',
      enabled: true,
      id: 'routine-oral',
      recurrence: 'weekdays',
      targetTime: '07:30',
      title: 'SB12',
    })
  })

  it('builds todays plan from reminders and checklist items', () => {
    const reminderState = upsertChecklistItem({
      reminders: [{ id: 'weight', scheduleType: 'daily', time: '08:00', title: 'Väg dig', type: 'weight' }],
    }, { category: 'personal_care', id: 'deodorant', order: 1, title: 'Deo' }, { now })
    const plan = buildDailyRoutinePlan({ reminderState }, { now, today: '2026-07-31' })

    expect(plan.items.map((item) => item.title)).toEqual(['Väg dig', 'Deo'])
    expect(plan.counts).toMatchObject({ done: 0, pending: 1, total: 2 })
    expect(plan.items.find((item) => item.title === 'Väg dig').status).toBe('overdue')
  })

  it('supports selected weekdays, weekends and weekdays without UTC day drift', () => {
    const friday = buildDailyRoutinePlan({
      reminderState: {
        reminders: [
          { id: 'weekday', scheduleType: 'weekdays', time: '09:00', title: 'Vardag' },
          { id: 'weekend', scheduleType: 'weekends', time: '09:00', title: 'Helg' },
          { daysOfWeek: ['friday'], id: 'selected', scheduleType: 'selected_weekdays', time: '09:00', title: 'Fredag' },
        ],
      },
    }, { now, today: '2026-07-31' })

    expect(friday.items.map((item) => item.title)).toEqual(['Fredag', 'Vardag'])
  })

  it('dedupes complete and skip events per routine date', () => {
    const first = recordRoutineAction({}, {
      action: 'completed',
      routineId: 'checklist:walk',
      scheduledAt: '2026-07-31T18:00:00.000Z',
    }, { now })
    const second = recordRoutineAction(first, {
      action: 'completed',
      routineId: 'checklist:walk',
      scheduledAt: '2026-07-31T18:00:00.000Z',
    }, { now: '2026-07-31T18:05:00.000Z' })

    expect(second.routinePlan.history.filter((entry) => entry.action === 'completed')).toHaveLength(1)
  })

  it('keeps snooze metadata across midnight', () => {
    const state = recordRoutineAction({}, {
      action: 'snoozed',
      routineId: 'checklist:evening',
      scheduledAt: '2026-07-31T21:50:00.000Z',
      snoozedUntil: '2026-08-01T00:20:00.000Z',
    }, { now: '2026-07-31T21:55:00.000Z' })

    expect(state.routinePlan.history[0]).toMatchObject({
      action: 'snoozed',
      date: '2026-07-31',
      snoozedUntil: '2026-08-01T00:20:00.000Z',
    })
  })

  it('calculates streaks without counting skipped days as complete', () => {
    const history = [
      { action: 'completed', at: '2026-07-29T10:00:00.000Z', date: '2026-07-29', routineId: 'r1' },
      { action: 'skipped', at: '2026-07-30T10:00:00.000Z', date: '2026-07-30', routineId: 'r1' },
      { action: 'completed', at: '2026-07-31T10:00:00.000Z', date: '2026-07-31', routineId: 'r1' },
    ]

    expect(buildRoutineStreak('r1', history, { today: '2026-07-31' })).toMatchObject({
      completedDays: 2,
      current: 1,
      longest: 1,
    })
  })

  it('toggles checklist items without deleting history', () => {
    const created = upsertChecklistItem({}, { id: 'napkins', title: 'Servetter' }, { now })
    const completed = recordRoutineAction(created, {
      action: 'completed',
      routineId: 'checklist:napkins',
      scheduledAt: '2026-07-31T20:00:00.000Z',
    }, { now })
    const paused = toggleChecklistItem(completed, 'napkins', false, { now: '2026-08-01T08:00:00.000Z' })

    expect(paused.routinePlan.checklist[0].enabled).toBe(false)
    expect(paused.routinePlan.history).toHaveLength(1)
  })

  it('summarizes routine context for AI Coach without raw scolding language', () => {
    const reminderState = recordRoutineAction({
      reminders: [{ id: 'walk', scheduleType: 'daily', time: '17:00', title: 'Promenad' }],
    }, {
      action: 'completed',
      reminderId: 'walk',
      routineId: 'reminder:walk',
      scheduledAt: '2026-07-31T17:00:00.000Z',
    }, { now: '2026-07-31T17:10:00.000Z' })
    const context = buildRoutineCoachContext({ reminderState }, { now: '2026-07-31T18:00:00.000Z', today: '2026-07-31' })

    expect(context).toMatchObject({
      completionStatus: '1/1',
      provenance: { completed: 'completed', routines: 'user_entered' },
      today: { done: 1, total: 1 },
    })
    expect(JSON.stringify(context)).not.toMatch(/dålig|misslyck/i)
  })
})

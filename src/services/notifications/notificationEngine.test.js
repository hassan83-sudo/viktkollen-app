import { describe, expect, it, vi } from 'vitest'
import {
  batchNotificationCandidates,
  buildAdaptiveDeliveryProfile,
  buildNotificationCenterModel,
  buildNotificationPlan,
  buildSmartNotificationCandidates,
  buildSmartNotificationCoachContext,
  isWithinQuietHours,
  normalizeNotificationsV3,
  recordNotificationEvent,
  updateSmartNotificationStatus,
} from './notificationEngine.js'

const now = '2026-08-04T10:00:00.000Z'

function reminder(overrides = {}) {
  return {
    createdAt: '2026-08-01T08:00:00.000Z',
    description: 'Lugnt test',
    enabled: true,
    id: 'reminder-meal',
    scheduleType: 'daily',
    startDate: '2026-08-01',
    time: '09:00',
    title: 'Logga måltid',
    type: 'meal_log',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('notificationEngine', () => {
  it('builds reminder deliveries from due reminders', () => {
    const plan = buildNotificationPlan({
      dueReminders: [reminder()],
      reminderState: { reminders: [reminder()] },
    }, { now })

    expect(plan.deliveries).toHaveLength(1)
    expect(plan.deliveries[0].title).toBe('Logga måltid')
  })

  it('suppresses deliveries during quiet hours and keeps upcoming plan', () => {
    const plan = buildNotificationPlan({
      dueReminders: [reminder()],
      reminderState: {
        notificationsV3: { settings: { quietHours: { enabled: true, end: '07:00', start: '22:00' } } },
        reminders: [reminder()],
      },
    }, { now: '2026-08-04T22:30:00.000Z' })

    expect(plan.quietHoursActive).toBe(true)
    expect(plan.deliveries).toHaveLength(0)
    expect(new Date(plan.upcoming[0].scheduledAt).getHours()).toBe(7)
  })

  it('does not treat disabled quiet hours as active', () => {
    expect(isWithinQuietHours('2026-08-04T23:00:00.000Z', { enabled: false, end: '07:00', start: '22:00' })).toBe(false)
  })

  it('batches nearby notifications', () => {
    const batches = batchNotificationCandidates([
      { id: 'a', priority: 1, scheduledAt: now, tag: 'a', title: 'A' },
      { id: 'b', priority: 2, scheduledAt: '2026-08-04T10:20:00.000Z', tag: 'b', title: 'B' },
    ], { windowMinutes: 30 })

    expect(batches).toHaveLength(1)
    expect(batches[0].title).toBe('2 påminnelser från Viktkollen')
  })

  it('keeps distant notifications separate', () => {
    const batches = batchNotificationCandidates([
      { id: 'a', priority: 1, scheduledAt: now, tag: 'a', title: 'A' },
      { id: 'b', priority: 2, scheduledAt: '2026-08-04T12:00:00.000Z', tag: 'b', title: 'B' },
    ], { windowMinutes: 30 })

    expect(batches).toHaveLength(2)
  })

  it('adapts cadence when many reminders are skipped or snoozed', () => {
    const profile = buildAdaptiveDeliveryProfile({
      history: [
        { action: 'skipped', at: now, id: 'h1', reminderId: 'r1' },
        { action: 'snoozed', at: now, id: 'h2', reminderId: 'r1' },
        { action: 'skipped', at: now, id: 'h3', reminderId: 'r2' },
      ],
      reminders: [],
    })

    expect(profile.cadence).toBe('reduced')
    expect(profile.recommendedDelayMinutes).toBe(45)
  })

  it('adapts cadence when reminders are completed quickly', () => {
    const profile = buildAdaptiveDeliveryProfile({
      history: [
        { action: 'completed', at: now, id: 'h1', reminderId: 'r1' },
        { action: 'completed', at: now, id: 'h2', reminderId: 'r2' },
      ],
      reminders: [],
    })

    expect(profile.cadence).toBe('responsive')
  })

  it('records notification history without raw source ids', () => {
    const state = recordNotificationEvent({ reminders: [reminder()] }, {
      items: [{ id: 'n1', sourceId: 'very-sensitive-id', sourceType: 'reminder', title: 'Test' }],
      status: 'delivered',
    }, { now })

    expect(state.notificationsV3.history[0].sourceIdMasked).toMatch(/^ref-/)
    expect(JSON.stringify(state.notificationsV3.history)).not.toContain('very-sensitive-id')
  })

  it('dedupes repeated deliveries for the same source inside the cooldown window', () => {
    const first = recordNotificationEvent({ reminders: [reminder()] }, {
      items: [{ id: 'n1', sourceId: 'reminder-meal', sourceType: 'reminder', title: 'Test' }],
      status: 'delivered',
    }, { now })
    const plan = buildNotificationPlan({
      dueReminders: [reminder()],
      reminderState: first,
    }, { now: '2026-08-04T10:10:00.000Z' })

    expect(plan.deliveries).toHaveLength(0)
  })

  it('adds sync conflict notifications without raw payload', () => {
    const plan = buildNotificationPlan({
      reminderState: {},
      syncStatus: { conflicts: [{ storageKey: 'viktkollen.profile', localRecord: { payload: { name: 'Anna' } } }], syncHealth: 'conflict' },
    }, { now })

    expect(plan.upcoming[0].items[0].sourceType).toBe('sync')
    expect(JSON.stringify(plan)).not.toContain('Anna')
  })

  it('normalizes malformed notification settings safely', () => {
    const normalized = normalizeNotificationsV3({
      history: [{ sourceId: 'abc', status: 'nope', title: 'x' }],
      settings: { batchingWindowMinutes: -1, quietHours: { end: 'bad', start: 'also-bad' } },
    }, { now })

    expect(normalized.settings.batchingWindowMinutes).toBe(5)
    expect(normalized.settings.quietHours.start).toBe('22:00')
    expect(normalized.history[0].status).toBe('scheduled')
  })

  it('builds center buckets for completed postponed and dismissed', () => {
    const state = {
      notificationsV3: {
        history: [
          { at: now, id: 'done', status: 'completed', title: 'Done' },
          { at: now, id: 'later', status: 'postponed', title: 'Later' },
          { at: now, id: 'dismiss', status: 'dismissed', title: 'Dismiss' },
        ],
      },
    }
    const model = buildNotificationCenterModel({ reminderState: state }, { now })

    expect(model.completed).toHaveLength(1)
    expect(model.postponed).toHaveLength(1)
    expect(model.dismissed).toHaveLength(1)
  })

  it('does not throw when Notification is missing', () => {
    vi.stubGlobal('window', {})
    const plan = buildNotificationPlan({ reminderState: {} }, { now })

    expect(plan.permission).toBe('unsupported')
    vi.unstubAllGlobals()
  })

  it('prioritizes at most three smart recommendations', () => {
    const candidates = buildSmartNotificationCandidates({
      checkIn: {},
      goalsHabits: { achievements: {} },
      mealPlans: { weeks: {} },
      meals: [{ calories: 500, date: '2026-08-04', id: 'm1', protein: 20 }],
      nutritionGoals: { protein: 100 },
      profile: { goalWeight: 80, startWeight: 90 },
      weights: [{ date: '2026-07-20', value: 90 }],
    }, { now })

    expect(candidates).toHaveLength(3)
    expect(candidates[0].priorityLabel).toBe('Hög prioritet')
    expect(candidates.map((item) => item.priority)).toEqual([...candidates.map((item) => item.priority)].sort((a, b) => b - a))
  })

  it('groups similar smart protein notifications', () => {
    const candidates = buildSmartNotificationCandidates({
      checkIn: { date: '2026-08-04', steps: 8000 },
      mealPlans: { weeks: {} },
      meals: [
        { date: '2026-08-02', id: 'm1', protein: 20 },
        { date: '2026-08-03', id: 'm2', protein: 25 },
        { date: '2026-08-04', id: 'm3', protein: 30 },
      ],
      nutritionGoals: { protein: 100 },
      weights: [{ date: '2026-08-04', value: 88 }],
    }, { now })

    expect(candidates.filter((item) => item.group === 'protein')).toHaveLength(1)
    expect(candidates.find((item) => item.group === 'protein')?.body).toContain('3')
  })

  it('marks smart notifications completed and snoozes them through existing history', () => {
    const [candidate] = buildSmartNotificationCandidates({
      checkIn: {},
      mealPlans: { weeks: {} },
      meals: [],
      weights: [],
    }, { now })
    const completed = updateSmartNotificationStatus({ notificationsV3: {} }, candidate, 'completed', { now })
    const snoozed = updateSmartNotificationStatus({ notificationsV3: {} }, candidate, 'postponed', { now, snoozeMinutes: 60 })

    expect(completed.notificationsV3.history[0].status).toBe('completed')
    expect(snoozed.notificationsV3.history[0].status).toBe('postponed')
    expect(snoozed.notificationsV3.history[0].reason).toContain('snooze_until:')
  })

  it('suppresses snoozed smart notifications until later', () => {
    const [candidate] = buildSmartNotificationCandidates({
      checkIn: {},
      mealPlans: { weeks: {} },
      meals: [],
      weights: [],
    }, { now })
    const reminderState = updateSmartNotificationStatus({ notificationsV3: {} }, candidate, 'postponed', { now, snoozeMinutes: 60 })
    const candidates = buildSmartNotificationCandidates({
      checkIn: {},
      mealPlans: { weeks: {} },
      meals: [],
      reminderState,
      weights: [],
    }, { now: '2026-08-04T10:30:00.000Z' })

    expect(candidates.some((item) => item.sourceIdMasked === candidate.sourceIdMasked)).toBe(false)
  })

  it('exposes the highest smart notification for AI Coach', () => {
    const context = buildSmartNotificationCoachContext({
      checkIn: {},
      mealPlans: { weeks: {} },
      meals: [],
      weights: [],
    }, { now })

    expect(context.recommendation).toContain('I dag rekommenderar jag')
    expect(context.priority).toBe('Hög prioritet')
  })

  it('reuses clear nutrition coach advice when it does not duplicate protein or meal plan alerts', () => {
    const candidates = buildSmartNotificationCandidates({
      checkIn: { date: '2026-08-04' },
      mealPlanner: {
        saveState: {
          dayHasPlan: true,
          saved: true,
          week: {
            days: {
              '2026-08-04': [{ date: '2026-08-04', id: 'planned', mealType: 'Middag', nutritionPreview: { calories: 700, protein: 35 } }],
            },
            weekStart: '2026-08-04',
          },
        },
      },
      meals: [{ calories: 900, date: '2026-08-04', id: 'm1', protein: 50 }],
      nutritionGoals: { calories: 2200, protein: 120 },
      weights: [{ date: '2026-08-04', value: 88 }],
    }, { now })

    expect(candidates.some((item) => item.group === 'nutrition')).toBe(true)
    expect(candidates.find((item) => item.group === 'nutrition')?.body).toContain('70 g protein kvar')
  })
})

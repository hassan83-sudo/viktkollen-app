import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { QUOTA_STATUS } from './catalog.js'
import { createEntitlement, numberLimit } from './entitlementModel.js'
import { defaultPlanCatalog } from './planCatalog.js'
import { createInMemoryPlanAssignmentStore } from './planAssignment.js'
import { createQuotaEngine } from './quotaEngine.js'
import { createInMemoryAtomicBackend } from './quotaAtomicBackend.js'
import { quotaPeriodForPlan } from './quotaWindow.js'
import { createInMemoryReservationStore } from './reservationStore.js'

const USER = '11111111-1111-4111-8111-111111111111'
const PAID = 'plan.prelim.sek.month.04'
const START = '2026-10-28T09:22:46.000Z'
const END = '2026-11-27T09:22:46.000Z'
const migration = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/migrations/20261028110000_billing_one_time_quota_window.sql',
), 'utf8')

function catalogWithCoachLimit(limit) {
  return defaultPlanCatalog.map((plan) => {
    if (plan.id !== PAID) return plan
    return {
      ...plan,
      entitlements: {
        ...plan.entitlements,
        'ai.text.request': createEntitlement({
          enabled: true,
          feature: 'ai.text.request',
          limit: numberLimit(limit),
          unit: 'requests',
        }),
      },
    }
  })
}

function openEngine({
  assignments = createInMemoryPlanAssignmentStore(),
  at = '2026-10-28T12:00:00.000Z',
  catalog = catalogWithCoachLimit(50),
  reservations = createInMemoryReservationStore(),
} = {}) {
  const now = () => new Date(at)
  const backend = createInMemoryAtomicBackend({ assignments, catalog, now, reservations })
  return {
    assignments,
    engine: createQuotaEngine({ backend, now }),
    reservations,
  }
}

async function assignOneTime(assignments, period = {}) {
  await assignments.set({
    current_period_end: END,
    current_period_start: START,
    plan_id: PAID,
    plan_version: 1,
    quota_window: 'subscription',
    user_id: USER,
    ...period,
  })
}

describe('one-time quota window', () => {
  it('keeps the migration from rewriting periods, reservations, and usage events', () => {
    expect(migration).toMatch(/quota_window text not null default 'calendar'/)
    expect(migration).toMatch(/set quota_window = 'subscription'/)
    expect(migration).toMatch(/s\.quota_window = 'subscription'/)
    expect(migration).toMatch(/order by keys\.key_start/)
    expect(migration).toMatch(/billing\.quota_legacy_paid_used/)
    expect(migration).toMatch(/billing\.period_bounds/)
    expect(migration.match(/mark_one_time_quota_window\(created\.subscription_id\)/g)).toHaveLength(2)
    expect(migration.match(/mark_one_time_quota_window\(s\.subscription_id\)/g)).toHaveLength(1)
    expect(migration.match(/create_subscription\(/g)).toHaveLength(1)
    expect(migration).not.toMatch(/update billing\.quota_reservations/i)
    expect(migration).not.toMatch(/update billing\.usage_events/i)
    expect(migration).not.toMatch(/enabled_for_sale\s*=\s*true/)
    expect(migration).not.toMatch(/set\s+current_period_(start|end)/i)
  })

  it('uses the paid 30-day window for a mid-month one-time purchase', async () => {
    const { assignments, engine } = openEngine()
    await assignOneTime(assignments)
    const snapshot = await engine.inspectQuota({ feature: 'ai.text.request', userId: USER })
    expect(snapshot.period_start).toBe(START)
    expect(snapshot.period_end).toBe(END)
    expect(snapshot.limit).toBe(50)
  })

  it('uses the paid window when the purchase is on the last day of the month', async () => {
    const start = '2026-10-31T22:00:00.000Z'
    const end = '2026-11-30T22:00:00.000Z'
    const { assignments, engine } = openEngine({ at: '2026-10-31T23:00:00.000Z' })
    await assignOneTime(assignments, { current_period_end: end, current_period_start: start })
    const snapshot = await engine.inspectQuota({ feature: 'ai.text.request', userId: USER })
    expect(snapshot.period_start).toBe(start)
    expect(snapshot.period_end).toBe(end)
  })

  it('does not reset the paid quota at the calendar month boundary', async () => {
    const { assignments, engine } = openEngine({ at: '2026-11-02T12:00:00.000Z' })
    await assignOneTime(assignments)
    const snapshot = await engine.inspectQuota({ feature: 'ai.text.request', userId: USER })
    expect(snapshot.period_start).toBe(START)
    expect(snapshot.period_end).toBe(END)
  })

  it('counts paid calls after payment and leaves earlier free calls on the free plan', async () => {
    const reservations = createInMemoryReservationStore()
    await reservations.insert({
      actual_quantity: 5,
      created_at: '2026-10-20T12:00:00.000Z',
      feature: 'ai.text.request',
      period_end: '2026-11-01T00:00:00.000Z',
      period_start: '2026-10-01T00:00:00.000Z',
      plan_id: 'plan.free',
      quantity: 5,
      reservation_id: 'free-before',
      status: 'COMMITTED',
      unit: 'requests',
      user_id: USER,
    })
    await reservations.insert({
      actual_quantity: 4,
      created_at: '2026-10-28T10:00:00.000Z',
      feature: 'ai.text.request',
      period_end: '2026-11-01T00:00:00.000Z',
      period_start: '2026-10-01T00:00:00.000Z',
      plan_id: PAID,
      quantity: 4,
      reservation_id: 'paid-after',
      status: 'COMMITTED',
      unit: 'requests',
      user_id: USER,
    })
    await reservations.insert({
      actual_quantity: 8899,
      created_at: '2026-10-28T10:00:00.000Z',
      feature: 'ai.text.request',
      period_end: '2026-11-01T00:00:00.000Z',
      period_start: '2026-10-01T00:00:00.000Z',
      plan_id: PAID,
      quantity: 8899,
      reservation_id: 'tokens',
      status: 'COMMITTED',
      unit: 'tokens',
      user_id: USER,
    })
    const { assignments, engine } = openEngine({ reservations })
    await assignOneTime(assignments)
    const snapshot = await engine.inspectQuota({ feature: 'ai.text.request', userId: USER })
    expect(snapshot.used).toBe(4)
    expect(snapshot.remaining).toBe(46)
    const freeRow = (await reservations.list()).find((row) => row.reservation_id === 'free-before')
    expect(freeRow.period_start).toBe('2026-10-01T00:00:00.000Z')
    expect(freeRow.plan_id).toBe('plan.free')
  })

  it('allows the 50th paid call and denies the 51st', async () => {
    const { assignments, engine } = openEngine()
    await assignOneTime(assignments)
    for (let index = 0; index < 50; index += 1) {
      const reserved = await engine.reserveQuota({
        feature: 'ai.text.request',
        quantity: 1,
        reservation_id: `call-${index}`,
        user: USER,
      })
      expect(reserved.status).toBe(QUOTA_STATUS.RESERVED)
      expect(reserved.period_start).toBe(START)
    }
    const denied = await engine.reserveQuota({
      feature: 'ai.text.request',
      quantity: 1,
      reservation_id: 'call-51',
      user: USER,
    })
    expect(denied.status).toBe(QUOTA_STATUS.DENIED_QUOTA_EXCEEDED)
    expect(denied.remaining).toBe(0)
  })

  it('lets concurrent reservations share one window without passing 50', async () => {
    const reservations = createInMemoryReservationStore()
    const assignments = createInMemoryPlanAssignmentStore()
    await assignOneTime(assignments)
    const now = () => new Date('2026-10-28T12:00:00.000Z')
    const backend = createInMemoryAtomicBackend({
      assignments,
      catalog: catalogWithCoachLimit(50),
      now,
      reservations,
    })
    const first = createQuotaEngine({ backend, now })
    const second = createQuotaEngine({ backend, now })
    const results = await Promise.all([
      ...Array.from({ length: 25 }, (_, index) => first.reserveQuota({
        feature: 'ai.text.request',
        quantity: 1,
        reservation_id: `a-${index}`,
        user: USER,
      })),
      ...Array.from({ length: 26 }, (_, index) => second.reserveQuota({
        feature: 'ai.text.request',
        quantity: 1,
        reservation_id: `b-${index}`,
        user: USER,
      })),
    ])
    expect(results.filter((row) => row.status === QUOTA_STATUS.RESERVED)).toHaveLength(50)
    expect(results.filter((row) => row.status === QUOTA_STATUS.DENIED_QUOTA_EXCEEDED)).toHaveLength(1)
  })

  it('returns a rolled-back reservation to the same paid window', async () => {
    const { assignments, engine, reservations } = openEngine()
    await assignOneTime(assignments)
    const reserved = await engine.reserveQuota({
      feature: 'ai.text.request',
      quantity: 1,
      reservation_id: 'rollback-me',
      user: USER,
    })
    const rolled = await engine.rollbackReservation({ reservation_id: reserved.reservation_id })
    expect(rolled.status).toBe(QUOTA_STATUS.ROLLED_BACK)
    const snapshot = await engine.inspectQuota({ feature: 'ai.text.request', userId: USER })
    expect(snapshot.remaining).toBe(50)
    expect(snapshot.period_end).toBe(END)
    const row = (await reservations.list()).find((item) => item.reservation_id === 'rollback-me')
    expect(row.status).toBe('ROLLED_BACK')
    expect(row.period_start).toBe(START)
    expect(row.period_end).toBe(END)
  })

  it('returns to the current free calendar quota after the paid period ends', async () => {
    const { assignments, engine } = openEngine({ at: '2026-11-28T09:22:46.000Z' })
    await assignOneTime(assignments)
    const snapshot = await engine.inspectQuota({ feature: 'food.scan', userId: USER })
    expect(snapshot.limit).toBe(5)
    expect(snapshot.period_start).toBe('2026-11-01T00:00:00.000Z')
    expect(snapshot.period_end).toBe('2026-12-01T00:00:00.000Z')
  })

  it('keeps a recurring subscription on the calendar month', async () => {
    const { assignments, engine } = openEngine()
    await assignments.set({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      plan_version: 1,
      quota_window: 'calendar',
      user_id: USER,
    })
    const snapshot = await engine.inspectQuota({ feature: 'ai.text.request', userId: USER })
    expect(snapshot.period_start).toBe('2026-10-01T00:00:00.000Z')
    expect(snapshot.period_end).toBe('2026-11-01T00:00:00.000Z')
  })

  it('resets the free plan when the calendar month changes', () => {
    expect(quotaPeriodForPlan({ now: new Date('2026-01-31T23:00:00.000Z') })).toMatchObject({
      period_end: '2026-02-01T00:00:00.000Z',
      period_start: '2026-01-01T00:00:00.000Z',
    })
    expect(quotaPeriodForPlan({ now: new Date('2026-02-01T00:00:00.000Z') })).toMatchObject({
      period_end: '2026-03-01T00:00:00.000Z',
      period_start: '2026-02-01T00:00:00.000Z',
    })
  })
})

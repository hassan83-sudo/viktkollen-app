import { describe, expect, it } from 'vitest'
import { LIMIT_KIND, OVERAGE_POLICY, QUOTA_STATUS } from './catalog.js'
import { readClientQuotaDisplay } from './clientQuotaView.js'
import { createQuotaEngine, passthroughMutex } from './quotaEngine.js'
import { createInMemoryAtomicBackend, assertReservationTransition } from './quotaAtomicBackend.js'
import { createInMemoryPlanAssignmentStore } from './planAssignment.js'
import { defaultPlanCatalog, getPlanById, preliminarySekMonthMajors } from './planCatalog.js'
import { periodBounds } from './period.js'
import { createInMemoryReservationStore } from './reservationStore.js'
import { createInMemoryUsageRepository } from './usageRepository.js'
import { createEntitlement, numberLimit } from './entitlementModel.js'

const USER = '11111111-1111-4111-8111-111111111111'

function engineAt(iso, extras = {}) {
  const now = () => new Date(iso)
  return createQuotaEngine({
    assignments: extras.assignments || createInMemoryPlanAssignmentStore(),
    catalog: extras.catalog || defaultPlanCatalog,
    now,
    reservations: extras.reservations || createInMemoryReservationStore(),
    usageRepository: extras.usageRepository || createInMemoryUsageRepository(),
  })
}

describe('BILL-2 plan catalog', () => {
  it('represents preliminary SEK monthly prices as integer ore', () => {
    expect(preliminarySekMonthMajors).toEqual([4, 7, 9, 12, 15, 19, 29, 39, 49, 59, 69, 79, 89, 99])
    const nine = getPlanById('plan.prelim.sek.month.09')
    expect(nine.price_minor).toBe(900)
    expect(nine.currency).toBe('SEK')
    expect(nine.price_status).toBe('PRELIMINARY')
    expect(nine.configurability).toBe('ADMIN-CONFIGURABLE')
    expect(nine.billing_interval).toBe('month')
    expect(Number.isInteger(nine.price_minor)).toBe(true)
  })

  it('keeps stable plan ids separate from display names', () => {
    const plan = getPlanById('plan.prelim.sek.month.19')
    expect(plan.id).toBe('plan.prelim.sek.month.19')
    expect(plan.name).not.toBe(plan.id)
    expect(plan.version).toBe(1)
  })
})

describe('BILL-2 quota engine', () => {
  it('reserves one of remaining=1 and denies the racer', async () => {
    const quota = engineAt('2026-04-15T12:00:00.000Z')
    await quota.reserveQuota({ feature: 'food.scan', quantity: 4, user: USER })
    const first = quota.reserveQuota({ feature: 'food_scan', quantity: 1, user: USER })
    const second = quota.reserveQuota({ feature: 'food.scan', quantity: 1, user: USER })
    const [a, b] = await Promise.all([first, second])
    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual([QUOTA_STATUS.DENIED_QUOTA_EXCEEDED, QUOTA_STATUS.RESERVED])
    expect([a.remaining, b.remaining].includes(0)).toBe(true)
  })

  it('ignores client plan/limit/unlimited claims', async () => {
    const quota = engineAt('2026-04-15T12:00:00.000Z')
    const snapshot = await quota.inspectQuota({
      clientClaim: {
        limit: 999999,
        plan_id: 'plan.prelim.sek.month.99',
        remaining: 999,
        unlimited: true,
      },
      feature: 'food.scan',
      userId: USER,
    })
    expect(snapshot.limit).toBe(5)
    expect(snapshot.status).toBe(QUOTA_STATUS.ALLOWED)
    expect(snapshot.remaining).toBe(5)
  })

  it('uses server time for period reset, not a client clock', async () => {
    const quota = engineAt('2026-04-15T12:00:00.000Z')
    await quota.reserveQuota({
      clientClaim: { now: '2026-05-15T12:00:00.000Z' },
      feature: 'food.scan',
      quantity: 5,
      user: USER,
    })
    const snapshot = await quota.inspectQuota({
      clientClaim: { now: '2026-05-20T00:00:00.000Z' },
      feature: 'food.scan',
      userId: USER,
    })
    expect(snapshot.period_start).toBe('2026-04-01T00:00:00.000Z')
    expect(snapshot.remaining).toBe(0)
  })

  it('resets used for a new period without deleting history', async () => {
    const reservations = createInMemoryReservationStore()
    const april = engineAt('2026-04-15T12:00:00.000Z', { reservations })
    const reserved = await april.reserveQuota({ feature: 'food.scan', quantity: 5, user: USER })
    await april.commitReservation({ reservation_id: reserved.reservation_id, actual_quantity: 5 })
    expect((await reservations.list()).length).toBe(1)

    const may = engineAt('2026-05-02T00:00:00.000Z', { reservations })
    const snapshot = await may.inspectQuota({ feature: 'food.scan', userId: USER })
    expect(snapshot.remaining).toBe(5)
    expect(snapshot.used).toBe(0)
    expect((await reservations.list()).length).toBe(1)
  })

  it('rolls back idempotently and does not grant extra quota', async () => {
    const quota = engineAt('2026-04-15T12:00:00.000Z')
    const reserved = await quota.reserveQuota({ feature: 'ai_text', quantity: 2, user: USER })
    const first = await quota.rollbackReservation({ reservation_id: reserved.reservation_id })
    const second = await quota.rollbackReservation({ reservation_id: reserved.reservation_id })
    expect(first.status).toBe(QUOTA_STATUS.ROLLED_BACK)
    expect(second.status).toBe(QUOTA_STATUS.ROLLED_BACK)
    const snapshot = await quota.inspectQuota({ feature: 'ai.text.request', userId: USER })
    expect(snapshot.remaining).toBe(20)
  })

  it('commits idempotently and releases unused reserved quantity', async () => {
    const quota = engineAt('2026-04-15T12:00:00.000Z')
    const reserved = await quota.reserveQuota({ feature: 'food.scan', quantity: 4, user: USER })
    const first = await quota.commitReservation({
      actual_quantity: 1,
      reservation_id: reserved.reservation_id,
    })
    const retry = await quota.commitReservation({
      actual_quantity: 4,
      reservation_id: reserved.reservation_id,
    })
    expect(first.status).toBe(QUOTA_STATUS.COMMITTED)
    expect(retry.status).toBe(QUOTA_STATUS.COMMITTED)
    expect(retry.used).toBe(1)
    const snapshot = await quota.inspectQuota({ feature: 'food.scan', userId: USER })
    expect(snapshot.used).toBe(1)
    expect(snapshot.remaining).toBe(4)
  })

  it('counts actual overage without negative remaining', async () => {
    const quota = engineAt('2026-04-15T12:00:00.000Z')
    const reserved = await quota.reserveQuota({ feature: 'food.scan', quantity: 1, user: USER })
    const committed = await quota.commitReservation({
      actual_quantity: 9,
      reservation_id: reserved.reservation_id,
    })
    expect(committed.overage_quantity).toBe(8)
    expect(committed.integrity).toBe('OVERAGE')
    expect(committed.overage_policy).toBe(OVERAGE_POLICY)
    expect(committed.remaining).toBe(0)
    expect(committed.remaining).toBeGreaterThanOrEqual(0)
  })

  it('denies disabled entitlements without mutating usage', async () => {
    const catalog = defaultPlanCatalog.map((plan) => {
      if (plan.id !== 'plan.free') return plan
      return {
        ...plan,
        entitlements: {
          ...plan.entitlements,
          'food.scan': createEntitlement({
            enabled: false,
            feature: 'food.scan',
            limit: numberLimit(5),
            unit: 'requests',
          }),
        },
      }
    })
    const quota = engineAt('2026-04-15T12:00:00.000Z', { catalog })
    const denied = await quota.reserveQuota({ feature: 'food.scan', quantity: 1, user: USER })
    expect(denied.status).toBe(QUOTA_STATUS.DENIED_DISABLED)
    expect(denied.reservation_id).toBe(null)
  })

  it('rejects negative quantity, unit mismatch, and does not use Infinity', async () => {
    const quota = engineAt('2026-04-15T12:00:00.000Z')
    const negative = await quota.reserveQuota({ feature: 'food.scan', quantity: -1, user: USER })
    const mismatch = await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      unit: 'tokens',
      user: USER,
    })
    const zero = await quota.reserveQuota({ feature: 'food.scan', quantity: 0, user: USER })
    expect(negative.status).toBe(QUOTA_STATUS.DENIED_INVALID_QUANTITY)
    expect(mismatch.status).toBe(QUOTA_STATUS.DENIED_UNIT_MISMATCH)
    expect(zero.status).toBe(QUOTA_STATUS.ALLOWED)
    expect(JSON.stringify(defaultPlanCatalog)).not.toMatch(/Infinity|-1|999999999/)
    expect(LIMIT_KIND.UNLIMITED).toBe('UNLIMITED')
  })

  it('leaves local unmetered features unblocked', async () => {
    const quota = engineAt('2026-04-15T12:00:00.000Z')
    const snapshot = await quota.inspectQuota({ feature: 'ready_avatar', userId: USER })
    expect(snapshot.status).toBe(QUOTA_STATUS.ALLOWED_UNMETERED)
  })

  it('does not treat localStorage as source of truth', () => {
    const server = { limit: 5, remaining: 2, status: QUOTA_STATUS.ALLOWED, unit: 'requests', used: 3 }
    const view = readClientQuotaDisplay(server, {
      limit: 99,
      plan_id: 'plan.prelim.sek.month.99',
      remaining: 99,
      unlimited: true,
    })
    expect(view.remaining).toBe(2)
    expect(view.limit).toBe(5)
  })

  it('uses calendar month UTC periods rather than 30 days', () => {
    const period = periodBounds('month', new Date('2026-01-31T23:00:00.000Z'))
    expect(period.period_start).toBe('2026-01-01T00:00:00.000Z')
    expect(period.period_end).toBe('2026-02-01T00:00:00.000Z')
  })

  it('two engines sharing one atomic backend cannot both take remaining=1', async () => {
    const now = () => new Date('2026-04-15T12:00:00.000Z')
    const backend = createInMemoryAtomicBackend({ now })
    const firstEngine = createQuotaEngine({ backend, mutex: passthroughMutex() })
    const secondEngine = createQuotaEngine({ backend, mutex: passthroughMutex() })
    await firstEngine.reserveQuota({ feature: 'food.scan', quantity: 4, user: USER })
    const [a, b] = await Promise.all([
      firstEngine.reserveQuota({ feature: 'food.scan', quantity: 1, user: USER }),
      secondEngine.reserveQuota({ feature: 'food.scan', quantity: 1, user: USER }),
    ])
    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual([QUOTA_STATUS.DENIED_QUOTA_EXCEEDED, QUOTA_STATUS.RESERVED])
  })

  it('isolated backends (two processes) do not share remaining', async () => {
    const now = () => new Date('2026-04-15T12:00:00.000Z')
    const firstEngine = createQuotaEngine({
      backend: createInMemoryAtomicBackend({ mutex: passthroughMutex(), now }),
      mutex: passthroughMutex(),
      now,
    })
    const secondEngine = createQuotaEngine({
      backend: createInMemoryAtomicBackend({ mutex: passthroughMutex(), now }),
      mutex: passthroughMutex(),
      now,
    })
    const [a, b] = await Promise.all([
      firstEngine.reserveQuota({ feature: 'food.scan', quantity: 5, user: USER }),
      secondEngine.reserveQuota({ feature: 'food.scan', quantity: 5, user: USER }),
    ])
    expect(a.status).toBe(QUOTA_STATUS.RESERVED)
    expect(b.status).toBe(QUOTA_STATUS.RESERVED)
  })

  it('rejects illegal reservation state transitions', () => {
    expect(() => assertReservationTransition('COMMITTED', 'PENDING')).toThrow(/illegal_reservation_transition/)
    expect(() => assertReservationTransition('COMMITTED', 'ROLLED_BACK')).toThrow(/illegal_reservation_transition/)
    expect(() => assertReservationTransition('ROLLED_BACK', 'PENDING')).toThrow(/illegal_reservation_transition/)
    expect(() => assertReservationTransition('ROLLED_BACK', 'COMMITTED')).toThrow(/illegal_reservation_transition/)
    expect(() => assertReservationTransition('EXPIRED', 'PENDING')).toThrow(/illegal_reservation_transition/)
    expect(() => assertReservationTransition('PENDING', 'COMMITTED')).not.toThrow()
  })
})

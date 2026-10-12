import { afterEach, describe, expect, it, vi } from 'vitest'

import { QUOTA_STATUS } from '../../../src/services/billing/catalog.js'
import {
  FOOD_SCAN_OWNER_DAILY_CAP_DEFAULT,
  FOOD_SCAN_OWNER_DAILY_CAP_MAX,
  countFoodScanEventsSince,
  resolveFoodScanOwnerExemption,
  resolveOwnerDailyCap,
  setFoodScanOwnerExemptionDepsForTests,
  withOwnerUnlimitedQuota,
} from './foodScanOwnerExemption.js'

const OWNER = 'b2222222-2222-4222-8222-222222222222'
const enabled = { FOOD_SCAN_OWNER_UNLIMITED: 'true' }

afterEach(() => setFoodScanOwnerExemptionDepsForTests(null))

describe('food.scan owner exemption', () => {
  it('is off unless the server flag is exactly "true"', async () => {
    const isAdmin = vi.fn(async () => true)
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin })
    for (const value of [undefined, '', '1', 'TRUE', 'yes', 'false']) {
      expect(await resolveFoodScanOwnerExemption({ env: { FOOD_SCAN_OWNER_UNLIMITED: value }, userId: OWNER }))
        .toEqual({ exempt: false, reason: 'disabled' })
    }
    // Avstängd flagga ger inga databasanrop alls.
    expect(isAdmin).not.toHaveBeenCalled()
  })

  it('requires an active billing_admin from the server-side lookup', async () => {
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin: async () => false })
    expect(await resolveFoodScanOwnerExemption({ env: enabled, userId: OWNER })).toEqual({ exempt: false, reason: 'not_admin' })
  })

  it('fails closed when the admin lookup errors or returns a non-boolean', async () => {
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin: async () => { throw new Error('rpc down') } })
    expect((await resolveFoodScanOwnerExemption({ env: enabled, userId: OWNER })).exempt).toBe(false)
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin: async () => 'true' })
    expect((await resolveFoodScanOwnerExemption({ env: enabled, userId: OWNER })).exempt).toBe(false)
  })

  it('rejects missing or malformed user ids before any lookup', async () => {
    const isAdmin = vi.fn(async () => true)
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin })
    expect(await resolveFoodScanOwnerExemption({ env: enabled, userId: '' })).toEqual({ exempt: false, reason: 'invalid_user' })
    expect(await resolveFoodScanOwnerExemption({ env: enabled, userId: "x' or 1=1" })).toEqual({ exempt: false, reason: 'invalid_user' })
    expect(isAdmin).not.toHaveBeenCalled()
  })

  it('grants unlimited monthly scans to the verified owner below the daily cap', async () => {
    const countRecentScans = vi.fn(async () => 42)
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans, isAdmin: async (id) => id === OWNER })
    const now = new Date('2026-10-12T12:00:00Z')
    expect(await resolveFoodScanOwnerExemption({ env: enabled, now, userId: OWNER }))
      .toEqual({ dailyCap: FOOD_SCAN_OWNER_DAILY_CAP_DEFAULT, exempt: true, reason: 'owner_unlimited', usedLast24h: 42 })
    expect(countRecentScans).toHaveBeenCalledWith({ since: new Date('2026-10-11T12:00:00Z'), userId: OWNER })
  })

  it('stops the exemption at the durable daily cap and when the cap cannot be read', async () => {
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 100, isAdmin: async () => true })
    expect(await resolveFoodScanOwnerExemption({ env: enabled, userId: OWNER }))
      .toMatchObject({ exempt: false, reason: 'daily_cap' })
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => { throw new Error('db') }, isAdmin: async () => true })
    expect(await resolveFoodScanOwnerExemption({ env: enabled, userId: OWNER }))
      .toEqual({ exempt: false, reason: 'cap_unavailable' })
  })

  it('bounds the configurable daily cap', () => {
    expect(resolveOwnerDailyCap({})).toBe(FOOD_SCAN_OWNER_DAILY_CAP_DEFAULT)
    expect(resolveOwnerDailyCap({ FOOD_SCAN_OWNER_DAILY_CAP: '30' })).toBe(30)
    expect(resolveOwnerDailyCap({ FOOD_SCAN_OWNER_DAILY_CAP: '0' })).toBe(FOOD_SCAN_OWNER_DAILY_CAP_DEFAULT)
    expect(resolveOwnerDailyCap({ FOOD_SCAN_OWNER_DAILY_CAP: 'abc' })).toBe(FOOD_SCAN_OWNER_DAILY_CAP_DEFAULT)
    expect(resolveOwnerDailyCap({ FOOD_SCAN_OWNER_DAILY_CAP: '100000' })).toBe(FOOD_SCAN_OWNER_DAILY_CAP_MAX)
  })

  it('counts only this user\'s food.scan usage events in the window', async () => {
    const calls = []
    const query = {
      eq: (column, value) => { calls.push(['eq', column, value]); return query },
      gte: async (column, value) => { calls.push(['gte', column, value]); return { count: 7, error: null } },
      select: (column, options) => { calls.push(['select', column, options]); return query },
    }
    const client = { schema: (name) => ({ from: (table) => { calls.push(['from', name, table]); return query } }) }
    const since = new Date('2026-10-11T12:00:00Z')
    expect(await countFoodScanEventsSince({ client, since, userId: OWNER })).toBe(7)
    expect(calls).toEqual([
      ['from', 'billing', 'usage_events'],
      ['select', 'event_id', { count: 'exact', head: true }],
      ['eq', 'user_id', OWNER],
      ['eq', 'event_type', 'food.scan'],
      ['eq', 'unit', 'requests'],
      ['gte', 'occurred_at', since.toISOString()],
    ])
    await expect(countFoodScanEventsSince({ client: null, since, userId: OWNER })).rejects.toThrow()
  })
})

describe('owner unlimited quota wrapper', () => {
  function realQuota() {
    return {
      commitReservation: vi.fn(async () => ({ status: QUOTA_STATUS.COMMITTED })),
      inspectQuota: vi.fn(async () => ({ status: QUOTA_STATUS.ALLOWED })),
      reserveQuota: vi.fn(async () => ({ status: QUOTA_STATUS.DENIED_QUOTA_EXCEEDED })),
      rollbackReservation: vi.fn(async () => ({ status: QUOTA_STATUS.ROLLED_BACK })),
    }
  }

  it('reserves without touching the monthly quota and commits/rolls back locally', async () => {
    const quota = realQuota()
    const wrapped = withOwnerUnlimitedQuota(quota)
    const reserved = await wrapped.reserveQuota({ feature: 'food.scan', quantity: 1, reservation_id: 'r1', unit: 'requests', user: OWNER })
    expect(reserved).toMatchObject({ reservation_id: 'r1', status: QUOTA_STATUS.UNLIMITED })
    expect(await wrapped.commitReservation({ actual_quantity: 1, reservation_id: 'r1' })).toMatchObject({ status: QUOTA_STATUS.COMMITTED })
    expect(await wrapped.rollbackReservation({ reservation_id: 'r1' })).toMatchObject({ status: QUOTA_STATUS.ROLLED_BACK })
    expect(quota.reserveQuota).not.toHaveBeenCalled()
    expect(quota.commitReservation).not.toHaveBeenCalled()
    expect(quota.rollbackReservation).not.toHaveBeenCalled()
  })

  it('only lifts the monthly limit during inspection; other denials still stop the scan', async () => {
    const quota = realQuota()
    const wrapped = withOwnerUnlimitedQuota(quota)
    quota.inspectQuota.mockResolvedValueOnce({ status: QUOTA_STATUS.DENIED_QUOTA_EXCEEDED })
    expect(await wrapped.inspectQuota({})).toMatchObject({ remaining: null, status: QUOTA_STATUS.ALLOWED })
    quota.inspectQuota.mockResolvedValueOnce({ remaining: 0, status: QUOTA_STATUS.ALLOWED })
    expect(await wrapped.inspectQuota({})).toMatchObject({ remaining: null, status: QUOTA_STATUS.ALLOWED })
    for (const status of [QUOTA_STATUS.DENIED_DISABLED, QUOTA_STATUS.DENIED_UNKNOWN_PLAN, QUOTA_STATUS.DENIED_UNIT_MISMATCH]) {
      quota.inspectQuota.mockResolvedValueOnce({ status })
      expect(await wrapped.inspectQuota({})).toEqual({ status })
    }
  })

  it('passes inspection and unknown reservations through to the real quota', async () => {
    const quota = realQuota()
    const wrapped = withOwnerUnlimitedQuota(quota)
    await wrapped.inspectQuota({ feature: 'food.scan' })
    await wrapped.reserveQuota({ quantity: 0, reservation_id: 'r0' })
    await wrapped.commitReservation({ reservation_id: 'other' })
    expect(quota.inspectQuota).toHaveBeenCalledTimes(1)
    expect(quota.reserveQuota).toHaveBeenCalledTimes(1)
    expect(quota.commitReservation).toHaveBeenCalledTimes(1)
  })
})

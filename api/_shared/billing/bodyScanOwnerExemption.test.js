import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyOwnerBodyScanQuota,
  applyOwnerBodyScanStatus,
  resolveBodyScanOwnerExemption,
  resolveBodyScanOwnerDailyCap,
  setBodyScanOwnerExemptionDepsForTests,
} from './bodyScanOwnerExemption.js'
import { resolveFoodScanOwnerExemption, setFoodScanOwnerExemptionDepsForTests } from './foodScanOwnerExemption.js'

const OWNER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ON = { BODY_SCAN_OWNER_UNLIMITED: 'true' }

describe('body.scan owner exemption', () => {
  afterEach(() => {
    setBodyScanOwnerExemptionDepsForTests(null)
    setFoodScanOwnerExemptionDepsForTests(null)
  })

  it('fails closed unless flag, admin and daily cap all allow it', async () => {
    const isAdmin = vi.fn(async () => true)
    setBodyScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin })
    expect((await resolveBodyScanOwnerExemption({ env: {}, userId: OWNER })).reason).toBe('disabled')
    expect((await resolveBodyScanOwnerExemption({ env: { BODY_SCAN_OWNER_UNLIMITED: '1' }, userId: OWNER })).exempt).toBe(false)
    expect((await resolveBodyScanOwnerExemption({ env: ON, userId: 'hassan@example.com' })).reason).toBe('invalid_user')
    expect(isAdmin).not.toHaveBeenCalled()

    setBodyScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin: async () => { throw new Error('db') } })
    expect((await resolveBodyScanOwnerExemption({ env: ON, userId: OWNER })).reason).toBe('not_admin')

    setBodyScanOwnerExemptionDepsForTests({ countRecentScans: async () => { throw new Error('db') }, isAdmin: async () => true })
    expect((await resolveBodyScanOwnerExemption({ env: ON, userId: OWNER })).reason).toBe('cap_unavailable')

    setBodyScanOwnerExemptionDepsForTests({ countRecentScans: async () => 50, isAdmin: async () => true })
    expect(await resolveBodyScanOwnerExemption({ env: ON, userId: OWNER })).toMatchObject({ exempt: false, reason: 'daily_cap' })

    setBodyScanOwnerExemptionDepsForTests({ countRecentScans: async () => 49, isAdmin: async () => true })
    expect(await resolveBodyScanOwnerExemption({ env: ON, userId: OWNER })).toMatchObject({ dailyCap: 50, exempt: true })
  })

  it('clamps the daily cap', () => {
    expect(resolveBodyScanOwnerDailyCap({})).toBe(50)
    expect(resolveBodyScanOwnerDailyCap({ BODY_SCAN_OWNER_DAILY_CAP: '0' })).toBe(50)
    expect(resolveBodyScanOwnerDailyCap({ BODY_SCAN_OWNER_DAILY_CAP: '10' })).toBe(10)
    expect(resolveBodyScanOwnerDailyCap({ BODY_SCAN_OWNER_DAILY_CAP: '9999' })).toBe(200)
  })

  it('does not turn on the food.scan exemption', async () => {
    setFoodScanOwnerExemptionDepsForTests({ countRecentScans: async () => 0, isAdmin: async () => true })
    expect((await resolveFoodScanOwnerExemption({ env: ON, userId: OWNER })).reason).toBe('disabled')
  })

  it('only rewrites body.scan quota and usage rows', () => {
    const status = { dailyCap: 50, exempt: true, usedLast24h: 1 }
    expect(applyOwnerBodyScanQuota({ remaining: 0, status: 'DENIED_QUOTA_EXCEEDED' }, status)).toMatchObject({ owner_unlimited: true, status: 'ALLOWED' })
    expect(applyOwnerBodyScanQuota({ status: 'DENIED_DISABLED' }, status)).toEqual({ status: 'DENIED_DISABLED' })
    expect(applyOwnerBodyScanQuota({ remaining: 0, status: 'DENIED_QUOTA_EXCEEDED' }, { ...status, exempt: false }).owner_unlimited).toBeUndefined()

    const snapshot = { quotas: [{ key: 'body_scan', limit: 3, used: 3 }, { key: 'food_scan', limit: 5, used: 1 }, { key: 'ai_eye', limit: 5, used: 0 }] }
    const result = applyOwnerBodyScanStatus(snapshot, status)
    expect(result.quotas[0]).toEqual({ daily_cap: 50, key: 'body_scan', owner_unlimited: true, used_last_24h: 1 })
    expect(result.quotas.slice(1)).toEqual(snapshot.quotas.slice(1))
    expect(applyOwnerBodyScanStatus(snapshot, null)).toBe(snapshot)
  })
})

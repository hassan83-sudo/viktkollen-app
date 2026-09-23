import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_QUOTA_AUTHORITY,
  COMMERCIAL_QUOTA_KEYS,
  createCommercialQuota,
  resolveAuthoritativePlan,
  validateCommercialPlanCatalog,
} from './commercialPlanMatrix.js'
import { defaultPlanCatalog, getPlanById, preliminarySekMonthMajors } from './planCatalog.js'

const NINE = 'plan.prelim.sek.month.09'

describe('commercial plan matrix', () => {
  it('preserves the fourteen candidate monthly prices in minor units', () => {
    expect(preliminarySekMonthMajors).toEqual([4, 7, 9, 12, 15, 19, 29, 39, 49, 59, 69, 79, 89, 99])
    const prices = defaultPlanCatalog
      .filter((plan) => plan.id !== 'plan.free')
      .map((plan) => plan.price_minor)
    expect(prices).toEqual(preliminarySekMonthMajors.map((major) => major * 100))
    expect(validateCommercialPlanCatalog(defaultPlanCatalog)).toBe(true)
  })

  it('keeps four independent quota dimensions on every plan', () => {
    for (const plan of defaultPlanCatalog) {
      expect(Object.keys(plan.commercial_quotas).sort()).toEqual([...COMMERCIAL_QUOTA_KEYS].sort())
      expect(plan.commercial_quotas.voice_minutes.unit).toBe('minutes')
      expect(plan.commercial_quotas.gps_live_minutes.unit).toBe('minutes')
      expect(plan.commercial_quotas.food_scan_requests.feature).toBe('food.scan')
      expect(plan.commercial_quotas.ai_text_requests.feature).toBe('ai.text.request')
    }
  })

  it('preserves the active free food.scan quota and does not approve paid limits', () => {
    const free = getPlanById('plan.free')
    expect(free.price_minor).toBe(0)
    expect(free.entitlements['food.scan'].enabled).toBe(true)
    expect(free.entitlements['food.scan'].limit.value).toBe(5)
    expect(free.commercial_quotas.food_scan_requests).toMatchObject({
      authority: COMMERCIAL_QUOTA_AUTHORITY.ACTIVE,
      enabled: true,
      limit: 5,
    })
    expect(free.commercial_quotas.ai_text_requests.authority).toBe(COMMERCIAL_QUOTA_AUTHORITY.LEGACY_PRELIMINARY)
    expect(free.commercial_quotas.voice_minutes.authority).toBe(COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED)
    expect(free.commercial_quotas.gps_live_minutes.limit).toBe(null)

    for (const plan of defaultPlanCatalog.filter((entry) => entry.id !== 'plan.free')) {
      expect(plan.commercial_status).toBe('PRELIMINARY')
      expect(plan.commercial_quotas.food_scan_requests.authority).toBe(COMMERCIAL_QUOTA_AUTHORITY.LEGACY_PRELIMINARY)
      expect(plan.commercial_quotas.ai_text_requests.authority).toBe(COMMERCIAL_QUOTA_AUTHORITY.LEGACY_PRELIMINARY)
      expect(plan.commercial_quotas.voice_minutes.limit).toBe(null)
      expect(plan.commercial_quotas.gps_live_minutes.limit).toBe(null)
      expect(plan.commercial_quotas.voice_minutes.limit).not.toBe(plan.commercial_quotas.food_scan_requests.limit)
    }
  })

  it('can express an independent feature combination without a shared quota', () => {
    const quotas = {
      ai_text_requests: createCommercialQuota({
        authority: COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED,
        enabled: true,
        key: 'ai_text_requests',
        limit: null,
      }),
      food_scan_requests: createCommercialQuota({
        authority: COMMERCIAL_QUOTA_AUTHORITY.LEGACY_PRELIMINARY,
        enabled: true,
        key: 'food_scan_requests',
        limit: 5,
      }),
      gps_live_minutes: createCommercialQuota({
        authority: COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED,
        enabled: false,
        key: 'gps_live_minutes',
        limit: null,
      }),
      voice_minutes: createCommercialQuota({
        authority: COMMERCIAL_QUOTA_AUTHORITY.TO_BE_FINALIZED,
        enabled: true,
        key: 'voice_minutes',
        limit: null,
      }),
    }
    expect(quotas.food_scan_requests.enabled).toBe(true)
    expect(quotas.ai_text_requests.enabled).toBe(true)
    expect(quotas.voice_minutes.enabled).toBe(true)
    expect(quotas.gps_live_minutes.enabled).toBe(false)
  })

  it('rejects client price, quota, and entitlement overrides', () => {
    const resolved = resolveAuthoritativePlan(defaultPlanCatalog, NINE, {
      entitlements: {
        'food.scan': { enabled: true, limit: { value: 999999 } },
        'gps.live.session': { enabled: true },
      },
      food_scan_requests: 999999,
      gps_live_minutes: 999999,
      plan_id: 'plan.prelim.sek.month.04',
      price: 4,
      price_sek_minor: 400,
      voice_minutes: 999999,
    })
    const server = getPlanById(NINE)
    expect(resolved.ok).toBe(true)
    expect(resolved.plan_id).toBe(NINE)
    expect(resolved.price_sek_minor).toBe(900)
    expect(resolved.billing_period).toBe('month')
    expect(resolved.entitlements).toBe(server.entitlements)
    expect(resolved.quotas).toBe(server.commercial_quotas)
    expect(resolved.quotas.food_scan_requests.limit).not.toBe(999999)
    expect(resolved.quotas.ai_text_requests.limit).not.toBe(999999)
    expect(resolved.quotas.voice_minutes.limit).toBe(null)
    expect(resolved.quotas.gps_live_minutes.limit).toBe(null)
    expect(JSON.stringify(resolved)).not.toMatch(/stripe|sumup|checkout|webhook|proration/i)
  })

  it('does not grant benefits for an unknown plan id', () => {
    const resolved = resolveAuthoritativePlan(defaultPlanCatalog, 'plan.client.override', {
      price_sek_minor: 400,
      voice_minutes: 999999,
    })
    expect(resolved).toEqual({ code: 'unknown_plan', ok: false })
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_QUOTA_AUTHORITY,
  COMMERCIAL_QUOTA_KEYS,
  createCommercialQuota,
  LAUNCH_QUOTA_BY_PLAN,
  LAUNCH_UNMETERED_FEATURES,
  resolveAuthoritativePlan,
  validateCommercialPlanCatalog,
} from './commercialPlanMatrix.js'
import { defaultPlanCatalog, getPlanById, preliminarySekMonthMajors } from './planCatalog.js'
import { isUnlimitedLimit } from './entitlementModel.js'

const NINE = 'plan.prelim.sek.month.09'
const migration = readFileSync(
  new URL('../../../supabase/migrations/20260923193000_billing_launch_quota_matrix.sql', import.meta.url),
  'utf8',
)

function quotaTuple(plan) {
  const quotas = plan.commercial_quotas
  return [
    quotas.ai_text_requests.limit,
    quotas.food_scan_requests.limit,
    quotas.body_scan_requests.limit,
    quotas.ai_eye_requests.limit,
  ]
}

describe('commercial plan matrix', () => {
  it('preserves the fourteen candidate monthly prices in minor units', () => {
    expect(preliminarySekMonthMajors).toEqual([4, 7, 9, 12, 15, 19, 29, 39, 49, 59, 69, 79, 89, 99])
    const prices = defaultPlanCatalog
      .filter((plan) => plan.id !== 'plan.free')
      .map((plan) => plan.price_minor)
    expect(prices).toEqual(preliminarySekMonthMajors.map((major) => major * 100))
    expect(defaultPlanCatalog).toHaveLength(15)
    expect(validateCommercialPlanCatalog(defaultPlanCatalog)).toBe(true)
  })

  it('stores the approved request matrix on every plan', () => {
    for (const plan of defaultPlanCatalog) {
      expect(Object.keys(plan.commercial_quotas).sort()).toEqual([...COMMERCIAL_QUOTA_KEYS].sort())
      expect(plan.commercial_quotas.ai_text_requests.feature).toBe('ai.text.request')
      expect(plan.commercial_quotas.food_scan_requests.feature).toBe('food.scan')
      expect(plan.commercial_quotas.body_scan_requests.feature).toBe('body.scan')
      expect(plan.commercial_quotas.ai_eye_requests.feature).toBe('ai.eye.analysis')
      expect(quotaTuple(plan)).toEqual([
        LAUNCH_QUOTA_BY_PLAN[plan.id].ai_text_requests,
        LAUNCH_QUOTA_BY_PLAN[plan.id].food_scan_requests,
        LAUNCH_QUOTA_BY_PLAN[plan.id].body_scan_requests,
        LAUNCH_QUOTA_BY_PLAN[plan.id].ai_eye_requests,
      ])
      for (const key of COMMERCIAL_QUOTA_KEYS) {
        expect(plan.commercial_quotas[key].authority).toBe(COMMERCIAL_QUOTA_AUTHORITY.ACTIVE)
      }
    }
    expect(quotaTuple(getPlanById('plan.free'))).toEqual([20, 5, 3, 25])
    expect(quotaTuple(getPlanById(NINE))).toEqual([70, 20, 8, 80])
    expect(quotaTuple(getPlanById('plan.prelim.sek.month.49'))).toEqual([500, 160, 50, 500])
    expect(quotaTuple(getPlanById('plan.prelim.sek.month.99'))).toEqual([1500, 400, 150, 1500])
  })

  it('keeps paid plans off sale and launch features unmetered', () => {
    expect(defaultPlanCatalog.filter((plan) => plan.enabled_for_sale === true)).toEqual([])
    expect(migration).not.toMatch(/insert into billing\.plan_commercial_controls/i)
    expect(migration).not.toMatch(/enabled_for_sale\s*=\s*true/i)
    expect(migration).not.toMatch(/price_minor/i)

    for (const plan of defaultPlanCatalog) {
      if (plan.id !== 'plan.free') expect(plan.commercial_status).toBe('PRELIMINARY')
      for (const feature of LAUNCH_UNMETERED_FEATURES) {
        expect(isUnlimitedLimit(plan.entitlements[feature].limit)).toBe(true)
      }
      expect(plan.commercial_quotas.friend_chat).toBeUndefined()
      expect(plan.commercial_quotas.voice_minutes).toBeUndefined()
      expect(plan.commercial_quotas.gps_live_minutes).toBeUndefined()
      expect(Object.keys(plan.entitlements).some((feature) => /sos/i.test(feature))).toBe(false)
    }
  })

  it('can express an independent feature combination without a shared quota', () => {
    const quotas = {
      ai_eye_requests: createCommercialQuota({
        authority: COMMERCIAL_QUOTA_AUTHORITY.ACTIVE,
        enabled: true,
        key: 'ai_eye_requests',
        limit: 25,
      }),
      ai_text_requests: createCommercialQuota({
        authority: COMMERCIAL_QUOTA_AUTHORITY.ACTIVE,
        enabled: true,
        key: 'ai_text_requests',
        limit: 20,
      }),
      body_scan_requests: createCommercialQuota({
        authority: COMMERCIAL_QUOTA_AUTHORITY.ACTIVE,
        enabled: false,
        key: 'body_scan_requests',
        limit: 3,
      }),
      food_scan_requests: createCommercialQuota({
        authority: COMMERCIAL_QUOTA_AUTHORITY.ACTIVE,
        enabled: true,
        key: 'food_scan_requests',
        limit: 5,
      }),
    }
    expect(quotas.food_scan_requests.limit).toBe(5)
    expect(quotas.ai_text_requests.limit).toBe(20)
    expect(quotas.body_scan_requests.enabled).toBe(false)
    expect(quotas.ai_eye_requests.limit).not.toBe(quotas.food_scan_requests.limit)
  })

  it('rejects client price, quota, and entitlement overrides', () => {
    const resolved = resolveAuthoritativePlan(defaultPlanCatalog, NINE, {
      ai_eye_requests: 999999,
      ai_text_requests: 999999,
      body_scan_requests: 999999,
      entitlements: {
        'body.scan': { enabled: true, limit: { value: 999999 } },
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
    expect(quotaTuple({ commercial_quotas: resolved.quotas })).toEqual([70, 20, 8, 80])
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

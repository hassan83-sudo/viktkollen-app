import { describe, expect, it } from 'vitest'
import { defaultPlanCatalog, getPlanById } from './planCatalog.js'
import { buildPlanComparison } from './planComparison.js'

function limits(comparison, priceText) {
  const plan = comparison.plans.find((item) => item.priceText === priceText)
  return plan.quotas.map((row) => row.limit)
}

describe('plan comparison', () => {
  it('shows only Free and 12 SEK, preserving the paid quota', () => {
    const comparison = buildPlanComparison({ currentPlanId: 'plan.free', plans: defaultPlanCatalog })
    expect(comparison.plans.map(plan => plan.priceText)).toEqual(['Gratis', '12 kr/mån'])
    expect(limits(comparison, 'Gratis')).toEqual([20, 5, 3, 25])
    expect(limits(comparison, '12 kr/mån')).toEqual([90, 30, 10, 100])
    expect(comparison.plans.find(plan => plan.current).priceText).toBe('Gratis')
  })

  it('offers only the 12 SEK plan even when historical sale flags are enabled', () => {
    const comparison = buildPlanComparison({ currentPlanId: 'plan.prelim.sek.month.12', plans: defaultPlanCatalog.map(plan => ({ ...plan, enabled_for_sale: true })) })
    expect(comparison.plans.find(plan => plan.current).priceText).toBe('12 kr/mån')
    expect(comparison.plans.find(plan => plan.priceText === '12 kr/mån')).toMatchObject({ forSale: true, offerKey: 'sek-1200' })
    expect(comparison.plans).toHaveLength(2)
  })

  it('does not invent a quota when a server entitlement is missing', () => {
    const free = getPlanById('plan.free')
    const entitlementsFlat = Object.values(free.entitlements)
      .filter((entitlement) => entitlement.feature !== 'food.scan')
      .map((entitlement) => ({
        enabled: entitlement.enabled === true,
        feature: entitlement.feature,
        limit_kind: entitlement.limit.kind,
        limit_value: entitlement.limit.value,
        unit: entitlement.unit,
      }))
    const comparison = buildPlanComparison({
      currentPlanId: 'plan.free',
      plans: [{
        active: true,
        currency: 'SEK',
        entitlementsFlat,
        id: 'plan.free',
        price_minor: 0,
      }],
    })
    expect(comparison.plans[0].complete).toBe(false)
    expect(comparison.plans[0].quotas).toEqual([])
  })

  it('returns no comparison when the catalog is missing', () => {
    expect(buildPlanComparison({ plans: [] })).toBeNull()
    expect(buildPlanComparison({ currentPlanId: 'plan.missing', plans: null })).toBeNull()
  })
})

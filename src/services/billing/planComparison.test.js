import { describe, expect, it } from 'vitest'
import { defaultPlanCatalog, getPlanById } from './planCatalog.js'
import { buildPlanComparison } from './planComparison.js'

function limits(comparison, priceText) {
  const plan = comparison.plans.find((item) => item.priceText === priceText)
  return plan.quotas.map((row) => row.limit)
}

describe('plan comparison', () => {
  it('reads fifteen plans from the server catalog in price order', () => {
    const comparison = buildPlanComparison({
      currentPlanId: 'plan.free',
      plans: defaultPlanCatalog,
    })
    expect(comparison.plans).toHaveLength(15)
    expect(comparison.plans.map((plan) => plan.priceText)).toEqual([
      'Gratis',
      '4 kr/mån',
      '7 kr/mån',
      '9 kr/mån',
      '12 kr/mån',
      '15 kr/mån',
      '19 kr/mån',
      '29 kr/mån',
      '39 kr/mån',
      '49 kr/mån',
      '59 kr/mån',
      '69 kr/mån',
      '79 kr/mån',
      '89 kr/mån',
      '99 kr/mån',
    ])
    expect(limits(comparison, 'Gratis')).toEqual([20, 5, 3, 25])
    expect(limits(comparison, '9 kr/mån')).toEqual([70, 20, 8, 80])
    expect(limits(comparison, '49 kr/mån')).toEqual([500, 160, 50, 500])
    expect(limits(comparison, '99 kr/mån')).toEqual([1500, 400, 150, 1500])
    expect(comparison.plans.filter((plan) => plan.current).map((plan) => plan.priceText)).toEqual(['Gratis'])
    expect(comparison.plans.filter((plan) => plan.forSale)).toEqual([])
    expect(comparison.plans.find((plan) => plan.priceText === 'Gratis').unlimited.map((item) => item.key)).toEqual([
      'friend_chat',
      'voice_input',
      'speech',
      'gps',
      'gps_live',
      'sos',
      'ai_ear',
    ])
    expect(JSON.stringify(comparison)).not.toMatch(/plan\.free|plan\.prelim|ai\.text\.request|food\.scan|body\.scan|ai\.eye\.analysis|tts\.request|gps_standard|ready_avatar|smart_ai/)
  })

  it('marks the assigned server plan and an explicit sale flag without using the price', () => {
    const priced = getPlanById('plan.prelim.sek.month.99')
    const comparison = buildPlanComparison({
      currentPlanId: 'plan.prelim.sek.month.09',
      plans: defaultPlanCatalog.map((plan) => (
        plan.id === priced.id ? { ...plan, enabled_for_sale: true } : plan
      )),
    })
    expect(comparison.plans.find((plan) => plan.current).priceText).toBe('9 kr/mån')
    expect(comparison.plans.find((plan) => plan.priceText === '99 kr/mån').forSale).toBe(true)
    expect(comparison.plans.find((plan) => plan.priceText === '49 kr/mån').forSale).toBe(false)
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

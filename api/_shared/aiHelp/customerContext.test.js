import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { loadCustomerContext, renderVerifiedAnswer, selectCustomerContext } from './customerContext.js'

const activeSubscription = {
  cancel_at_period_end: false,
  current_period_end: '2026-11-01T00:00:00.000Z',
  past_due_grace_until: null,
  pending_plan_id: null,
  plan_id: 'plan.prelim.sek.month.04',
  status: 'ACTIVE',
}

describe('customer context selection', () => {
  it('keeps navigation on knowledge and loads only the slices a personal question needs', () => {
    expect(selectCustomerContext('Var finns matscanning?').slices).toEqual([])
    expect(selectCustomerContext('Vad kostar abonnemanget?').personal).toBe(false)
    expect(selectCustomerContext('Vilket abonnemang har jag?').slices).toEqual(expect.arrayContaining(['subscription', 'plan']))
    expect(selectCustomerContext('Hur mycket matscanning har jag kvar?').slices).toEqual(expect.arrayContaining(['usage']))
    expect(selectCustomerContext('Varför kan jag inte använda matscanning?').slices).toEqual(
      expect.arrayContaining(['subscription', 'entitlements', 'usage', 'payment']),
    )
  })

  it('reads plan price and sale status from the supplied billing readers', async () => {
    const plan = vi.fn(async (planId) => ({
      entitlements: [{ enabled: false, feature: 'food.scan', limit_kind: 'NUMBER', limit_value: 0 }],
      plan: {
        active: true,
        billing_interval: 'month',
        currency: 'SEK',
        enabled_for_sale: true,
        plan_id: planId,
        price_minor: 400,
      },
      unavailable: false,
    }))
    const context = await loadCustomerContext({
      readers: {
        plan,
        subscription: async (userId) => {
          expect(userId).toBe('user-a')
          return { subscription: activeSubscription, unavailable: false }
        },
      },
      slices: ['plan'],
      userId: 'user-a',
    })
    expect(context.plan).toMatchObject({ currency: 'SEK', enabled_for_sale: true, price_minor: 400 })
    expect(renderVerifiedAnswer({
      context,
      selection: selectCustomerContext('Vad kostar min plan?'),
    })).toContain('4 kr')
  })

  it('says a payment failure reason is unavailable', () => {
    const answer = renderVerifiedAnswer({
      context: {
        available: true,
        payment: {
          cancel_at_period_end: false,
          past_due_grace_until: '2026-10-12T00:00:00.000Z',
          payment_failure_reason: null,
          payment_failure_reason_available: false,
          pending_plan_id: null,
          status: 'PAST_DUE',
        },
      },
      selection: { focus: 'payment' },
    })
    expect(answer).toContain('PAST_DUE')
    expect(answer).toContain('2026-10-12')
    expect(answer).toMatch(/inte tillgänglig/)
    expect(answer).not.toMatch(/SumUp|error code|felkod/i)
  })

  it('distinguishes a missing feature, an empty quota and no verified fault', () => {
    const missing = renderVerifiedAnswer({
      context: { available: true, entitlements: [], payment: { status: 'ACTIVE' }, quota: null, subscription: activeSubscription },
      selection: { feature: { feature: 'food.scan', knowledgeId: 'more.nutrition' }, focus: 'access' },
    })
    const empty = renderVerifiedAnswer({
      context: {
        available: true,
        entitlements: [{ enabled: true, feature: 'food.scan', limit_kind: 'NUMBER', limit_value: 30 }],
        payment: { status: 'ACTIVE' },
        quota: { feature: 'food.scan', limit: 30, remaining: 0, status: 'DENIED_QUOTA_EXCEEDED', unlimited: false, used: 30 },
        subscription: activeSubscription,
      },
      selection: { feature: { feature: 'food.scan', knowledgeId: 'more.nutrition' }, focus: 'access' },
    })
    const clear = renderVerifiedAnswer({
      context: {
        available: true,
        entitlements: [{ enabled: true, feature: 'food.scan', limit_kind: 'NUMBER', limit_value: 30 }],
        payment: { status: 'ACTIVE' },
        quota: { feature: 'food.scan', limit: 30, remaining: 10, status: 'ALLOWED', unlimited: false, used: 20 },
        subscription: activeSubscription,
      },
      selection: { feature: { feature: 'food.scan', knowledgeId: 'more.nutrition' }, focus: 'access' },
    })
    expect(missing).toMatch(/inte tillgänglig/)
    expect(empty).toMatch(/Kvoten/)
    expect(clear).toMatch(/Inget verifierat fel/)
  })

  it('does not use the legacy entitlement route or a billing write', () => {
    const contextSource = readFileSync(new URL('./customerContext.js', import.meta.url), 'utf8')
    const serviceSource = readFileSync(new URL('./service.js', import.meta.url), 'utf8')
    expect(contextSource).not.toContain('/api/entitlements')
    expect(contextSource).not.toContain('executeUserBillingIntent')
    expect(serviceSource).not.toContain('executeUserBillingIntent')
    expect(serviceSource).not.toContain('/api/entitlements')
  })
})

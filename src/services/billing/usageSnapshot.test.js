import { describe, expect, it } from 'vitest'
import { getPlanById } from './planCatalog.js'
import { buildUsageSnapshot, countReservationUsage, snapshotForPlan } from './usageSnapshot.js'

const NOW = new Date('2026-09-23T12:00:00.000Z')

describe('usage snapshot', () => {
  it('reads the free plan allowances from the server plan, not a client override', () => {
    const plan = getPlanById('plan.free')
    const snapshot = snapshotForPlan({ now: NOW, plan })
    expect(snapshot.plan).toEqual({ name: 'Gratis', priceText: '0 kr/mån' })
    expect(snapshot.quotas).toEqual([
      { key: 'ai_coach', limit: 20, remaining: 20, used: 0 },
      { key: 'food_scan', limit: 5, remaining: 5, used: 0 },
      { key: 'body_scan', limit: 3, remaining: 3, used: 0 },
      { key: 'ai_eye', limit: 25, remaining: 25, used: 0 },
    ])
    expect(snapshot.period.end).toBe('2026-10-01T00:00:00.000Z')
    expect(snapshot.unlimited.map((item) => item.key)).toEqual([
      'friend_chat',
      'voice_input',
      'speech',
      'gps',
      'gps_live',
      'sos',
      'ai_ear',
    ])
    expect(JSON.stringify(snapshot)).not.toMatch(/ai\.text\.request|food\.scan|body\.scan|ai\.eye\.analysis|tts\.request|gps_standard|ready_avatar|smart_ai|plan\.free/)
  })

  it('counts committed and pending usage inside the server period and clamps remaining at zero', () => {
    const plan = getPlanById('plan.free')
    const snapshot = snapshotForPlan({
      now: NOW,
      plan,
      reservations: [
        {
          actual_quantity: 4,
          feature: 'ai.text.request',
          period_start: '2026-09-01T00:00:00.000Z',
          quantity: 4,
          status: 'COMMITTED',
          unit: 'requests',
        },
        {
          feature: 'food.scan',
          period_start: '2026-09-01T00:00:00.000Z',
          quantity: 5,
          status: 'COMMITTED',
          unit: 'requests',
        },
        {
          expires_at: '2026-09-23T13:00:00.000Z',
          feature: 'body.scan',
          period_start: '2026-09-01T00:00:00.000Z',
          quantity: 1,
          status: 'PENDING',
          unit: 'requests',
        },
        {
          expires_at: '2026-09-23T11:00:00.000Z',
          feature: 'body.scan',
          period_start: '2026-09-01T00:00:00.000Z',
          quantity: 1,
          status: 'PENDING',
          unit: 'requests',
        },
        {
          feature: 'ai.eye.analysis',
          period_start: '2026-08-01T00:00:00.000Z',
          quantity: 9,
          status: 'COMMITTED',
          unit: 'requests',
        },
      ],
    })
    expect(snapshot.quotas).toEqual([
      { key: 'ai_coach', limit: 20, remaining: 16, used: 4 },
      { key: 'food_scan', limit: 5, remaining: 0, used: 5 },
      { key: 'body_scan', limit: 3, remaining: 2, used: 1 },
      { key: 'ai_eye', limit: 25, remaining: 25, used: 0 },
    ])
    expect(countReservationUsage([{
      feature: 'food.scan',
      period_start: '2026-09-01T00:00:00+00:00',
      quantity: 2,
      status: 'COMMITTED',
      unit: 'requests',
    }], {
      feature: 'food.scan',
      now: NOW,
      periodStart: '2026-09-01T00:00:00.000Z',
      unit: 'requests',
    })).toBe(2)
  })

  it('counts request calls and leaves token quantities out of the same feature', () => {
    const period = { period_end: '2026-11-01T00:00:00.000Z', period_start: '2026-10-01T00:00:00.000Z' }
    const requests = Array.from({ length: 7 }, () => ({
      actual_quantity: 1,
      feature: 'ai.text.request',
      period_start: period.period_start,
      quantity: 1,
      status: 'COMMITTED',
      unit: 'requests',
    }))
    const snapshot = buildUsageSnapshot({
      accessPeriodEnd: '2026-11-27T09:22:46.000Z',
      entitlements: [{
        enabled: true,
        feature: 'ai.text.request',
        limit_kind: 'NUMBER',
        limit_value: 50,
        unit: 'requests',
      }],
      now: new Date('2026-10-28T12:00:00.000Z'),
      period,
      plan: { price_minor: 400 },
      reservations: [
        ...requests,
        {
          actual_quantity: 8899,
          feature: 'ai.text.request',
          period_start: period.period_start,
          quantity: 8899,
          status: 'COMMITTED',
          unit: 'tokens',
        },
        {
          actual_quantity: 1,
          feature: 'ai.text.request',
          period_start: '2026-09-01T00:00:00.000Z',
          quantity: 1,
          status: 'COMMITTED',
          unit: 'requests',
        },
      ],
    })
    expect(snapshot.period.end).toBe('2026-11-01T00:00:00.000Z')
    expect(snapshot.access.end).toBe('2026-11-27T09:22:46.000Z')
    expect(snapshot.quotas).toEqual([{ key: 'ai_coach', limit: 50, remaining: 43, used: 7 }])
  })

  it('shows a paid price from the server plan without a purchase field', () => {
    const snapshot = snapshotForPlan({
      now: NOW,
      plan: getPlanById('plan.prelim.sek.month.09'),
    })
    expect(snapshot.plan).toEqual({ name: '9 kr', priceText: '9 kr/mån' })
    expect(snapshot.quotas.find((row) => row.key === 'ai_coach').limit).toBe(70)
    expect(snapshot).not.toHaveProperty('checkout')
    expect(snapshot).not.toHaveProperty('purchase')
  })
})

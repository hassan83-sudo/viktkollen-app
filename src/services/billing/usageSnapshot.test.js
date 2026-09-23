import { describe, expect, it } from 'vitest'
import { getPlanById } from './planCatalog.js'
import { countReservationUsage, snapshotForPlan } from './usageSnapshot.js'

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

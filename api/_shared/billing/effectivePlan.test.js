import { describe, expect, it } from 'vitest'
import { effectivePlanId, subscriptionInPaidPeriod } from './effectivePlan.js'
import { readDurableQuota } from './quotaRead.js'

const NOW = new Date('2026-10-27T12:00:00.000Z')
const USER = '11111111-1111-4111-8111-111111111111'
const PAID = 'plan.prelim.sek.month.04'
const day = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString()

function client(tables) {
  return {
    schema() {
      return {
        from(table) {
          const rows = tables[table] || []
          const filters = []
          const api = {
            select() { return api },
            eq(column, value) { filters.push([column, value]); return api },
            maybeSingle: async () => ({ data: rows.find((row) => filters.every(([c, v]) => row[c] === v)) || null, error: null }),
            then(resolve, reject) {
              return Promise.resolve({ data: rows.filter((row) => filters.every(([c, v]) => row[c] === v)), error: null }).then(resolve, reject)
            },
          }
          return api
        },
        rpc() { throw new Error('quota read must not call rpc') },
      }
    },
  }
}

function tablesFor({ assignment, subscriptions = [] }) {
  return {
    plan_entitlements: [
      { enabled: true, feature: 'food.scan', limit_kind: 'NUMBER', limit_value: 5, plan_id: 'plan.free', unit: 'requests' },
      { enabled: true, feature: 'food.scan', limit_kind: 'NUMBER', limit_value: 10, plan_id: PAID, unit: 'requests' },
    ],
    plans: [
      { active: true, billing_interval: 'month', plan_id: 'plan.free' },
      { active: true, billing_interval: 'month', plan_id: PAID },
    ],
    quota_reservations: [],
    subscriptions: subscriptions.map((row) => ({ plan_id: PAID, user_id: USER, ...row })),
    user_plan_assignments: assignment ? [{ plan_version: 1, user_id: USER, ...assignment }] : [],
  }
}

describe('betalkvot gäller bara under betalperioden', () => {
  it('följer samma regel som databasens synkning', () => {
    const active = { current_period_end: day(29), current_period_start: day(-1), status: 'ACTIVE' }
    expect(subscriptionInPaidPeriod(active, NOW)).toBe(true)
    expect(subscriptionInPaidPeriod({ ...active, current_period_end: day(-0.001) }, NOW)).toBe(false)
    expect(subscriptionInPaidPeriod({ ...active, status: 'CANCELED' }, NOW)).toBe(false)
    expect(subscriptionInPaidPeriod({ ...active, past_due_grace_until: day(1), status: 'PAST_DUE' }, NOW)).toBe(true)
    expect(subscriptionInPaidPeriod({ ...active, past_due_grace_until: day(-1), status: 'PAST_DUE' }, NOW)).toBe(false)
  })

  it('behåller gratisplan och manuella tilldelningar utan att läsa abonnemang', async () => {
    const never = async () => { throw new Error('not needed') }
    await expect(effectivePlanId(null, never, NOW)).resolves.toBe('plan.free')
    await expect(effectivePlanId({ plan_id: PAID, source: 'admin-seed' }, never, NOW)).resolves.toBe(PAID)
    await expect(effectivePlanId({ plan_id: 'plan.free', source: 'server' }, never, NOW)).resolves.toBe('plan.free')
  })

  it('visar betalkvoten före periodens slut och gratiskvoten efter, utan skrivning', async () => {
    const assignment = { plan_id: PAID, source: 'server' }
    const before = await readDurableQuota({
      client: client(tablesFor({ assignment, subscriptions: [{ cancel_at_period_end: true, current_period_end: day(29), current_period_start: day(-1), status: 'ACTIVE' }] })),
      feature: 'food.scan',
      now: NOW,
      userId: USER,
    })
    expect(before.quota).toMatchObject({ limit: 10, plan_id: PAID })

    const after = await readDurableQuota({
      client: client(tablesFor({ assignment, subscriptions: [{ cancel_at_period_end: true, current_period_end: day(-1), current_period_start: day(-31), status: 'ACTIVE' }] })),
      feature: 'food.scan',
      now: NOW,
      userId: USER,
    })
    expect(after.quota).toMatchObject({ limit: 5, plan_id: 'plan.free' })
  })
})

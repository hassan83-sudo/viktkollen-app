import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPostgresUsageSnapshot } from './usageSnapshotRead.js'

function client(tables) {
  return {
    schema() {
      return {
        from(table) {
          const filters = []
          const query = {
            select() { return query },
            eq(column, value) {
              filters.push((row) => row[column] === value)
              return query
            },
            in(column, values) {
              filters.push((row) => values.includes(row[column]))
              return query
            },
            gt(column, value) {
              filters.push((row) => new Date(row[column]).getTime() > new Date(value).getTime())
              return query
            },
            limit() { return query },
            maybeSingle: async () => ({
              data: (tables[table] || []).find((row) => filters.every((match) => match(row))) || null,
              error: null,
            }),
            then(resolve, reject) {
              return Promise.resolve({
                data: (tables[table] || []).filter((row) => filters.every((match) => match(row))),
                error: null,
              }).then(resolve, reject)
            },
          }
          return query
        },
      }
    },
  }
}

const USER = 'user'
const requests = Array.from({ length: 7 }, () => ({
  actual_quantity: 1,
  feature: 'ai.text.request',
  period_start: '2026-10-01T00:00:00.000Z',
  quantity: 1,
  status: 'COMMITTED',
  unit: 'requests',
  user_id: USER,
}))

describe('readPostgresUsageSnapshot', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the calendar quota reset and the paid access end without counting tokens', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'))
    const snapshot = await readPostgresUsageSnapshot(client({
      plan_entitlements: [{
        enabled: true,
        feature: 'ai.text.request',
        limit_kind: 'NUMBER',
        limit_value: 50,
        plan_id: 'plan.prelim.sek.month.04',
        unit: 'requests',
      }],
      plans: [{
        active: true,
        billing_interval: 'month',
        plan_id: 'plan.prelim.sek.month.04',
        price_minor: 400,
      }],
      quota_reservations: [
        ...requests,
        {
          actual_quantity: 8899,
          feature: 'ai.text.request',
          period_start: '2026-10-01T00:00:00.000Z',
          quantity: 8899,
          status: 'COMMITTED',
          unit: 'tokens',
          user_id: USER,
        },
      ],
      subscriptions: [{
        current_period_end: '2026-11-27T09:22:46.000Z',
        plan_id: 'plan.prelim.sek.month.04',
        status: 'ACTIVE',
        user_id: USER,
      }],
      user_plan_assignments: [{ plan_id: 'plan.prelim.sek.month.04', user_id: USER }],
    }), USER)

    expect(snapshot.period.end).toBe('2026-11-01T00:00:00.000Z')
    expect(snapshot.access.end).toBe('2026-11-27T09:22:46.000Z')
    expect(snapshot.quotas.find((row) => row.key === 'ai_coach')).toMatchObject({
      limit: 50,
      remaining: 43,
      used: 7,
    })
  })
})

import { describe, expect, it } from 'vitest'
import { createUsageEvent } from './usageEvent.js'
import { createPostgresUsageRepository } from './usageRepositoryPostgres.js'

function createFakeUsageClient(store = new Map()) {
  return {
    schema(name) {
      expect(name).toBe('billing')
      return {
        from(table) {
          expect(table).toBe('usage_events')
          return {
            insert(row) {
              return {
                select() {
                  return {
                    async maybeSingle() {
                      if (store.has(row.event_id)) {
                        return { data: null, error: { code: '23505', message: 'duplicate key' } }
                      }
                      store.set(row.event_id, row)
                      return { data: row, error: null }
                    },
                  }
                },
              }
            },
            select() {
              return {
                eq(_column, id) {
                  return {
                    async maybeSingle() {
                      return { data: store.get(id) || null, error: null }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

describe('BILL-5B2 postgres usage adapter', () => {
  it('first insert wins and duplicate event_id is already dispatched', async () => {
    const store = new Map()
    const repoA = createPostgresUsageRepository({ client: createFakeUsageClient(store) })
    const repoB = createPostgresUsageRepository({ client: createFakeUsageClient(store) })
    const event = createUsageEvent({
      cost_basis: 'UNAVAILABLE',
      event_id: 'op_food_scan_cas_01',
      event_type: 'food.scan',
      feature: 'food.scan',
      metadata: { usage_basis: 'UNAVAILABLE' },
      quantity: 1,
      unit: 'requests',
      user_id: 'a1111111-1111-4111-8111-111111111111',
    })
    const first = await repoA.insert(event)
    const second = await repoB.insert(event)
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(store.size).toBe(1)
    expect(JSON.stringify([...store.values()])).not.toMatch(/base64|prompt|image_url|Bearer |sk-/)
  })
})

import { describe, expect, it } from 'vitest'
import { createPostgresQuotaBackend, createSupabaseBillingRpcQuery } from './quotaPostgres.js'

describe('BILL-5B2 postgres quota adapter', () => {
  it('inspect uses reserve_quota quantity 0 and does not throw', async () => {
    const calls = []
    const backend = createPostgresQuotaBackend(async (sql, params) => {
      calls.push({ params, sql })
      return [{ result: { remaining: 4, status: 'ALLOWED', unit: 'requests' } }]
    })
    const snapshot = await backend.inspect({
      feature: 'food.scan',
      unit: 'requests',
      userId: 'a1111111-1111-4111-8111-111111111111',
    })
    expect(snapshot.status).toBe('ALLOWED')
    expect(calls[0].params[3]).toBe(0)
    expect(String(calls[0].params[4])).toMatch(/^inspect:/)
  })

  it('maps supabase rpc to reserve/commit/rollback', async () => {
    const rpcCalls = []
    const client = {
      schema(name) {
        expect(name).toBe('billing')
        return {
          async rpc(fn, args) {
            rpcCalls.push({ args, fn })
            return { data: { status: 'RESERVED', reservation_id: args.p_reservation_id }, error: null }
          },
        }
      },
    }
    const query = createSupabaseBillingRpcQuery(client)
    const backend = createPostgresQuotaBackend(query)
    const reserved = await backend.reserve({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: 'op_abc',
      unit: 'requests',
      userId: 'a1111111-1111-4111-8111-111111111111',
    })
    expect(reserved.status).toBe('RESERVED')
    expect(rpcCalls[0].fn).toBe('reserve_quota')
    expect(rpcCalls[0].args.p_quantity).toBe(1)
  })
})

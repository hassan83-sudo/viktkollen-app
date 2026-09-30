import { describe, expect, it, vi } from 'vitest'
import { createCostStoreFromEnv, createSupabaseCostStore } from './supabaseCostStore.js'

const serviceRoleKey = 'server-cost-credential'
const url = 'https://cost.example.test'

describe('AI Help Supabase cost store', () => {
  it('sends only the hashed user to the cost function and keeps the server credential in the header', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, reservationId: '11111111-1111-4111-8111-111111111111' }),
    }))
    const store = createSupabaseCostStore({ fetchImpl, serviceRoleKey, url })
    const result = await store.reserve({
      budgetSek: 10,
      claimedNow: '2099-01-01T00:00:00.000Z',
      holdSek: 0.000001,
      maxInputTokens: 80,
      maxOutputTokens: 400,
      periodSeconds: 3600,
      sekPerUsd: 9.93,
      userHash: 'a'.repeat(24),
      userLimit: 8,
      windowSeconds: 600,
    })

    expect(result.ok).toBe(true)
    const [endpoint, request] = fetchImpl.mock.calls[0]
    expect(endpoint).toBe(`${url}/rest/v1/rpc/ai_help_reserve_model_call`)
    expect(request.headers.Authorization).toBe(`Bearer ${serviceRoleKey}`)
    expect(request.body).not.toContain(serviceRoleKey)
    expect(request.body).toContain('a'.repeat(24))
    expect(request.body).not.toContain('signed-in-user')
    expect(request.body).not.toContain('p_now')
    expect(request.body).not.toContain('p_hold_sek')
    expect(request.body).not.toContain('claimedNow')
  })

  it('drops an unknown database reason instead of returning credential text', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, reason: serviceRoleKey }),
    }))
    const store = createSupabaseCostStore({ fetchImpl, serviceRoleKey, url })
    const result = await store.settle({
      actualSek: 999,
      inputTokens: 10,
      outputTokens: 4,
      reasoningTokens: 128,
      reservationId: '11111111-1111-4111-8111-111111111111',
    })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('p_actual_sek')
    expect(result).toMatchObject({ ok: false, reason: 'store_unavailable' })
    expect(JSON.stringify(result)).not.toContain(serviceRoleKey)
  })

  it('reports only outstanding reservation fields from the shared ledger', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        reservations: [
          {
            holdSek: 0.02,
            note: serviceRoleKey,
            periodId: '22222222-2222-4222-8222-222222222222',
            reservationId: '11111111-1111-4111-8111-111111111111',
            status: 'uncertain',
            userHash: 'a'.repeat(24),
          },
          { reservationId: 'not-a-reservation', status: 'reserved', userHash: 'signed-in-user' },
        ],
      }),
    }))
    const store = createSupabaseCostStore({ fetchImpl, serviceRoleKey, url })
    const result = await store.listOutstanding({ olderThanSeconds: 120 })
    expect(result.ok).toBe(true)
    expect(result.reservations).toEqual([{
      holdSek: 0.02,
      periodId: '22222222-2222-4222-8222-222222222222',
      reservationId: '11111111-1111-4111-8111-111111111111',
      status: 'uncertain',
      userHash: 'a'.repeat(24),
    }])
    expect(JSON.stringify(result)).not.toContain(serviceRoleKey)
    expect(JSON.stringify(result)).not.toContain('signed-in-user')
  })

  it('stays closed unless a server-only https credential is configured', async () => {
    const fetchImpl = vi.fn()
    expect((await createCostStoreFromEnv({}, fetchImpl).reserve()).reason).toBe('store_unavailable')
    expect((await createCostStoreFromEnv({
      AI_HELP_COST_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      AI_HELP_COST_SUPABASE_URL: 'http://cost.example.test',
    }, fetchImpl).reserve()).reason).toBe('store_unavailable')
    expect((await createCostStoreFromEnv({
      AI_HELP_COST_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      AI_HELP_COST_SUPABASE_URL: url,
      VITE_AI_HELP_COST_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    }, fetchImpl).reserve()).reason).toBe('store_unavailable')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

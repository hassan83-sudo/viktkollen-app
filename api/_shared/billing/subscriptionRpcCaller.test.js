import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_RPC } from '../../../src/services/billing/subscriptionAuthority.js'
import { clearSupabaseAdminClientForTests } from '../supabaseServer.js'
import {
  createServerPrivilegedSubscriptionAuthority,
  createServerSubscriptionRpcCaller,
  mapBillingRpcError,
} from './subscriptionRpcCaller.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const callerSource = readFileSync(join(root, 'api/_shared/billing/subscriptionRpcCaller.js'), 'utf8')
const userSubscription = readFileSync(join(root, 'api/_shared/billing/subscription.js'), 'utf8')

describe('BILL-7O server subscription RPC caller', () => {
  it('fails closed when server credentials are unavailable', () => {
    clearSupabaseAdminClientForTests()
    expect(() => createServerSubscriptionRpcCaller({ env: {} })).toThrow(expect.objectContaining({
      code: 'durable_operation_unavailable',
    }))
    expect(() => createServerPrivilegedSubscriptionAuthority({
      client: null,
    })).toThrow(expect.objectContaining({
      code: 'durable_operation_unavailable',
    }))
  })

  it('calls billing schema RPCs and keeps privileged mode durable', async () => {
    const calls = []
    const client = {
      schema(name) {
        return {
          async rpc(fn, args) {
            calls.push({ args, fn, name })
            return {
              data: {
                plan_id: 'plan.prelim.sek.month.49',
                status: 'ACTIVE',
                subscription_id: 'sub-1',
              },
              error: null,
            }
          },
        }
      },
    }
    const authority = createServerPrivilegedSubscriptionAuthority({ client })
    expect(authority.durable).toBe(true)
    expect(authority.store).toBeUndefined()
    await authority.subscriptions.scheduleNextPeriodPlanChange({
      clientClaim: { plan_id: 'plan.free', quota: 9, status: 'ACTIVE' },
      external_event_id: 'evt-1',
      plan_id: 'plan.prelim.sek.month.09',
      subscription_id: 'sub-1',
    })
    expect(calls).toEqual([{
      args: {
        p_external_event_id: 'evt-1',
        p_plan_id: 'plan.prelim.sek.month.09',
        p_subscription_id: 'sub-1',
      },
      fn: 'schedule_next_period_plan_change',
      name: 'billing',
    }])
    expect(JSON.stringify(calls)).not.toMatch(/plan\.free|quota/)
  })

  it('maps known RPC failures and hides raw database errors', async () => {
    expect(mapBillingRpcError({ code: '23505', message: 'duplicate key value violates unique constraint' }).code)
      .toBe('duplicate_external_event')
    expect(mapBillingRpcError({ message: 'duplicate_external_event' }).message).toBe('duplicate_external_event')
    const hidden = mapBillingRpcError({
      details: 'postgres://secret@db.example/billing',
      hint: 'service_role key',
      message: 'connection failed postgres://secret@db.example/billing password=hidden',
    })
    expect(hidden.code).toBe('billing_rpc_failed')
    expect(hidden.message).toBe('billing_rpc_failed')
    expect(JSON.stringify(hidden)).not.toMatch(/postgres:|password|service_role/)

    const client = {
      schema() {
        return {
          async rpc() {
            return {
              data: null,
              error: { code: 'P0001', message: 'illegal subscription transition ACTIVE -> PAST_DUE' },
            }
          },
        }
      },
    }
    const callRpc = createServerSubscriptionRpcCaller({ client })
    await expect(callRpc(SUBSCRIPTION_RPC.advancePeriod, { p_subscription_id: 'sub-1' }))
      .rejects.toMatchObject({
        code: 'illegal_subscription_transition',
        message: 'illegal_subscription_transition',
      })
  })

  it('stays server-only and leaves user subscription reads in memory', () => {
    expect(callerSource).toMatch(/createSupabaseAdminClient/)
    expect(callerSource).not.toMatch(/createInMemorySubscriptionStore|eyJ|postgres:\/\//)
    expect(callerSource).not.toMatch(/src\/lib\/supabase|src\/services\/supabaseClient/)
    expect(userSubscription).toMatch(/createSubscriptionAuthority\(\{ catalog \}\)/)
    expect(userSubscription).not.toMatch(/subscriptionRpcCaller|durable:\s*true/)
  })
})

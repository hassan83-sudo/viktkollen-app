import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../../billing/user/index.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../supabaseServer.js'
import { setSupabaseAuthVerifierForTests } from '../verifySupabaseUser.js'
import { readPostgresPlanComparison, readPlanComparison, setPlanComparisonReaderForTests } from './planComparisonRead.js'

const USER = '11111111-1111-4111-8111-111111111111'
const SECRET = 'service-role-key-SHOULD-NOT-LOG'
const TOKEN = 'Bearer fake-token-SHOULD-NOT-LOG'
const DATABASE_URL = 'postgresql://user:secret@db.example.supabase.co:5432/postgres'

function leakedError(code) {
  return {
    code,
    details: `user ${USER} ${SECRET}`,
    hint: TOKEN,
    message: `read failed ${DATABASE_URL}`,
    status: 400,
  }
}

function queryResult(result) {
  const query = Promise.resolve(result)
  query.eq = () => query
  query.maybeSingle = async () => result
  return query
}

function clientFor({ assignments = { data: null, error: null }, entitlements = { data: [], error: null }, plans = { data: [], error: null } } = {}) {
  return {
    schema() {
      return {
        from(table) {
          return {
            select() {
              if (table === 'user_plan_assignments') return queryResult(assignments)
              if (table === 'plans') return queryResult(plans)
              return queryResult(entitlements)
            },
          }
        },
      }
    },
  }
}

function warningText() {
  return JSON.stringify(vi.mocked(console.warn).mock.calls)
}

describe('BILL-6C plan read diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setPlanComparisonReaderForTests(null)
    setSupabaseAuthVerifierForTests(null)
    clearSupabaseAdminClientForTests()
  })

  it('records a plans PostgREST failure and still fails closed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setSupabaseAdminClientForTests(clientFor({ plans: { data: null, error: leakedError('PGRST205') } }))
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: USER } }))
    await expect(readPostgresPlanComparison(clientFor({ plans: { data: null, error: leakedError('PGRST205') } }), USER)).rejects.toThrow('plan_comparison_read_failed')
    expect(await readPlanComparison(USER)).toBeNull()
    const response = { json: vi.fn(), setHeader: vi.fn(), status: vi.fn() }
    response.status.mockReturnValue(response)
    await handler({ headers: { authorization: `Bearer ${TOKEN}` }, method: 'GET', query: { __vk_route: 'plans' }, url: '/api/billing/user' }, response)
    expect(response.status).toHaveBeenCalledWith(503)
    expect(JSON.stringify(response.json.mock.calls)).not.toMatch(/PGRST205|plans|SHOULD-NOT-LOG/)
    expect(warningText()).toMatch(/billing_plan_read_failed/)
    expect(warningText()).toMatch(/"operation":"plans"/)
    expect(warningText()).toMatch(/"code":"PGRST205"/)
    expect(warningText()).not.toMatch(/SHOULD-NOT-LOG|fake-token|postgresql:\/\/|11111111-1111-4111-8111-111111111111/)
  })

  it('identifies a plan_entitlements failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(readPostgresPlanComparison(clientFor({
      entitlements: { data: null, error: leakedError('42501') },
      plans: { data: [], error: null },
    }), USER)).rejects.toThrow('plan_comparison_read_failed')
    expect(warningText()).toMatch(/"operation":"plan_entitlements"/)
    expect(warningText()).toMatch(/"code":"42501"/)
    expect(warningText()).not.toMatch(/SHOULD-NOT-LOG|11111111-1111-4111-8111-111111111111/)
  })

  it('identifies a user_plan_assignments failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(readPostgresPlanComparison(clientFor({
      assignments: { data: null, error: leakedError('PGRST116') },
    }), USER)).rejects.toThrow('plan_comparison_read_failed')
    expect(warningText()).toMatch(/"operation":"user_plan_assignments"/)
    expect(warningText()).toMatch(/"code":"PGRST116"/)
    expect(warningText()).not.toMatch(/SHOULD-NOT-LOG|fake-token|postgresql:\/\//)
  })

  it('does not emit an error diagnostic for a successful comparison', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const features = ['ai.text.request', 'food.scan', 'body.scan', 'ai.eye.analysis']
    const comparison = await readPostgresPlanComparison(clientFor({
      plans: { data: [{ active: true, currency: 'SEK', plan_id: 'plan.free', price_minor: 0 }], error: null },
      entitlements: {
        data: features.map((feature) => ({
          enabled: true,
          feature,
          limit_kind: 'NUMBER',
          limit_value: 5,
          plan_id: 'plan.free',
          unit: 'requests',
        })),
        error: null,
      },
    }), USER)
    expect(comparison.plans).toHaveLength(1)
    expect(warningText()).not.toMatch(/billing_plan_read_failed/)
  })
})

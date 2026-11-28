import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountTrial } from './accountTrial.js'
import handler from '../../billing/user/index.js'
import { setSupabaseAuthVerifierForTests } from '../verifySupabaseUser.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../supabaseServer.js'
import { checkFeatureAccess } from '../featureAccess.js'
import { executeUserBillingIntent } from './userLifecycleIntent.js'

const USER = '11111111-1111-4111-8111-111111111111'
const trial = {
  plan_id: 'plan.trial.30days', status: 'TRIALING', quota_window: 'subscription',
  current_period_start: '2026-11-28T10:00:00Z', current_period_end: '2026-12-28T10:00:00Z', cancel_at_period_end: true,
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-28T10:00:00Z'))
  setSupabaseAuthVerifierForTests(async token => token === 'valid' ? { user: { id: USER } } : { error: { message: 'invalid jwt' } })
})
afterEach(() => { vi.useRealTimers(); clearSupabaseAdminClientForTests(); setSupabaseAuthVerifierForTests(null) })

async function call({ method = 'POST', token = 'valid', body = {}, url = '/api/billing/trial', query = {} } = {}) {
  const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body, url, query }, response)
  return response
}

describe('account trial server boundary', () => {
  it('uses only the authenticated account, ignoring client plan, quota, price and dates', async () => {
    const rpc = vi.fn(async () => ({ data: trial, error: null }))
    setSupabaseAdminClientForTests({ schema: () => ({ rpc }) })
    const response = await call({ body: { user_id: 'other', plan_id: 'plan.prelim.sek.month.99', quota: 999, current_period_end: '2099-01-01', price: 1 } })
    expect(response.statusCode).toBe(200)
    expect(response.body.subscription).toMatchObject({ status: 'TRIALING', plan_id: 'plan.trial.30days' })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('start_account_trial', { p_user_id: USER })
  })
  it.each(['', 'invalid'])('rejects unauthenticated activation (%s)', async token => {
    const rpc = vi.fn()
    setSupabaseAdminClientForTests({ schema: () => ({ rpc }) })
    expect((await call({ token })).statusCode).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([
    ['trial_already_used', 409, 'TRIAL_ALREADY_USED'],
    ['active_period_exists', 409, 'ACTIVE_PERIOD_EXISTS'],
    ['checkout_in_progress', 409, 'CHECKOUT_IN_PROGRESS'],
    ['email_password_required', 403, 'EMAIL_PASSWORD_REQUIRED'],
    ['secret database failure', 503, 'TRIAL_UNAVAILABLE'],
  ])('maps %s without leaking database details', async (message, status, code) => {
    setSupabaseAdminClientForTests({ schema: () => ({ rpc: async () => ({ error: { message } }) }) })
    const response = await call()
    expect(response.statusCode).toBe(status)
    expect(response.body.error.code).toBe(code)
    expect(JSON.stringify(response.body)).not.toContain('secret database')
  })
  it('permits only GET/POST and keeps the rewritten route authenticated', async () => {
    expect((await call({ method: 'DELETE' })).statusCode).toBe(405)
    expect((await call({ token: '', url: '/api/billing/user', query: { __vk_route: 'start_trial' } })).statusCode).toBe(401)
  })
  it('does not activate on a GET eligibility read', async () => {
    const rpc = vi.fn()
    const tables = { account_trials: [], subscriptions: [] }
    setSupabaseAdminClientForTests({ schema: () => ({ rpc, from: table => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: resolve => Promise.resolve({ data: tables[table] }).then(resolve) }
      return q
    } }) })
    const response = await call({ method: 'GET' })
    expect(response.body.trial).toEqual({ eligible: true, used: false, endsAt: null })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('fails closed without durable billing and without a valid trial response', async () => {
    expect(await accountTrial({ client: null, userId: USER, start: true })).toMatchObject({ ok: false, status: 503 })
    expect(await accountTrial({ client: { schema: () => ({ rpc: async () => ({ data: null }) }) }, userId: USER, start: true })).toMatchObject({ ok: false, status: 503 })
  })
  it('cannot undo trial expiry or schedule a plan change through existing lifecycle APIs', async () => {
    const lifecycle = { clearCancelAtPeriodEnd: vi.fn(), scheduleNextPeriodPlanChange: vi.fn() }
    for (const action of ['undo_cancel', 'plan_change']) {
      expect(await executeUserBillingIntent({ action, userId: USER, deps: { lifecycle, readSubscription: async () => ({ subscriptionId: 'trial', subscription: trial }) } })).toMatchObject({ status: 409 })
    }
    expect(lifecycle.clearCancelAtPeriodEnd).not.toHaveBeenCalled()
    expect(lifecycle.scheduleNextPeriodPlanChange).not.toHaveBeenCalled()
  })
  it.each(['wardrobe', 'mealCalendar', 'checklists', 'personalCare', 'subscriptionFeatures'])('grants %s only within the server subscription period', async feature => {
    const readSubscription = async () => ({ subscription: trial, unavailable: false })
    expect(await checkFeatureAccess(feature, USER, { readSubscription })).toMatchObject({ allowed: true })
    vi.setSystemTime(new Date(trial.current_period_end))
    expect(await checkFeatureAccess(feature, USER, { readSubscription })).toMatchObject({ allowed: false })
  })
})

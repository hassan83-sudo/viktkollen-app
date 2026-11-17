import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendSafeAiError } from '../aiRouteErrors.js'
import { requireBillingAdmin, setBillingAdminControlsForTests } from '../billing/admin.js'
import { handleCheckoutRequest, setCheckoutAdapterForTests, setCheckoutPortsForTests, setCheckoutSaleReaderForTests } from '../billing/checkoutIntent.js'
import { mapFoodScanBillingHttp } from '../billing/foodScanLiveBilling.js'
import { ENFORCEMENT_DECISION } from '../../../src/services/billing/catalog.js'
import supportHandler from '../aiHelp/supportHandler.js'
import securityCenterHandler from './securityCenterHandler.js'
import billingUserHandler from '../../billing/user/index.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../supabaseServer.js'
import { setSupabaseAuthVerifierForTests, verifySupabaseUser } from '../verifySupabaseUser.js'
import { setSecurityWaitUntilForTests } from './securityEventStore.js'
import { recordBurst, resetSecurityGuardForTests, shouldWriteSecurityEvent } from './securityGuard.js'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const TICKET = '33333333-3333-4333-8333-333333333333'

let pending
let securityRpc
let supportRpc

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

function request({ token = 'valid-token', ip = '203.0.113.7', ...rest } = {}) {
  return {
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': ip },
    method: 'GET',
    query: {},
    url: '/api/test',
    ...rest,
  }
}

async function recorded() {
  await Promise.all(pending)
  return securityRpc.mock.calls
    .filter(([name]) => name === 'security_center_record_event')
    .map(([, args]) => args)
}

beforeEach(() => {
  resetSecurityGuardForTests()
  pending = []
  setSecurityWaitUntilForTests((promise) => { pending.push(promise) })
  securityRpc = vi.fn(async () => ({ data: 1, error: null }))
  supportRpc = vi.fn(async () => ({ data: { ok: true, tickets: [] }, error: null }))
  setSupabaseAdminClientForTests({ rpc: securityRpc, schema: () => ({ rpc: supportRpc }) })
  setSupabaseAuthVerifierForTests(async (token) => (token === 'valid-token' ? { user: { id: USER } } : { error: { message: 'invalid JWT' } }))
})

afterEach(() => {
  setSecurityWaitUntilForTests(null)
  setSupabaseAuthVerifierForTests(null)
  setBillingAdminControlsForTests(undefined)
  setCheckoutAdapterForTests(null)
  setCheckoutPortsForTests(null)
  setCheckoutSaleReaderForTests(null)
  clearSupabaseAdminClientForTests()
  resetSecurityGuardForTests()
})

describe('stored fields', () => {
  it('sends only type, severity and feature, never ids, tokens or addresses', async () => {
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => false })
    await requireBillingAdmin(request({ token: 'valid-token' }), { securityFeature: 'bug-monitor' })
    const [args] = await recorded()
    expect(Object.keys(args).sort()).toEqual(['p_feature', 'p_severity', 'p_type'])
    expect(JSON.stringify(args)).not.toMatch(/valid-token|203\.0\.113|1111/)
  })
})

describe('repeated invalid tokens (AUTH_FAILURE_BURST)', () => {
  it('records one burst after ten invalid tokens from the same source', async () => {
    for (let i = 0; i < 10; i += 1) await verifySupabaseUser(request({ token: `forged-${i}` }))
    expect(await recorded()).toEqual([{ p_feature: 'api-auth', p_severity: 'medium', p_type: 'AUTH_FAILURE_BURST' }])
  })

  it('does not count expired sessions, missing tokens or valid users', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ error: { message: 'JWT expired' } }))
    for (let i = 0; i < 20; i += 1) await verifySupabaseUser(request({ token: 'old' }))
    for (let i = 0; i < 20; i += 1) await verifySupabaseUser(request({ token: '' }))
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: USER } }))
    for (let i = 0; i < 20; i += 1) await verifySupabaseUser(request())
    expect(await recorded()).toEqual([])
  })

  it('does not combine different sources into one burst', async () => {
    for (let i = 0; i < 9; i += 1) await verifySupabaseUser(request({ ip: '198.51.100.1', token: 'bad' }))
    for (let i = 0; i < 9; i += 1) await verifySupabaseUser(request({ ip: '198.51.100.2', token: 'bad' }))
    expect(await recorded()).toEqual([])
  })
})

describe('admin endpoints (ADMIN_ACCESS_DENIED)', () => {
  it('records a verified non-admin with the endpoint name', async () => {
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => false })
    const result = await requireBillingAdmin(request(), { securityFeature: 'security-center' })
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(await recorded()).toEqual([{ p_feature: 'security-center', p_severity: 'high', p_type: 'ADMIN_ACCESS_DENIED' }])
  })

  it('does not record admins or signed-out requests', async () => {
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => true })
    expect((await requireBillingAdmin(request())).ok).toBe(true)
    expect((await requireBillingAdmin(request({ token: '' }))).status).toBe(401)
    expect(await recorded()).toEqual([])
  })
})

describe('Premium and quota denials', () => {
  it('names entitlement and quota denials without changing the response', () => {
    expect(mapFoodScanBillingHttp({ decision: ENFORCEMENT_DECISION.DENY_ENTITLEMENT })).toEqual({
      code: 'SAFETY_BLOCKED', kind: 'error', retryable: false, securitySignal: 'premium_denied', status: 403,
    })
    expect(mapFoodScanBillingHttp({ decision: ENFORCEMENT_DECISION.DENY_QUOTA })).toMatchObject({
      code: 'RATE_LIMITED', securitySignal: 'quota_exceeded', status: 429,
    })
    expect(mapFoodScanBillingHttp({ decision: ENFORCEMENT_DECISION.DENY_FEATURE_DISABLED })).not.toHaveProperty('securitySignal')
  })

  it('records PREMIUM_ACCESS_DENIED and QUOTA_EXCEEDED, not API_RATE_LIMITED, for billing denials', async () => {
    sendSafeAiError(response(), { code: 'SAFETY_BLOCKED', securityFeature: 'food-scan', securitySignal: 'premium_denied', status: 403 })
    sendSafeAiError(response(), { code: 'RATE_LIMITED', securityFeature: 'ai-text', securitySignal: 'quota_exceeded', status: 429 })
    expect(await recorded()).toEqual([
      { p_feature: 'food-scan', p_severity: 'medium', p_type: 'PREMIUM_ACCESS_DENIED' },
      { p_feature: 'ai-text', p_severity: 'medium', p_type: 'QUOTA_EXCEEDED' },
    ])
  })

  it('ignores unknown signal names and successful responses', async () => {
    sendSafeAiError(response(), { code: 'INVALID_REQUEST', securitySignal: 'CROSS_USER_ACCESS_DENIED', status: 400 })
    sendSafeAiError(response(), { code: 'SAFETY_BLOCKED', securitySignal: 'admin', status: 403 })
    expect(await recorded()).toEqual([])
  })
})

describe('support (CROSS_USER_ACCESS_DENIED, PREMIUM_ACCESS_DENIED, API_RATE_LIMITED)', () => {
  const reply = { action: 'reply', message: 'hej', ticketId: TICKET, version: 1 }

  async function post(body, { admin = false } = {}) {
    const res = response()
    await supportHandler(request({ body, method: 'POST', query: admin ? { resource: 'admin' } : {} }), res)
    return res
  }

  it('records a customer reply to a ticket that is not theirs', async () => {
    supportRpc.mockResolvedValueOnce({ data: { ok: false, code: 'NOT_FOUND' }, error: null })
    expect((await post(reply)).statusCode).toBe(404)
    expect(await recorded()).toEqual([{ p_feature: 'support', p_severity: 'critical', p_type: 'CROSS_USER_ACCESS_DENIED' }])
  })

  it('does not record an admin reply to a ticket that has gone', async () => {
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => true })
    supportRpc.mockResolvedValueOnce({ data: { ok: false, code: 'NOT_FOUND' }, error: null })
    expect((await post(reply, { admin: true })).statusCode).toBe(404)
    expect(await recorded()).toEqual([])
  })

  it('records free users submitting tickets and support rate limits', async () => {
    supportRpc.mockResolvedValueOnce({ data: { ok: false, code: 'PAID_SUPPORT_REQUIRED' }, error: null })
    await post({ action: 'create', message: 'hej', requestId: TICKET })
    supportRpc.mockResolvedValueOnce({ data: { ok: false, code: 'RATE_LIMITED' }, error: null })
    await post({ action: 'create', message: 'hej', requestId: TICKET })
    expect(await recorded()).toEqual([
      { p_feature: 'support', p_severity: 'medium', p_type: 'PREMIUM_ACCESS_DENIED' },
      { p_feature: 'support', p_severity: 'medium', p_type: 'API_RATE_LIMITED' },
    ])
  })

  it('ignores ordinary conflicts and a client-supplied user_id', async () => {
    supportRpc.mockResolvedValueOnce({ data: { ok: false, code: 'CONFLICT' }, error: null })
    await post({ ...reply, user_id: OTHER })
    expect(supportRpc.mock.calls[0][1].p_actor).toBe(USER)
    expect(await recorded()).toEqual([])
  })
})

describe('billing (BILLING_TAMPER_ATTEMPT, CROSS_USER_ACCESS_DENIED)', () => {
  beforeEach(() => {
    setCheckoutSaleReaderForTests(() => ({ active: true, enabledForSale: true, known: true }))
  })

  async function checkout(body) {
    const res = response()
    await handleCheckoutRequest(request({ body, method: 'POST' }), res)
    return res
  }

  it('records a checkout with an edited amount or currency', async () => {
    expect((await checkout({ amount: 1, plan_id: 'plan.prelim.sek.month.04' })).body.error.code).toBe('INVALID_AMOUNT')
    resetSecurityGuardForTests()
    expect((await checkout({ currency: 'USD', plan_id: 'plan.prelim.sek.month.04' })).body.error.code).toBe('INVALID_CURRENCY')
    expect(await recorded()).toEqual([
      { p_feature: 'checkout', p_severity: 'high', p_type: 'BILLING_TAMPER_ATTEMPT' },
      { p_feature: 'checkout', p_severity: 'high', p_type: 'BILLING_TAMPER_ATTEMPT' },
    ])
  })

  it('does not record an ordinary checkout or an unknown plan', async () => {
    expect((await checkout({ plan_id: 'plan.prelim.sek.month.04' })).statusCode).toBe(503)
    expect((await checkout({ plan_id: 'plan.free' })).body.error.code).toBe('INVALID_PLAN')
    expect(await recorded()).toEqual([])
  })

  it('records a request for another user\'s subscription, not the own one', async () => {
    const other = response()
    await billingUserHandler(request({ query: { resource: 'subscription', user_id: OTHER }, url: '/api/billing/subscription' }), other)
    expect(other.statusCode).toBe(403)
    expect(await recorded()).toEqual([{ p_feature: 'billing-subscription', p_severity: 'critical', p_type: 'CROSS_USER_ACCESS_DENIED' }])
  })
})

describe('clients cannot create events', () => {
  it('the Security Center API is read-only and never writes', async () => {
    const res = response()
    await securityCenterHandler(request({ body: { type: 'CROSS_USER_ACCESS_DENIED' }, method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
    expect(await recorded()).toEqual([])
  })
})

describe('cost limits', () => {
  it('writes one event per type and feature every ten seconds per instance', () => {
    expect(shouldWriteSecurityEvent('API_RATE_LIMITED:api', 0)).toBe(true)
    expect(shouldWriteSecurityEvent('API_RATE_LIMITED:api', 9_999)).toBe(false)
    expect(shouldWriteSecurityEvent('API_RATE_LIMITED:support', 9_999)).toBe(true)
    expect(shouldWriteSecurityEvent('API_RATE_LIMITED:api', 10_000)).toBe(true)
  })

  it('a flood of 429s makes one database call', async () => {
    for (let i = 0; i < 50; i += 1) sendSafeAiError(response(), { code: 'RATE_LIMITED', status: 429 })
    expect(await recorded()).toHaveLength(1)
  })

  it('bursts reset after the window and after reporting', () => {
    const rule = { threshold: 3, windowMs: 1000 }
    expect(recordBurst('t', 'a', rule, 0)).toBe(false)
    expect(recordBurst('t', 'a', rule, 10)).toBe(false)
    expect(recordBurst('t', 'a', rule, 2000)).toBe(false)
    expect(recordBurst('t', 'a', rule, 2001)).toBe(false)
    expect(recordBurst('t', 'a', rule, 2002)).toBe(true)
    expect(recordBurst('t', 'a', rule, 2003)).toBe(false)
  })
})

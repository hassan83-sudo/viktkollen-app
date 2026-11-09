import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { setBillingAdminServiceForTests } from './admin.js'
import { createBillingAdminService } from '../../../src/services/billing/adminService.js'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../supabaseServer.js'
import { setSupabaseAuthVerifierForTests } from '../verifySupabaseUser.js'
import { mapBillingRpcError } from './subscriptionRpcCaller.js'
import {
  attachVerifiedSumUpSetupToExisting,
  handleSumUpSetupAttachExisting,
  SUMUP_SETUP_ATTACH_EXISTING_RPC,
  SUMUP_SETUP_ATTACH_TARGET,
} from './sumupSetupAttachExisting.js'
import { sumUpCustomerIdForUser } from './sumupRecurring.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const USER = 'd449f4d1-d2c7-41fd-8c74-e8b1bbe46f89'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ADMIN = USER
const INTENT = SUMUP_SETUP_ATTACH_TARGET.intentCheckoutId
const SUMUP_ID = SUMUP_SETUP_ATTACH_TARGET.providerCheckoutRef
const SUB = SUMUP_SETUP_ATTACH_TARGET.subscriptionId
const PLAN = SUMUP_SETUP_ATTACH_TARGET.planId
const TX = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const TOKEN = '6878cb7f-6515-47bf-bdd9-1408d270fdce'
const FINGERPRINT = createHash('sha256').update(TOKEN).digest('hex')
const PERIOD_START = '2026-11-02T12:31:32.390Z'
const PERIOD_END = '2026-12-02T12:31:32.390Z'
const ENV = { SUMUP_API_KEY: 'test-key', SUMUP_MERCHANT_CODE: 'MTEST01' }

function response() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) { this.body = body; return this },
    setHeader(name, value) { this.headers[name] = value; return this },
    status(code) { this.statusCode = code; return this },
  }
}

function request({ body, method = 'POST', token = 'admin-token' } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query: { __vk_route: 'sumup_setup_attach_existing' },
    url: '/api/billing/sumup-setup-attach-existing',
  }
}

function paidCheckout({
  customerId = sumUpCustomerIdForUser(USER),
  purpose = 'SETUP_RECURRING_PAYMENT',
  status = 'PAID',
  token = TOKEN,
} = {}) {
  return {
    amount: 12,
    checkout_reference: INTENT,
    currency: 'SEK',
    customer_id: customerId,
    id: SUMUP_ID,
    merchant_code: 'MTEST01',
    payment_instrument: token == null ? undefined : { token },
    purpose,
    status,
    transactions: [{
      amount: 12,
      currency: 'SEK',
      id: TX,
      status: 'SUCCESSFUL',
      timestamp: '2026-11-08T02:56:31.000Z',
    }],
  }
}

function intentRow({ status = 'pending', userId = USER } = {}) {
  return {
    checkoutId: INTENT,
    expiresAt: '2026-11-08T03:26:06.220Z',
    planId: PLAN,
    provider: 'sumup',
    providerCheckoutRef: SUMUP_ID,
    status,
    userId,
  }
}

function appliedRow(overrides = {}) {
  return {
    access_granted: true,
    cancel_at_period_end: false,
    current_period_end: PERIOD_END,
    current_period_start: PERIOD_START,
    instrument_bound: true,
    plan_id: PLAN,
    provider: 'sumup',
    provider_customer_ref: sumUpCustomerIdForUser(USER),
    proration: false,
    refund: false,
    status: 'ACTIVE',
    subscription_id: SUB,
    user_id: USER,
    ...overrides,
  }
}

afterEach(() => {
  setBillingAdminServiceForTests(null)
  setSupabaseAuthVerifierForTests(null)
  clearSupabaseAdminClientForTests()
})

describe('attachVerifiedSumUpSetupToExisting', () => {
  it('re-verifies SumUp, binds the pinned subscription, and keeps the period unchanged', async () => {
    const rpcCalls = []
    const result = await attachVerifiedSumUpSetupToExisting({
      callRpc: async (name, args) => {
        rpcCalls.push({ args, name })
        return appliedRow()
      },
      checkoutId: INTENT,
      env: ENV,
      intents: { async get(id) { expect(id).toBe(INTENT); return intentRow() } },
      merchantCode: 'MTEST01',
      now: () => new Date('2026-11-09T07:00:00.000Z'),
      subscriptionId: SUB,
      transport: {
        async retrieveCheckout(id) {
          expect(id).toBe(SUMUP_ID)
          return paidCheckout()
        },
      },
    })

    expect(result).toMatchObject({
      accessGranted: true,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END,
      currentPeriodStart: PERIOD_START,
      instrumentBound: true,
      ok: true,
      planId: PLAN,
      subscriptionId: SUB,
      userId: USER,
    })
    expect(rpcCalls).toEqual([{
      name: SUMUP_SETUP_ATTACH_EXISTING_RPC,
      args: {
        p_checkout_id: INTENT,
        p_clear_cancel_event_id: `attach-clear:${SUMUP_ID}`,
        p_instrument_fingerprint: FINGERPRINT,
        p_provider_checkout_ref: SUMUP_ID,
        p_provider_customer_ref: sumUpCustomerIdForUser(USER),
        p_provider_event_id: `attach:${SUMUP_ID}`,
        p_subscription_id: SUB,
      },
    }])
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(getPlanById(PLAN).price_minor).toBe(1200)
  })

  it('is idempotent when the attach RPC returns the same bound facts', async () => {
    const first = await attachVerifiedSumUpSetupToExisting({
      callRpc: async () => appliedRow(),
      checkoutId: INTENT,
      env: ENV,
      intents: { async get() { return intentRow({ status: 'consumed' }) } },
      merchantCode: 'MTEST01',
      subscriptionId: SUB,
      transport: { async retrieveCheckout() { return paidCheckout() } },
    })
    const second = await attachVerifiedSumUpSetupToExisting({
      callRpc: async () => appliedRow(),
      checkoutId: SUMUP_ID,
      env: ENV,
      intents: { async get() { return intentRow({ status: 'consumed' }) } },
      merchantCode: 'MTEST01',
      subscriptionId: SUB,
      transport: { async retrieveCheckout() { return paidCheckout() } },
    })
    expect(first).toMatchObject({ ok: true, instrumentBound: true, subscriptionId: SUB })
    expect(second).toMatchObject({ ok: true, instrumentBound: true, subscriptionId: SUB })
  })

  it('rejects a different subscription or checkout target', async () => {
    const wrongSub = await attachVerifiedSumUpSetupToExisting({
      callRpc: async () => appliedRow(),
      checkoutId: INTENT,
      env: ENV,
      intents: { async get() { return intentRow() } },
      merchantCode: 'MTEST01',
      subscriptionId: '00000000-0000-4000-8000-000000000000',
      transport: { async retrieveCheckout() { return paidCheckout() } },
    })
    expect(wrongSub).toMatchObject({ ok: false, code: 'ATTACH_TARGET_MISMATCH' })

    const wrongCheckout = await attachVerifiedSumUpSetupToExisting({
      callRpc: async () => appliedRow(),
      checkoutId: 'chk_other',
      env: ENV,
      intents: { async get() { return intentRow() } },
      merchantCode: 'MTEST01',
      subscriptionId: SUB,
      transport: { async retrieveCheckout() { return paidCheckout() } },
    })
    expect(wrongCheckout).toMatchObject({ ok: false, code: 'ATTACH_TARGET_MISMATCH' })
  })

  it('rejects customer mismatch and never calls the attach RPC', async () => {
    const rpcCalls = []
    const result = await attachVerifiedSumUpSetupToExisting({
      callRpc: async (...args) => { rpcCalls.push(args); return appliedRow() },
      checkoutId: INTENT,
      env: ENV,
      intents: { async get() { return intentRow() } },
      merchantCode: 'MTEST01',
      subscriptionId: SUB,
      transport: {
        async retrieveCheckout() {
          return paidCheckout({ customerId: sumUpCustomerIdForUser(OTHER) })
        },
      },
    })
    expect(result).toMatchObject({ ok: false, code: 'CUSTOMER_MISMATCH' })
    expect(rpcCalls).toEqual([])
  })

  it('does not create a subscription through activate_verified_sumup_setup', async () => {
    const names = []
    await attachVerifiedSumUpSetupToExisting({
      callRpc: async (name) => {
        names.push(name)
        return appliedRow()
      },
      checkoutId: INTENT,
      env: ENV,
      intents: { async get() { return intentRow() } },
      merchantCode: 'MTEST01',
      subscriptionId: SUB,
      transport: { async retrieveCheckout() { return paidCheckout() } },
    })
    expect(names).toEqual([SUMUP_SETUP_ATTACH_EXISTING_RPC])
    expect(names.join(',')).not.toMatch(/activate_verified_sumup_setup|create_subscription/)
  })
})

describe('handleSumUpSetupAttachExisting', () => {
  it('requires billing_admin and never returns the instrument token', async () => {
    const service = createBillingAdminService()
    await service.bootstrapGrantForTests(ADMIN)
    setBillingAdminServiceForTests(service)
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'admin-token') return { user: { id: ADMIN } }
      if (token === 'user-token') return { user: { id: OTHER } }
      return { error: { message: 'invalid jwt' } }
    })
    setSupabaseAdminClientForTests({})

    const denied = response()
    await handleSumUpSetupAttachExisting(request({
      body: { checkout_id: INTENT, subscription_id: SUB },
      token: 'user-token',
    }), denied, {
      attach: async () => {
        throw new Error('attach must not run for non-admin')
      },
      env: ENV,
    })
    expect(denied.statusCode).toBe(403)
    expect(denied.body.ok).toBe(false)

    const allowed = response()
    await handleSumUpSetupAttachExisting(request({
      body: { checkout_id: INTENT, subscription_id: SUB },
    }), allowed, {
      attach: async () => ({
        accessGranted: true,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: PERIOD_END,
        currentPeriodStart: PERIOD_START,
        instrumentBound: true,
        ok: true,
        planId: PLAN,
        status: 200,
        subscriptionId: SUB,
        userId: USER,
      }),
      env: ENV,
    })
    expect(allowed.statusCode).toBe(200)
    expect(allowed.body).toMatchObject({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END,
      currentPeriodStart: PERIOD_START,
      instrumentBound: true,
      ok: true,
      planId: PLAN,
      subscriptionId: SUB,
    })
    expect(JSON.stringify(allowed.body)).not.toContain(TOKEN)
    expect(JSON.stringify(allowed.body)).not.toContain('test-key')

    const route = readFileSync(join(root, 'api/billing/admin/index.js'), 'utf8')
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8')
    expect(route).toContain('sumup_setup_attach_existing')
    expect(route).toContain('handleSumUpSetupAttachExisting')
    expect(vercel).toContain('/api/billing/sumup-setup-attach-existing')
    expect(vercel).toContain('/api/billing/admin?__vk_route=sumup_setup_attach_existing')
  })
})

describe('attach SQL contract', () => {
  it('reuses bind and clear-cancel, never creates a subscription, and keeps periods locked', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/20261109120000_billing_attach_sumup_setup_to_existing.sql'),
      'utf8',
    )
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).toMatch(/billing\.bind_verified_sumup_instrument\(/)
    expect(sql).toMatch(/billing\.clear_cancel_at_period_end\(/)
    expect(sql).not.toMatch(/billing\.create_subscription\(|billing\.activate_verified_sumup_setup\(|billing\.sync_plan_assignment/)
    expect(sql).not.toMatch(/current_period_start\s*=|current_period_end\s*=/)
    expect(sql).toMatch(/provider_customer_ref is distinct from p_provider_customer_ref/)
    expect(sql).toMatch(/subscription_user_mismatch/)
    expect(sql).toMatch(/period_changed/)
    expect(sql).toMatch(/Pending intents remain attachable after expires_at/)
    expect(sql).toMatch(/grant execute on function billing\.attach_verified_sumup_setup_to_existing\(text, text, text, text, text, text, text\)\s+to service_role/)
    expect(sql).not.toMatch(/grant execute on function billing\.attach_verified_sumup_setup_to_existing\([\s\S]*?\)\s+to (public|anon|authenticated)/)
    expect(sql).not.toMatch(/token|card_number|payment_instrument/i)

    const source = readFileSync(join(root, 'api/_shared/billing/sumupSetupAttachExisting.js'), 'utf8')
    expect(source).not.toMatch(/activateVerifiedSumUpSetup|activate_verified_sumup_setup/)
    expect(source).toMatch(/SUMUP_SETUP_ATTACH_TARGET/)
    expect(readFileSync(join(root, 'api/_shared/billing/sumupOneTimeCheckout.js'), 'utf8'))
      .not.toMatch(/attach_verified_sumup_setup_to_existing|sumupSetupAttachExisting/)
    expect(mapBillingRpcError({ message: 'subscription_user_mismatch' }).code).toBe('subscription_user_mismatch')
    expect(mapBillingRpcError({ message: 'period_changed' }).code).toBe('period_changed')
    expect(mapBillingRpcError({ message: 'cancel_not_cleared' }).code).toBe('cancel_not_cleared')
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import handler from '../../../api/billing/admin/index.js'
import {
  setBillingAdminControlsForTests,
  setBillingAdminStoreUnavailableForTests,
} from '../../../api/_shared/billing/admin.js'
import { setSupabaseAuthVerifierForTests } from '../../../api/_shared/verifySupabaseUser.js'
import { createInMemoryAdminAuditStore } from './adminAuthority.js'
import { createPostgresBillingControlAdapter } from './billingControlPostgres.js'
import { preliminarySekMonthMajors, getPlanById } from './planCatalog.js'
import {
  createInMemoryPlanCommercialStore,
  createPlanCommercialControlAdapter,
  createPlanCommercialControlService,
  paidCommercialPlans,
  presentPlanCommercialState,
} from './planCommercialControl.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260923130000_billing_plan_commercial_controls.sql'), 'utf8')
const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const PLAN_4 = 'plan.prelim.sek.month.04'
const PLAN_7 = 'plan.prelim.sek.month.07'
const PLAN_99 = 'plan.prelim.sek.month.99'

function createRequest({ body = {}, method = 'GET', query = {}, token = 'user-token' } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query,
  }
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) {
      response.body = body
      return response
    },
    setHeader(name, value) {
      response.headers[name] = value
    },
    status(statusCode) {
      response.statusCode = statusCode
      return response
    },
  }
  return response
}

function harness() {
  const store = createInMemoryPlanCommercialStore()
  const audits = createInMemoryAdminAuditStore()
  const service = createPlanCommercialControlService({
    audits,
    hasAdmin: async (userId) => userId === ADMIN,
    now: () => '2026-09-23T12:00:00.000Z',
    store,
  })
  const controls = createPlanCommercialControlAdapter(service)
  return { audits, controls, service, store }
}

function planById(result, planId) {
  return result.plans.find((plan) => plan.plan_id === planId)
}

describe('BILL-6B2A plan commercial migration', () => {
  it('is local-only, fail-closed, and does not sell plans by default', () => {
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/enabled_for_sale boolean not null default false/)
    expect(sql).toMatch(/featured boolean not null default false/)
    expect(sql).toMatch(/featured = false/)
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/plan_commercial_controls_deny_all/)
    expect(sql).toMatch(/revoke all on table billing\.plan_commercial_controls from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.set_plan_commercial_availability\(uuid, text, boolean, integer\) to service_role/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(sql).not.toMatch(/alter table billing\.(usage_events|subscriptions|plan_entitlements)/i)
    expect(sql).not.toMatch(/stripe|sumup|checkout|webhook|proration/i)
    expect(sql).toMatch(/plan\.commercial\.changed/)
    expect(sql).toMatch(/'field', 'enabled_for_sale'/)
    expect(sql).toMatch(/'field', 'display_order'/)
    for (const major of preliminarySekMonthMajors) {
      expect(sql).toContain(`plan.prelim.sek.month.${String(major).padStart(2, '0')}`)
    }
    expect(sql.match(/plan\.prelim\.sek\.month\.\d{2}/g)).toHaveLength(28)
    const knownCheck = sql.slice(sql.indexOf('plan_commercial_plan_known'), sql.indexOf('plan_commercial_order_bounds'))
    expect(knownCheck).not.toContain('plan.free')
    expect(sql).not.toMatch(/insert into billing\.plan_commercial_controls[\s\S]{0,80}default/i)
  })
})

describe('BILL-6B2A plan commercial control', () => {
  afterEach(() => {
    setBillingAdminControlsForTests(undefined)
    setBillingAdminStoreUnavailableForTests(false)
    setSupabaseAuthVerifierForTests(null)
    delete globalThis.localStorage
  })

  it('lets an admin read 14 paid plans that are off and not final', async () => {
    const { service } = harness()
    const listed = await service.list(ADMIN)
    expect(listed.ok).toBe(true)
    expect(listed.plans).toHaveLength(14)
    expect(listed.plans.every((plan) => plan.enabled_for_sale === false)).toBe(true)
    expect(listed.plans.every((plan) => plan.quota_status === 'PRELIMINARY')).toBe(true)
    expect(listed.plans.map((plan) => plan.price_sek_minor)).toEqual(preliminarySekMonthMajors.map((major) => major * 100))
    expect(listed.plans.find((plan) => plan.price_sek_minor === 400).quotas).toEqual({
      ai_coach: 30,
      ai_eye: 40,
      body_scan: 4,
      food_scan: 10,
    })
    expect(listed.plans.find((plan) => plan.price_sek_minor === 9900).quotas).toEqual({
      ai_coach: 1500,
      ai_eye: 1500,
      body_scan: 150,
      food_scan: 400,
    })
    expect(listed.plans.some((plan) => plan.plan_id === 'plan.free')).toBe(false)
    expect(listed.plans.some((plan) => 'food_scan_requests' in plan || 'entitlements' in plan)).toBe(false)
  })

  it('enables and disables a paid plan and keeps that state in the server adapter', async () => {
    const { audits, service, store } = harness()
    const enabled = await service.setAvailability(ADMIN, {
      enabled_for_sale: true,
      expected_version: 0,
      plan_id: PLAN_4,
    })
    expect(planById(enabled, PLAN_4)).toMatchObject({
      enabled_for_sale: true,
      price_sek_minor: 400,
      version: 1,
    })
    const second = createPlanCommercialControlService({
      audits,
      hasAdmin: async (userId) => userId === ADMIN,
      store,
    })
    expect(planById(await second.list(ADMIN), PLAN_4).enabled_for_sale).toBe(true)
    const disabled = await second.setAvailability(ADMIN, {
      enabled_for_sale: false,
      expected_version: 1,
      plan_id: PLAN_4,
    })
    expect(planById(disabled, PLAN_4).enabled_for_sale).toBe(false)
    const audit = (await audits.list())[0]
    expect(audit).toMatchObject({
      action: 'plan.commercial.changed',
      admin_user_id: ADMIN,
      created_at: '2026-09-23T12:00:00.000Z',
      target_id: PLAN_4,
      target_type: 'plan_commercial',
    })
    expect(audit.after_safe).toMatchObject({
      enabled_for_sale: true,
      field: 'enabled_for_sale',
      plan_id: PLAN_4,
    })
    expect(JSON.stringify(audit)).not.toMatch(/Bearer|service_role|api_key/i)
  })

  it('moves display order only within the paid catalog', async () => {
    const { service } = harness()
    expect((await service.move(ADMIN, {
      direction: 'up',
      expected_version: 0,
      plan_id: PLAN_4,
    })).code).toBe('order_bound')
    expect((await service.move(ADMIN, {
      direction: 'down',
      expected_version: 0,
      plan_id: PLAN_99,
    })).code).toBe('order_bound')
    const moved = await service.move(ADMIN, {
      direction: 'down',
      expected_version: 0,
      plan_id: PLAN_4,
    })
    expect(moved.plans.map((plan) => plan.plan_id).slice(0, 2)).toEqual([PLAN_7, PLAN_4])
    expect(moved.plans.every((plan) => plan.enabled_for_sale === false)).toBe(true)
    expect((await service.move(ADMIN, {
      direction: 'up',
      expected_version: 1,
      plan_id: PLAN_7,
    })).code).toBe('order_bound')
    expect((await service.list(ADMIN)).plans.map((plan) => plan.plan_id).slice(0, 2)).toEqual([PLAN_7, PLAN_4])
  })

  it('denies ordinary users, anonymous callers, and client authority flags', async () => {
    const { controls, service, store } = harness()
    expect((await service.setAvailability(USER, {
      billing_admin: true,
      enabled_for_sale: true,
      expected_version: 0,
      isAdmin: true,
      localStorage: { billing_admin: true },
      plan_id: PLAN_4,
      role: 'admin',
    })).code).toBe('forbidden_admin')
    expect((await service.move(USER, {
      direction: 'down',
      expected_version: 0,
      plan_id: PLAN_99,
    })).code).toBe('forbidden_admin')
    expect((await service.list(null)).code).toBe('forbidden_admin')

    setBillingAdminControlsForTests(controls)
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'admin-token' ? { user: { id: ADMIN } } : { user: { id: USER } }
    ))
    const storedFlags = new Map()
    globalThis.localStorage = {
      getItem: (key) => storedFlags.get(key) || null,
      setItem: (key, value) => storedFlags.set(key, value),
    }
    globalThis.localStorage.setItem('billing_admin', 'true')
    globalThis.localStorage.setItem('isAdmin', 'true')
    const denied = createResponse()
    await handler(createRequest({
      body: {
        action: 'set_plan_availability',
        billing_admin: true,
        enabled_for_sale: true,
        expected_version: 0,
        isAdmin: true,
        localStorage: { billing_admin: true },
        plan_id: PLAN_4,
        role: 'admin',
      },
      method: 'POST',
    }), denied)
    expect(denied.statusCode).toBe(403)
    const anonymous = createResponse()
    await handler(createRequest({
      body: {
        action: 'set_plan_availability',
        enabled_for_sale: true,
        expected_version: 0,
        plan_id: PLAN_99,
      },
      method: 'POST',
      token: '',
    }), anonymous)
    expect(anonymous.statusCode).toBe(401)
    const queried = createResponse()
    await handler(createRequest({
      method: 'GET',
      query: { enabled_for_sale: 'true', plan_id: PLAN_4, price_sek_minor: '1' },
      token: 'admin-token',
    }), queried)
    expect(queried.statusCode).toBe(200)
    expect(queried.body.plans).toBeUndefined()
    expect((await service.list(ADMIN)).plans.every((plan) => plan.enabled_for_sale === false)).toBe(true)
    expect(store.failWrites).toBe(false)
  })

  it('rejects unknown plans, free plan edits, and price quota entitlement overrides', async () => {
    const { service } = harness()
    expect((await service.setAvailability(ADMIN, {
      enabled_for_sale: true,
      expected_version: 0,
      plan_id: 'plan.fake',
    })).code).toBe('unknown_plan')
    expect((await service.setAvailability(ADMIN, {
      enabled_for_sale: true,
      expected_version: 0,
      plan_id: 'plan.prelim.sek.month.03',
    })).code).toBe('unknown_plan')
    expect((await service.setAvailability(ADMIN, {
      enabled_for_sale: false,
      expected_version: 0,
      plan_id: 'plan.free',
    })).code).toBe('protected_plan')
    expect(getPlanById('plan.free')).toMatchObject({ active: true, price_minor: 0 })
    expect((await service.setAvailability(ADMIN, {
      enabled_for_sale: true,
      expected_version: 0,
      plan_id: PLAN_4,
      price_sek_minor: 1,
    })).code).toBe('price_immutable')
    expect((await service.setAvailability(ADMIN, {
      enabled_for_sale: true,
      expected_version: 0,
      food_scan_requests: 999999,
      plan_id: PLAN_99,
    })).code).toBe('quota_immutable')
    expect((await service.setAvailability(ADMIN, {
      enabled_for_sale: true,
      entitlements: { 'food.scan': { limit: 1 } },
      expected_version: 0,
      plan_id: PLAN_99,
    })).code).toBe('entitlement_immutable')
    expect((await service.setAvailability(ADMIN, {
      display_order: 14,
      enabled_for_sale: true,
      expected_version: 0,
      plan_id: PLAN_4,
    })).code).toBe('invalid_plan_control')
    const listed = await service.list(ADMIN)
    expect(listed.plans.every((plan) => plan.enabled_for_sale === false)).toBe(true)
    expect(planById(listed, PLAN_4).price_sek_minor).toBe(400)
    expect(planById(listed, PLAN_99).price_sek_minor).toBe(9900)
  })

  it('fails closed when the durable read or write fails', async () => {
    const { controls, service, store } = harness()
    store.failReads = true
    const unread = await service.list(ADMIN)
    expect(unread).toEqual({ code: 'PLAN_STATE_UNAVAILABLE', ok: false })
    expect(unread.plans).toBeUndefined()
    store.failReads = false
    store.failWrites = true
    const unwritten = await service.setAvailability(ADMIN, {
      enabled_for_sale: true,
      expected_version: 0,
      plan_id: PLAN_4,
    })
    expect(unwritten).toEqual({ code: 'PLAN_WRITE_FAILED', ok: false })
    store.failWrites = false
    expect((await service.list(ADMIN)).plans.every((plan) => plan.enabled_for_sale === false)).toBe(true)

    setBillingAdminControlsForTests(controls)
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: ADMIN } }))
    store.failWrites = true
    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'set_plan_availability',
        enabled_for_sale: true,
        expected_version: 0,
        plan_id: PLAN_99,
      },
      method: 'POST',
      token: 'admin-token',
    }), response)
    expect(response.statusCode).toBe(503)
    expect(response.body.ok).toBe(false)
    expect(response.body.plans).toBeUndefined()
    store.failWrites = false
    store.failReads = true
    const readFailed = createResponse()
    await handler(createRequest({
      method: 'GET',
      query: { resource: 'plan_commercial' },
      token: 'admin-token',
    }), readFailed)
    expect(readFailed.statusCode).toBe(503)
    expect(readFailed.body.plans).toBeUndefined()
  })

  it('keeps catalog price when a stored row tries to carry another price', () => {
    const rows = paidCommercialPlans().map((plan) => ({
      display_order: plan.display_order,
      enabled_for_sale: false,
      plan_id: plan.id,
      price_sek_minor: 1,
      version: 0,
    }))
    const presented = presentPlanCommercialState(rows)
    expect(presented.find((plan) => plan.plan_id === PLAN_4).price_sek_minor).toBe(400)
    expect(presentPlanCommercialState(rows.slice(0, 13))).toBeNull()
  })

  it('persists availability through the postgres control adapter', async () => {
    const rows = new Map()
    const calls = []
    const client = {
      schema(name) {
        if (name !== 'billing') throw new Error('unexpected_schema')
        return {
          async rpc(fn, args) {
            calls.push(fn)
            if (fn === 'has_billing_admin') return { data: args.p_user_id === ADMIN, error: null }
            if (fn === 'list_plan_commercial_controls') {
              if (args.p_actor_user_id !== ADMIN) return { data: null, error: { message: 'forbidden_admin' } }
              return {
                data: paidCommercialPlans().map((plan) => {
                  const row = rows.get(plan.id)
                  return {
                    display_order: row?.display_order || plan.display_order,
                    enabled_for_sale: row?.enabled_for_sale === true,
                    plan_id: plan.id,
                    version: row?.version || 0,
                  }
                }),
                error: null,
              }
            }
            if (fn === 'set_plan_commercial_availability') {
              if (args.p_plan_id !== PLAN_99) return { data: null, error: { message: 'unknown_plan' } }
              rows.set(PLAN_99, { display_order: 14, enabled_for_sale: true, version: 1 })
              return {
                data: paidCommercialPlans().map((plan) => ({
                  display_order: plan.display_order,
                  enabled_for_sale: plan.id === PLAN_99,
                  plan_id: plan.id,
                  version: plan.id === PLAN_99 ? 1 : 0,
                })),
                error: null,
              }
            }
            return { data: null, error: { message: 'PLAN_STATE_UNAVAILABLE' } }
          },
        }
      },
    }
    const first = createPostgresBillingControlAdapter({ client })
    expect(first.durable).toBe(true)
    const written = await first.setPlanAvailability(ADMIN, {
      enabled_for_sale: true,
      expected_version: 0,
      plan_id: PLAN_99,
    })
    expect(written.plans.find((plan) => plan.plan_id === PLAN_99).enabled_for_sale).toBe(true)
    const second = createPostgresBillingControlAdapter({ client })
    const listed = await second.listPlanCommercial(ADMIN)
    expect(listed.plans.find((plan) => plan.plan_id === PLAN_99)).toMatchObject({
      enabled_for_sale: true,
      price_sek_minor: 9900,
    })
    client.schema = () => ({
      async rpc() {
        return { data: null, error: { message: 'PLAN_STATE_UNAVAILABLE' } }
      },
    })
    const failed = await createPostgresBillingControlAdapter({ client }).listPlanCommercial(ADMIN)
    expect(failed).toEqual({ code: 'PLAN_STATE_UNAVAILABLE', ok: false })
    expect(calls).toContain('set_plan_commercial_availability')
    expect(calls).toContain('list_plan_commercial_controls')
  })
})

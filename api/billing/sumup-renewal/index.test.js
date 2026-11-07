import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBillingAdminService } from '../../../src/services/billing/adminService.js'
import { setBillingAdminServiceForTests } from '../../_shared/billing/admin.js'
import {
  createServerSumUpRenewalRpcCaller,
  runDueSumUpRenewal,
} from '../../_shared/billing/sumupRenewalRun.js'
import {
  instrumentFingerprint,
  SUMUP_INSTRUMENT_FINGERPRINT_RPC,
  SUMUP_RENEWAL_CLAIM_RPC,
  SUMUP_RENEWAL_FINISH_RPC,
  SUMUP_RENEWAL_RESERVE_RPC,
} from '../../_shared/billing/sumupRecurring.js'
import { handleSumUpRenewal as handler } from '../../_shared/billing/sumupRenewalHandler.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../../_shared/supabaseServer.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const ADMIN = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PLAN = 'plan.prelim.sek.month.04'
const TOKEN = '6878cb7f-6515-47bf-bdd9-1408d270fdce'
const FINGERPRINT = instrumentFingerprint(TOKEN)
const DUE_END = '2026-09-27T00:00:00.000Z'
const FUTURE_END = '2026-12-27T00:00:00.000Z'
const NOW = new Date('2026-11-07T00:00:00.000Z')
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

function request({ body = {}, method = 'POST', token = 'admin-token' } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    url: '/api/billing/sumup-renewal',
  }
}

function subscription(userId, periodEnd, status = 'ACTIVE') {
  return {
    cancel_at_period_end: false,
    current_period_end: periodEnd,
    pending_plan_change: null,
    pending_plan_id: null,
    plan_id: PLAN,
    provider: 'sumup',
    status,
    subscription_id: `sub-${userId.slice(0, 8)}`,
    user_id: userId,
  }
}

function renewalDatabase() {
  const rows = []
  const names = []
  const now = () => Date.now()
  function reject(code) {
    const error = new Error(code)
    error.code = code
    throw error
  }
  function rowFor(args) {
    const row = rows.find((item) => item.reference === args.p_checkout_reference)
    if (!row) reject('renewal_attempt_not_found')
    if (row.subscriptionId !== args.p_subscription_id || row.periodEnd !== args.p_period_end) reject('renewal_attempt_conflict')
    return row
  }
  function view(row, claimed, takeoverAllowed) {
    return {
      checkout_reference: row.reference,
      claimed,
      provider_checkout_ref: row.providerCheckoutRef,
      status: row.status,
      takeover_allowed: takeoverAllowed,
    }
  }
  return {
    names,
    call(name, args) {
      names.push(name)
      if (name === SUMUP_INSTRUMENT_FINGERPRINT_RPC) return FINGERPRINT
      if (name === SUMUP_RENEWAL_RESERVE_RPC) {
        const existing = rows.find((item) => item.reference === args.p_checkout_reference)
        if (existing) return { checkout_reference: existing.reference, inserted: false, status: existing.status }
        rows.push({
          periodEnd: args.p_period_end,
          providerCheckoutRef: '',
          reference: args.p_checkout_reference,
          status: 'reserved',
          subscriptionId: args.p_subscription_id,
          updatedAt: now(),
        })
        return { checkout_reference: args.p_checkout_reference, inserted: true, status: 'reserved' }
      }
      if (name === SUMUP_RENEWAL_CLAIM_RPC) {
        const row = rowFor(args)
        const ref = args.p_provider_checkout_ref || ''
        if (args.p_takeover === true && now() - row.updatedAt < 900000) return view(row, false, false)
        if (args.p_to_status === 'created') {
          if (['processing', 'succeeded', 'failed'].includes(row.status)) return view(row, false, false)
          if (row.status === 'created') return view(row, false, true)
          if (row.status !== 'reserved' || !ref) reject('illegal_renewal_transition')
          row.status = 'created'
          row.providerCheckoutRef = ref
          row.updatedAt = now()
          return view(row, true, true)
        }
        if (['processing', 'succeeded', 'failed', 'reserved'].includes(row.status)) return view(row, false, false)
        if (row.status !== 'created' || (ref && row.providerCheckoutRef !== ref)) reject('illegal_renewal_transition')
        row.status = 'processing'
        row.updatedAt = now()
        return view(row, true, true)
      }
      if (name === SUMUP_RENEWAL_FINISH_RPC) {
        const row = rowFor(args)
        if (row.status === args.p_status) return { checkout_reference: row.reference, status: row.status }
        if (row.status === 'succeeded' || row.status === 'failed') reject('renewal_attempt_conflict')
        row.status = args.p_status
        row.updatedAt = now()
        return { checkout_reference: row.reference, status: row.status }
      }
      reject('unexpected_rpc')
    },
  }
}

function billingClient(rows, database) {
  const queries = []
  return {
    queries,
    schema() {
      return {
        from(table) {
          const filters = []
          const api = {
            select() { return api },
            eq(column, value) {
              filters.push([column, value])
              return api
            },
            then(resolve, reject) {
              queries.push({ filters, table })
              const data = rows.filter((row) => filters.every(([column, value]) => row[column] === value))
              return Promise.resolve({ data, error: null }).then(resolve, reject)
            },
          }
          return api
        },
        async rpc(fn, args) {
          try {
            return { data: database.call(`billing.${fn}`, args), error: null }
          } catch (error) {
            return { data: null, error: { code: error.code, message: error.message } }
          }
        },
      }
    },
  }
}

function transport() {
  const checkouts = []
  let seq = 0
  const calls = { createCheckout: 0, processCheckout: 0 }
  const http = {
    calls,
    failProcess: false,
    async createCustomer() { return {} },
    async createCheckout(body) {
      calls.createCheckout += 1
      if (checkouts.some((row) => row.checkout_reference === body.checkout_reference)) {
        const error = new Error('exists')
        error.code = 'SUMUP_REFERENCE_EXISTS'
        throw error
      }
      seq += 1
      const row = {
        ...body,
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        status: 'PENDING',
      }
      checkouts.push(row)
      return { ...row }
    },
    async listCheckouts(reference) {
      return checkouts.filter((row) => row.checkout_reference === reference).map((row) => ({ ...row }))
    },
    async listPaymentInstruments() {
      return [{ token: TOKEN }]
    },
    async processCheckout(id) {
      calls.processCheckout += 1
      const row = checkouts.find((item) => item.id === id)
      if (http.failProcess) {
        if (row) row.status = 'PENDING'
        const error = new Error('timeout')
        error.code = 'SUMUP_TIMEOUT'
        throw error
      }
      if (row) row.status = 'PAID'
      return { id, status: 'PAID' }
    },
    async retrieveCheckout(id) {
      return checkouts.find((item) => item.id === id) || null
    },
  }
  return http
}

function lifecycle() {
  const events = new Set()
  return {
    events,
    async applyTrustedRenewal({ external_event_id }) {
      events.add(external_event_id)
      return {
        assignment: { plan_id: PLAN },
        subscription: { plan_id: PLAN, status: 'ACTIVE' },
      }
    },
  }
}

describe('POST /api/billing/sumup-renewal', () => {
  beforeEach(async () => {
    const service = createBillingAdminService()
    await service.bootstrapGrantForTests(ADMIN)
    setBillingAdminServiceForTests(service)
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'admin-token') return { user: { id: ADMIN } }
      if (token === 'user-token') return { user: { id: OTHER } }
      return { error: { message: 'invalid jwt' } }
    })
  })

  afterEach(() => {
    setBillingAdminServiceForTests(null)
    setSupabaseAuthVerifierForTests(null)
    clearSupabaseAdminClientForTests()
  })

  it('stays manual: no cron, and the user billing route does not renew', () => {
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8')
    const userRoute = readFileSync(join(root, 'api/billing/user/index.js'), 'utf8')
    const adminRoute = readFileSync(join(root, 'api/billing/admin/index.js'), 'utf8')
    const route = readFileSync(join(root, 'api/_shared/billing/sumupRenewalHandler.js'), 'utf8')
    expect(existsSync(join(root, 'api/billing/sumup-renewal/index.js'))).toBe(false)
    expect(vercel).not.toMatch(/crons/)
    expect(vercel).toMatch(/\/api\/billing\/sumup-renewal/)
    expect(userRoute).not.toMatch(/sumupRenewalRun|processDueRenewals|handleSumUpRenewal/)
    expect(adminRoute).toMatch(/__vk_route === 'sumup_renewal'/)
    expect(route).toMatch(/requireBillingAdmin/)
    expect(route).toMatch(/runDueSumUpRenewal/)
    expect(route).not.toMatch(/setInterval|cron/)
  })

  it('rejects anonymous and non-admin callers before reading a subscription', async () => {
    const database = renewalDatabase()
    const client = billingClient([subscription(ADMIN, DUE_END)], database)
    setSupabaseAdminClientForTests(client)
    const anonymous = response()
    await handler(request({ token: '' }), anonymous)
    expect(anonymous.statusCode).toBe(401)
    const denied = response()
    await handler(request({ token: 'user-token', body: { billing_admin: true, user_id: ADMIN } }), denied)
    expect(denied.statusCode).toBe(403)
    expect(denied.body.accessGranted).toBe(false)
    expect(client.queries).toEqual([])
    expect(database.names).toEqual([])
  })

  it('does not renew another user or a period that is still open', async () => {
    const database = renewalDatabase()
    const client = billingClient([
      subscription(ADMIN, FUTURE_END),
      subscription(OTHER, DUE_END),
    ], database)
    setSupabaseAdminClientForTests(client)
    const res = response()
    await handler(request({
      body: { amount: 12, current_period_end: DUE_END, subscription_id: 'sub-22222222', user_id: OTHER },
    }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body.error.code).toBe('RENEWAL_NOT_DUE')
    expect(client.queries[0].filters).toEqual([['user_id', ADMIN], ['provider', 'sumup']])
    expect(database.names).toEqual([])
  })
})

describe('runDueSumUpRenewal', () => {
  it('refuses renewal RPC names outside reservation, claim, finish, and fingerprint', async () => {
    let called = false
    const caller = createServerSumUpRenewalRpcCaller({
      client: {
        schema() {
          return {
            async rpc() {
              called = true
              return { data: null, error: null }
            },
          }
        },
      },
    })
    await expect(caller('billing.advance_period', {})).rejects.toMatchObject({ code: 'durable_operation_unavailable' })
    expect(called).toBe(false)
  })

  it('charges one due period once and does not charge an unclear checkout again', async () => {
    const database = renewalDatabase()
    const http = transport()
    http.failProcess = true
    const rows = [subscription(ADMIN, DUE_END)]
    const first = await runDueSumUpRenewal({
      client: billingClient(rows, database),
      env: ENV,
      lifecycle: lifecycle(),
      now: () => NOW,
      transport: http,
      userId: ADMIN,
    })
    expect(first.ok).toBe(true)
    expect(first.results[0]).toMatchObject({ charged: false, code: 'SUMUP_TIMEOUT', subscriptionId: rows[0].subscription_id })
    expect(http.calls).toEqual({ createCheckout: 1, processCheckout: 1 })
    expect(database.names).toEqual([
      SUMUP_INSTRUMENT_FINGERPRINT_RPC,
      SUMUP_RENEWAL_RESERVE_RPC,
      SUMUP_RENEWAL_CLAIM_RPC,
      SUMUP_RENEWAL_CLAIM_RPC,
    ])

    http.failProcess = false
    const second = await runDueSumUpRenewal({
      client: billingClient(rows, database),
      env: ENV,
      lifecycle: lifecycle(),
      now: () => NOW,
      transport: http,
      userId: ADMIN,
    })
    expect(second.results[0].code).toBe('RENEWAL_AMBIGUOUS')
    expect(http.calls.processCheckout).toBe(1)
    expect(http.calls.createCheckout).toBe(1)
  })

  it('books a settled due period through the existing renewal once', async () => {
    const database = renewalDatabase()
    const http = transport()
    const booked = lifecycle()
    const rows = [subscription(ADMIN, DUE_END)]
    const renewed = await runDueSumUpRenewal({
      client: billingClient(rows, database),
      env: ENV,
      lifecycle: booked,
      now: () => NOW,
      transport: http,
      userId: ADMIN,
    })
    expect(renewed.results[0]).toMatchObject({ charged: true, code: 'RENEWAL_SUCCEEDED' })
    const replay = await runDueSumUpRenewal({
      client: billingClient(rows, database),
      env: ENV,
      lifecycle: booked,
      now: () => NOW,
      transport: http,
      userId: ADMIN,
    })
    expect(replay.results[0].code).toBe('RENEWAL_SUCCEEDED')
    expect(http.calls).toEqual({ createCheckout: 1, processCheckout: 1 })
    expect(booked.events.size).toBe(1)
  })
})

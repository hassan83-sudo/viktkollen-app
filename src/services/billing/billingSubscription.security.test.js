import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import process from 'node:process'
import { setSupabaseAuthVerifierForTests } from '../../../api/_shared/verifySupabaseUser.js'
import handler from '../../../api/billing/subscription/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260921200000_billing_subscriptions.sql'), 'utf8')
const quotaSql = readFileSync(join(root, 'supabase/migrations/20260921180000_billing_plan_quota.sql'), 'utf8')
const usageSql = readFileSync(join(root, 'supabase/migrations/20260921121500_billing_usage_events.sql'), 'utf8')
const srcTree = readFileSync(join(root, 'src/services/supabaseClient.js'), 'utf8')
const envExample = readFileSync(join(root, '.env.example'), 'utf8')
const source = [
  readFileSync(join(root, 'src/services/billing/subscriptionService.js'), 'utf8'),
  readFileSync(join(root, 'src/services/billing/effectivePlan.js'), 'utf8'),
  readFileSync(join(root, 'api/billing/subscription/index.js'), 'utf8'),
  sql,
].join('\n')

function createRequest({ method = 'GET', query = {}, token = 'valid-token' } = {}) {
  return {
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
    json: vi.fn((body) => {
      response.body = body
      return response
    }),
    setHeader: vi.fn((name, value) => {
      response.headers[name] = value
    }),
    status: vi.fn((statusCode) => {
      response.statusCode = statusCode
      return response
    }),
  }
  return response
}

describe('BILL-3 subscription migration static security', () => {
  it('is local-only and has no payment credential columns', () => {
    const ddl = sql.replace(/--[^\n]*/g, '').replace(/comment on[\s\S]*?;/gi, '')
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(ddl).not.toMatch(/stripe|sumup|klarna|paypal|swish|iap|checkout|refund|proration|cvv|card_number/i)
    expect(ddl).not.toMatch(/\bprompt\b/)
    expect(ddl).not.toMatch(/\bpassword\b/)
    expect(sql).not.toMatch(/alter table billing\.usage_events/i)
    expect(sql).not.toMatch(/alter table billing\.quota_reservations/i)
  })

  it('force-RLS denies clients and grants trusted writes only', () => {
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/using \(false\)/)
    expect(sql).toMatch(/with check \(false\)/)
    expect(sql).toMatch(/grant select, insert, update on table billing\.subscriptions to service_role/)
    expect(sql).toMatch(/revoke delete on table billing\.subscriptions/)
    expect(sql).not.toMatch(/grant (all|select|insert|update|delete).*authenticated/i)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
  })

  it('enforces period direction, one open row, and a DB state machine', () => {
    expect(sql).toMatch(/current_period_end > current_period_start/)
    expect(sql).toMatch(/subscriptions_one_open_per_user_uidx/)
    expect(sql).toMatch(/illegal subscription transition/)
    expect(sql).toMatch(/subscription identity and plan snapshot are immutable/)
    expect(sql).toMatch(/new subscription requires an active plan/)
    expect(sql).toMatch(/subscriptions_external_event_uidx/)
  })

  it('does not put service role on the Vite client env surface', () => {
    expect(srcTree).toMatch(/VITE_SUPABASE_ANON_KEY/)
    expect(srcTree).not.toMatch(/SERVICE_ROLE|serviceRole|service_role/)
    expect(envExample).not.toMatch(/VITE_SUPABASE_SERVICE_ROLE/)
    expect(source).not.toMatch(/sk_live|rk_live|whsec_/)
  })

  it('does not rewrite BILL-1 or BILL-2 history tables', () => {
    expect(usageSql).toMatch(/billing\.usage_events is append-only/)
    expect(quotaSql).toMatch(/terminal state is immutable/)
  })
})

describe('BILL-3 subscription API', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: '11111111-1111-4111-8111-111111111111' } }
        : { error: { message: 'invalid jwt' } }
    ))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setSupabaseAuthVerifierForTests(null)
  })

  it('blocks unauthenticated GET and non-GET mutation attempts', async () => {
    const unauth = createResponse()
    await handler(createRequest({ token: '' }), unauth)
    expect(unauth.statusCode).toBe(401)

    const post = createResponse()
    await handler(createRequest({ method: 'POST' }), post)
    expect(post.statusCode).toBe(405)
  })

  it('blocks reading another user via query user_id', async () => {
    const response = createResponse()
    await handler(createRequest({
      query: { user_id: '22222222-2222-4222-8222-222222222222' },
    }), response)
    expect(response.statusCode).toBe(403)
    expect(response.body.ok).toBe(false)
  })

  it('returns a client-safe snapshot for the JWT user', async () => {
    const response = createResponse()
    await handler(createRequest(), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.subscription.plan_id).toBe('plan.free')
    expect(JSON.stringify(response.body)).not.toMatch(/provider_customer_ref/)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import handler from './index.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../../_shared/supabaseServer.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function createRequest({
  method = 'GET',
  query = {},
  token = 'valid-token',
  url = '/api/billing/quota',
} = {}) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query,
    url,
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

async function call(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

describe('VERCEL-FN-2A user billing dispatcher', () => {
  beforeEach(() => {
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: USER } }
        : { error: { message: 'invalid jwt' } }
    ))
    clearSupabaseAdminClientForTests()
  })

  afterEach(() => {
    setSupabaseAuthVerifierForTests(null)
    clearSupabaseAdminClientForTests()
  })

  it('preserves GET /api/billing/quota for the JWT user', async () => {
    const response = await call(createRequest({
      query: { feature: 'food.scan', isAdmin: true, user_id: OTHER },
      url: '/api/billing/quota',
    }))
    expect(response.statusCode).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.quota).toBeTruthy()
    expect(response.body).not.toHaveProperty('subscription')
    expect(response.body).not.toHaveProperty('entitlement')
  })

  it('preserves GET /api/billing/subscription for the JWT user', async () => {
    const response = await call(createRequest({ url: '/api/billing/subscription' }))
    expect(response.statusCode).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.subscription.plan_id).toBe('plan.free')
    expect(response.body).not.toHaveProperty('entitlement')
  })

  it('keeps GET /api/entitlements as a non-authoritative compatibility response', async () => {
    const from = vi.fn()
    setSupabaseAdminClientForTests({ from })
    const response = await call(createRequest({
      query: { plan: 'premium', user_id: OTHER },
      url: '/api/entitlements',
    }))
    expect(response.statusCode).toBe(200)
    expect(response.body.authority).toBe('none')
    expect(response.body.compatibility).toBe(true)
    expect(response.body.verification).toBe('legacy_compatibility_not_authority')
    expect(response.body.entitlement.plan).toBe('free')
    expect(response.body.entitlement.userId).toBe(USER)
    expect(from).not.toHaveBeenCalled()
  })

  it('blocks anonymous callers on all three public paths', async () => {
    for (const url of ['/api/billing/quota', '/api/billing/subscription', '/api/entitlements']) {
      const response = await call(createRequest({ token: '', url }))
      expect(response.statusCode).toBe(401)
      expect(response.body.ok).toBe(false)
    }
  })

  it('blocks cross-user subscription spoof', async () => {
    const response = await call(createRequest({
      query: { user_id: OTHER },
      url: '/api/billing/subscription',
    }))
    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN_USER')
  })

  it('returns 404 for unknown dispatcher paths and client-controlled ops', async () => {
    const unknown = await call(createRequest({ url: '/api/billing/user' }))
    expect(unknown.statusCode).toBe(404)
    const spoofOp = await call(createRequest({
      query: { op: 'quota', __vk_route: 'quota' },
      url: '/api/billing/admin',
    }))
    expect(spoofOp.statusCode).toBe(404)
    const adminViaUser = await call(createRequest({
      query: { __vk_route: 'admin' },
      url: '/api/billing/user',
    }))
    expect(adminViaUser.statusCode).toBe(404)
  })

  it('returns 405 for non-GET on known paths', async () => {
    const response = await call(createRequest({ method: 'POST', url: '/api/billing/quota' }))
    expect(response.statusCode).toBe(405)
  })

  it('accepts rewrite destination /api/billing/user?__vk_route=quota', async () => {
    const response = await call(createRequest({
      query: { __vk_route: 'quota', feature: 'food.scan' },
      url: '/api/billing/user',
    }))
    expect(response.statusCode).toBe(200)
    expect(response.body.quota).toBeTruthy()
  })

  it('counts 11 deployable serverless entrypoints', () => {
    const entrypoints = [
      'api/account-deletion/index.js',
      'api/adaptive-coach/index.js',
      'api/ai-ear/interpret/index.js',
      'api/ai/index.js',
      'api/analysis-consent/index.js',
      'api/billing/admin/index.js',
      'api/billing/user/index.js',
      'api/body-analysis/index.js',
      'api/forgotten-items-analysis/index.js',
      'api/meal-analysis/index.js',
      'api/nutrition-photo-analysis/index.js',
    ]
    expect(entrypoints.every((file) => existsSync(join(root, file)))).toBe(true)
    expect(entrypoints).toHaveLength(11)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from '../billing/user/index.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../_shared/supabaseServer.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

function createRequest({ method = 'GET', token = 'valid-token', url = '/api/entitlements' } = {}) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
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

function createEntitlementClient(row, error = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row, error })),
        })),
      })),
    })),
  }
}

async function callRoute(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

describe('entitlements API route', () => {
  beforeEach(() => {
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: 'user-a' } }
        : { error: { message: 'invalid jwt' } }
    ))
    clearSupabaseAdminClientForTests()
  })

  afterEach(() => {
    setSupabaseAuthVerifierForTests(null)
    clearSupabaseAdminClientForTests()
  })

  it('requires auth and never reads the legacy entitlements table', async () => {
    const client = createEntitlementClient(null)
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ token: '' }))

    expect(response.statusCode).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
    expect(client.from).not.toHaveBeenCalled()
  })

  it('returns a free compatibility snapshot and does not query public.user_entitlements', async () => {
    const client = createEntitlementClient({
      current_period_end: '2099-01-01T00:00:00.000Z',
      plan: 'premium',
      status: 'active',
      user_id: 'user-a',
    })
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ url: '/api/entitlements?plan=premium' }))

    expect(response.statusCode).toBe(200)
    expect(response.body.authority).toBe('none')
    expect(response.body.compatibility).toBe(true)
    expect(response.body.verification).toBe('legacy_compatibility_not_authority')
    expect(response.body.entitlement.plan).toBe('free')
    expect(response.body.entitlement.status).not.toBe('active')
    expect(response.body.entitlement.userId).toBe('user-a')
    expect(client.from).not.toHaveBeenCalled()
  })
})

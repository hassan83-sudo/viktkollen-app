import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../_shared/supabaseServer.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

function createRequest({ method = 'GET', token = 'valid-token' } = {}) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
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

  it('requires auth and never reads entitlements without a session', async () => {
    const client = createEntitlementClient(null)
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ token: '' }))

    expect(response.statusCode).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
    expect(client.from).not.toHaveBeenCalled()
  })

  it('falls back to free when the entitlement row is missing', async () => {
    setSupabaseAdminClientForTests(createEntitlementClient(null))
    const response = await callRoute(createRequest())

    expect(response.statusCode).toBe(200)
    expect(response.body.entitlement.plan).toBe('free')
    expect(response.body.entitlement.userId).toBe('user-a')
    expect(response.body.verification).toBe('missing_row_default_free')
  })

  it('returns active premium from the server-owned row', async () => {
    setSupabaseAdminClientForTests(createEntitlementClient({
      current_period_end: '2099-01-01T00:00:00.000Z',
      current_period_start: '2026-08-01T00:00:00.000Z',
      plan: 'premium',
      provider: 'manual',
      provider_subscription_id: 'sub_test',
      status: 'active',
      user_id: 'user-a',
    }))
    const response = await callRoute(createRequest())

    expect(response.body.entitlement).toMatchObject({
      plan: 'premium',
      provider: 'manual',
      status: 'active',
      userId: 'user-a',
    })
  })

  it('returns active trial from the server-owned row', async () => {
    setSupabaseAdminClientForTests(createEntitlementClient({
      current_period_end: '2099-01-01T00:00:00.000Z',
      current_period_start: '2026-08-01T00:00:00.000Z',
      plan: 'trial',
      provider: 'manual',
      status: 'trialing',
      user_id: 'user-a',
    }))
    const response = await callRoute(createRequest())

    expect(response.body.entitlement).toMatchObject({
      plan: 'trial',
      status: 'trialing',
      userId: 'user-a',
    })
  })

  it('keeps canceled paid access until the current period ends', async () => {
    setSupabaseAdminClientForTests(createEntitlementClient({
      cancel_at_period_end: true,
      current_period_end: '2099-01-01T00:00:00.000Z',
      plan: 'premium',
      status: 'canceled',
      user_id: 'user-a',
    }))
    const response = await callRoute(createRequest())

    expect(response.body.entitlement.plan).toBe('premium')
    expect(response.body.entitlement.status).toBe('canceled')
  })

  it('downgrades expired premium to free', async () => {
    setSupabaseAdminClientForTests(createEntitlementClient({
      current_period_end: '2020-01-01T00:00:00.000Z',
      plan: 'premium',
      status: 'active',
      user_id: 'user-a',
    }))
    const response = await callRoute(createRequest())

    expect(response.body.entitlement.plan).toBe('free')
  })

  it('returns safe free when the DB read fails or row is malformed', async () => {
    setSupabaseAdminClientForTests(createEntitlementClient(null, { code: 'PGRST500' }))
    const dbFailure = await callRoute(createRequest())

    setSupabaseAdminClientForTests(createEntitlementClient({
      plan: 'premium-plus',
      status: 'super-active',
      user_id: 'user-a',
    }))
    const malformed = await callRoute(createRequest())

    expect(dbFailure.statusCode).toBe(200)
    expect(dbFailure.body.entitlement.plan).toBe('free')
    expect(dbFailure.body.verification).toBe('read_failed_safe_free')
    expect(malformed.body.entitlement.plan).toBe('free')
  })
})

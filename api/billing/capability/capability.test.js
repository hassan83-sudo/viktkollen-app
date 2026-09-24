import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../user/index.js'
import adminHandler from '../admin/index.js'
import {
  getBillingAdminService,
  setBillingAdminServiceForTests,
} from '../../_shared/billing/admin.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'
import { createBillingAdminService } from '../../../src/services/billing/adminService.js'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

function createRequest({ body = {}, method = 'GET', query = {}, token = 'user-token', url = '/api/billing/capability' } = {}) {
  return {
    body,
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

describe('GET /api/billing/capability', () => {
  beforeEach(async () => {
    const service = createBillingAdminService()
    await service.bootstrapGrantForTests(ADMIN)
    setBillingAdminServiceForTests(service)
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'admin-token') return { user: { id: ADMIN } }
      if (token === 'user-token') return { user: { id: USER } }
      return { error: { message: 'invalid jwt' } }
    })
  })

  afterEach(() => {
    setBillingAdminServiceForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('returns billing_admin false for a normal user without a 403', async () => {
    const response = createResponse()
    await handler(createRequest({
      query: { billing_admin: 'true', isAdmin: 'true', role: 'admin' },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({ billing_admin: false, ok: true })
    expect(JSON.stringify(response.body)).not.toMatch(/service_role|admin_permissions|22222222|audit/)
  })

  it('returns billing_admin true for a verified billing admin without admin data', async () => {
    const response = createResponse()
    await handler(createRequest({ token: 'admin-token' }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.billing_admin).toBe(true)
    expect(response.body.plans).toBeUndefined()
    expect(response.body.session).toBeUndefined()
  })

  it('still blocks a normal user from admin reads and mutations', async () => {
    const read = createResponse()
    await adminHandler(createRequest({
      query: { resource: 'plan_commercial' },
      url: '/api/billing/admin',
    }), read)
    expect(read.statusCode).toBe(403)
    expect(read.body.plans).toBeUndefined()

    const write = createResponse()
    await adminHandler(createRequest({
      body: {
        action: 'set_plan_availability',
        enabled_for_sale: true,
        expected_version: 0,
        plan_id: 'plan.prelim.sek.month.04',
      },
      method: 'POST',
      url: '/api/billing/admin',
    }), write)
    expect(write.statusCode).toBe(403)
    expect(await getBillingAdminService().hasBillingAdmin(USER)).toBe(false)
  })
})

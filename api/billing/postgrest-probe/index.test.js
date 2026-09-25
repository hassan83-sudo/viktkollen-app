import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import handler, { probeBillingPostgrest } from './index.js'
import { createBillingAdminService } from '../../../src/services/billing/adminService.js'
import { setBillingAdminServiceForTests } from '../../_shared/billing/admin.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../../_shared/supabaseServer.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

function createRequest({ method = 'POST', token = 'admin-token' } = {}) {
  return {
    body: '{}',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
  }
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json: (body) => {
      response.body = body
      return response
    },
    setHeader: (name, value) => {
      response.headers[name] = value
    },
    status(statusCode) {
      response.statusCode = statusCode
      return response
    },
  }
  return response
}

function createBillingClient({ error = null, row = { feature_id: 'food.scan' } } = {}) {
  const calls = []
  const client = {
    calls,
    schema(name) {
      calls.push(['schema', name])
      return client
    },
    from(table) {
      calls.push(['from', table])
      return client
    },
    select(columns) {
      calls.push(['select', columns])
      return client
    },
    limit(count) {
      calls.push(['limit', count])
      return Promise.resolve({ data: error ? null : [row], error })
    },
    insert() {
      throw new Error('insert')
    },
    update() {
      throw new Error('update')
    },
    delete() {
      throw new Error('delete')
    },
    upsert() {
      throw new Error('upsert')
    },
    rpc() {
      throw new Error('rpc')
    },
  }
  return client
}

describe('billing postgrest probe', () => {
  const originalEnv = { ...process.env }

  beforeEach(async () => {
    process.env = { ...originalEnv }
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    const service = createBillingAdminService()
    await service.bootstrapGrantForTests(ADMIN)
    setBillingAdminServiceForTests(service)
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'admin-token') return { user: { id: ADMIN } }
      if (token === 'user-token') return { user: { id: USER } }
      return { error: { message: 'invalid jwt' } }
    })
    clearSupabaseAdminClientForTests()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setBillingAdminServiceForTests(null)
    setSupabaseAuthVerifierForTests(null)
    clearSupabaseAdminClientForTests()
  })

  it('fails closed when the server-side service role client is missing', async () => {
    const response = createResponse()
    await handler(createRequest(), response)
    expect(response.statusCode).toBe(503)
    expect(response.body).toEqual({ code: 'SERVICE_ROLE_UNAVAILABLE', ok: false })
  })

  it('reports a successful select without returning rows', async () => {
    const client = createBillingClient()
    setSupabaseAdminClientForTests(client)
    const response = createResponse()
    await handler(createRequest(), response)
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ billingPostgrestReachable: true, ok: true })
    expect(JSON.stringify(response.body)).not.toMatch(/food\.scan|feature_id/)
    expect(client.calls).toEqual([
      ['schema', 'billing'],
      ['from', 'feature_controls'],
      ['select', 'feature_id'],
      ['limit', 1],
    ])
  })

  it('reports a postgrest error without leaking the message', async () => {
    const client = createBillingClient({
      error: { code: 'PGRST106', message: 'schema must be one of the following: public eyJsecret' },
    })
    setSupabaseAdminClientForTests(client)
    const response = createResponse()
    await handler(createRequest(), response)
    expect(response.statusCode).toBe(502)
    expect(response.body).toEqual({
      billingPostgrestReachable: false,
      code: 'SCHEMA_NOT_EXPOSED',
      ok: false,
    })
    expect(JSON.stringify(response.body)).not.toMatch(/eyJsecret|schema must be/)
  })

  it('denies callers who are not billing admins and does not query', async () => {
    const client = createBillingClient()
    setSupabaseAdminClientForTests(client)
    const anon = createResponse()
    await handler(createRequest({ token: '' }), anon)
    const user = createResponse()
    await handler(createRequest({ token: 'user-token' }), user)
    expect(anon.statusCode).toBe(401)
    expect(anon.body.ok).toBe(false)
    expect(user.statusCode).toBe(403)
    expect(user.body.ok).toBe(false)
    expect(client.calls).toEqual([])
  })

  it('uses only select on the billing schema', async () => {
    const client = createBillingClient({ error: { code: '42501', message: 'permission denied for secret-key' } })
    const result = await probeBillingPostgrest(client)
    expect(result).toEqual({
      billingPostgrestReachable: false,
      code: 'PERMISSION_DENIED',
      ok: false,
    })
    expect(JSON.stringify(result)).not.toMatch(/secret-key/)
    expect(client.calls.some((call) => ['insert', 'update', 'delete', 'upsert', 'rpc'].includes(call[0]))).toBe(false)
  })
})

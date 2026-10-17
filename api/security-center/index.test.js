import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { setBillingAdminControlsForTests } from '../_shared/billing/admin.js'
import { setSupabaseAdminClientForTests, clearSupabaseAdminClientForTests } from '../_shared/supabaseServer.js'

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}
afterEach(() => {
  setSupabaseAuthVerifierForTests(null)
  setBillingAdminControlsForTests(undefined)
  clearSupabaseAdminClientForTests()
})
describe('GET /api/security-center', () => {
  it('rejects anonymous requests without querying the store', async () => {
    const rpc = vi.fn()
    setSupabaseAdminClientForTests({ rpc })
    const res = response()
    await handler({ method: 'GET', headers: {} }, res)
    expect(res.statusCode).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects authenticated non-admin users', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'ordinary-user' } }))
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => false })
    const res = response()
    await handler({ method: 'GET', headers: { authorization: 'Bearer fake-test-token' } }, res)
    expect(res.statusCode).toBe(403)
  })
  it('returns stored events for authorized admins only', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'admin-user' } }))
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => true })
    const rpc = vi.fn(async () => ({ data: [{ id: 1, type: 'API_RATE_LIMITED' }], error: null }))
    setSupabaseAdminClientForTests({ rpc })
    const res = response()
    await handler({ method: 'GET', headers: { authorization: 'Bearer fake-test-token' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.events).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('security_center_recent_events', { p_limit: 50 })
  })
  it('rejects unsupported methods before checking admin privileges', async () => {
    const rpc = vi.fn()
    setSupabaseAdminClientForTests({ rpc })
    const res = response()
    await handler({ method: 'POST', headers: {} }, res)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('fails closed when the database client lacks an RPC method', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'admin-user' } }))
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => true })
    setSupabaseAdminClientForTests({})
    const res = response()
    await handler({ method: 'GET', headers: { authorization: 'Bearer fake-test-token' } }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body.ok).toBe(false)
  })
  it('reports store errors instead of claiming zero incidents', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'admin-user' } }))
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => true })
    setSupabaseAdminClientForTests({ rpc: async () => ({ data: null, error: new Error('unavailable') }) })
    const res = response()
    await handler({ method: 'GET', headers: { authorization: 'Bearer fake-test-token' } }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body.ok).toBe(false)
  })
})

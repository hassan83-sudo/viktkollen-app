import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './supportHandler.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { requireBillingAdmin } from '../billing/admin.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
vi.mock('../verifySupabaseUser.js', () => ({ verifySupabaseUser: vi.fn() }))
vi.mock('../billing/admin.js', () => ({ requireBillingAdmin: vi.fn() }))
vi.mock('../supabaseServer.js', () => ({ createSupabaseAdminClient: vi.fn() }))
const rpc = vi.fn()
const response = () => ({ setHeader: vi.fn(), status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
beforeEach(() => {
  vi.resetAllMocks()
  verifySupabaseUser.mockResolvedValue({ authenticated: true, user: { id: 'real-user' } })
  requireBillingAdmin.mockResolvedValue({ ok: false, status: 403, error: { code: 'FORBIDDEN' } })
  createSupabaseAdminClient.mockReturnValue({ schema: () => ({ rpc }) })
  rpc.mockResolvedValue({ data: { ok: true, eligible: false, tickets: [] } })
})
describe('support API', () => {
  it('uses the authenticated identity and discards spoofed plan and admin claims', async () => {
    const res = response()
    await handler({ method: 'POST', body: { action: 'create', requestId: '10000000-0000-4000-8000-000000000001', message: 'help', category: 'billing', user_id: 'victim', premium: true, isAdmin: true } }, res)
    expect(rpc).toHaveBeenCalledWith('customer_command', expect.objectContaining({ p_actor: 'real-user' }))
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/victim|premium|isAdmin/)
  })
  it('rejects non-admin queue reads and writes, including URL query dispatch', async () => {
    for (const method of ['GET','POST']) {
      const res = response()
      await handler({ method, url: '/api/ai?__vk_route=support&resource=admin', body: { action: 'update' } }, res)
      expect(res.statusCode).toBe(403)
    }
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects logged-out and malformed requests without touching storage', async () => {
    verifySupabaseUser.mockResolvedValueOnce({ authenticated: false, status: 401 })
    const first = response()
    await handler({ method: 'GET' }, first)
    expect(first.statusCode).toBe(401)
    for (const body of ['null','[]','{bad',JSON.stringify({ action: 'create', message: 'x'.repeat(6001) })]) {
      const res = response()
      await handler({ method: 'POST', body }, res)
      expect([400,413]).toContain(res.statusCode)
    }
    expect(rpc).not.toHaveBeenCalled()
  })
  it('fails closed for unavailable storage and ineligible free accounts', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, code: 'PAID_SUPPORT_REQUIRED' } })
    const res = response()
    await handler({ method: 'GET' }, res)
    expect(res.statusCode).toBe(403)
    createSupabaseAdminClient.mockReturnValueOnce(null)
    const unavailable = response()
    await handler({ method: 'GET' }, unavailable)
    expect(unavailable.statusCode).toBe(503)
  })
})

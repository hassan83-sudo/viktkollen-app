import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queueSecurityEvent, recordSecurityEvent, setSecurityWaitUntilForTests } from './securityEventStore.js'
import { resetSecurityGuardForTests } from './securityGuard.js'
import { sendSafeAiError } from '../aiRouteErrors.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../supabaseServer.js'

describe('security event persistence', () => {
  beforeEach(() => {
    resetSecurityGuardForTests()
  })

  it('writes only trusted classified fields', async () => {
    const rpc = vi.fn(async () => ({ data: 7, error: null }))
    const client = { rpc }
    expect(await recordSecurityEvent({ type: 'API_RATE_LIMITED', severity: 'critical', feature: 'food-scan', password: 'private' }, { client })).toBe(true)
    expect(client.rpc).toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('security_center_record_event', {
      p_type: 'API_RATE_LIMITED', p_severity: 'medium', p_feature: 'food-scan',
    })
  })
  it('rejects unsupported events and unavailable database', async () => {
    const rpc = vi.fn()
    const client = { rpc }
    expect(await recordSecurityEvent({ type: 'UNKNOWN' }, { client })).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(await recordSecurityEvent({ type: 'API_RATE_LIMITED' }, { client: null })).toBe(false)
  })

  it('hands the write to waitUntil so Vercel keeps the function alive until it is stored', async () => {
    const waitUntil = vi.fn()
    setSecurityWaitUntilForTests(waitUntil)
    let finish
    const rpc = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    const pending = queueSecurityEvent({ type: 'API_RATE_LIMITED', feature: 'api' }, { client: { rpc } })
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(waitUntil.mock.calls[0][0]).toBe(pending)
    finish({ data: 3, error: null })
    expect(await pending).toBe(true)
    setSecurityWaitUntilForTests(null)
  })

  it('never throws when storage or waitUntil fails', async () => {
    setSecurityWaitUntilForTests(() => { throw new Error('no request context') })
    const pending = queueSecurityEvent({ type: 'API_RATE_LIMITED', feature: 'api' }, { client: { rpc: async () => { throw new Error('down') } } })
    expect(await pending).toBe(false)
    setSecurityWaitUntilForTests(null)
  })

  it('a 429 from any API route is stored through waitUntil, without request content', async () => {
    const waitUntil = vi.fn()
    setSecurityWaitUntilForTests(waitUntil)
    const rpc = vi.fn(async () => ({ data: 9, error: null }))
    setSupabaseAdminClientForTests({ rpc })
    const response = { headers: {}, setHeader() {}, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
    sendSafeAiError(response, { code: 'RATE_LIMITED', requestId: 'r-1', status: 429 })
    expect(response.statusCode).toBe(429)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(await waitUntil.mock.calls[0][0]).toBe(true)
    expect(rpc).toHaveBeenCalledWith('security_center_record_event', { p_type: 'API_RATE_LIMITED', p_severity: 'medium', p_feature: 'api' })

    waitUntil.mockClear()
    sendSafeAiError(response, { code: 'AUTH_REQUIRED', requestId: 'r-2', status: 401 })
    expect(waitUntil).not.toHaveBeenCalled()
    setSecurityWaitUntilForTests(null)
    clearSupabaseAdminClientForTests()
  })
})

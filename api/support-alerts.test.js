import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const update = vi.fn()
vi.mock('./_shared/supabaseServer.js', () => ({
  createSupabaseAdminClient: () => ({
    schema: () => ({
      rpc,
      from: () => ({
        update: (...args) => {
          update(...args)
          return {
            eq: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          }
        },
      }),
    }),
  }),
}))
import handler from './support-alerts.js'

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
  }
}
const request = (authorization, method = 'GET') => ({ method, headers: { authorization } })
const ticket = { ticket_id: '10000000-0000-4000-8000-000000000001', ticket_version: 2 }

describe('support scheduled email alerts', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
    vi.stubEnv('SUPPORT_ALERT_TO', 'admin@example.test')
    vi.stubEnv('SUPPORT_ALERT_FROM', 'alerts@example.test')
    rpc.mockReset()
    update.mockReset()
    rpc.mockResolvedValue({ data: [], error: null })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('denies missing or incorrect scheduler authorization without database access', async () => {
    for (const auth of [undefined, 'Bearer wrong']) {
      const res = response()
      await handler(request(auth), res)
      expect(res.statusCode).toBe(401)
    }
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects methods other than GET', async () => {
    const res = response()
    await handler(request('Bearer test-cron-secret', 'POST'), res)
    expect(res.statusCode).toBe(405)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not claim tickets when email delivery is unconfigured', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const res = response()
    await handler(request('Bearer test-cron-secret'), res)
    expect(res.statusCode).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('sends only generic content and uses a stable provider idempotency key', async () => {
    rpc.mockResolvedValue({ data: [ticket], error: null })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const res = response()
    await handler(request('Bearer test-cron-secret'), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ sent: 1, failed: 0 })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options.headers['Idempotency-Key']).toBe(`support-${ticket.ticket_id}-${ticket.ticket_version}`)
    expect(JSON.stringify(options.body)).not.toContain(ticket.ticket_id)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: 'sent' }))
  })
  it('records provider failure and returns 503 for retry monitoring', async () => {
    rpc.mockResolvedValue({ data: [ticket], error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const res = response()
    await handler(request('Bearer test-cron-secret'), res)
    expect(res.statusCode).toBe(503)
    expect(res.body).toMatchObject({ sent: 0, failed: 1 })
    expect(update).toHaveBeenCalledWith({ state: 'failed' })
  })
})

import { describe, expect, it } from 'vitest'
import handler, { resolveUserBillingOperation } from './index.js'

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

describe('SumUp Live diagnostic access', () => {
  it('is only selected by the existing internal route and never by arbitrary query op', () => {
    expect(resolveUserBillingOperation({ url: '/api/billing/user', query: { __vk_route: 'sumup_live_check' } })).toBe('sumup_live_check')
    expect(resolveUserBillingOperation({ url: '/api/billing/user', query: { op: 'sumup_live_check' } })).toBeNull()
    expect(resolveUserBillingOperation({ url: '/api/billing/plans', query: { __vk_route: 'sumup_live_check' } })).toBe('plans')
  })

  it('rejects unauthenticated diagnostic calls before reading SumUp credentials', async () => {
    const res = response()
    await handler({ method: 'GET', url: '/api/billing/user', query: { __vk_route: 'sumup_live_check' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
    expect(res.body.ok).toBe(false)
    expect(JSON.stringify(res.body)).not.toMatch(/merchant_code|api_key|sandbox/i)
  })

  it('refuses methods other than GET', async () => {
    const res = response()
    await handler({ method: 'PUT', url: '/api/billing/user', query: { __vk_route: 'sumup_live_check' }, headers: {} }, res)
    expect(res.statusCode).toBe(405)
  })
})

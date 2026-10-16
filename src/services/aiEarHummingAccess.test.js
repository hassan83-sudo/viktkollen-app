import { afterEach, describe, expect, it, vi } from 'vitest'

const getCurrentAiAuthorization = vi.fn()
vi.mock('./ai/aiAuthTransport.js', () => ({ getCurrentAiAuthorization: (...args) => getCurrentAiAuthorization(...args) }))

const { loadAiEarHummingAccess } = await import('./aiEarHummingAccess.js')

const reply = (status, body) => vi.fn(async () => ({ json: async () => body, ok: status === 200, status }))

describe('Humma / sjung owner access', () => {
  afterEach(() => getCurrentAiAuthorization.mockReset())

  it('allows only a session the server confirms as billing admin', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ authorizationHeader: 'Bearer owner', ok: true })
    const fetchImpl = reply(200, { billing_admin: true, ok: true })
    expect(await loadAiEarHummingAccess({ fetchImpl })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith('/api/billing/capability', expect.objectContaining({ headers: { Authorization: 'Bearer owner' } }))
  })

  it('fails closed for an ordinary user, a server error, no session or a network error', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ authorizationHeader: 'Bearer user', ok: true })
    expect(await loadAiEarHummingAccess({ fetchImpl: reply(200, { billing_admin: false, ok: true }) })).toBe(false)
    expect(await loadAiEarHummingAccess({ fetchImpl: reply(500, { billing_admin: true }) })).toBe(false)
    expect(await loadAiEarHummingAccess({ fetchImpl: vi.fn(async () => { throw new Error('offline') }) })).toBe(false)
    getCurrentAiAuthorization.mockResolvedValue({ ok: false })
    const fetchImpl = reply(200, { billing_admin: true })
    expect(await loadAiEarHummingAccess({ fetchImpl })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

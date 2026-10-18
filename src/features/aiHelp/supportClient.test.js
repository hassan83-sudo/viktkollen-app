import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from '../../services/ai/aiAuthTransport.js'
import { requestSupport } from './supportClient.js'
vi.mock('../../services/ai/aiAuthTransport.js', () => ({ getCurrentAiAuthorization: vi.fn(), hasSameAiAuthUser: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })
describe('support client account boundaries', () => {
  it('never sends logged-out requests', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: false, errorCode: 'AUTH_REQUIRED' })
    vi.stubGlobal('fetch', vi.fn())
    expect(await requestSupport()).toEqual({ ok: false, code: 'AUTH_REQUIRED' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('discards tickets after the account changes during a request', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: true, userScope: 'old', authorizationHeader: 'Bearer old' })
    hasSameAiAuthUser.mockResolvedValue(false)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, tickets: [{ private: 'old account' }] }) })))
    expect(await requestSupport({ admin: true })).toEqual({ ok: false, code: 'AUTH_STALE' })
  })
})

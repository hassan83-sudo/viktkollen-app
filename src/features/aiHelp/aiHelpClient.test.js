import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from '../../services/ai/aiAuthTransport.js'
import { confirmScheduleCancel, requestAiHelpReply } from './aiHelpClient.js'

vi.mock('../../services/ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(),
  hasSameAiAuthUser: vi.fn(),
}))

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

describe('AI Help account boundaries', () => {
  it('discards a private reply after the signed-in account changes', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: true, userScope: 'first', authorizationHeader: 'Bearer first' })
    hasSameAiAuthUser.mockResolvedValue(false)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, answer: 'Private plan facts' }) })))
    expect(await requestAiHelpReply()).toEqual({ code: 'AUTH_STALE', ok: false })
  })

  it('never sends an old account cancellation using the new account token', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: true, userScope: 'second', authorizationHeader: 'Bearer second' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await confirmScheduleCancel('first')).toEqual({ code: 'AUTH_STALE', ok: false })
    expect(await confirmScheduleCancel()).toEqual({ code: 'AUTH_STALE', ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires login before requesting help or changing billing', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: false, errorCode: 'AUTH_REQUIRED' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await requestAiHelpReply()).code).toBe('AUTH_REQUIRED')
    expect((await confirmScheduleCancel('first')).code).toBe('AUTH_REQUIRED')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

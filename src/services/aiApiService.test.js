import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentAuthSession } from './authService.js'
import { requestAiEndpoint } from './aiApiService.js'

vi.mock('./authService.js', () => ({
  getCurrentAuthSession: vi.fn(),
}))

describe('aiApiService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses local fallback without calling the endpoint when auth is missing', async () => {
    getCurrentAuthSession.mockResolvedValue({ data: { session: null } })

    const result = await requestAiEndpoint({ action: 'daily-coach' })

    expect(result.ok).toBe(false)
    expect(result.skipped).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the current Supabase access token to the endpoint', async () => {
    getCurrentAuthSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token-a',
          user: { id: 'user-a' },
        },
      },
    })
    fetch.mockResolvedValue(new Response(JSON.stringify({
      source: 'mock',
      summary: 'Hej',
    }), { status: 200 }))

    const result = await requestAiEndpoint({ action: 'daily-coach' })

    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/api/ai', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer access-token-a',
      }),
    }))
  })

  it('does not send an old account payload under a new account session', async () => {
    getCurrentAuthSession.mockResolvedValue({ data: { session: { access_token: 'new-account-token', user: { id: 'B' } } } })
    const result = await requestAiEndpoint({ action: 'daily-coach', profile: { private: 'A' } }, { expectedUserScope: 'A' })
    expect(result.skipped).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not send if the originating request expires while auth is loading', async () => {
    let finish
    getCurrentAuthSession.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    let current = true
    const pending = requestAiEndpoint({ action: 'daily-coach' }, { expectedUserScope: 'A', isCurrent: () => current })
    current = false
    finish({ data: { session: { access_token: 'same-account-token', user: { id: 'A' } } } })
    expect((await pending).skipped).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
})

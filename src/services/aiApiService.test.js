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
})

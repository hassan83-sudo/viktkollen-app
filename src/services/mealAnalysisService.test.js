import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentAuthSession } from './authService.js'
import { analyzeMealPhoto } from './mealAnalysisService.js'

vi.mock('./authService.js', () => ({
  getCurrentAuthSession: vi.fn(),
}))

describe('mealAnalysisService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses local fallback without calling the endpoint when auth is missing', async () => {
    getCurrentAuthSession.mockResolvedValue({ data: { session: null } })

    const result = await analyzeMealPhoto({ image: 'data:image/png;base64,abc' })

    expect(result.source).toBe('mock')
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
      analysis: {
        calories: 400,
        foods: ['mat'],
        source: 'openai',
        summary: 'Måltid',
      },
      source: 'openai',
    }), { status: 200 }))

    const result = await analyzeMealPhoto({ image: 'data:image/png;base64,abc' })

    expect(result.source).toBe('openai')
    expect(fetch).toHaveBeenCalledWith('/api/meal-analysis', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer access-token-a',
      }),
    }))
  })
})

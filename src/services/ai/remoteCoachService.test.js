import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./aiAuthTransport.js', () => ({
  aiAuthErrorCode: {
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    AUTH_STALE: 'AUTH_STALE',
    AUTH_UNAVAILABLE: 'AUTH_UNAVAILABLE',
  },
  getAiAuthSafeMessage: (code) => code === 'AUTH_REQUIRED' ? 'Logga in för att använda remote AI.' : 'Authfel.',
  getCurrentAiAuthorization: vi.fn(async () => ({
    authorizationHeader: 'Bearer test-access-token',
    ok: true,
    userScope: 'user-a',
  })),
  hasSameAiAuthUser: vi.fn(async () => true),
}))

import {
  remoteCoachServiceInternals,
  requestRemoteCoachSuggestions,
} from './remoteCoachService.js'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from './aiAuthTransport.js'

describe('remoteCoachService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    remoteCoachServiceInternals.activeRequests.clear()
  })

  it('returns safe error on failed route and does not leak payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'aiNotConfigured', retryable: false },
      ok: false,
    }), { status: 503 })))

    const result = await requestRemoteCoachSuggestions({
      adaptiveCoachFeedback: {},
      meals: [],
      weights: [],
    }, { analysisDate: '2026-08-04', consent: true })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('aiNotConfigured')
    expect(JSON.stringify(result)).not.toMatch(/weights|meals|localStorage/)
    expect(fetch).toHaveBeenCalledWith('/api/adaptive-coach', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-access-token',
      }),
    }))
    expect(fetch.mock.calls[0][1].body).not.toContain('test-access-token')
  })

  it('deduplicates concurrent identical requests', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      coach: {
        generatedAt: '2026-08-04T12:00:00.000Z',
        recommendations: [],
        safetyNote: 'Ok',
        summary: 'Ok',
      },
      ok: true,
      providerType: 'openai',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    const input = { adaptiveCoachFeedback: {}, meals: [], weights: [] }
    const [first, second] = await Promise.all([
      requestRemoteCoachSuggestions(input, { analysisDate: '2026-08-04', consent: true }),
      requestRemoteCoachSuggestions(input, { analysisDate: '2026-08-04', consent: true }),
    ])

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
  })

  it('does not call the route when session is missing', async () => {
    getCurrentAiAuthorization.mockResolvedValueOnce({
      errorCode: 'AUTH_REQUIRED',
      ok: false,
      warning: 'Logga in för att använda remote AI.',
    })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    const result = await requestRemoteCoachSuggestions({}, { consent: true })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('AUTH_REQUIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/test-access-token|Bearer/)
  })

  it('ignores a response after user switch', async () => {
    hasSameAiAuthUser.mockResolvedValueOnce(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      coach: { generatedAt: '2026-08-04T12:00:00.000Z', recommendations: [], safetyNote: 'Ok', summary: 'Ok' },
      ok: true,
      providerType: 'openai',
    }), { status: 200 })))

    const result = await requestRemoteCoachSuggestions({}, { consent: true })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('AUTH_STALE')
  })
})

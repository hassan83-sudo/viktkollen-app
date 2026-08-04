import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  remoteCoachServiceInternals,
  requestRemoteCoachSuggestions,
} from './remoteCoachService.js'

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
})

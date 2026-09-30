import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentAiAuthorization } from '../../services/ai/aiAuthTransport.js'
import {
  coachModelRequestBody,
  requestCoachModelReply,
  resetCoachModelRequestForTests,
} from './coachModelClient.js'

vi.mock('../../services/ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(async () => ({
    authorizationHeader: 'Bearer test-token',
    ok: true,
  })),
}))

afterEach(() => {
  resetCoachModelRequestForTests()
  vi.unstubAllGlobals()
  getCurrentAiAuthorization.mockResolvedValue({
    authorizationHeader: 'Bearer test-token',
    ok: true,
  })
})

describe('coach model client', () => {
  it('sends only the filtered coach context and one request', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answer: 'Fokusera på protein till en måltid.',
        ok: true,
        source: 'openai',
        status: 'answered',
      }),
    }))
    vi.stubGlobal('fetch', fetchImpl)
    const body = coachModelRequestBody({
      context: {
        email: 'secret@example.com',
        protein: { grams: 35, mealCount: 2, status: 'logged' },
      },
      messages: [{ content: 'Utifrån min vecka, vad tycker du att jag ska fokusera på?', role: 'user' }],
      route: { entries: [{ id: 'coach.weekly-focus' }] },
    })
    expect(body.context.protein.grams).toBe(35)
    expect(JSON.stringify(body)).not.toMatch(/secret@example.com|userId|user_id/)

    const result = await requestCoachModelReply({
      context: body.context,
      messages: body.messages,
      route: { entries: [{ id: 'coach.weekly-focus' }] },
    })
    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/ai-coach')
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
  })

  it('does not retry a network failure or start a second request while one is running', async () => {
    let resolveFetch
    const fetchImpl = vi.fn(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))
    vi.stubGlobal('fetch', fetchImpl)
    const input = {
      context: { protein: { grams: 35, status: 'logged' } },
      messages: [{ content: 'Utifrån min vecka, vad tycker du att jag ska fokusera på?', role: 'user' }],
      route: { entries: [] },
    }
    const first = requestCoachModelReply(input)
    const second = await requestCoachModelReply(input)
    expect(second).toEqual({ code: 'REQUEST_IN_FLIGHT', ok: false })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    resolveFetch({ ok: false, json: async () => { throw new Error('bad') } })
    await expect(first).resolves.toMatchObject({ code: 'UNKNOWN_ERROR', ok: false })

    fetchImpl.mockRejectedValue(new Error('offline'))
    const failed = await requestCoachModelReply(input)
    expect(failed).toEqual({ code: 'PROVIDER_UNAVAILABLE', ok: false })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../_shared/aiCoach/httpHandler.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { hashAiHelpScope } from '../_shared/aiHelp/costGuard.js'
import { createTestCostStore } from '../_shared/aiHelp/sharedCostLedger.js'
import { setCoachCostStoreForTests } from '../_shared/aiCoach/service.js'

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json: (body) => {
      response.body = body
      return response
    },
    setHeader: (name, value) => {
      response.headers[name] = value
    },
    status(code) {
      response.statusCode = code
      return response
    },
  }
  return response
}

function modelBody(extra = {}) {
  return {
    context: {
      displayName: 'Ada',
      email: 'secret@example.com',
      payment: { card: '4111111111111111' },
      phone: '0700000000',
      protein: { grams: 35, mealCount: 2, status: 'logged', targetGrams: 90 },
      subscription: { plan: 'premium' },
    },
    messages: [{ content: 'Utifrån min vecka, vad tycker du att jag ska fokusera på?', role: 'user' }],
    userId: 'someone-else',
    ...extra,
  }
}

function providerSuccess() {
  return {
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        answer: 'Fokusera på protein till en måltid du redan äter.',
        knowledgeIds: ['coach.weekly-focus'],
        status: 'answered',
      }),
      usage: { input_tokens: 20, output_tokens: 12 },
    }),
  }
}

afterEach(() => {
  setSupabaseAuthVerifierForTests(null)
  setCoachCostStoreForTests(null)
  delete process.env.OPENAI_API_KEY
  delete process.env.AI_HELP_BUDGET_SEK
  vi.unstubAllGlobals()
})

describe('POST /api/ai-coach', () => {
  it('rejects anonymous requests and does not call the provider', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = createResponse()
    await handler({ body: modelBody(), headers: {}, method: 'POST' }, response)
    expect(response.statusCode).toBe(401)
    expect(response.body.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON with HTTP 400', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = createResponse()
    await handler({
      body: '{',
      headers: { authorization: 'Bearer token' },
      method: 'POST',
    }, response)
    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses the signed-in user, strips forbidden fields, and settles one mock call', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.AI_HELP_BUDGET_SEK = '10'
    const store = createTestCostStore()
    const hashes = []
    const reserve = store.reserve.bind(store)
    store.reserve = async (input) => {
      hashes.push(input.userHash)
      return reserve(input)
    }
    const settle = vi.spyOn(store, 'settle')
    setCoachCostStoreForTests(store)
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    const fetchImpl = vi.fn(async () => providerSuccess())
    vi.stubGlobal('fetch', fetchImpl)

    const response = createResponse()
    await handler({
      body: modelBody({
        messages: [
          { content: 'Hur ser mitt protein ut idag?', role: 'user' },
          { content: 'Registrerat protein är 35 g.', role: 'assistant' },
          { content: 'Utifrån min vecka, vad tycker du att jag ska fokusera på?', role: 'user' },
        ],
      }),
      headers: { authorization: 'Bearer token' },
      method: 'POST',
    }, response)

    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('openai')
    expect(response.body.answer).toMatch(/protein/)
    expect(JSON.stringify(response.body)).not.toMatch(/someone-else|signed-in-user|secret@example.com|Ada|4111|premium|0700000000/)
    expect(hashes).toEqual([hashAiHelpScope('signed-in-user')])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const providerBody = JSON.parse(fetchImpl.mock.calls[0][1].body)
    const packed = JSON.stringify(providerBody)
    expect(packed).not.toMatch(/secret@example.com|Ada|4111|premium|someone-else/)
    expect(packed).toContain('35')
    const assistant = providerBody.input.find((item) => item.role === 'assistant')
    expect(assistant.content[0].type).toBe('output_text')
    expect(assistant.content[0].annotations).toEqual([])
    expect(settle).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses')
  })

  it('does not call the provider when the shared budget is blocked', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.AI_HELP_BUDGET_SEK = '0'
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = createResponse()
    await handler({
      body: modelBody(),
      headers: { authorization: 'Bearer token' },
      method: 'POST',
    }, response)
    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('local-fallback')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not retry when the provider fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.AI_HELP_BUDGET_SEK = '10'
    setCoachCostStoreForTests(createTestCostStore())
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchImpl)
    const response = createResponse()
    await handler({
      body: modelBody(),
      headers: { authorization: 'Bearer token' },
      method: 'POST',
    }, response)
    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('keeps the coach route out of the ordinary Vite config and off the old /api/ai path', () => {
    const vite = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8')
    const handlerSource = readFileSync(new URL('../_shared/aiCoach/httpHandler.js', import.meta.url), 'utf8')
    expect(vite).not.toContain('/api/ai-coach')
    expect(handlerSource).not.toMatch(/\/api\/ai(?!-coach)|requestAiEndpoint/)
    expect(handlerSource).toContain('answerCoachQuestion')
    expect(handlerSource).not.toContain('body.userId')
  })
})

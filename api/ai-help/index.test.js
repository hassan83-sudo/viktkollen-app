import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { clearAiHelpRateLimitForTests } from '../_shared/aiHelp/costGuard.js'
import { createTestCostStore } from '../_shared/aiHelp/sharedCostLedger.js'
import { setAiHelpCostStoreForTests } from '../_shared/aiHelp/service.js'

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

afterEach(() => {
  setSupabaseAuthVerifierForTests(null)
  setAiHelpCostStoreForTests(null)
  clearAiHelpRateLimitForTests()
  delete process.env.OPENAI_API_KEY
  delete process.env.AI_HELP_BUDGET_SEK
  delete process.env.AI_HELP_RATE_LIMIT_MAX
  vi.unstubAllGlobals()
})

describe('POST /api/ai-help', () => {
  it('requires a signed-in user and does not read another user id from the body', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    const response = createResponse()
    await handler({
      body: {
        language: 'sv',
        messages: [{ content: 'Kan du förklara språket på ett annat sätt?', role: 'user' }],
        userId: 'someone-else',
      },
      headers: { authorization: 'Bearer token' },
      method: 'POST',
    }, response)

    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
    expect(JSON.stringify(response.body)).not.toContain('someone-else')
  })

  it('does not show a total chat quota when the shared limit is reached', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.AI_HELP_BUDGET_SEK = '1000'
    process.env.AI_HELP_RATE_LIMIT_MAX = '1'
    setAiHelpCostStoreForTests(createTestCostStore())
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({ answer: 'That feature is not in the app.', featureIds: [], status: 'answered' }),
        usage: { input_tokens: 12, output_tokens: 8 },
      }),
    })))
    const body = {
      language: 'en',
      messages: [{ content: 'How do I open the quantum portal?', role: 'user' }],
      userId: 'someone-else',
    }

    const first = createResponse()
    await handler({
      body,
      headers: { authorization: 'Bearer token' },
      method: 'POST',
    }, first)
    expect(first.statusCode).toBe(200)

    const second = createResponse()
    await handler({
      body,
      headers: { authorization: 'Bearer token' },
      method: 'POST',
    }, second)
    expect(second.statusCode).toBe(429)
    expect(second.body.error.code).toBe('MODEL_LIMITED')
    expect(JSON.stringify(second.body)).not.toMatch(/remaining|someone-else|signed-in-user|\b8\b|kvot/)
  })

  it('rejects anonymous requests', async () => {
    const response = createResponse()
    await handler({ body: {}, headers: {}, method: 'POST' }, response)
    expect(response.statusCode).toBe(401)
    expect(response.body.ok).toBe(false)
  })
})

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import * as billing from '../_shared/billing/aiTextLiveBilling.js'
import { setCoachCostStoreForTests } from '../_shared/aiCoach/service.js'
import { createTestCostStore } from '../_shared/aiHelp/sharedCostLedger.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

const root = fileURLToPath(new URL('../..', import.meta.url))

function countDeployableFunctions(dir = join(root, 'api')) {
  const found = []
  function walk(current) {
    for (const entry of readdirSync(current)) {
      if (entry.startsWith('_') || entry.endsWith('.test.js')) continue
      const full = join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'index.js') found.push(full)
    }
  }
  walk(dir)
  return found
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) {
      response.body = body
      return response
    },
    setHeader(name, value) {
      response.headers[name] = value
    },
    status(code) {
      response.statusCode = code
      return response
    },
  }
  return response
}

function createRequest({ body = {}, method = 'POST', query, token = 'valid-token', url } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query,
    url,
  }
}

afterEach(() => {
  setSupabaseAuthVerifierForTests(null)
  setCoachCostStoreForTests(null)
  delete process.env.OPENAI_API_KEY
  delete process.env.AI_HELP_BUDGET_SEK
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AI route dispatch on /api/ai', () => {
  it('sends __vk_route=ai-help to the Help handler and skips legacy billing', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    const resolveSpy = vi.spyOn(billing, 'resolveAiTextBillingRuntime')
    const executeSpy = vi.spyOn(billing, 'executeAiTextMeteredOperation')
    vi.stubGlobal('fetch', fetchImpl)

    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'daily-coach',
        featureIds: ['navigation.journey'],
        language: 'sv',
        messages: [{ content: 'Kan du öppna den?', role: 'user' }],
      },
      query: { __vk_route: 'ai-help' },
    }), response)

    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('local')
    expect(response.body.requestId).toMatch(/^ai-help-/)
    expect(response.body.tool).toMatchObject({ name: 'open-section', sectionId: 'journey' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(resolveSpy).not.toHaveBeenCalled()
    expect(executeSpy).not.toHaveBeenCalled()
  })

  it('accepts the rewrite URL when the query object is absent', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = createResponse()
    await handler(createRequest({
      body: {
        featureIds: ['navigation.journey'],
        language: 'sv',
        messages: [{ content: 'Kan du öppna den?', role: 'user' }],
      },
      token: 'valid-token',
      url: '/api/ai?__vk_route=ai-help',
    }), response)

    expect(response.statusCode).toBe(200)
    expect(response.body.requestId).toMatch(/^ai-help-/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('requires auth for AI Help before any provider call', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = createResponse()
    await handler(createRequest({
      body: { language: 'sv', messages: [{ content: 'Var finns språket?', role: 'user' }] },
      query: { __vk_route: 'ai-help' },
      token: '',
    }), response)

    expect(response.statusCode).toBe(401)
    expect(response.body.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends __vk_route=ai-coach to the Coach handler, keeps the cost guard, and calls the provider once', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.AI_HELP_BUDGET_SEK = '10'
    const store = createTestCostStore()
    const reserve = vi.spyOn(store, 'reserve')
    setCoachCostStoreForTests(store)
    const resolveSpy = vi.spyOn(billing, 'resolveAiTextBillingRuntime')
    const executeSpy = vi.spyOn(billing, 'executeAiTextMeteredOperation')
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          answer: 'Fokusera på protein till en måltid du redan äter.',
          knowledgeIds: ['coach.weekly-focus'],
          status: 'answered',
        }),
        usage: { input_tokens: 20, output_tokens: 12 },
      }),
    }))
    vi.stubGlobal('fetch', fetchImpl)

    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'daily-coach',
        context: { email: 'secret@example.com', protein: { grams: 35, mealCount: 2, status: 'logged', targetGrams: 90 } },
        messages: [{ content: 'Utifrån min vecka, vad tycker du att jag ska fokusera på?', role: 'user' }],
      },
      query: { __vk_route: 'ai-coach' },
    }), response)

    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('openai')
    expect(response.body.requestId).toMatch(/^ai-coach-/)
    expect(response.body.tool).toBeUndefined()
    expect(JSON.stringify(response.body)).not.toMatch(/secret@example.com/)
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(fetchImpl.mock.invocationCallOrder[0])
    expect(resolveSpy).not.toHaveBeenCalled()
    expect(executeSpy).not.toHaveBeenCalled()
  })

  it('keeps /api/ai without __vk_route on the legacy daily-coach path', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'signed-in-user' } }))
    delete process.env.OPENAI_API_KEY
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'daily-coach' },
    }), response)

    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('mock')
    expect(response.body.summary).toBeTruthy()
    expect(response.body.requestId).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fails closed for an unknown __vk_route before legacy auth and the provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    const resolveSpy = vi.spyOn(billing, 'resolveAiTextBillingRuntime')
    vi.stubGlobal('fetch', fetchImpl)
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'daily-coach' },
      query: { __vk_route: 'billing' },
      token: '',
    }), response)

    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(response.body.error.safeMessage).not.toBe('Okänd AI-åtgärd.')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it('preserves the public AI Help and AI Coach URLs in vercel.json', () => {
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
    const rewrites = vercel.rewrites
    expect(rewrites).toContainEqual({
      source: '/api/ai-help',
      destination: '/api/ai?__vk_route=ai-help',
    })
    expect(rewrites).toContainEqual({
      source: '/api/ai-coach',
      destination: '/api/ai?__vk_route=ai-coach',
    })
    const clientHelp = readFileSync(join(root, 'src/features/aiHelp/aiHelpClient.js'), 'utf8')
    const clientCoach = readFileSync(join(root, 'src/features/aiCoach/coachModelClient.js'), 'utf8')
    expect(clientHelp).toContain("fetch('/api/ai-help'")
    expect(clientCoach).toContain("fetch('/api/ai-coach'")
  })

  it('keeps the deployable serverless function count at or below the Hobby limit', () => {
    const functions = countDeployableFunctions()
    const names = functions.map((file) => file.replaceAll('\\', '/'))
    expect(functions.length).toBeLessThanOrEqual(12)
    expect(functions).toHaveLength(11)
    expect(names.some((file) => file.endsWith('/api/ai/index.js'))).toBe(true)
    expect(names.some((file) => file.includes('/api/ai-help/'))).toBe(false)
    expect(names.some((file) => file.includes('/api/ai-coach/'))).toBe(false)
  })
})

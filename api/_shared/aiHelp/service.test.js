import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answerAiHelpQuestion, setAiHelpCostStoreForTests } from './service.js'
import { aiHelpCostSek, clearAiHelpRateLimitForTests } from './costGuard.js'
import { createTestCostStore } from './sharedCostLedger.js'
import { clearUnansweredQuestionsForTests, listUnansweredQuestionsForTests } from './unansweredStore.js'

const languages = [
  { code: 'sv', nativeName: 'Svenska', direction: 'ltr' },
  { code: 'en', nativeName: 'English', direction: 'ltr' },
  { code: 'zh-CN', nativeName: '简体中文', direction: 'ltr' },
  { code: 'ar', nativeName: 'العربية', direction: 'rtl' },
]

function modelResponse(answer) {
  return {
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        answer,
        featureIds: ['settings.language'],
        status: 'answered',
      }),
    }),
  }
}

beforeEach(() => {
  setAiHelpCostStoreForTests(createTestCostStore())
})

afterEach(() => {
  setAiHelpCostStoreForTests(null)
  clearAiHelpRateLimitForTests()
  clearUnansweredQuestionsForTests()
})

describe('AI Help language and model contract', () => {
  it.each(languages)('asks gpt-5-mini to answer in $code', async (language) => {
    const fetchImpl = vi.fn(async () => modelResponse(`answer-${language.code}`))
    const result = await answerAiHelpQuestion({
      body: {
        language: language.code,
        messages: [{ content: 'Hur byter jag språk?', role: 'user' }],
      },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: `user-${language.code}`,
    })

    expect(result.ok).toBe(true)
    expect(result.language).toMatchObject({ code: language.code, direction: language.direction, fallback: false })
    if (language.code === 'sv') {
      expect(result.source).toBe('local')
      expect(result.answer).toContain('Inställningar')
      expect(result.tool?.sectionId).toBe('installningar')
      expect(fetchImpl).not.toHaveBeenCalled()
      return
    }
    expect(result.source).toBe('openai')
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(request.model).toBe('gpt-5-mini')
    expect(request.max_output_tokens).toBe(400)
    expect(request.reasoning).toEqual({ effort: 'low' })
    expect(request.input[0].content[0].text).toContain(language.code)
    expect(request.input[0].content[0].text).toContain(language.nativeName)
    expect(request.input[0].content[0].text).not.toMatch(/\b\d+\s*kr\b/i)
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key')
  })

  it('falls back to Swedish for an unknown language code', async () => {
    const fetchImpl = vi.fn(async () => modelResponse('svenska'))
    const result = await answerAiHelpQuestion({
      body: {
        language: 'xx-UNKNOWN',
        messages: [{ content: 'Kan du förklara inställningarna på ett annat sätt?', role: 'user' }],
      },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-fallback',
    })

    expect(result.language).toMatchObject({ code: 'sv', direction: 'ltr', fallback: true })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).input[0].content[0].text).toContain('Svenska')
  })

  it('records an unanswered question when the model cannot answer', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: '{"status":"unanswered","answer":"","featureIds":[]}' }),
    }))
    const result = await answerAiHelpQuestion({
      body: {
        language: 'ar',
        messages: [{ content: 'Vad kostar ett okänt tillägg?', role: 'user' }],
      },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-gap',
    })

    expect(result).toMatchObject({ ok: true, source: 'knowledge-gap', status: 'unanswered' })
    expect(result.language.direction).toBe('rtl')
    expect(listUnansweredQuestionsForTests()).toHaveLength(1)
    expect(listUnansweredQuestionsForTests()[0].language).toBe('ar')
    expect(listUnansweredQuestionsForTests()[0].scope).not.toBe('user-gap')
  })

  it('does not call the model when the server key is missing', async () => {
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: {
        language: 'en',
        messages: [{ content: 'Where are settings?', role: 'user' }],
      },
      env: {},
      fetchImpl,
      userId: 'user-nokey',
    })

    expect(result).toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED', ok: false, status: 503 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rate limits a user without sharing another user bucket', async () => {
    const fetchImpl = vi.fn(async () => modelResponse('ok'))
    const env = { AI_HELP_RATE_LIMIT_MAX: '1', AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' }
    const body = { language: 'sv', messages: [{ content: 'Kan du förklara Mer på ett annat sätt?', role: 'user' }] }

    expect((await answerAiHelpQuestion({ body, env, fetchImpl, userId: 'user-a' })).source).toBe('openai')
    expect((await answerAiHelpQuestion({ body, env, fetchImpl, userId: 'user-a' })).source).toBe('local-fallback')
    expect((await answerAiHelpQuestion({ body, env, fetchImpl, userId: 'user-b' })).source).toBe('openai')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('keeps a Swedish follow-up in the mocked model input', async () => {
    const fetchImpl = vi.fn(async () => modelResponse('Öppna språklistan i Inställningar.'))
    await answerAiHelpQuestion({
      body: {
        featureIds: ['settings.language'],
        language: 'sv',
        messages: [
          { content: 'Hur ändrar jag språk?', role: 'user' },
          { content: 'Öppna Inställningar och välj språk.', role: 'assistant' },
          { content: 'Och var klickar jag sedan?', role: 'user' },
        ],
      },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-follow-up',
    })

    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    const input = request.input
    expect(input.map((item) => item.role)).toEqual(['developer', 'user', 'assistant', 'user'])
    expect(input.map((item) => item.content[0].type)).toEqual(['input_text', 'input_text', 'output_text', 'input_text'])
    expect(input[2].content[0]).toEqual({
      annotations: [],
      text: 'Öppna Inställningar och välj språk.',
      type: 'output_text',
    })
    expect(input.at(-1).content[0].text).toBe('Och var klickar jag sedan?')
    expect(input[1].content[0].text).toBe('Hur ändrar jag språk?')
    expect(request.model).toBe('gpt-5-mini')
    expect(request.max_output_tokens).toBe(400)
    expect(request.reasoning).toEqual({ effort: 'low' })
    expect(request.temperature).toBeUndefined()
    expect(request.text).toEqual({ verbosity: 'low' })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses')
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST')
  })

  it('drops invented prices and claimed account actions from mocked answers', async () => {
    const cases = [
      '{"status":"answered","answer":"Abonnemanget kostar 1234 kr i månaden.","featureIds":["settings.plan"]}',
      '{"status":"answered","answer":"Jag har sagt upp ditt abonnemang.","featureIds":["settings.plan"]}',
    ]
    for (const outputText of cases) {
      clearUnansweredQuestionsForTests()
      const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ output_text: outputText }) }))
      const result = await answerAiHelpQuestion({
        body: { language: 'sv', messages: [{ content: 'Kan du förklara uppsägning med andra ord?', role: 'user' }] },
        env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
        fetchImpl,
        userId: `user-policy-${outputText.length}`,
      })
      expect(result).toMatchObject({ answer: '', source: 'withheld', status: 'unanswered' })
      expect(result.answer).not.toMatch(/1234|sagt upp/)
    }
  })

  it('caps output tokens and stored history', async () => {
    const fetchImpl = vi.fn(async () => modelResponse('Öppna Mer.'))
    const history = [
      ...Array.from({ length: 9 }, (_, index) => ({
        content: `meddelande ${index} ${'x'.repeat(800)}`,
        role: index % 2 === 0 ? 'assistant' : 'user',
      })),
      { content: 'Kan du förklara Mer på ett annat sätt?', role: 'user' },
    ]
    await answerAiHelpQuestion({
      body: { language: 'sv', messages: history },
      env: { AI_HELP_MAX_OUTPUT_TOKENS: '9000', AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-cap',
    })
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(request.max_output_tokens).toBe(400)
    expect(request.model).toBe('gpt-5-mini')
    const conversation = request.input.filter((item) => item.role !== 'developer')
    expect(conversation).toHaveLength(8)
    expect(conversation.some((item) => item.content.some((part) => part.text.length > 600))).toBe(false)
  })

  it('does not call a cut or invalid model response a knowledge gap', async () => {
    const cases = [
      { incomplete_details: { reason: 'max_output_tokens' }, output_text: '{"status":"answered","answer":"Öppna', status: 'incomplete' },
      { output_text: '{"status":"answered","answer":"Öppna Mer', status: 'completed' },
    ]
    for (const payload of cases) {
      clearUnansweredQuestionsForTests()
      const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => payload }))
      const result = await answerAiHelpQuestion({
        body: { language: 'sv', messages: [{ content: 'Kan du förklara Mer på ett annat sätt?', role: 'user' }] },
        env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
        fetchImpl,
        userId: 'user-cut',
      })
      expect(result).toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE', ok: false, status: 502 })
      expect(JSON.stringify(result)).not.toContain('Öppna')
      expect(listUnansweredQuestionsForTests()).toHaveLength(0)
    }
  })

  it('asks for a short answer so gpt-5-mini can finish inside the 400 token cap', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          answer: 'Språket väljs i Inställningar.',
          featureIds: ['settings.language'],
          status: 'answered',
        }),
        status: 'completed',
        usage: {
          input_tokens: 944,
          output_tokens: 180,
          output_tokens_details: { reasoning_tokens: 64 },
        },
      }),
    }))
    const result = await answerAiHelpQuestion({
      body: {
        language: 'en',
        messages: [{ content: 'What does the language setting do?', role: 'user' }],
      },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-prod-cap',
    })
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)

    expect(request.max_output_tokens).toBe(400)
    expect(request.text).toEqual({ verbosity: 'low' })
    expect(request.input[0].content[0].text).toContain('at most four short sentences')
    expect(result).toMatchObject({ ok: true, source: 'openai', status: 'answered' })
  })

  it('returns a provider error when the mocked model call fails', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Kan du förklara Mer på ett annat sätt?', role: 'user' }] },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-down',
    })
    expect(result).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', ok: false, status: 503 })
  })

  it('answers Min resa from the catalog without a model call', async () => {
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Hur öppnar jag Min resa?', role: 'user' }] },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-journey',
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.source).toBe('local')
    expect(result.answer).toContain('nedre navigeringen')
    expect(result.tool).toEqual({ label: 'Öppna Min resa', name: 'open-section', sectionId: 'journey' })
  })

  it('rejects general chat and records a real knowledge gap separately', async () => {
    const fetchImpl = vi.fn()
    const poem = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Skriv en dikt om havet', role: 'user' }] },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-poem',
    })
    expect(poem.source).toBe('out-of-scope')
    expect(listUnansweredQuestionsForTests()).toHaveLength(0)

    const unknown = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Hur öppnar jag kvantportalen?', role: 'user' }] },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-unknown',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(unknown.source).toBe('knowledge-gap')
    expect(listUnansweredQuestionsForTests()).toHaveLength(1)
  })

  it('explains preliminary catalog prices locally', async () => {
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Vad kostar abonnemanget?', role: 'user' }] },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-price',
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.answer).toContain('preliminära')
    expect(result.answer).toContain('0 kr')
    expect(result.answer).toContain('kan inte ändra')
  })

  it('drops an invented tool and keeps local help after the model budget is spent', async () => {
    const inner = createTestCostStore()
    let reserved = null
    const store = {
      ...inner,
      reserve: async (input) => {
        reserved = input
        const holdSek = aiHelpCostSek({
          inputTokens: input.maxInputTokens,
          outputTokens: input.maxOutputTokens,
          sekPerUsd: input.sekPerUsd,
        })
        return inner.reserve({ ...input, budgetSek: holdSek * 1.1 })
      },
    }
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          answer: 'Mer finns längst ned.',
          featureIds: ['navigation.more'],
          status: 'answered',
          tool: { name: 'delete-account', sectionId: 'journey' },
        }),
        usage: {
          input_tokens: reserved.maxInputTokens,
          output_tokens: reserved.maxOutputTokens,
          output_tokens_details: { reasoning_tokens: 20 },
        },
      }),
    }))
    const env = { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' }
    const body = {
      budgetSek: 0.0001,
      holdSek: 0,
      inputTokens: 1,
      language: 'sv',
      messages: [{ content: 'Kan du förklara Mer på ett annat sätt?', role: 'user' }],
    }
    const first = await answerAiHelpQuestion({ body, costStore: store, env, fetchImpl, userId: 'user-budget' })
    const second = await answerAiHelpQuestion({ body, costStore: store, env, fetchImpl, userId: 'user-budget' })

    expect(reserved.budgetSek).toBe(1000)
    expect(reserved.maxInputTokens).toBeGreaterThanOrEqual(new TextEncoder().encode(body.messages[0].content).length)
    expect(first.source).toBe('openai')
    expect(first.tool).toBeNull()
    expect(JSON.stringify(first)).not.toContain('delete-account')
    expect(second.source).toBe('local-fallback')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('pauses paid answers when no local match exists', async () => {
    const fetchImpl = vi.fn(async () => modelResponse('ok'))
    const env = { AI_HELP_RATE_LIMIT_MAX: '1', AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' }
    const body = { language: 'en', messages: [{ content: 'How do I open the quantum portal?', role: 'user' }] }
    expect((await answerAiHelpQuestion({ body, env, fetchImpl, userId: 'user-portal' })).source).toBe('openai')
    const limited = await answerAiHelpQuestion({ body, env, fetchImpl, userId: 'user-portal' })
    expect(limited).toMatchObject({ code: 'MODEL_LIMITED', ok: false, status: 429 })
    expect(JSON.stringify(limited)).not.toMatch(/remaining|user-portal/)
    expect(listUnansweredQuestionsForTests()).toHaveLength(0)
  })

  it('keeps answering a clear local question when paid calls are limited', async () => {
    const fetchImpl = vi.fn()
    const store = { reserve: vi.fn(async () => ({ ok: false, reason: 'budget' })) }
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Hur öppnar jag Min resa?', role: 'user' }] },
      costStore: store,
      env: { AI_HELP_BUDGET_SEK: '0', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-local-limited',
    })

    expect(result.source).toBe('local')
    expect(result.answer).toMatch(/Min resa/)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(store.reserve).not.toHaveBeenCalled()
  })

  it('does not call the model when the shared cost store is not configured', async () => {
    setAiHelpCostStoreForTests(null)
    const fetchImpl = vi.fn(async () => modelResponse('ok'))
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Kan du förklara Mer på ett annat sätt?', role: 'user' }] },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-no-store',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.source).toBe('local-fallback')
  })

  it('keeps the reservation when the model call fails and still limits that user', async () => {
    const store = createTestCostStore()
    const env = { AI_HELP_BUDGET_SEK: '1000', AI_HELP_RATE_LIMIT_MAX: '1', OPENAI_API_KEY: 'test-key' }
    const body = { language: 'sv', messages: [{ content: 'Kan du förklara Mer på ett annat sätt?', role: 'user' }] }
    const failed = await answerAiHelpQuestion({
      body,
      costStore: store,
      env,
      fetchImpl: vi.fn(async () => ({ ok: false, json: async () => ({}) })),
      userId: 'user-fail',
    })
    expect(failed.status).toBe(503)
    const snapshot = await store.ledger.snapshot()
    expect(snapshot.periods[0].openHoldSek).toBeGreaterThan(0)
    expect(snapshot.reservations[0].status).toBe('uncertain')

    const other = await answerAiHelpQuestion({
      body,
      costStore: store,
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl: vi.fn(async () => modelResponse('Mer finns längst ned.')),
      userId: 'user-other',
    })
    expect(other.source).toBe('openai')

    const again = await answerAiHelpQuestion({
      body,
      costStore: store,
      env,
      fetchImpl: vi.fn(async () => modelResponse('igen')),
      userId: 'user-fail',
    })
    expect(again.source).toBe('local-fallback')
    expect(again.answer).toContain('Mer')
  })

  it('answers a pronoun follow-up locally and does not invent an unknown feature', async () => {
    const fetchImpl = vi.fn()
    const opened = await answerAiHelpQuestion({
      body: {
        featureIds: ['navigation.journey'],
        language: 'sv',
        messages: [{ content: 'Kan du öppna den?', role: 'user' }],
      },
      env: { AI_HELP_BUDGET_SEK: '0', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-pronoun',
    })
    expect(opened).toMatchObject({ featureIds: ['navigation.journey'], source: 'local', tool: { name: 'open-section', sectionId: 'journey' } })
    expect(opened.answer).not.toMatch(/öppnade|har öppnat/)

    const unknown = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Var finns teleporten?', role: 'user' }] },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-unknown-feature',
    })
    expect(unknown).toMatchObject({ source: 'knowledge-gap', status: 'unanswered' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('asks the mocked model only for a comparison and still answers locally when the budget is closed', async () => {
    const fetchImpl = vi.fn(async () => modelResponse('Min resa är en egen flik. Framsteg är en mapp under Mer.'))
    const compared = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Kan du förklara skillnaden mellan Min resa och Framsteg?', role: 'user' }] },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-compare',
    })
    expect(compared.source).toBe('openai')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).input[0].content[0].text
    expect(prompt).toContain('Never turn an unknown feature name')

    const local = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Var ser jag hur vikten förändrats?', role: 'user' }] },
      costStore: { reserve: vi.fn() },
      env: { AI_HELP_BUDGET_SEK: '0', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-weight-local',
    })
    expect(local.source).toBe('local')
    expect(local.featureIds).toEqual(['feature.weight-history'])
    expect(local.answer).toMatch(/Viktgrafen/)
    expect(local.answer).toMatch(/AI-estimat/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('answers personal billing questions from the authenticated user only', async () => {
    const writes = vi.fn()
    const seen = []
    const customerReaders = {
      plan: async (planId) => {
        seen.push(planId)
        return {
          entitlements: [{ enabled: true, feature: 'food.scan', limit_kind: 'NUMBER', limit_value: 30 }],
          plan: {
            active: true,
            billing_interval: 'month',
            currency: 'SEK',
            enabled_for_sale: true,
            plan_id: planId,
            price_minor: 400,
          },
          unavailable: false,
        }
      },
      quota: async ({ userId: quotaUserId }) => {
        seen.push(quotaUserId)
        return {
          quota: { feature: 'food.scan', limit: 30, remaining: 12, status: 'ALLOWED', used: 18 },
          unavailable: false,
        }
      },
      subscription: async (id) => {
        seen.push(id)
        return {
          subscription: {
            cancel_at_period_end: false,
            current_period_end: '2026-11-01T00:00:00.000Z',
            past_due_grace_until: null,
            pending_plan_id: null,
            plan_id: 'plan.prelim.sek.month.04',
            status: 'ACTIVE',
          },
          unavailable: false,
        }
      },
      usage: async (id) => {
        seen.push(id)
        return { quotas: [{ key: 'food_scan', limit: 30, remaining: 12, used: 18 }], unlimited: [] }
      },
    }
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: {
        confirmation: true,
        messages: [{ content: 'Vilket abonnemang har jag?', role: 'user' }],
        user_id: 'user-b',
      },
      customerReaders,
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
    expect(seen).not.toContain('user-b')
    expect(seen).toContain('user-a')
    expect(result.source).toBe('verified-customer')
    expect(result.answer).toContain('plan.prelim.sek.month.04')
    expect(result.answer).toContain('ACTIVE')
    expect(result.answer).toContain('4 kr')
    expect(result.confirmation).toBeUndefined()
  })

  it('uses the quota reader for remaining food scans and does not call the model', async () => {
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Hur mycket matscanning har jag kvar?', role: 'user' }] },
      customerReaders: {
        quota: async ({ feature, userId }) => ({
          quota: { feature, limit: 30, remaining: 4, status: 'ALLOWED', used: 26 },
          unavailable: false,
          userId,
        }),
        usage: async () => ({ quotas: [], unlimited: [] }),
      },
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.answer).toContain('4')
    expect(result.answer).toContain('26')
    expect(result.source).toBe('verified-customer')
  })

  it('keeps ordinary navigation on the catalog', async () => {
    const readers = { subscription: vi.fn() }
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Var finns matscanning?', role: 'user' }] },
      customerReaders: readers,
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(readers.subscription).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.source).toBe('local')
    expect(result.answer).toContain('Mat')
  })

  it('offers cancellation without a billing write until a separate confirmation exists', async () => {
    const writes = vi.fn()
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: {
        confirmation: true,
        messages: [{ content: 'Avsluta mitt abonnemang', role: 'user' }],
        user_id: 'user-b',
      },
      customerReaders: {
        plan: async () => ({
          entitlements: [],
          plan: { active: true, billing_interval: 'month', currency: 'SEK', enabled_for_sale: true, plan_id: 'plan.prelim.sek.month.04', price_minor: 400 },
          unavailable: false,
        }),
        subscription: async (id) => {
          expect(id).toBe('user-a')
          return {
            subscription: {
              cancel_at_period_end: false,
              current_period_end: '2026-11-01T00:00:00.000Z',
              plan_id: 'plan.prelim.sek.month.04',
              status: 'ACTIVE',
            },
            unavailable: false,
          }
        },
      },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
      writes,
    })
    expect(writes).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.confirmation).toEqual({ action: 'schedule_cancel' })
    expect(result.answer).toMatch(/Inget har ändrats/)
    expect(result.answer).not.toMatch(/har sagt upp|är uppsagt/)
  })

  it('replaces an invented personal price with the verified plan price', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          answer: 'Ditt abonnemang kostar 1234 kr.',
          featureIds: ['settings.plan'],
          status: 'answered',
          confirmation: true,
        }),
      }),
    }))
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Kan du förklara mitt abonnemang med andra ord?', role: 'user' }] },
      customerReaders: {
        plan: async () => ({
          entitlements: [],
          plan: { active: true, billing_interval: 'month', currency: 'SEK', enabled_for_sale: true, plan_id: 'plan.prelim.sek.month.04', price_minor: 400 },
          unavailable: false,
        }),
        subscription: async () => ({
          subscription: {
            cancel_at_period_end: false,
            current_period_end: '2026-11-01T00:00:00.000Z',
            plan_id: 'plan.prelim.sek.month.04',
            status: 'ACTIVE',
          },
          unavailable: false,
        }),
      },
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(result.answer).toContain('4 kr')
    expect(result.answer).not.toContain('1234')
    expect(result.confirmation).toBeUndefined()
  })

  it('does not return personal billing data when no user id is supplied', async () => {
    const readers = { subscription: vi.fn() }
    const result = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Vilket abonnemang har jag?', role: 'user' }], user_id: 'user-b' },
      customerReaders: readers,
      userId: '',
    })
    expect(readers.subscription).not.toHaveBeenCalled()
    expect(result.source).toBe('verified-customer')
    expect(result.answer).not.toContain('user-b')
    expect(result.answer).toMatch(/inte verifiera|cannot verify/i)
  })
})

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
  vi.restoreAllMocks()
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
        body: { language: 'en', messages: [{ content: 'Can you explain the More menu differently?', role: 'user' }] },
        env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'test-key' },
        fetchImpl,
        userId: 'user-cut',
      })
      expect(result).toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE', ok: false, status: 502 })
      expect(JSON.stringify(result)).not.toContain('Öppna')
      expect(listUnansweredQuestionsForTests()).toHaveLength(0)
    }
  })

  it.each(['invalid_json', 'incomplete_output', 'invalid_contract', 'empty_answer'])('uses existing verified Swedish help after %s without a second paid call', async (reason) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payloads = {
      incomplete_output: { status: 'incomplete', output_text: 'PRIVATE_PROVIDER_TEXT' },
      invalid_contract: { output_text: 'PRIVATE_PROVIDER_TEXT' },
      empty_answer: { output_text: '{"status":"answered","answer":""}' },
    }
    const store = createTestCostStore()
    const keep = vi.spyOn(store, 'markUncertain')
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => {
      if (reason === 'invalid_json') throw new Error('PRIVATE_PROVIDER_TEXT')
      return payloads[reason]
    } }))
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Kan du förklara Mer på ett annat sätt?', role: 'user' }] },
      costStore: store,
      env: { AI_HELP_BUDGET_SEK: '1000', OPENAI_API_KEY: 'PRIVATE_API_KEY' },
      fetchImpl,
      userId: 'PRIVATE_USER_ID',
    })
    expect(result).toMatchObject({ ok: true, source: 'local-fallback', status: 'answered', language: { code: 'sv' } })
    expect(result.answer.length).toBeGreaterThan(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(keep).toHaveBeenCalledTimes(1)
    expect(listUnansweredQuestionsForTests()).toHaveLength(0)
    expect(warning).toHaveBeenCalledWith('[ai-help] invalid provider response', { reason })
    expect(JSON.stringify([result, warning.mock.calls])).not.toMatch(/PRIVATE_/)
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

  it('offers a next-period plan change only after the customer names a plan', async () => {
    const fetchImpl = vi.fn()
    const readers = {
      plan: async () => ({
        entitlements: [],
        plan: { active: true, billing_interval: 'month', currency: 'SEK', enabled_for_sale: true, plan_id: 'plan.prelim.sek.month.04', price_minor: 400 },
        unavailable: false,
      }),
      subscription: async (id) => {
        expect(id).toBe('user-a')
        return {
          subscription: { cancel_at_period_end: false, current_period_end: '2026-11-01T00:00:00.000Z', plan_id: 'plan.prelim.sek.month.04', status: 'ACTIVE' },
          unavailable: false,
        }
      },
    }
    const named = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Byt mitt abonnemang till plan.prelim.sek.month.07', role: 'user' }], price_minor: 1, user_id: 'user-b' },
      customerReaders: readers,
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(named.confirmation).toEqual({ action: 'plan_change', planId: 'plan.prelim.sek.month.07' })
    expect(named.answer).toMatch(/ingen betalning har startats/i)
    expect(named.answer).not.toMatch(/är bytt|har bytt/)

    const same = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Byt mitt abonnemang till plan.prelim.sek.month.04', role: 'user' }] },
      customerReaders: readers,
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(same.confirmation).toBeUndefined()

    const unnamed = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Hur byter jag mitt abonnemang?', role: 'user' }] },
      customerReaders: readers,
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(unnamed.confirmation).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('offers to undo a scheduled cancellation and explains status without a charge', async () => {
    const fetchImpl = vi.fn()
    const scheduled = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Ångra min uppsägning', role: 'user' }] },
      customerReaders: {
        plan: async () => ({ entitlements: [], plan: { currency: 'SEK', plan_id: 'plan.prelim.sek.month.04', price_minor: 400 }, unavailable: false }),
        subscription: async () => ({
          subscription: { cancel_at_period_end: true, current_period_end: '2026-11-01T00:00:00.000Z', plan_id: 'plan.prelim.sek.month.04', status: 'ACTIVE' },
          unavailable: false,
        }),
      },
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(scheduled.confirmation).toEqual({ action: 'undo_cancel' })
    expect(scheduled.answer).toMatch(/Inget har ändrats/)
    expect(fetchImpl).not.toHaveBeenCalled()

    const renewal = await answerAiHelpQuestion({
      body: { messages: [{ content: 'När förnyas mitt abonnemang?', role: 'user' }] },
      customerReaders: {
        plan: async () => ({ entitlements: [], plan: { currency: 'SEK', plan_id: 'plan.prelim.sek.month.04', price_minor: 400 }, unavailable: false }),
        subscription: async () => ({
          subscription: { cancel_at_period_end: true, current_period_end: '2026-11-01T00:00:00.000Z', pending_plan_id: 'plan.prelim.sek.month.07', plan_id: 'plan.prelim.sek.month.04', status: 'ACTIVE' },
          unavailable: false,
        }),
      },
      env: {},
      fetchImpl,
      userId: 'user-a',
    })
    expect(renewal.confirmation).toBeUndefined()
    expect(renewal.answer).toContain('2026-11-01')
    expect(renewal.answer).toContain('ACTIVE')
    expect(renewal.answer).toContain('plan.prelim.sek.month.07')

    const payment = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Min betalning gick inte igenom', role: 'user' }] },
      customerReaders: {
        subscription: async () => ({
          subscription: { past_due_grace_until: '2026-10-20T00:00:00.000Z', plan_id: 'plan.prelim.sek.month.04', status: 'PAST_DUE' },
          unavailable: false,
        }),
      },
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(payment.confirmation).toBeUndefined()
    expect(payment.answer).toContain('PAST_DUE')
    expect(payment.answer).toContain('2026-10-20')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('explains the verified price together with the quota', async () => {
    const result = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Vad kostar min plan och vilken kvot har jag?', role: 'user' }] },
      customerReaders: {
        plan: async () => ({
          entitlements: [],
          plan: { active: true, billing_interval: 'month', currency: 'SEK', enabled_for_sale: true, plan_id: 'plan.prelim.sek.month.04', price_minor: 400 },
          unavailable: false,
        }),
        subscription: async () => ({
          subscription: { plan_id: 'plan.prelim.sek.month.04', status: 'ACTIVE' },
          unavailable: false,
        }),
        usage: async () => ({ quotas: [{ key: 'food.scan', limit: 3, remaining: 0, used: 3 }], unlimited: [] }),
      },
      env: {},
      fetchImpl: vi.fn(),
      userId: 'user-a',
    })
    expect(result.confirmation).toBeUndefined()
    expect(result.answer).toContain('4 kr')
    expect(result.answer).toContain('food.scan')
    expect(result.answer).toContain('3')
  })

  it('prepares a hosted payment only when no open subscription exists', async () => {
    const fetchImpl = vi.fn()
    const readers = {
      plan: async () => ({ entitlements: [], plan: { currency: 'SEK', plan_id: 'plan.free', price_minor: 0 }, unavailable: false }),
      subscription: async (id) => {
        expect(id).toBe('user-a')
        return { subscription: { plan_id: 'plan.free', status: 'NONE' }, unavailable: false }
      },
    }
    const ready = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Nytt betalningsförsök för plan.prelim.sek.month.07 kort 4242424242424242', role: 'user' }], user_id: 'user-b' },
      customerReaders: readers,
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(ready.confirmation).toEqual({ action: 'hosted_checkout', planId: 'plan.prelim.sek.month.07' })
    expect(ready.answer).toMatch(/Ingen betalning är gjord/)
    expect(ready.answer).not.toMatch(/4242/)
    expect(ready.handoff).toBe(true)

    const sameAttempt = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Nytt betalningsförsök', role: 'user' }] },
      customerReaders: {
        plan: async () => ({ entitlements: [], plan: { currency: 'SEK', plan_id: 'plan.prelim.sek.month.04', price_minor: 400 }, unavailable: false }),
        subscription: async () => ({
          subscription: { plan_id: 'plan.prelim.sek.month.04', status: 'PAST_DUE' },
          unavailable: false,
        }),
      },
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(sameAttempt.confirmation).toBeUndefined()
    expect(sameAttempt.answer).toContain('PAST_DUE')
    expect(sameAttempt.answer).toMatch(/blockerat/)
    expect(sameAttempt.handoff).toBe(true)
  })

  it('explains charges and blocks refunds, receipts and transaction lists', async () => {
    const fetchImpl = vi.fn()
    const readers = {
      plan: async () => ({
        entitlements: [],
        plan: { billing_interval: 'month', currency: 'SEK', plan_id: 'plan.prelim.sek.month.04', price_minor: 400 },
        unavailable: false,
      }),
      subscription: async () => ({
        subscription: {
          current_period_end: '2026-11-01T00:00:00.000Z',
          plan_id: 'plan.prelim.sek.month.04',
          status: 'ACTIVE',
        },
        unavailable: false,
      }),
    }
    const refund = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Jag vill ha återbetalning', role: 'user' }] },
      customerReaders: readers,
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-a',
    })
    expect(refund.confirmation).toBeUndefined()
    expect(refund.answer).toMatch(/Återbetalning är blockerad/)
    expect(refund.handoff).toBe(true)

    const receipt = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Visa mitt kvitto', role: 'user' }] },
      customerReaders: readers,
      env: {},
      fetchImpl,
      userId: 'user-a',
    })
    expect(receipt.answer).toContain('4 kr')
    expect(receipt.answer).toMatch(/kan inte hämtas/)
    expect(receipt.answer).toContain('ACTIVE')

    const transactions = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Visa mina transaktioner', role: 'user' }] },
      customerReaders: readers,
      env: {},
      fetchImpl,
      userId: 'user-a',
    })
    expect(transactions.answer).toMatch(/kan inte listas/)
    expect(transactions.answer).toContain('2026-11-01')
    expect(fetchImpl).not.toHaveBeenCalled()

    const reason = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Varför misslyckades min betalning?', role: 'user' }] },
      customerReaders: {
        subscription: async () => ({
          subscription: { past_due_grace_until: '2026-10-20T00:00:00.000Z', plan_id: 'plan.prelim.sek.month.04', status: 'PAST_DUE' },
          unavailable: false,
        }),
      },
      env: {},
      fetchImpl,
      userId: 'user-a',
    })
    expect(reason.confirmation).toBeUndefined()
    expect(reason.answer).toContain('PAST_DUE')
    expect(reason.answer).toMatch(/inte tillgänglig/)
    expect(reason.answer).not.toMatch(/insufficient|3DS|avslagskod/)
  })

  it.each(['free', 'premium'])('answers verified %s plan facts without a model or plan gate', async (planId) => {
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ role: 'user', content: 'Vilket abonnemang har jag?' }] },
      userId: `user-${planId}`,
      env: {},
      fetchImpl,
      customerReaders: {
        subscription: async () => ({ unavailable: false, subscription: { plan_id: planId, status: 'ACTIVE' } }),
        plan: async () => ({ unavailable: false, plan: { plan_id: planId, price_minor: 0, currency: 'SEK' }, entitlements: [] }),
      },
    })
    expect(result.ok).toBe(true)
    expect(result.source).toBe('verified-customer')
    expect(result.answer).toContain(planId)
    expect(fetchImpl).not.toHaveBeenCalled()
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

  it('reads the verified account and blocks changes that have no safe API', async () => {
    const fetchImpl = vi.fn()
    const readers = { subscription: vi.fn() }
    const account = { createdAt: '2026-01-01T00:00:00Z', email: 'owner@example.test', emailConfirmed: true }
    const read = await answerAiHelpQuestion({
      account,
      body: { messages: [{ content: 'Vilken e-post har jag?', role: 'user' }] },
      customerReaders: readers,
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(read.source).toBe('verified-customer')
    expect(read.answer).toContain('owner@example.test')
    expect(read.answer).toMatch(/Inget har ändrats/)
    expect(read.confirmation).toBeUndefined()
    expect(readers.subscription).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()

    const reset = await answerAiHelpQuestion({
      account,
      body: { messages: [{ content: 'Återställ mitt lösenord. Lösenordet är hunter2', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(reset.confirmation).toBeUndefined()
    expect(reset.answer).not.toMatch(/hunter2/)

    const offer = await answerAiHelpQuestion({
      account,
      body: { messages: [{ content: 'Återställ mitt lösenord', role: 'user' }] },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(offer.confirmation).toEqual({ action: 'password_reset' })
    expect(offer.answer).not.toMatch(/hunter2|reset-code/)

    const removal = await answerAiHelpQuestion({
      account,
      body: { messages: [{ content: 'Radera mitt konto', role: 'user' }], password: 'hunter2', user_id: 'other-user' },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(removal.confirmation).toEqual({ action: 'delete_account' })
    expect(removal.answer).toMatch(/Ingen radering har utförts/)
    expect(JSON.stringify(removal)).not.toMatch(/hunter2|other-user/)

    const email = await answerAiHelpQuestion({
      account,
      body: { messages: [{ content: 'Byt min e-post till annan@example.test', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(email.confirmation).toBeUndefined()
    expect(email.answer).toMatch(/blockerat/)
    expect(email.answer).not.toContain('annan@example.test')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('diagnoses verified feature faults and blocks device fixes', async () => {
    const fetchImpl = vi.fn()
    const active = {
      cancel_at_period_end: false,
      current_period_end: '2026-11-01T00:00:00.000Z',
      plan_id: 'plan.prelim.sek.month.04',
      status: 'ACTIVE',
    }
    const readersFor = (quota, entitlements = [{ enabled: true, feature: 'food.scan', limit_kind: 'NUMBER', limit_value: 30 }]) => ({
      plan: async () => ({ entitlements, plan: { active: true, currency: 'SEK', plan_id: active.plan_id, price_minor: 400 }, unavailable: false }),
      quota: async ({ userId }) => {
        expect(userId).toBe('user-1')
        return { quota, unavailable: false }
      },
      subscription: async (userId) => {
        expect(userId).toBe('user-1')
        return { subscription: active, unavailable: false }
      },
      usage: async () => ({ quotas: [], unlimited: [] }),
    })
    const empty = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Matscanningen fungerar inte', role: 'user' }] },
      customerReaders: readersFor({ feature: 'food.scan', limit: 30, remaining: 0, status: 'DENIED_QUOTA_EXCEEDED', unlimited: false, used: 30 }),
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(empty.source).toBe('verified-customer')
    expect(empty.answer).toMatch(/Kvoten för matscanning är slut/)
    expect(empty.answer).toMatch(/30/)
    expect(empty.confirmation).toBeUndefined()
    expect(empty.handoff).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()

    const camera = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Kameran fungerar inte', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(camera.answer).toMatch(/Kameradiagnos är blockerad/)
    expect(camera.answer).not.toMatch(/bilddata|hunter2|token/)
    expect(camera.confirmation).toBeUndefined()
    expect(camera.followUps).toEqual(['Gäller det matscanningen?', 'Gäller det kameran?'])

    const microphone = await answerAiHelpQuestion({
      body: { language: 'es', messages: [{ content: 'El micrófono no funciona', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(microphone.answer).toMatch(/micrófono está bloqueado/i)
    expect(microphone.answer).not.toMatch(/Mikrofondiagnos/)

    const login = await answerAiHelpQuestion({
      account: { email: 'owner@example.test', emailConfirmed: false },
      body: { messages: [{ content: 'Jag kan inte logga in', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(login.confirmation).toBeUndefined()
    expect(login.answer).toMatch(/obekräftad/)
    expect(login.answer).toMatch(/blockerat/)

    const secret = await answerAiHelpQuestion({
      account: { email: 'owner@example.test', emailConfirmed: true },
      body: { messages: [{ content: 'Jag kan inte logga in. Lösenordet är hunter2', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(secret.confirmation).toBeUndefined()
    expect(secret.answer).not.toMatch(/hunter2/)

    const reset = await answerAiHelpQuestion({
      account: { email: 'owner@example.test', emailConfirmed: true },
      body: { messages: [{ content: 'Jag kan inte logga in', role: 'user' }] },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(reset.confirmation).toEqual({ action: 'password_reset' })
    expect(reset.answer).toMatch(/bekräftad/)

    const scheduled = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Abonnemanget fungerar inte', role: 'user' }] },
      customerReaders: {
        plan: async () => ({ entitlements: [], plan: { currency: 'SEK', plan_id: active.plan_id, price_minor: 400 }, unavailable: false }),
        subscription: async () => ({ subscription: { ...active, cancel_at_period_end: true }, unavailable: false }),
      },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(scheduled.confirmation).toEqual({ action: 'undo_cancel' })
    expect(scheduled.answer).toMatch(/Ingen betalning har startats/)

    const unresolved = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Matscanningen fungerar inte', role: 'user' }, { content: 'Fungerar det nu?', role: 'user' }] },
      customerReaders: readersFor({ feature: 'food.scan', limit: 30, remaining: 0, status: 'DENIED_QUOTA_EXCEEDED', unlimited: false, used: 30 }),
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(unresolved.answer).toMatch(/inte är löst/)
    expect(unresolved.answer).toMatch(/Kvoten för matscanning/)

    const clear = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Matscanningen fungerar inte', role: 'user' }, { content: 'Fungerar det nu?', role: 'user' }] },
      customerReaders: readersFor({ feature: 'food.scan', limit: 30, remaining: 10, status: 'ALLOWED', unlimited: false, used: 20 }),
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(clear.answer).toMatch(/inget kvarvarande hinder/)
    expect(clear.answer).toMatch(/mänsklig support/)
    expect(clear.confirmation).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()

    const excluded = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Kroppsscanningen fungerar inte', role: 'user' }] },
      customerReaders: {
        plan: async () => ({ entitlements: [], plan: { currency: 'SEK', plan_id: active.plan_id, price_minor: 400 }, unavailable: false }),
        quota: async () => ({ quota: { feature: 'body.scan', limit: 5, remaining: 5, status: 'ALLOWED', unlimited: false, used: 0 }, unavailable: false }),
        subscription: async () => ({ subscription: active, unavailable: false }),
        usage: async () => ({ quotas: [], unlimited: [] }),
      },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(excluded.answer).toMatch(/kroppsscanning ingår inte/)
    expect(excluded.confirmation).toBeUndefined()

    const coach = await answerAiHelpQuestion({
      body: { messages: [{ content: 'AI-coachen fungerar inte', role: 'user' }] },
      customerReaders: {
        plan: async () => ({ entitlements: [{ enabled: true, feature: 'ai.text.request', limit_kind: 'NUMBER', limit_value: 20 }], plan: { currency: 'SEK', plan_id: active.plan_id, price_minor: 400 }, unavailable: false }),
        quota: async () => ({ quota: { feature: 'ai.text.request', limit: 20, remaining: 0, status: 'DENIED_QUOTA_EXCEEDED', unlimited: false, used: 20 }, unavailable: false }),
        subscription: async () => ({ subscription: active, unavailable: false }),
        usage: async () => ({ quotas: [], unlimited: [] }),
      },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(coach.answer).toMatch(/Kvoten för AI-coach är slut/)
    expect(coach.confirmation).toBeUndefined()

    const payment = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Betalningen fungerar inte', role: 'user' }] },
      customerReaders: {
        plan: async () => ({ entitlements: [], plan: { currency: 'SEK', plan_id: active.plan_id, price_minor: 400 }, unavailable: false }),
        subscription: async () => ({ subscription: { ...active, status: 'PAST_DUE' }, unavailable: false }),
      },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(payment.answer).toMatch(/PAST_DUE/)
    expect(payment.answer).toMatch(/lagras inte/)
    expect(payment.confirmation).toBeUndefined()

    const unknown = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Appen fungerar inte', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(unknown.answer).toMatch(/Ingen diagnos är gjord/)
    expect(unknown.followUps?.length).toBe(2)
    expect(unknown.confirmation).toBeUndefined()
  })

  it('keeps one case across turns and does not mark it solved early', async () => {
    const fetchImpl = vi.fn()
    const active = {
      cancel_at_period_end: true,
      current_period_end: '2026-11-01T00:00:00.000Z',
      plan_id: 'plan.prelim.sek.month.04',
      status: 'ACTIVE',
    }
    const quotaReaders = {
      plan: async () => ({ entitlements: [{ enabled: true, feature: 'food.scan', limit_kind: 'NUMBER', limit_value: 30 }], plan: { currency: 'SEK', plan_id: active.plan_id, price_minor: 400 }, unavailable: false }),
      quota: async () => ({ quota: { feature: 'food.scan', limit: 30, remaining: 0, status: 'DENIED_QUOTA_EXCEEDED', unlimited: false, used: 30 }, unavailable: false }),
      subscription: async () => ({ subscription: { ...active, cancel_at_period_end: false }, unavailable: false }),
      usage: async () => ({ quotas: [], unlimited: [] }),
    }
    const opened = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Appen fungerar inte', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(opened.answer).toMatch(/Ingen diagnos är gjord/)
    expect(opened.handoff).toBe(true)
    expect(opened.confirmation).toBeUndefined()

    const food = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Appen fungerar inte', role: 'user' }, { content: 'Gäller det matscanningen?', role: 'user' }] },
      customerReaders: quotaReaders,
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(food.answer).toMatch(/Kvoten för matscanning är slut/)
    expect(food.answer).not.toMatch(/löst/)
    expect(food.confirmation).toBeUndefined()

    const agreed = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Matscanningen fungerar inte', role: 'user' }, { content: 'ja', role: 'user' }] },
      customerReaders: quotaReaders,
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(agreed.answer).toMatch(/inte löst/)
    expect(agreed.confirmation).toBeUndefined()

    const stopped = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Matscanningen fungerar inte', role: 'user' }, { content: 'nej', role: 'user' }] },
      customerReaders: quotaReaders,
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(stopped.answer).toMatch(/avbruten/)
    expect(stopped.answer).toMatch(/inte löst/)
    expect(stopped.handoff).toBe(true)

    const still = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Matscanningen fungerar inte', role: 'user' }, { content: 'Fungerar det nu?', role: 'user' }] },
      customerReaders: quotaReaders,
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(still.answer).toMatch(/inte är löst/)
    expect(still.handoff).toBe(true)

    const subscription = await answerAiHelpQuestion({
      body: { messages: [{ content: 'Abonnemanget fungerar inte', role: 'user' }, { content: 'fortsätt', role: 'user' }] },
      customerReaders: {
        plan: async () => ({ entitlements: [], plan: { currency: 'SEK', plan_id: active.plan_id, price_minor: 400 }, unavailable: false }),
        subscription: async () => ({ subscription: active, unavailable: false }),
      },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(subscription.confirmation).toEqual({ action: 'undo_cancel' })
    expect(subscription.answer).not.toMatch(/är löst/)

    const english = await answerAiHelpQuestion({
      account: { email: 'owner@example.test', emailConfirmed: true },
      body: { language: 'en', messages: [{ content: "I can't sign in", role: 'user' }, { content: 'yes', role: 'user' }] },
      env: {},
      fetchImpl,
      userId: 'user-1',
    })
    expect(english.confirmation).toBeUndefined()
    expect(english.answer).toMatch(/not solved/)
    expect(english.answer).toMatch(/button/)

    const arabic = await answerAiHelpQuestion({
      body: { language: 'ar', messages: [{ content: 'الكاميرا لا تعمل', role: 'user' }] },
      env: { OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      userId: 'user-1',
    })
    expect(arabic.answer).toMatch(/الكاميرا محظور/)
    expect(arabic.answer).not.toMatch(/تم الحل/)
    expect(arabic.handoff).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

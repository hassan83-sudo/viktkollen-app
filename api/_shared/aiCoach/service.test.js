import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { answerCoachQuestion, coachAnswerIsAllowed } from './service.js'

function providerResponse(answer, status = 'answered') {
  return {
    json: async () => ({
      output_text: JSON.stringify({ answer, knowledgeIds: ['coach.protein', 'coach.activity'], status }),
      usage: { input_tokens: 20, output_tokens: 12, output_tokens_details: { reasoning_tokens: 0 } },
    }),
    ok: true,
  }
}

describe('coach answer service', () => {
  it('answers local coach knowledge when the shared budget is closed', async () => {
    const fetchImpl = vi.fn()
    const reserve = vi.fn()
    const result = await answerCoachQuestion({
      body: { language: 'sv', messages: [{ content: 'Hur kan jag få in mer protein i maten?', role: 'user' }] },
      costStore: { reserve },
      env: { AI_HELP_BUDGET_SEK: '0', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'coach-user',
    })
    expect(result.source).toBe('local')
    expect(result.knowledgeIds).toEqual(['coach.protein'])
    expect(result.tool).toBeNull()
    expect(result.answer).toMatch(/Protein/)
    expect(result.answer).not.toMatch(/\d+\s*g/)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(reserve).not.toHaveBeenCalled()
  })

  it('falls back to local coach knowledge when a synthesis question is budget blocked', async () => {
    const fetchImpl = vi.fn()
    const result = await answerCoachQuestion({
      body: { language: 'sv', messages: [{ content: 'Jämför protein och aktivitet för mig', role: 'user' }] },
      contextProvider: () => ({ activity: { label: 'promenad' }, protein: { grams: 70 } }),
      env: { AI_HELP_BUDGET_SEK: '0', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'coach-user',
    })
    expect(result.source).toBe('local-fallback')
    expect(result.knowledgeIds[0]).toMatch(/^coach\./)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('routes synthesis through the shared cost guard and a mocked model', async () => {
    const fetchImpl = vi.fn(async () => providerResponse('Protein till en måltid och en promenad är ett tillräckligt fokus.'))
    const reserve = vi.fn(async () => ({ ok: true, reservationId: 'reserve-1' }))
    const settle = vi.fn(async () => ({ ok: true }))
    const result = await answerCoachQuestion({
      body: { language: 'sv', messages: [{ content: 'Vad borde jag fokusera på den här veckan?', role: 'user' }] },
      contextProvider: () => ({ activity: { label: 'promenad' }, displayName: 'Ada', goal: 'maintain' }),
      costStore: { reserve, settle },
      env: { AI_HELP_BUDGET_SEK: '10', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'coach-user',
    })
    expect(result.source).toBe('openai')
    expect(result.model).toBe('gpt-5-mini')
    expect(result.tool).toBeNull()
    expect(result.handoff).toBe(false)
    expect(reserve).toHaveBeenCalledOnce()
    expect(settle).toHaveBeenCalledOnce()
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(request.model).toBe('gpt-5-mini')
    expect(request.reasoning).toEqual({ effort: 'low' })
    expect(request.input[0].content[0].type).toBe('input_text')
    expect(request.input.at(-1).content[0].type).toBe('input_text')
    const instructions = request.input[0].content[0].text
    expect(instructions).toMatch(/Do not invent/)
    expect(instructions).toMatch(/not a doctor/)
    expect(instructions).toContain('coach.weekly-focus')
    expect(instructions).not.toContain('navigation.journey')
    expect(instructions).not.toContain('Ada')
    expect(instructions).toContain('maintain')
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses')
  })

  it('sends an earlier assistant turn as output text on a follow-up', async () => {
    const fetchImpl = vi.fn(async () => providerResponse('Protein till en måltid räcker som exempel.'))
    await answerCoachQuestion({
      body: {
        language: 'sv',
        messages: [
          { content: 'Jämför protein och aktivitet för mig', role: 'user' },
          { content: 'Båda kan vara veckans fokus.', role: 'assistant' },
          { content: 'Jämför det en gång till', role: 'user' },
        ],
      },
      costStore: {
        reserve: async () => ({ ok: true, reservationId: 'reserve-3' }),
        settle: async () => ({ ok: true }),
      },
      env: { AI_HELP_BUDGET_SEK: '10', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'coach-user',
    })
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(request.input.map((item) => item.content[0].type)).toEqual(['input_text', 'input_text', 'output_text', 'input_text'])
    expect(request.input[2].content[0].annotations).toEqual([])
    expect(request.input).toHaveLength(4)
  })

  it('withholds a mocked answer that invents a weight or a diagnosis', async () => {
    const fetchImpl = vi.fn(async () => providerResponse('Du väger 82 kg och du har diabetes.'))
    const result = await answerCoachQuestion({
      body: { language: 'sv', messages: [{ content: 'Jämför protein och aktivitet för mig', role: 'user' }] },
      costStore: {
        reserve: async () => ({ ok: true, reservationId: 'reserve-2' }),
        settle: async () => ({ ok: true }),
      },
      env: { AI_HELP_BUDGET_SEK: '10', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'coach-user',
    })
    expect(result.source).toBe('withheld')
    expect(result.answer).toBe('')
    expect(coachAnswerIsAllowed('Jag har loggat din vikt.', null)).toBe(false)
  })

  it('uses the shared cost module and does not open a second budget system', () => {
    const source = readFileSync(new URL('./service.js', import.meta.url), 'utf8')
    expect(source).toContain("from '../aiHelp/costGuard.js'")
    expect(source).not.toMatch(/0\.25|reserve_model_call|createCostStoreFromEnv/)
    expect(source).toContain('openai_call_blocked')
  })
})

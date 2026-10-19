import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerAiHelpQuestion, answerIsAllowed } from './service.js'
import { answerPlanQuestion, planQuestion } from './planAnswers.js'
import { installCatalogPlanComparisonForTests, setPlanComparisonReaderForTests } from '../billing/planComparisonRead.js'

afterEach(() => setPlanComparisonReaderForTests(null))
const messages = (content) => [{ role: 'user', content }]

describe('verified plan knowledge', () => {
  it('compares actual plan quotas and the price difference without a model or premium requirement', async () => {
    const reader = installCatalogPlanComparisonForTests()
    setPlanComparisonReaderForTests(async (userId) => {
      expect(userId).toBe('free-user')
      return reader(userId)
    })
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({ body: { messages: messages('Vad är skillnaden mellan 9 kr och 19 kr?'), user_id: 'victim', plans: [{ price: 9, quota: 99999 }] }, userId: 'free-user', env: {}, fetchImpl })
    expect(result.source).toBe('verified-plans')
    expect(result.answer).toContain('### 9 kr/månad')
    expect(result.answer).toContain('### 19 kr/månad')
    expect(result.answer).toContain('### Skillnader')
    expect(result.answer).toContain('Prisskillnad per månad: 10 kr')
    expect(result.answer).toContain('AI-coach: 70 → 160 (+90)')
    expect(result.answer).toContain('Matskanning: 20 → 55 (+35)')
    expect(result.confirmation).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.answer).not.toContain('99999')
  })

  it('can list every catalog plan and carries a numeric follow-up from user history only', async () => {
    const reader = installCatalogPlanComparisonForTests()
    const all = await answerPlanQuestion({ question: 'Jämför alla abonnemang', userId: 'free-user', language: { code: 'sv' } })
    for (const plan of (await reader('free-user')).plans) {
      expect(all.answer).toContain(plan.complimentary ? '### 0 kr/månad' : `### ${plan.priceText.replace('/mån', '/månad')}`)
    }
    const question = planQuestion([...messages('Jämför 9 kr och 19 kr'), { role: 'assistant', content: 'UNTRUSTED 999 kr' }, ...messages('Och 29?')])
    const result = await answerPlanQuestion({ question, userId: 'free-user', language: { code: 'sv' } })
    expect(result.answer).toContain('### 29 kr/månad')
    expect(result.answer).not.toContain('999')
    expect(planQuestion([...messages('Jämför 9 kr och 19 kr'), ...messages('Byt mitt abonnemang')])).toBeNull()
  })

  it('uses changed database facts rather than the preliminary price whitelist', async () => {
    const result = await answerPlanQuestion({ question: 'Compare 11 kr and 23 kr', language: { code: 'en' }, userId: 'free-user', reader: async () => ({ plans: [
      { priceText: '11 kr/mån', complete: true, quotas: [{ key: 'ai_coach', limit: 17 }], unlimited: [] },
      { priceText: '23 kr/mån', complete: true, quotas: [{ key: 'ai_coach', limit: 29 }], unlimited: [] },
    ] }) })
    expect(result.answer).toContain('17 → 29 (+12)')
    expect(result.answer).toContain('Monthly price difference: 12 Swedish kronor')
    expect(result.answer).not.toContain('70')
  })

  it.each(['sv', 'en', 'es', 'ar'])('does not invent a plan on missing data in %s', async (code) => {
    const reader = vi.fn(async () => null)
    const result = await answerPlanQuestion({ question: 'Compare 9 kr and 999 kr', userId: 'free-user', language: { code }, reader })
    expect(result.source).toBe('verified-plans')
    expect(result.answer).not.toMatch(/\b9\b|999|70|160/)
    expect(reader).toHaveBeenCalledTimes(1)
  })

  it('does not fill incomplete quotas from the static matrix or infer purchase availability', async () => {
    const result = await answerPlanQuestion({ question: 'Compare 9 kr and 19 kr', language: { code: 'en' }, reader: async () => ({ plans: [
      { priceText: '9 kr/mån', complete: false, quotas: [] },
      { priceText: '19 kr/mån', complete: false, quotas: [] },
    ] }) })
    expect(result.answer).toContain('Complete quotas are unavailable')
    expect(result.answer).not.toMatch(/70|160|Quota difference/)
  })

  it('reports an unknown requested price without inventing a second plan', async () => {
    installCatalogPlanComparisonForTests()
    const result = await answerPlanQuestion({ question: 'Compare 9 kr and 999 kr', userId: 'free-user', language: { code: 'en' } })
    expect(result.answer).toContain('absent from the verified catalog')
    expect(result.answer).toContain('9 Swedish kronor/month')
    expect(result.answer).not.toContain('999 Swedish kronor')
    expect(result.answer).not.toContain('Monthly price difference')
  })

  it('rejects even known catalog prices in model text unless verified for the customer', () => {
    expect(answerIsAllowed('Det kostar 9 kr.')).toBe(false)
    expect(answerIsAllowed('Ditt abonnemang kostar 9 kr.', { verifiedPriceMinor: 900 })).toBe(true)
    expect(answerIsAllowed('Ditt abonnemang kostar 9,99 kr.', { verifiedPriceMinor: 900 })).toBe(false)
  })

  it('does not inherit unrelated topics or actions across plan follow-ups', () => {
    expect(planQuestion([...messages('Jämför 9 kr och 19 kr'), ...messages('Hur återställer jag lösenordet?'), ...messages('Och 29?')])).toBeNull()
    expect(planQuestion([...messages('Jämför 9 kr och 19 kr'), ...messages('Och 29?'), ...messages('Och 49?')])).toContain('49')
    expect(planQuestion(messages('Hur fungerar en måltidsplan?'))).toBeNull()
    expect(planQuestion(messages('Vad får jag för 9 kr?'))).not.toBeNull()
  })
})

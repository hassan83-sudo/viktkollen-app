import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { answerCoachQuestion } from '../../../api/_shared/aiCoach/service.js'
import { COACH_TOOL_ALLOWLIST } from '../sharedAi/domainContract.js'
import { answerCoachPanelQuestion, narrowCoachPanelSource } from './coachPanelReply.js'
import { requestCoachModelReply } from './coachModelClient.js'

vi.mock('./coachModelClient.js', () => ({
  requestCoachModelReply: vi.fn(),
}))

const today = '2026-09-30'

function source(extra = {}) {
  return {
    address: 'Storgatan 1',
    bodyAnalysisHistory: [{
      createdAt: '2026-09-28',
      result: { estimatedWeight: { maxKg: 84, midpointKg: 82, minKg: 80 } },
    }],
    checkIn: { steps: 4200, workout: 'promenad' },
    email: 'secret@example.com',
    foods: [
      { done: true, label: 'Vatten' },
      { done: false, title: 'Kvällspromenad' },
    ],
    meals: [
      { date: '2026-09-30', name: 'Lunch', protein: 20 },
      { date: '2026-09-30', name: 'Middag', protein: 15 },
    ],
    nutritionGoals: { protein: { target: 90 } },
    profile: {
      dietaryPreferences: { avoidedFoods: ['nötter'], dietType: 'vegetarian' },
      displayName: 'Ada',
      goalWeight: '85',
      heightCm: 170,
      weightDirection: 'loss',
    },
    subscription: { plan: 'premium' },
    today,
    weights: [
      { date: '2026-09-01', source: 'Manuell', value: 90 },
      { date: '2026-09-20', source: 'Manuell', value: 88.4 },
      { date: '2026-09-28', estimatedWeightKg: 70, source: 'Kroppsscanning', value: 70 },
    ],
    ...extra,
  }
}

function ask(content, appData = source(), extra = {}) {
  return answerCoachPanelQuestion({
    appData,
    messages: [{ content, role: 'user' }],
    ...extra,
  })
}

describe('coach panel replies', () => {
  beforeEach(() => {
    requestCoachModelReply.mockReset()
  })

  it('answers a general weight-trend question locally without personal numbers', async () => {
    const result = await ask('Hur fungerar vikttrend?')
    expect(result.source).toBe('local')
    expect(result.reply).toMatch(/flera veckor/)
    expect(result.reply).not.toMatch(/88\.4|70/)
    expect(result.tool).toBeNull()
    expect(requestCoachModelReply).not.toHaveBeenCalled()
    expect(result.handoff).toBe(false)
  })

  it('answers the latest measured weight from panel data', async () => {
    const result = await ask('Vad vägde jag senast?')
    expect(result.source).toBe('local')
    expect(result.reply).toMatch(/88\.4 kg/)
    expect(result.reply).not.toMatch(/70 kg/)
    expect(requestCoachModelReply).not.toHaveBeenCalled()
  })

  it('answers a personal weight trend and keeps a body-scan estimate separate', async () => {
    const result = await ask('Hur har min vikt utvecklats?')
    expect(result.source).toBe('local')
    expect(result.reply).toMatch(/88\.4 kg/)
    expect(result.reply).toMatch(/-1\.6 kg/)
    expect(result.reply).toMatch(/ingår inte i den uppmätta vikten/)
    expect(result.reply).not.toMatch(/Senaste registrerade vikten är 70/)
  })

  it('answers today protein and a dinner follow-up from the same conversation', async () => {
    const first = await ask('Hur ser mitt protein ut idag?')
    expect(first.reply).toMatch(/35 g/)
    const second = await answerCoachPanelQuestion({
      appData: source(),
      messages: [
        { content: 'Hur ser mitt protein ut idag?', role: 'user' },
        { content: first.reply, role: 'assistant' },
        { content: 'Vad kan jag göra till middagen?', role: 'user' },
      ],
    })
    expect(second.source).toBe('local')
    expect(second.reply).toMatch(/35 g/)
    expect(second.reply).toMatch(/Ägg|Bönor|Fisk/)
  })

  it('says when personal data is missing and does not use a scan as measured weight', async () => {
    const result = await ask('Vad vägde jag senast?', source({
      weights: [{ date: '2026-09-28', estimatedWeightKg: 70, source: 'Kroppsscanning', value: 70 }],
    }))
    expect(result.source).toBe('context-gap')
    expect(result.reply).toMatch(/saknas/)
    expect(result.reply).toMatch(/används inte som uppmätt vikt/)
    expect(result.reply).not.toMatch(/Senaste registrerade vikten är 70/)
  })

  it('keeps only the latest bounded history for a follow-up', async () => {
    const filler = Array.from({ length: 8 }, () => ({ content: 'Hej igen', role: 'user' }))
    const dropped = await answerCoachPanelQuestion({
      appData: source(),
      messages: [
        { content: 'Hur ser mitt protein ut idag?', role: 'user' },
        ...filler,
        { content: 'Vad kan jag göra till middagen?', role: 'user' },
      ],
    })
    expect(dropped.reply).not.toMatch(/35 g/)
  })

  it('uses an injected model answer for a complex question and no live provider by default', async () => {
    const statuses = []
    const modelAnswer = vi.fn(async () => ({
      answer: 'Fokusera på protein till en måltid du redan äter.',
      ok: true,
      source: 'openai',
    }))
    const mocked = await ask('Utifrån min vecka, vad tycker du att jag ska fokusera på?', source(), {
      modelAnswer,
      onStatus: (status) => statuses.push(status),
    })
    expect(modelAnswer).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['AI-coachen formulerar ett svar.'])
    expect(mocked.source).toBe('openai')
    expect(mocked.reply).toMatch(/protein/)
    expect(mocked.tool).toBeNull()

    requestCoachModelReply.mockClear()
    requestCoachModelReply.mockResolvedValue({
      answer: 'Fokusera på en promenad den här veckan.',
      ok: true,
      source: 'openai',
    })
    const routed = await ask('Utifrån min vecka, vad tycker du att jag ska fokusera på?')
    expect(requestCoachModelReply).toHaveBeenCalledTimes(1)
    expect(routed.source).toBe('openai')
    expect(routed.reply).toMatch(/promenad/)
    const sent = requestCoachModelReply.mock.calls[0][0]
    expect(JSON.stringify(sent)).not.toMatch(/Ada|secret@example.com|Storgatan|premium/)
  })

  it('keeps a local answer when the shared budget blocks the model', async () => {
    const fetchImpl = vi.fn()
    const result = await ask('Utifrån min vecka, vad tycker du att jag ska fokusera på?', source(), {
      modelAnswer: (input) => answerCoachQuestion({
        body: { messages: input.messages },
        contextProvider: () => input.context,
        env: { AI_HELP_BUDGET_SEK: '0', OPENAI_API_KEY: 'test-not-used' },
        fetchImpl,
      }),
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.source).toBe('local')
    expect(result.reply).toMatch(/veckofokus|protein|promenad/i)
  })

  it('keeps the earlier conversation when the provider fails', async () => {
    const history = [
      { content: 'Hur fungerar vikttrend?', role: 'user' },
      { content: 'En vikttrend läses över flera veckor.', role: 'assistant' },
      { content: 'Utifrån min vecka, vad tycker du att jag ska fokusera på?', role: 'user' },
    ]
    const failed = await answerCoachPanelQuestion({
      appData: source(),
      messages: history,
      modelAnswer: async () => {
        throw new Error('provider down')
      },
    })
    expect(failed.source).toBe('provider-unavailable')
    expect(failed.reply).toMatch(/kunde inte svara/)
    expect(history[0].content).toBe('Hur fungerar vikttrend?')
    const again = await answerCoachPanelQuestion({
      appData: source(),
      messages: [
        ...history,
        { content: failed.reply, role: 'assistant' },
        { content: 'Hur fungerar vikttrend?', role: 'user' },
      ],
    })
    expect(again.source).toBe('local')
    expect(again.reply).toMatch(/flera veckor/)
  })

  it('shows a knowledge gap without guessing', async () => {
    const result = await ask('Hur odlar jag en drake?')
    expect(result.source).toBe('knowledge-gap')
    expect(result.reply).toMatch(/gissar inte/)
    expect(result.reply).not.toMatch(/88\.4|drake väger/)
  })

  it('refuses a diagnosis and still coaches a walk', async () => {
    const diagnosis = await ask('Har jag diabetes?')
    expect(diagnosis.source).toBe('safety')
    expect(diagnosis.reply).toMatch(/kan inte bedöma/)
    expect(diagnosis.reply).not.toMatch(/du har diabetes/i)
    const walk = await ask('Är en promenad bra aktivitet?')
    expect(walk.source).toBe('local')
    expect(walk.reply).not.toMatch(/kan inte bedöma sjukdom/)
  })

  it('classifies a help question without transferring personal data', async () => {
    const result = await ask('Var hittar jag viktgrafen?')
    expect(result.source).toBe('other-domain')
    expect(result.reply).toMatch(/AI-Hjälpen/)
    expect(result.handoff).toBe(false)
    expect(result.performed).toBe(false)
    expect(result.reply).not.toMatch(/88\.4|handoff completed|öppnade/i)
  })

  it('sends only the narrow context fields and keeps tools empty', () => {
    const narrow = narrowCoachPanelSource(source())
    expect(narrow.profile.displayName).toBeUndefined()
    expect(narrow.profile.heightCm).toBeUndefined()
    expect(JSON.stringify(narrow)).not.toMatch(/Ada|secret@example.com|Storgatan|premium/)
    expect(COACH_TOOL_ALLOWLIST).toEqual([])
  })

  it('does not call the old chat engine or the old /api/ai payment path', () => {
    const panel = readFileSync(new URL('./coachPanelReply.js', import.meta.url), 'utf8')
    const client = readFileSync(new URL('./coachModelClient.js', import.meta.url), 'utf8')
    const controller = readFileSync(new URL('../../services/ai/aiChatController.js', import.meta.url), 'utf8')
    const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
    const request = controller.slice(controller.indexOf('export async function requestCoachChatReply'))
    expect(panel).not.toMatch(/aiApiService|requestAiEndpoint|\/api\/ai|createDeterministicAiCoachReply|costGuard|node:crypto/)
    expect(client).toContain('/api/ai-coach')
    expect(client).not.toMatch(/\/api\/ai(?!-coach)|requestAiEndpoint|OPENAI_API_KEY|SERVICE_ROLE|node:crypto/)
    expect(request).not.toMatch(/createDeterministicChatReply|createLocalSmartChatReply|requestAiEndpoint|\/api\/ai|fallbackReply/)
    expect(app).toMatch(/if \(chatRequestInFlightRef\.current\)/)
  })
})

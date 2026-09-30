import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { answerCoachQuestion } from '../../../api/_shared/aiCoach/service.js'
import { explainCoachRoute, routeCoachQuestion } from './coachRouter.js'
import { buildCoachPersonalContext, createViktkollenCoachContext } from './coachDataProvider.js'

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
      { done: false, label: 'Kvällspromenad' },
    ],
    location: { lat: 59.33, lng: 18.06 },
    meals: [
      { date: '2026-09-30', name: 'Lunch', protein: 20 },
      { date: '2026-09-30', name: 'Middag', protein: 15 },
      { date: '2026-09-01', name: 'Gammal frukost', protein: 40 },
    ],
    nutritionGoals: { protein: { target: 90 } },
    payment: { card: '4111111111111111' },
    phone: '0700000000',
    photos: ['progress.jpg'],
    profile: {
      dietaryPreferences: { avoidedFoods: ['nötter'], dietType: 'vegetarian' },
      displayName: 'Ada',
      goalWeight: '85',
      heightCm: 170,
      weightDirection: 'loss',
    },
    subscription: { plan: 'premium' },
    weights: [
      { date: '2026-09-01', source: 'Manuell', value: 90 },
      { date: '2026-09-20', source: 'Manuell', value: 88.4 },
      { date: '2026-09-28', estimatedWeightKg: 70, source: 'Kroppsscanning', value: 70 },
    ],
    ...extra,
  }
}

function ask(content, context) {
  const route = routeCoachQuestion({ context, languageCode: 'sv', messages: [{ content, role: 'user' }] })
  return { explained: explainCoachRoute(route, context), route }
}

describe('Viktkollen coach context', () => {
  it('projects measured weight, goal, meals, protein, activity, habits and preferences', () => {
    const context = buildCoachPersonalContext(source(), { today })
    expect(context.weightTrend).toMatchObject({
      changeKg: -1.6,
      direction: 'ned',
      latestKg: 88.4,
      pointCount: 2,
      source: 'measured_or_user_entered',
      status: 'trend',
    })
    expect(context.weightTrend.points).toEqual([
      { date: '2026-09-01', kg: 90 },
      { date: '2026-09-20', kg: 88.4 },
    ])
    expect(context.weightTrend.bodyScanEstimate).toEqual({ maxKg: 84, minKg: 80, source: 'ai_estimated' })
    expect(JSON.stringify(context.weightTrend.points)).not.toContain('70')
    expect(context.goal).toMatchObject({ direction: 'loss', goalKg: 85, latestMeasuredKg: 88.4, remainingKg: 3.4 })
    expect(context.meals).toEqual({ count: 2, names: ['Lunch', 'Middag'], source: 'logged_meals' })
    expect(context.protein).toMatchObject({ grams: 35, mealCount: 2, status: 'logged', targetGrams: 90 })
    expect(context.activity).toEqual({ source: 'check-in', steps: 4200, workout: 'promenad' })
    expect(context.habits).toMatchObject({ done: 1, total: 2 })
    expect(context.preferences).toMatchObject({ avoidedFoods: ['nötter'], dietType: 'vegetarian' })
    const packed = JSON.stringify(context)
    for (const secret of ['Ada', 'secret@example.com', '0700000000', 'Storgatan', '4111', 'premium', '59.33', 'progress.jpg', '170']) {
      expect(packed).not.toContain(secret)
    }
  })

  it('keeps an empty log and a single weigh-in from becoming a trend', () => {
    const empty = buildCoachPersonalContext({ bodyAnalysisHistory: source().bodyAnalysisHistory, weights: [] }, { today })
    expect(empty.weightTrend.status).toBe('missing')
    expect(empty.weightTrend.latestKg).toBeUndefined()
    const one = buildCoachPersonalContext({ weights: [{ date: '2026-09-20', source: 'Manuell', value: 88.4 }] }, { today })
    expect(one.weightTrend).toMatchObject({ latestKg: 88.4, pointCount: 1, status: 'single' })
    expect(one.weightTrend.changeKg).toBeUndefined()
  })

  it('answers personal weight questions from the provider and keeps a general question general', () => {
    const context = buildCoachPersonalContext(source(), { today })
    const trend = ask('Hur har min vikt utvecklats?', context)
    expect(trend.route.kind).toBe('local')
    expect(trend.explained.answer).toMatch(/88\.4 kg/)
    expect(trend.explained.answer).toMatch(/-1\.6 kg/)
    expect(trend.explained.answer).toMatch(/ingår inte i den uppmätta vikten/)
    const latest = ask('Vad vägde jag senast?', context)
    expect(latest.explained.answer).toMatch(/88\.4 kg/)
    const goal = ask('Hur ligger jag till mot mitt mål?', context)
    expect(goal.explained.answer).toMatch(/85 kg/)
    expect(goal.explained.answer).toMatch(/3\.4 kg/)
    const general = ask('Hur fungerar vikttrend?', context)
    expect(general.route.kind).toBe('local')
    expect(general.explained.answer).not.toMatch(/88\.4|82/)
    const missing = ask('Hur har min vikt utvecklats?', buildCoachPersonalContext({ weights: [], bodyAnalysisHistory: source().bodyAnalysisHistory }, { today }))
    expect(missing.route.kind).toBe('context-gap')
    expect(missing.explained.answer).toMatch(/saknas/)
    expect(missing.explained.answer).toMatch(/används inte som uppmätt vikt/)
    expect(missing.explained.answer).not.toMatch(/Senaste registrerade vikten är 82/)
    const single = ask('Hur har min vikt utvecklats?', buildCoachPersonalContext({ weights: [{ date: '2026-09-20', source: 'Manuell', value: 88.4 }] }, { today }))
    expect(single.explained.answer).toMatch(/bara ett värde/)
    expect(single.explained.answer).not.toMatch(/-1\.6/)
  })

  it('answers protein, meals, activity and habits without inventing missing pieces', () => {
    const context = buildCoachPersonalContext(source(), { today })
    expect(ask('Hur ser mitt protein ut idag?', context).explained.answer).toMatch(/35 g/)
    expect(ask('Vad åt jag idag?', context).explained.answer).toMatch(/Lunch/)
    expect(ask('Hur har min aktivitet varit?', context).explained.answer).toMatch(/4200 steg/)
    expect(ask('Hur går det med mina vanor?', context).explained.answer).toMatch(/1 av 2/)
    const noProtein = ask('Har jag fått i mig tillräckligt med protein idag?', buildCoachPersonalContext({ weights: source().weights }, { today }))
    expect(noProtein.route.kind).toBe('context-gap')
    expect(noProtein.explained.answer).toMatch(/saknas/)
    expect(noProtein.explained.answer).not.toMatch(/\d+\s*g/)
  })

  it('answers a personal weight locally when the model budget is closed and filters model context', async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({ output_text: JSON.stringify({ answer: 'Ett fokus räcker.', status: 'answered' }), usage: { input_tokens: 10, output_tokens: 4 } }),
      ok: true,
    }))
    const local = await answerCoachQuestion({
      body: { language: 'sv', messages: [{ content: 'Hur har min vikt utvecklats?', role: 'user' }] },
      contextProvider: createViktkollenCoachContext(source(), { today }),
      env: { AI_HELP_BUDGET_SEK: '0', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'coach-user',
    })
    expect(local.source).toBe('local')
    expect(local.answer).toMatch(/88\.4 kg/)
    expect(local.tool).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()

    const modelFetch = vi.fn(async () => ({
      json: async () => ({ output_text: JSON.stringify({ answer: 'Protein och måltider räcker som underlag.', status: 'answered' }), usage: { input_tokens: 11, output_tokens: 5 } }),
      ok: true,
    }))
    await answerCoachQuestion({
      body: { language: 'sv', messages: [{ content: 'Jämför protein och måltider för mig', role: 'user' }] },
      contextProvider: createViktkollenCoachContext(source(), { today }),
      costStore: { reserve: async () => ({ ok: true, reservationId: 'r1' }), settle: async () => ({ ok: true }) },
      env: { AI_HELP_BUDGET_SEK: '10', OPENAI_API_KEY: 'test-key' },
      fetchImpl: modelFetch,
      userId: 'coach-user',
    })
    const instructions = JSON.parse(modelFetch.mock.calls[0][1].body).input[0].content[0].text
    expect(instructions).toContain('35')
    expect(instructions).toContain('Lunch')
    expect(instructions).not.toContain('88.4')
    expect(instructions).not.toContain('Ada')
    expect(instructions).not.toContain('secret@example.com')
    expect(instructions).not.toContain('4111')
    const providerSource = readFileSync(new URL('./coachDataProvider.js', import.meta.url), 'utf8')
    const serviceSource = readFileSync(new URL('../../../api/_shared/aiCoach/service.js', import.meta.url), 'utf8')
    expect(providerSource).not.toMatch(/console\.(log|debug|info)/)
    expect(serviceSource).not.toMatch(/console\.(log|debug|info)/)
    expect(serviceSource).not.toMatch(/userDataRepository|supabase/)
  })
})

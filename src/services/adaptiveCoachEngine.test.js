import { describe, expect, it } from 'vitest'

import { buildAdaptiveCoach } from './adaptiveCoachEngine.js'

const analysisDate = '2026-07-31'

function baseData(overrides = {}) {
  return {
    checkIn: { date: analysisDate, energy: 6, mood: 'Fokuserad', steps: 7200, workout: true },
    goalsHabits: {
      habits: [{ id: 'h1', status: 'active', title: 'Kvällspromenad', trackingMode: 'manual' }],
      weeklyFocus: [{ action: 'Ta en kort promenad efter middagen.', id: 'f1', order: 1, status: 'active', title: 'Rörelse efter middag' }],
    },
    meals: [
      { calories: 450, date: '2026-07-30', id: 'm1', name: 'Kyckling och ris', protein: 35, type: 'Lunch' },
      { calories: 380, date: analysisDate, id: 'm2', name: 'Ägg och kvarg', protein: 38, type: 'Frukost' },
      { calories: 520, date: analysisDate, id: 'm3', name: 'Lax och potatis', protein: 42, type: 'Middag' },
    ],
    nutritionGoals: { protein: '108-144 g' },
    profile: { goalWeight: 78, startWeight: 91.8 },
    reminderState: {
      reminders: [{ enabled: true, id: 'r1', scheduleType: 'daily', time: '08:00', title: 'Check-in' }],
    },
    today: analysisDate,
    weights: [
      { date: '2026-07-24', id: 'w1', time: '08:00', value: 91.8 },
      { date: '2026-07-28', id: 'w2', time: '08:00', value: 90.4 },
      { date: analysisDate, id: 'w3', time: '08:00', value: 89.6 },
    ],
    ...overrides,
  }
}

describe('adaptiveCoachEngine', () => {
  it('prioritizes at most three non-duplicated recommendations from shared data', () => {
    const model = buildAdaptiveCoach(baseData(), { analysisDate, now: `${analysisDate}T12:00:00.000Z` })

    expect(model.recommendations.length).toBeGreaterThan(0)
    expect(model.recommendations.length).toBeLessThanOrEqual(3)
    expect(new Set(model.recommendations.map((item) => item.area)).size).toBe(model.recommendations.length)
    expect(model.sourceStatus.analytics).toBe('sharedAnalyticsEngine')
    expect(model.sourceStatus.nutrition).toBe('aiNutritionInsights')
    expect(model.sourceStatus.reminders).toBe('reminderEngineV2')
  })

  it('uses coverage and confidence without inventing data', () => {
    const model = buildAdaptiveCoach(baseData({ goalsHabits: {}, meals: [], weights: [] }), { analysisDate })

    expect(model.coverage.weightDays).toBe(0)
    expect(model.coverage.mealDays).toBe(0)
    expect(model.confidence.value).toBeLessThan(0.7)
    expect(model.summary.todayFocus).toMatch(/registrering|Logga|check-in/i)
  })

  it('softens recommendations and avoids unsafe medical or extreme advice', () => {
    const model = buildAdaptiveCoach(baseData(), { analysisDate })
    const text = JSON.stringify(model.recommendations).toLocaleLowerCase('sv-SE')

    expect(text).not.toMatch(/diagnos|svält|extrem|straff|förbjud|hoppa över måltid/)
    expect(model.safetyNote).toMatch(/diagnoser|vård/i)
  })

  it('uses reminder state as an input signal without creating storage', () => {
    const model = buildAdaptiveCoach(baseData({
      reminderState: {
        reminders: [{ enabled: true, id: 'due', lastTriggeredAt: '', scheduleType: 'daily', time: '08:00', title: 'Frukost' }],
      },
    }), { analysisDate, now: `${analysisDate}T12:30:00.000Z` })

    expect(model.signals.reminders.enabledCount).toBe(1)
    expect(model.signals.reminders.dueCount).toBe(1)
    expect(model.recommendations.some((item) => item.area === 'reminders')).toBe(true)
  })
})

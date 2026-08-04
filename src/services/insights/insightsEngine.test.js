import { describe, expect, it } from 'vitest'
import { buildInsightsEngine } from './insightsEngine.js'

const today = '2026-08-04'

function baseData(overrides = {}) {
  return {
    adaptiveCoachFeedback: {
      recommendations: [
        { id: 'c1', status: 'accepted', title: 'Protein' },
        { id: 'c2', status: 'completed', title: 'Promenad' },
      ],
      history: [{ at: '2026-08-03T10:00:00.000Z', status: 'completed', title: 'Promenad' }],
    },
    checkIn: {
      date: '2026-08-03',
      energy: 7,
      steps: 8000,
    },
    checkIns: [
      { date: '2026-08-01', energy: 5, steps: 6000 },
      { date: '2026-08-02', energy: 6, steps: 7000 },
      { date: '2026-08-03', energy: 7, steps: 8000 },
    ],
    goalsHabits: {
      goals: [{ id: 'g1', status: 'active' }],
      habits: [{ completedDates: [today], id: 'h1', status: 'active' }],
    },
    meals: [
      { calories: 500, date: '2026-08-01', id: 'm1', protein: 35, text: 'Kyckling' },
      { calories: 520, date: '2026-08-02', id: 'm2', protein: 36, text: 'Kvarg' },
      { calories: 510, date: '2026-08-03', id: 'm3', protein: 36, text: 'Ägg' },
    ],
    nutritionGoals: { protein: 100 },
    profile: { goal: 'gå ner i vikt', goalWeight: 78 },
    reminderState: {
      history: [
        { action: 'completed', at: '2026-08-01T09:00:00.000Z', id: 'r1', reminderId: 'r1' },
        { action: 'completed', at: '2026-08-02T09:00:00.000Z', id: 'r2', reminderId: 'r1' },
      ],
      notificationsV3: {
        history: [{ at: '2026-08-03T09:00:00.000Z', id: 'n1', status: 'completed', title: 'Måltid' }],
      },
    },
    today,
    weights: [
      { date: '2026-07-29', value: 91.8 },
      { date: '2026-08-01', value: 90.8 },
      { date: '2026-08-04', value: 89.6 },
    ],
    ...overrides,
  }
}

describe('insightsEngine', () => {
  it('builds score momentum consistency coverage and confidence', () => {
    const model = buildInsightsEngine(baseData(), { analysisDate: today, period: '30d' })

    expect(model.score).toBeGreaterThan(0)
    expect(model.momentum).toBeGreaterThan(0)
    expect(model.consistency).toBeGreaterThan(0)
    expect(model.coverage).toBeGreaterThan(0)
    expect(model.confidence).toBeGreaterThan(0)
})

  it('detects a weight trend in the goal direction', () => {
    const model = buildInsightsEngine(baseData(), { analysisDate: today, period: '30d' })

    expect(model.trends.weight.direction).toBe('down')
    expect(model.improvementSignals.map((item) => item.id)).toContain('weight-improved')
  })

  it('detects stable protein when data supports it', () => {
    const model = buildInsightsEngine(baseData(), { analysisDate: today, period: '30d' })

    expect(model.trends.protein.direction).toBe('stable')
    expect(model.improvementSignals.map((item) => item.id)).toContain('protein-stable')
  })

  it('detects decreased activity as neutral regression', () => {
    const model = buildInsightsEngine(baseData({
      checkIn: { date: '2026-08-03', energy: 5, steps: 3000 },
      checkIns: [
        { date: '2026-08-01', energy: 7, steps: 9000 },
        { date: '2026-08-02', energy: 6, steps: 5000 },
        { date: '2026-08-03', energy: 5, steps: 3000 },
      ],
    }), { analysisDate: today, period: '30d' })

    expect(model.regressionSignals.map((item) => item.id)).toContain('steps-down')
  })

  it('uses reminder completion and notification history', () => {
    const model = buildInsightsEngine(baseData(), { analysisDate: today, period: '30d' })

    expect(model.trends.reminderCompletion.rate).toBe(100)
    expect(model.notificationSummary.completed).toBe(1)
  })

  it('uses coach acceptance without inventing data', () => {
    const model = buildInsightsEngine(baseData(), { analysisDate: today, period: '30d' })

    expect(model.trends.coachAcceptance.rate).not.toBeNull()
    expect(JSON.stringify(model)).not.toContain('undefined')
  })

  it('returns conservative fallback for empty data', () => {
    const model = buildInsightsEngine({}, { analysisDate: today, period: '30d' })

    expect(model.coverage).toBe(0)
    expect(model.trends.weight.direction).toBe('insufficient')
    expect(model.insights.length).toBeGreaterThan(0)
  })

  it('includes scanner usage signal', () => {
    const model = buildInsightsEngine(baseData({
      meals: [{ createdAt: '2026-08-02T10:00:00.000Z', id: 'p1', photoAnalysis: { provider: 'local' }, text: 'Foto' }],
    }), { analysisDate: today, period: '30d' })

    expect(model.trends.scannerUsage).toMatchObject({ id: 'scannerUsage' })
  })
})

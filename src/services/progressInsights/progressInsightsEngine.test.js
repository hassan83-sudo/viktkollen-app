import { describe, expect, it } from 'vitest'
import { buildProgressInsightsModel, progressInsightTypes } from './progressInsightsEngine.js'

const today = new Date('2026-08-11T12:00:00.000Z')

function date(day) {
  return `2026-08-${String(day).padStart(2, '0')}`
}

function baseData(overrides = {}) {
  return {
    checkIns: [],
    meals: [],
    nutritionGoals: { protein: 100 },
    profile: { goal: 'gå ner i vikt', goalWeight: 80, startWeight: 90 },
    today,
    weights: [],
    ...overrides,
  }
}

describe('progressInsightsEngine', () => {
  it('detects a positive weight trend toward the goal', () => {
    const model = buildProgressInsightsModel(baseData({
      weights: [
        { date: date(1), value: 90 },
        { date: date(11), value: 88.2 },
      ],
    }), { period: '30d', today })

    expect(model.mainInsights.some((insight) => insight.type === progressInsightTypes.positiveTrend)).toBe(true)
    expect(model.facts.weightChange30d).toBeCloseTo(-1.8)
  })

  it('detects stable weight and possible plateau with enough data', () => {
    const model = buildProgressInsightsModel(baseData({
      weights: [
        { date: date(1), value: 88 },
        { date: date(4), value: 88.1 },
        { date: date(8), value: 88 },
        { date: date(11), value: 88.2 },
      ],
    }), { period: '30d', today })

    expect(model.allInsights.some((insight) => insight.id === 'weight-plateau')).toBe(true)
    expect(model.allInsights.find((insight) => insight.id === 'weight-plateau')?.title).toContain('Möjlig platå')
  })

  it('flags unusually fast weight change with cautious copy', () => {
    const model = buildProgressInsightsModel(baseData({
      weights: [
        { date: date(1), value: 90 },
        { date: date(11), value: 86 },
      ],
    }), { period: '30d', today })

    const insight = model.mainInsights.find((item) => item.id === 'weight-fast-change')

    expect(insight?.type).toBe(progressInsightTypes.needsAttention)
    expect(insight?.action).toContain('kontakta vården vid oro')
  })

  it('uses insufficient data when there are too few weight points', () => {
    const model = buildProgressInsightsModel(baseData({
      weights: [{ date: date(11), value: 88 }],
    }), { period: '30d', today })

    expect(model.mainInsights[0].type).toBe(progressInsightTypes.insufficient)
    expect(model.nextBestAction).toContain('Logga vikten')
  })

  it('does not count null as zero but keeps real zero values', () => {
    const model = buildProgressInsightsModel(baseData({
      checkIns: [
        { date: date(10), steps: null },
        { date: date(11), steps: 0 },
      ],
      meals: [
        { date: date(10), id: 'missing', protein: null },
        { date: date(11), id: 'zero', protein: 0 },
      ],
    }), { period: '30d', today })

    expect(model.facts.averageSteps).toBe(0)
    expect(model.facts.mealDays).toBe(2)
    expect(JSON.stringify(model)).not.toMatch(/NaN|Infinity/)
  })

  it('compares this period with the previous period for protein and check-ins', () => {
    const meals = [
      { date: '2026-07-06', id: 'old-1', protein: 40 },
      { date: '2026-07-07', id: 'old-2', protein: 50 },
      { date: date(8), id: 'new-1', protein: 110 },
      { date: date(9), id: 'new-2', protein: 120 },
    ]
    const model = buildProgressInsightsModel(baseData({
      checkIns: [{ date: '2026-07-06', steps: 3000 }, { date: date(8), steps: 6000 }, { date: date(9), steps: 7000 }],
      meals,
      weights: [{ date: date(1), value: 90 }, { date: date(11), value: 89 }],
    }), { period: '30d', today })

    expect(model.comparison.hasComparison).toBe(true)
    expect(model.allInsights.some((insight) => insight.id === 'protein-comparison')).toBe(true)
    expect(model.comparison.checkInDelta).not.toBeNull()
  })

  it('keeps only three main insights and exposes one next action', () => {
    const model = buildProgressInsightsModel(baseData({
      bodyAnalysisHistory: [{ createdAt: date(1) }, { createdAt: date(11) }],
      checkIns: [{ date: date(8), steps: 1000 }, { date: date(9), steps: 1200 }],
      meals: [{ date: date(8), id: 'm1', protein: 20 }],
      progressPhotoItems: [{ createdAt: date(1), id: 'p1' }, { createdAt: date(11), id: 'p2' }],
      weights: [{ date: date(1), value: 90 }, { date: date(11), value: 86 }],
    }), { period: '30d', today })

    expect(model.mainInsights).toHaveLength(3)
    expect(model.nextBestAction).toBeTruthy()
  })

  it('is deterministic and local without remote AI source', () => {
    const first = buildProgressInsightsModel(baseData({
      weights: [{ date: date(1), value: 90 }, { date: date(11), value: 89 }],
    }), { period: '30d', today })
    const second = buildProgressInsightsModel(baseData({
      weights: [{ date: date(1), value: 90 }, { date: date(11), value: 89 }],
    }), { period: '30d', today })

    expect(first.source).toBe('deterministic')
    expect(second.mainInsights.map((insight) => insight.title)).toEqual(first.mainInsights.map((insight) => insight.title))
  })

  it('reports confidence and data coverage', () => {
    const model = buildProgressInsightsModel(baseData({
      checkIns: Array.from({ length: 8 }, (_, index) => ({ date: date(index + 1), steps: 6000 + index })),
      meals: Array.from({ length: 8 }, (_, index) => ({ date: date(index + 1), id: `m-${index}`, protein: 90 })),
      weights: [{ date: date(1), value: 90 }, { date: date(11), value: 89 }],
    }), { period: '30d', today })

    expect(model.confidence.label).toMatch(/Medel|Hög/)
    expect(model.coverage.mealDays).toBe(8)
    expect(model.coverage.checkInDays).toBe(8)
  })
})

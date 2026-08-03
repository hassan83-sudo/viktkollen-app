import { describe, expect, it } from 'vitest'

import { buildAdaptiveCoachStrategy } from './adaptiveCoachStrategy.js'

const analysisDate = '2026-07-31'

function base(overrides = {}) {
  return {
    adaptiveCoachFeedback: {},
    checkIns: [
      { date: '2026-07-21', energy: 6, steps: 7200 },
      { date: '2026-07-22', energy: 6, steps: 7100 },
      { date: '2026-07-23', energy: 6, steps: 7000 },
    ],
    meals: [
      { date: '2026-07-21', protein: 90 },
      { date: '2026-07-22', protein: 92 },
      { date: '2026-07-23', protein: 88 },
    ],
    nutritionGoals: { protein: '108-144 g' },
    profile: { goalWeight: 78, startWeight: 91.8 },
    weights: [
      { date: '2026-07-21', value: 91.8 },
      { date: analysisDate, value: 89.6 },
    ],
    ...overrides,
  }
}

describe('adaptiveCoachStrategy', () => {
  it('waits or improves coverage when data is sparse', () => {
    const strategy = buildAdaptiveCoachStrategy(base({ checkIns: [], meals: [], weights: [] }), { analysisDate })

    expect(['improveCoverage', 'waitForMoreData']).toContain(strategy.strategy)
    expect(strategy.explanation).toMatch(/underlag|Datatäckningen/)
  })

  it('reinforces success when completed outcomes exist', () => {
    const strategy = buildAdaptiveCoachStrategy(base({
      adaptiveCoachFeedback: {
        recommendations: [
          { area: 'nutrition', id: 'r1', status: 'completed', title: 'Protein', updatedAt: '2026-07-30T10:00:00.000Z' },
          { area: 'activity', id: 'r2', status: 'completed', title: 'Steg', updatedAt: '2026-07-29T10:00:00.000Z' },
        ],
      },
    }), { analysisDate })

    expect(strategy.strategy).toBe('reinforceSuccess')
  })

  it('continues active actions before creating more', () => {
    const strategy = buildAdaptiveCoachStrategy(base({
      adaptiveCoachFeedback: {
        recommendations: [{ area: 'nutrition', id: 'r1', lastActionStatus: 'active', linkedEntityId: 'g1', linkedEntityType: 'goal', status: 'accepted', title: 'Protein', updatedAt: '2026-07-30T10:00:00.000Z' }],
      },
    }), { analysisDate })

    expect(strategy.strategy).toBe('continueActiveAction')
  })

  it('simplifies action after many dismissed recommendations', () => {
    const strategy = buildAdaptiveCoachStrategy(base({
      adaptiveCoachFeedback: {
        recommendations: [
          { area: 'nutrition', id: 'r1', status: 'dismissed', title: 'A', updatedAt: '2026-07-30T10:00:00.000Z' },
          { area: 'activity', id: 'r2', status: 'dismissed', title: 'B', updatedAt: '2026-07-29T10:00:00.000Z' },
          { area: 'weight', id: 'r3', status: 'dismissed', title: 'C', updatedAt: '2026-07-28T10:00:00.000Z' },
        ],
      },
    }), { analysisDate })

    expect(strategy.strategy).toBe('simplifyAction')
  })

  it('returns max three recommendations and no profiling language', () => {
    const strategy = buildAdaptiveCoachStrategy(base(), { analysisDate })

    expect(strategy.recommendations.length).toBeLessThanOrEqual(3)
    expect(JSON.stringify(strategy)).not.toMatch(/lat|diagnos|kommer att|misslyckas/i)
  })

  it('is deterministic', () => {
    expect(buildAdaptiveCoachStrategy(base(), { analysisDate })).toEqual(buildAdaptiveCoachStrategy(base(), { analysisDate }))
  })
})

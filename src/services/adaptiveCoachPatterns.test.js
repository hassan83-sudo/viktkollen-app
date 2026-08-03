import { describe, expect, it } from 'vitest'

import {
  buildAdaptiveCoachPatterns,
  buildAdaptiveCoachPatternSummary,
  sanitizeCoachPatternText,
} from './adaptiveCoachPatterns.js'

const analysisDate = '2026-07-31'

function data(overrides = {}) {
  return {
    adaptiveCoachFeedback: {
      recommendations: [
        { area: 'nutrition', id: 'r1', status: 'completed', title: 'Protein', updatedAt: '2026-07-30T10:00:00.000Z' },
        { area: 'activity', id: 'r2', status: 'accepted', title: 'Promenad', updatedAt: '2026-07-29T10:00:00.000Z' },
      ],
    },
    checkIns: [
      { date: '2026-07-21', energy: 6, steps: 7200, time: '08:30' },
      { date: '2026-07-22', energy: 5, steps: 7600, time: '08:40' },
      { date: '2026-07-23', energy: 7, steps: 7000, time: '08:20' },
      { date: '2026-07-24', energy: 6, steps: 7400, time: '08:10' },
      { date: '2026-07-25', energy: 4, steps: 2800, time: '11:30' },
      { date: '2026-07-26', energy: 4, steps: 3200, time: '11:10' },
      { date: '2026-07-27', energy: 4, steps: 3200, time: '11:10' },
    ],
    meals: [
      { date: '2026-07-21', id: 'm1', protein: 95, time: '12:00' },
      { date: '2026-07-22', id: 'm2', protein: 100, time: '12:15' },
      { date: '2026-07-23', id: 'm3', protein: 92, time: '18:00' },
      { date: '2026-07-25', id: 'm4', protein: 38, time: '19:00' },
      { date: '2026-07-26', id: 'm5', protein: 42, time: '20:00' },
      { date: '2026-07-27', id: 'm6', protein: 44, time: '20:00' },
      { date: '2026-07-28', id: 'planned', planned: true, protein: 200, time: '12:00' },
    ],
    weights: [
      { date: '2026-07-21', value: 91.8 },
      { date: '2026-07-31', value: 89.6 },
    ],
    ...overrides,
  }
}

describe('adaptiveCoachPatterns', () => {
  it('detects supported weekday and weekend differences from observed data', () => {
    const result = buildAdaptiveCoachPatterns(data(), { analysisDate, days: 14 })

    expect(result.patterns.some((pattern) => ['weekdayDifference', 'weekendDifference'].includes(pattern.patternType) && pattern.eligibility !== 'insufficient')).toBe(true)
    expect(result.patterns.some((pattern) => pattern.textualSummary.includes('vardagar') || pattern.textualSummary.includes('helger'))).toBe(true)
  })

  it('does not count planned meals as actual meal evidence', () => {
    const result = buildAdaptiveCoachPatterns(data(), { analysisDate, days: 14 })
    const nutrition = result.patterns.find((pattern) => pattern.category === 'nutrition' && ['consistency', 'recurringGap'].includes(pattern.patternType))

    expect(nutrition.evidence.join(' ')).toContain('6 registrerade dagar')
    expect(nutrition.evidence.join(' ')).not.toContain('7 registrerade dagar')
  })

  it('marks single observations as insufficient instead of creating a pattern', () => {
    const result = buildAdaptiveCoachPatterns(data({ checkIns: [{ date: analysisDate, energy: 5, steps: 6000 }], meals: [], weights: [] }), { analysisDate })

    expect(result.patterns.every((pattern) => pattern.sampleSize !== 1 || pattern.eligibility === 'insufficient')).toBe(true)
  })

  it('returns deterministic output for the same explicit analysis date', () => {
    const first = buildAdaptiveCoachPatterns(data(), { analysisDate, days: 14 })
    const second = buildAdaptiveCoachPatterns(data(), { analysisDate, days: 14 })

    expect(second).toEqual(first)
  })

  it('separates missing data from zero values', () => {
    const result = buildAdaptiveCoachPatterns(data({ checkIns: [{ date: analysisDate, energy: 0, steps: 0 }], meals: [], weights: [] }), { analysisDate })

    expect(result.patterns.some((pattern) => pattern.sampleSize === 1 && pattern.eligibility === 'insufficient')).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('summarizes top patterns without leaking internal scoring', () => {
    const summary = buildAdaptiveCoachPatternSummary(data(), { analysisDate, days: 14 })

    expect(summary.topPatterns.length).toBeLessThanOrEqual(3)
    expect(summary.text).toMatch(/Registrerad data|Under registrerade dagar|Coachhistoriken/)
    expect(summary.text).not.toMatch(/score|profil|diagnos/i)
  })

  it('neutralizes unsafe pattern text', () => {
    expect(sanitizeCoachPatternText('Du kommer att misslyckas')).toContain('neutraliserats')
  })
})

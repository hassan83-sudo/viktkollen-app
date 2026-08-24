import { describe, expect, it } from 'vitest'

import {
  buildClothingAdvice,
  buildHomeBodyToday,
  buildScanComparison,
  buildWeightTrend,
  classifyWindMs,
  formatTimeUntil,
} from './homeBodyToday.js'

describe('homeBodyToday', () => {
  it('computes 7 and 30 day weight change from real history only', () => {
    const trend = buildWeightTrend([
      { date: '2026-07-21', value: 85.2 },
      { date: '2026-08-13', value: 84.4 },
      { date: '2026-08-20', value: 83.8 },
    ], null, new Date('2026-08-20T12:00:00'))

    expect(trend.currentKg).toBe(83.8)
    expect(trend.change7dKg).toBe(-0.6)
    expect(trend.change30dKg).toBe(-1.4)
    expect(trend.trend).toBe('down')
  })

  it('does not invent a change when older weights are missing', () => {
    const trend = buildWeightTrend(
      [{ date: '2026-08-20', value: 83.8 }],
      null,
      new Date('2026-08-20T12:00:00'),
    )

    expect(trend.currentKg).toBe(83.8)
    expect(trend.change7dKg).toBeNull()
    expect(trend.change30dKg).toBeNull()
    expect(trend.trendLabel).toBe('')
  })

  it('compares scans cautiously when ranges overlap', () => {
    const comparison = buildScanComparison([
      {
        createdAt: '2026-08-20T08:40:00.000Z',
        result: {
          confidence: 'medium',
          estimatedMeasurements: { waistCm: { max: 92.2, min: 90.2 } },
          measuredWeight: { valueKg: 82.9 },
        },
      },
      {
        createdAt: '2026-08-10T08:40:00.000Z',
        result: {
          estimatedMeasurements: { waistCm: { max: 92, min: 90 } },
          measuredWeight: { valueKg: 83.8 },
        },
      },
    ])

    expect(comparison.weight.change).toBeCloseTo(-0.9)
    expect(comparison.measurements[0].changeLabel).toBe('Ingen säker förändring')
  })

  it('builds clothing advice from weather without UV claims', () => {
    const advice = buildClothingAdvice({
      condition: 'Regn',
      hasLiveWeather: true,
      precipitationRiskPercent: 55,
      sunset: '2026-08-20T20:28:00',
      temperatureC: 16,
      windSpeedMs: 7,
    }, new Date('2026-08-20T18:14:00'))

    expect(advice.available).toBe(true)
    expect(advice.mentionsUv).toBe(false)
    expect(advice.lines.join(' ')).toMatch(/hoodie|jacka/i)
    expect(advice.lines.join(' ')).toMatch(/7 m\/s|kyligt/)
    expect(advice.lines.join(' ')).toMatch(/regnjacka|paraply/)
    expect(advice.lines.join(' ')).not.toMatch(/UV|uv-index/i)
    expect(classifyWindMs(7).label).toBe('Måttlig vind')
    expect(formatTimeUntil('2026-08-20T20:28:00', new Date('2026-08-20T18:14:00'))).toBe('2 h 14 min kvar')
  })

  it('keeps empty weather and clothing states honest', () => {
    const today = buildHomeBodyToday({
      history: [],
      weather: { hasLiveWeather: false },
      weights: [],
    })

    expect(today.weightTrend.currentKg).toBeNull()
    expect(today.scan.latest).toBeNull()
    expect(today.clothing.available).toBe(false)
    expect(today.clothing.emptyLabel).toMatch(/väderdata/)
  })
})

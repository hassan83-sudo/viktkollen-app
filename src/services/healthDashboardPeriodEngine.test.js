import { describe, expect, it } from 'vitest'
import {
  buildHealthDashboardPeriod,
  buildPeriodBuckets,
  buildTrendSeries,
  collectAvailableDates,
  compareMetricPeriods,
  healthDashboardPeriodDefinitions,
} from './healthDashboardPeriodEngine.js'

describe('Health Dashboard V3 period engine', () => {
  it('defines native short long and all periods', () => {
    expect(healthDashboardPeriodDefinitions.map((period) => period.id)).toEqual(['7d', '30d', '90d', '180d', '365d', 'all'])
  })

  it.each([
    ['7d', '2026-03-25', '2026-03-31', 'day'],
    ['30d', '2026-03-02', '2026-03-31', 'day'],
    ['90d', '2026-01-01', '2026-03-31', 'week'],
    ['180d', '2025-10-03', '2026-03-31', 'week'],
    ['365d', '2025-04-01', '2026-03-31', 'month'],
  ])('builds %s period with deterministic range and buckets', (period, start, end, bucketStrategy) => {
    const result = buildHealthDashboardPeriod(period, { analysisDate: '2026-03-31' })

    expect(result.start).toBe(start)
    expect(result.end).toBe(end)
    expect(result.bucketStrategy).toBe(bucketStrategy)
    expect(result.previousPeriod).not.toBeNull()
    expect(result.previousEnd < result.start).toBe(true)
  })

  it('uses available data for all period without reading the system date', () => {
    const result = buildHealthDashboardPeriod('all', {
      analysisDate: '2026-03-31',
      availableDates: {
        meals: [{ date: '2026-03-20' }],
        weights: [{ date: '2026-01-05' }],
      },
    })

    expect(result.start).toBe('2026-01-05')
    expect(result.end).toBe('2026-03-31')
    expect(result.previousPeriod).toBeNull()
  })

  it('handles leap year ranges', () => {
    const result = buildHealthDashboardPeriod('7d', { analysisDate: '2024-03-01' })

    expect(result.start).toBe('2024-02-24')
    expect(result.calendarDays).toBe(7)
  })

  it('handles year boundaries without overlapping comparison ranges', () => {
    const result = buildHealthDashboardPeriod('30d', { analysisDate: '2026-01-05' })

    expect(result.start).toBe('2025-12-07')
    expect(result.previousEnd).toBe('2025-12-06')
    expect(result.previousStart).toBe('2025-11-07')
  })

  it('collects available dates from mixed entry formats', () => {
    expect(collectAvailableDates({
      checkIns: [{ date: '2026-03-29T22:00:00' }],
      meals: [{ date: '2026-03-30' }],
      weights: ['2026-03-31'],
    })).toEqual(['2026-03-29', '2026-03-30', '2026-03-31'])
  })

  it('creates empty buckets without treating them as zero', () => {
    const period = buildHealthDashboardPeriod('7d', { analysisDate: '2026-03-31' })
    const series = buildTrendSeries({
      entries: [{ date: '2026-03-31', value: 89.6 }],
      id: 'weight',
      label: 'Vikt',
      period,
      unit: 'kg',
    })

    expect(series.points).toHaveLength(7)
    expect(series.points.filter((point) => point.hasData)).toHaveLength(1)
    expect(series.points.find((point) => !point.hasData).value).toBeNull()
  })

  it('limits long period chart points with month buckets', () => {
    const period = buildHealthDashboardPeriod('365d', { analysisDate: '2026-12-31' })
    const buckets = buildPeriodBuckets(period)

    expect(period.bucketStrategy).toBe('month')
    expect(buckets.length).toBe(12)
  })

  it('compares metrics without percentages from zero', () => {
    const comparison = compareMetricPeriods({
      currentValue: 10,
      label: 'Protein',
      previousValue: 0,
      unit: 'g',
    })

    expect(comparison.absoluteDifference).toBe(10)
    expect(comparison.percentDifference).toBeNull()
  })

  it('marks comparison as not comparable when coverage differs too much', () => {
    const comparison = compareMetricPeriods({
      currentCoverage: 0.9,
      currentValue: 10,
      label: 'Måltider',
      previousCoverage: 0.1,
      previousValue: 8,
    })

    expect(comparison.comparisonStatus).toBe('notComparable')
  })
})

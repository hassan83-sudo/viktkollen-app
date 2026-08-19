import { describe, expect, it } from 'vitest'
import {
  calculateRobustWeeklyTrend,
  forecastGoalProgress,
  normalizeForecastWeights,
  progressForecastInternals,
} from './progressForecast.js'

const today = new Date('2026-02-28T12:00:00.000Z')

const weights = [
  { date: '2026-01-01', value: 92 },
  { date: '2026-01-08', value: 91.5 },
  { date: '2026-01-15', value: 91 },
  { date: '2026-01-22', value: 90.5 },
  { date: '2026-01-29', value: 90 },
]

describe('progress forecast normalization', () => {
  it.each([
    ['valid entries', weights, 5],
    ['invalid weight', [{ date: '2026-01-01', value: 'NaN' }], 0],
    ['future weight', [{ date: '2027-01-01', value: 90 }], 0],
    ['too low weight', [{ date: '2026-01-01', value: 20 }], 0],
    ['too high weight', [{ date: '2026-01-01', value: 400 }], 0],
    ['weight alias', [{ date: '2026-01-01', weight: '90,1 kg' }], 1],
    ['invalid date', [{ date: 'bad', value: 90 }], 0],
    ['null list', null, 0],
  ])('handles %s', (_, input, expected) => {
    expect(normalizeForecastWeights(input, today)).toHaveLength(expected)
  })

  it('sorts by date', () => {
    expect(normalizeForecastWeights([weights[2], weights[0]], today)[0].date).toBe('2026-01-01')
  })
})

describe('robust weekly trend', () => {
  it('calculates downward weekly rate', () => {
    expect(calculateRobustWeeklyTrend(weights, { today }).weeklyRate).toBeLessThan(0)
  })

  it('requires at least three weights', () => {
    expect(calculateRobustWeeklyTrend(weights.slice(0, 2), { today })).toBeNull()
  })

  it('requires at least fourteen days', () => {
    expect(calculateRobustWeeklyTrend([
      { date: '2026-02-01', value: 91 },
      { date: '2026-02-05', value: 90.8 },
      { date: '2026-02-07', value: 90.6 },
    ], { today })).toBeNull()
  })

  it('rejects extreme weekly rates', () => {
    expect(calculateRobustWeeklyTrend([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-15', value: 80 },
      { date: '2026-01-29', value: 70 },
    ], { today })).toBeNull()
  })

  it('detects stable trend', () => {
    expect(calculateRobustWeeklyTrend([
      { date: '2026-01-01', value: 90 },
      { date: '2026-01-15', value: 90.1 },
      { date: '2026-01-29', value: 90 },
    ], { today }).direction).toBe('stable')
  })
})

describe('goal progress forecast', () => {
  it.each([
    ['missing current', { goalWeight: 80, weights }, 'missing_goal'],
    ['missing goal', { currentWeight: 90, weights }, 'missing_goal'],
    ['goal reached', { currentWeight: 80, goalWeight: 80, weights }, 'reached'],
    ['insufficient data', { currentWeight: 90, goalWeight: 80, weights: weights.slice(0, 2) }, 'insufficient_data'],
    ['not moving toward goal', { currentWeight: 90, goalWeight: 80, weights: [
      { date: '2026-01-01', value: 88 },
      { date: '2026-01-15', value: 89 },
      { date: '2026-01-29', value: 90 },
    ] }, 'not_moving_toward_goal'],
    ['projected', { currentWeight: 90, goalWeight: 80, weights }, 'projected'],
  ])('returns %s status', (_, input, status) => {
    expect(forecastGoalProgress({ ...input, today }).status).toBe(status)
  })

  it('returns weeks remaining for projected goal', () => {
    expect(forecastGoalProgress({ currentWeight: 90, goalWeight: 80, today, weights }).weeksRemaining).toBeGreaterThan(0)
  })

  it('returns a cautious week interval for projected goals', () => {
    const forecast = forecastGoalProgress({ currentWeight: 90, goalWeight: 80, today, weights })

    expect(forecast.weekIntervalLabel).toMatch(/veckor/)
    expect(forecast.text).toContain(forecast.weekIntervalLabel)
  })

  it('includes uncertainty language', () => {
    expect(forecastGoalProgress({ currentWeight: 90, goalWeight: 80, today, weights }).text).toContain('inte ett löfte')
  })

  it('handles invalid today', () => {
    expect(forecastGoalProgress({ currentWeight: 90, goalWeight: 80, today: 'bad', weights }).status).toBe('projected')
  })

  it('rounds values predictably', () => {
    expect(progressForecastInternals.round(1.234, 1)).toBe(1.2)
  })
})

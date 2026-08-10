import { describe, expect, it } from 'vitest'
import {
  buildReportCenterExportText,
  buildReportCenterModel,
  buildShareableReportCenterModel,
  resolveReportCenterPeriod,
} from './reportCenterService.js'

const today = '2026-08-10'

function data(overrides = {}) {
  return {
    checkIn: { date: today, energy: 7, mood: 'Bra', steps: 9000, workout: true },
    checkIns: [
      { date: '2026-08-08', energy: 6, mood: 'Okej', steps: 4000 },
      { date: today, energy: 7, mood: 'Bra', steps: 9000, workout: true },
    ],
    goalsHabits: {
      achievements: { acknowledged: [], events: [], unlocked: [] },
      goals: [],
      habits: [],
      weeklyFocus: [],
    },
    healthSnapshot: null,
    meals: [
      { calories: 500, date: '2026-08-01', id: 'old-meal', protein: 10, text: 'Old' },
      { calories: 600, date: '2026-08-10', id: 'meal-1', protein: 50, text: 'Lunch' },
    ],
    nutritionGoals: { calories: 2000, protein: 40 },
    profile: { goalWeight: 80, startWeight: 90 },
    progressPhotoItems: [
      { createdAt: '2026-07-01T10:00:00.000Z', dataUrl: 'data:image/png;base64,old', id: 'p1', weight: 90 },
      { createdAt: '2026-08-10T10:00:00.000Z', dataUrl: 'data:image/png;base64,new', id: 'p2', weight: 88 },
    ],
    today,
    weights: [
      { date: '2026-08-01', value: 90 },
      { date: '2026-08-10', value: 88 },
    ],
    ...overrides,
  }
}

describe('report center service', () => {
  it('resolves custom periods without mutating analytics period contracts', () => {
    expect(resolveReportCenterPeriod({
      customEnd: '2026-08-10',
      customStart: '2026-08-08',
      period: 'custom',
      today,
    })).toMatchObject({
      analyticsPeriod: '7d',
      calendarDays: 3,
      end: '2026-08-10',
      start: '2026-08-08',
    })
  })

  it('filters progress aggregations to the selected period', () => {
    const model = buildReportCenterModel(data(), {
      customEnd: today,
      customStart: today,
      period: 'custom',
      reportType: 'progress',
      today,
    })

    expect(model.nutrition.averageProteinLabel).toContain('50')
    expect(model.nutrition.proteinGoalLabel).toBe('1 av 1 loggade dagar')
    expect(model.activity.bestDayLabel).toContain('9')
    expect(model.activity.bestDayLabel).toContain('steg')
  })

  it('builds prediction and achievement sections from existing engines', () => {
    const model = buildReportCenterModel(data(), { period: '30d', reportType: 'progress', today })

    expect(model.prediction.confidence).toMatch(/Låg|Medel|Hög/)
    expect(model.achievements.unlockedCount).toBeGreaterThan(0)
    expect(model.achievements.next).toEqual(expect.any(String))
  })

  it('keeps progress photos optional and explicit', () => {
    const withoutPhotos = buildReportCenterModel(data(), { photoMode: 'none', reportType: 'progress', today })
    const withPhotos = buildReportCenterModel(data(), { photoMode: 'beforeAfter', reportType: 'progress', today })

    expect(withoutPhotos.photos.included).toBe(false)
    expect(withPhotos.photos.included).toBe(true)
    expect(withPhotos.photos.summary).toContain('-2,0 kg')
  })

  it('creates a shareable privacy-safe model without photos or identifiers', () => {
    const model = buildShareableReportCenterModel(data(), {
      photoMode: 'beforeAfter',
      reportType: 'progress',
      today,
    })
    const text = buildReportCenterExportText(model)

    expect(model.photos.items).toHaveLength(0)
    expect(text).not.toMatch(/data:image|email|userId/i)
    expect(text).toContain('Exkluderar:')
  })

  it('returns an empty state when selected history is missing', () => {
    const model = buildReportCenterModel(data({ checkIn: {}, checkIns: [], meals: [], weights: [] }), {
      period: '7d',
      reportType: 'progress',
      today,
    })

    expect(model.empty).toBe(true)
    expect(model.overview.currentWeightLabel).toBe('Saknas')
  })
})

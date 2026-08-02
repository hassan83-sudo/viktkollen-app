import { describe, expect, it } from 'vitest'
import { buildAiNutritionCoachInsights } from './aiNutritionInsights.js'
import { buildHealthDashboardV2Model } from './healthDashboardV2.js'
import { createMonthlyHealthReport } from './monthlyReportService.js'
import {
  buildSharedAnalytics,
  buildSharedMonthlyReportModel,
  buildSharedWeeklyReportModel,
  sharedAnalyticsEngineVersion,
} from './sharedAnalyticsEngine.js'
import { makeWeeklyReportFallback } from './weeklyReportService.js'

const analysisDate = '2026-07-31'
const profile = { goalWeight: 78, startWeight: 91.8 }
const weights = [
  { date: '2026-07-01', value: 91.8 },
  { date: '2026-07-20', value: 90.1 },
  { date: analysisDate, value: 89.6 },
]
const meals = [
  { calories: 420, date: analysisDate, id: 'meal-1', protein: 35, text: 'Kyckling och ris', type: 'Lunch' },
  { calories: 999, date: analysisDate, id: 'planned-1', isPlanned: true, protein: 99, text: 'Planerad middag' },
]
const checkIns = [
  { date: analysisDate, energy: 7, mood: 'Fokuserad', steps: 8200, workout: true },
]
const goalsHabits = {
  goals: [{ id: 'goal-1', status: 'active', title: 'Proteinmål' }],
  habits: [{ id: 'habit-1', status: 'active', title: 'Promenad', trackingMode: 'manual' }],
  weeklyFocus: [{ action: 'Gå 10 minuter', id: 'focus-1', order: 0, status: 'active', title: 'Kort rörelse' }],
}

function data(overrides = {}) {
  return {
    checkIn: checkIns[0],
    checkIns,
    goalsHabits,
    meals,
    nutritionGoals: { protein: 35 },
    profile,
    today: analysisDate,
    weights,
    ...overrides,
  }
}

describe('Shared Analytics Engine V2', () => {
  it('builds a deterministic shared analytics model', () => {
    const first = buildSharedAnalytics(data(), { analysisDate, period: '30d' })
    const second = buildSharedAnalytics(data(), { analysisDate, period: '30d' })

    expect({
      coverage: first.coverage,
      period: first.period,
      summaries: first.summaries,
      weightSummary: first.weightSummary,
    }).toEqual({
      coverage: second.coverage,
      period: second.period,
      summaries: second.summaries,
      weightSummary: second.weightSummary,
    })
    expect(first.version).toBe(sharedAnalyticsEngineVersion)
    expect(first.period.id).toBe('30d')
  })

  it('keeps dashboard and shared analytics aligned for central weight facts', () => {
    const shared = buildSharedAnalytics(data(), { analysisDate, period: '30d' })
    const dashboard = buildHealthDashboardV2Model(data(), { analysisDate, period: '30d' })

    expect(dashboard.weightSummary.currentWeight).toBe(shared.weightSummary.currentWeight)
    expect(dashboard.weightSummary.startWeight).toBe(shared.weightSummary.startWeight)
    expect(dashboard.weightSummary.goalRemaining).toBe(shared.weightSummary.goalRemaining)
    expect(dashboard.weightSummary.changeLabel).toBe(shared.weightSummary.changeLabel)
  })

  it('uses the same actual meal count in dashboard weekly and monthly report models', () => {
    const dashboard = buildHealthDashboardV2Model(data(), { analysisDate, period: '30d' })
    const weekly = buildSharedWeeklyReportModel(data(), { analysisDate })
    const monthly = buildSharedMonthlyReportModel(data(), { analysisDate })

    expect(dashboard.nutritionSummary.mealCount).toBe(1)
    expect(weekly.summaries.nutrition).toContain('1 faktiska måltider')
    expect(monthly.summaries.nutrition).toContain('1 faktiska måltider')
  })

  it('keeps planned meals out of shared analytics totals', () => {
    const shared = buildSharedAnalytics(data(), { analysisDate, period: '30d' })

    expect(shared.nutritionSummary.mealCount).toBe(1)
    expect(JSON.stringify(shared.summaries)).not.toContain('999')
  })

  it('feeds weekly report fallback from shared analytics while preserving public fields', () => {
    const report = makeWeeklyReportFallback(data())

    expect(report.sharedAnalytics.source).toBe('sharedAnalyticsEngine')
    expect(report.weightTrend).toContain('sedan start')
    expect(report.mealPattern).toContain('faktiska måltider')
    expect(report.nextSteps).toHaveLength(3)
  })

  it('feeds monthly report from the shared 30 day period model', () => {
    const report = createMonthlyHealthReport(data())

    expect(report.sharedAnalytics.source).toBe('sharedAnalyticsEngine')
    expect(report.period.id).toBe('30d')
    expect(report.totalMeals).toBe(1)
    expect(report.weightChange).toBe(-0.5)
  })

  it('exposes shared analytics to AI Nutrition Insights without changing AI safety text', () => {
    const report = buildAiNutritionCoachInsights(data(), { analysisDate })

    expect(report.sharedAnalytics.source).toBe('sharedAnalyticsEngine')
    expect(report.overview.sharedSummary.weight).toContain('Start')
    expect(JSON.stringify(report)).not.toMatch(/auth|session|token/i)
  })

  it('builds shared highlights and attention items without duplicates or technical values', () => {
    const shared = buildSharedAnalytics(data({ meals: [], weights: [] }), { analysisDate, period: '180d' })
    const serialized = JSON.stringify({
      attentionItems: shared.attentionItems,
      highlights: shared.highlights,
      summaries: shared.summaries,
    })

    expect(shared.attentionItems.length).toBeGreaterThan(0)
    expect(serialized).not.toMatch(/NaN|Infinity|undefined|\[object Object\]/)
  })
})

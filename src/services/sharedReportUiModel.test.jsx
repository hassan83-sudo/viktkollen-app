import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import MonthlyReport from '../components/MonthlyReport.jsx'
import WeeklyReport from '../components/WeeklyReport.jsx'
import ReportTrendCard from '../components/reports/ReportTrendCard.jsx'
import { buildSharedMonthlyReportModel, buildSharedWeeklyReportModel } from './sharedAnalyticsEngine.js'
import { buildSharedReportUiModel } from './sharedReportUiModel.js'

const analysisDate = '2026-07-31'
const baseData = {
  checkIn: { date: analysisDate, energy: 7, mood: 'Fokuserad', steps: 8200, workout: true },
  checkIns: [{ date: analysisDate, energy: 7, mood: 'Fokuserad', steps: 8200, workout: true }],
  goalsHabits: {
    goals: [{ id: 'goal-1', status: 'active', title: 'Viktmål' }],
    habits: [{ id: 'habit-1', status: 'active', title: 'Promenad', trackingMode: 'manual' }],
    weeklyFocus: [{ action: 'Gå 10 minuter', id: 'focus-1', order: 0, status: 'active', title: 'Kort rörelse' }],
  },
  meals: [{ calories: 420, date: analysisDate, id: 'meal-1', protein: 35, text: 'Kyckling och ris', type: 'Lunch' }],
  nutritionGoals: { protein: 35 },
  profile: { goalWeight: 78, startWeight: 91.8 },
  today: analysisDate,
  weights: [
    { date: '2026-07-01', value: 91.8 },
    { date: '2026-07-20', value: 90.1 },
    { date: analysisDate, value: 89.6 },
  ],
}

function weeklyReport() {
  const sharedAnalytics = buildSharedWeeklyReportModel(baseData, { analysisDate })

  return {
    biggestProgress: sharedAnalytics.highlights[0]?.text || '',
    biggestRisk: sharedAnalytics.attentionItems[0]?.text || '',
    coachFeedback: {
      accepted: 1,
      completed: 1,
      completionRateLabel: '50%',
      dismissed: 0,
      postponed: 0,
    },
    focusNextWeek: sharedAnalytics.nextActions[0]?.text || '',
    goalsHabits: sharedAnalytics.goalsHabits,
    mealPattern: sharedAnalytics.summaries.nutrition,
    movement: sharedAnalytics.summaries.activity,
    nextSteps: ['Behåll protein', 'Logga check-in'],
    nutritionStatus: sharedAnalytics.summaries.nutrition,
    recovery: sharedAnalytics.summaries.activity,
    sharedAnalytics,
    summary: sharedAnalytics.summaries.coverage,
    weightTrend: sharedAnalytics.weightSummary.changeLabel,
  }
}

function monthlyReport() {
  const sharedAnalytics = buildSharedMonthlyReportModel(baseData, { analysisDate })

  return {
    aiSummary: ['Månaden bygger på gemensam analys.'],
    averageProteinRating: 'Medel',
    averageVegetableRating: 'Bra',
    averageWeightLabel: '90 kg',
    bestWeek: 'Saknas',
    coachEffectiveness: {
      confidence: 0.62,
      coverage: 0.5,
      effectivenessLabel: 'Coachråden verkar hjälpa',
      helpedMost: 'nutrition',
      ignoredMost: 'activity',
    },
    commonMealType: 'Lunch',
    goalsHabits: sharedAnalytics.goalsHabits,
    improvements: ['Logga två vanliga dagar'],
    monthlyAchievement: 'Du loggade mat 1 dag denna månad.',
    motivation: 'Små steg räcker.',
    sharedAnalytics,
    strengths: sharedAnalytics.highlights.map((item) => item.text).slice(0, 3),
    totalMeals: 1,
    weighInCount: 2,
    weightChangeLabel: 'Ned 0,5 kg',
  }
}

describe('Shared Report UI V3 model', () => {
  it('builds weekly report presentation from shared analytics', () => {
    const model = buildSharedReportUiModel(weeklyReport(), { reportType: 'weekly' })

    expect(model.reportType).toBe('weekly')
    expect(model.periodLabel).toContain('7 dagar')
    expect(model.trendCards.map((card) => card.id)).toContain('weight')
    expect(model.comparisonCards.length).toBeGreaterThan(0)
    expect(model.coverage).toMatchObject({ level: expect.any(String) })
  })

  it('builds monthly report presentation from the same contract', () => {
    const model = buildSharedReportUiModel(monthlyReport(), { reportType: 'monthly' })

    expect(model.reportType).toBe('monthly')
    expect(model.periodLabel).toContain('30 dagar')
    expect(model.trendCards.map((card) => card.id)).toEqual(expect.arrayContaining(['weight', 'protein', 'calories']))
  })

  it('renders trend chart with text alternative and no technical values', () => {
    const model = buildSharedReportUiModel(monthlyReport(), { reportType: 'monthly' })
    const markup = renderToStaticMarkup(<ReportTrendCard card={model.trendCards[0]} />)

    expect(markup).toContain('role="img"')
    expect(markup).toContain('Saknade buckets')
    expect(markup).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('renders Weekly Report V3 shared sections', () => {
    const markup = renderToStaticMarkup(
      <WeeklyReport
        onCreateWeeklyReport={vi.fn()}
        weeklyReportData={weeklyReport()}
        weeklyReportLines={[]}
        weeklyReportStatus=""
      />,
    )

    expect(markup).toContain('Veckorapport V3')
    expect(markup).toContain('Datatäckning')
    expect(markup).toContain('Jämförelse')
    expect(markup).toContain('Coachens genomförandegrad')
    expect(markup).toContain('Accepterade:')
    expect(markup).toContain('role="progressbar"')
    expect(markup).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('renders Monthly Report V3 shared sections', () => {
    const markup = renderToStaticMarkup(<MonthlyReport report={monthlyReport()} />)

    expect(markup).toContain('Månadsrapport V3')
    expect(markup).toContain('Datatäckning')
    expect(markup).toContain('Coach effectiveness')
    expect(markup).toContain('Hjälpte mest:')
    expect(markup).toContain('Skriv ut rapport')
    expect(markup).toContain('Öppna mål &amp; vanor')
    expect(markup).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('keeps weekly and monthly numeric facts aligned with shared analytics', () => {
    const weekly = weeklyReport()
    const monthly = monthlyReport()
    const weeklyModel = buildSharedReportUiModel(weekly, { reportType: 'weekly' })
    const monthlyModel = buildSharedReportUiModel(monthly, { reportType: 'monthly' })

    expect(weeklyModel.overview.weight).toContain(String(weekly.sharedAnalytics.weightSummary.currentWeight))
    expect(monthlyModel.overview.weight).toContain(String(monthly.sharedAnalytics.weightSummary.currentWeight))
    expect(weeklyModel.dataQuality.mealDays).toBe(weekly.sharedAnalytics.coverage.mealDays)
    expect(monthlyModel.dataQuality.mealDays).toBe(monthly.sharedAnalytics.coverage.mealDays)
  })
})

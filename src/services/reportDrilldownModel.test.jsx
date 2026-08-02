import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ReportDrilldown from '../components/reports/ReportDrilldown.jsx'
import { buildReportDrilldownModel, reportDrilldownSections } from './reportDrilldownModel.js'
import { buildSharedMonthlyReportModel } from './sharedAnalyticsEngine.js'

const analysisDate = '2026-07-31'
const data = {
  checkIn: { date: analysisDate, energy: 7, mood: 'Fokuserad', steps: 8200, workout: true },
  checkIns: [{ date: analysisDate, energy: 7, mood: 'Fokuserad', steps: 8200, workout: true }],
  goalsHabits: {
    goals: [{ id: 'goal-1', status: 'active', title: 'Viktmål' }],
    habits: [{ id: 'habit-1', status: 'active', title: 'Promenad' }],
  },
  meals: [{ calories: 420, date: analysisDate, id: 'meal-1', protein: 35, text: 'Kyckling och ris', type: 'Lunch' }],
  nutritionGoals: { protein: 35 },
  profile: { goalWeight: 78, startWeight: 91.8 },
  today: analysisDate,
  weights: [
    { date: '2026-07-01', value: 91.8 },
    { date: analysisDate, value: 89.6 },
  ],
}

const report = {
  sharedAnalytics: buildSharedMonthlyReportModel(data, { analysisDate }),
}

describe('report drilldown model and UI', () => {
  it('defines required drilldown sections', () => {
    expect(reportDrilldownSections.map((section) => section.id)).toEqual(['activity', 'attention', 'coverage', 'goals', 'nutrition', 'weight'])
  })

  it.each(['weight', 'nutrition', 'activity', 'goals', 'attention', 'coverage'])('builds %s drilldown from shared analytics', (sectionId) => {
    const model = buildReportDrilldownModel(report, sectionId, { reportType: 'monthly' })

    expect(model.sectionId).toBe(sectionId)
    expect(model.sourceStatus).toBe('sharedAnalyticsEngine')
    expect(model.summary).toBeTruthy()
    expect(JSON.stringify(model)).not.toMatch(/auth|session|token|localStorage|NaN|Infinity|undefined|\[object Object\]/i)
  })

  it('renders accessible drilldown with back action and destination link', () => {
    const markup = renderToStaticMarkup(
      <ReportDrilldown
        onClose={vi.fn()}
        report={report}
        reportType="monthly"
        sectionId="weight"
      />,
    )

    expect(markup).toContain('role="region"')
    expect(markup).toContain('Tillbaka till rapport')
    expect(markup).toContain('Öppna relevant vy')
    expect(markup).toContain('Så beräknas det')
    expect(markup).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import HealthDashboardV2 from '../components/HealthDashboardV2.jsx'
import {
  buildHealthDashboardV2Model,
  healthDashboardPeriods,
  healthDashboardV2ModelVersion,
} from './healthDashboardV2.js'

const analysisDate = '2026-07-31'
const profile = { goalWeight: 78, startWeight: '91,8' }
const weights = [
  { date: '2026-07-01', value: 91.8 },
  { date: '2026-07-20', value: 90.1 },
  { date: analysisDate, value: 89.6 },
]
const meals = [
  { calories: 420, date: analysisDate, id: 'meal-1', protein: 35, text: 'Kyckling och ris', type: 'Lunch' },
  { calories: 999, date: analysisDate, id: 'planned-1', isPlanned: true, protein: 99, text: 'Planerad middag' },
]
const checkIn = {
  date: analysisDate,
  energy: 7,
  mood: 'Fokuserad',
  steps: 8200,
  workout: true,
}
const goalsHabits = {
  goals: [{ id: 'goal-1', status: 'active', title: 'Proteinmål' }],
  habits: [{ id: 'habit-1', status: 'active', title: 'Promenad', trackingMode: 'manual' }],
  weeklyFocus: [{ action: 'Gå 10 minuter', id: 'focus-1', order: 0, status: 'active', title: 'Kort rörelse' }],
}

function model(overrides = {}, options = {}) {
  return buildHealthDashboardV2Model({
    checkIn,
    goalsHabits,
    meals,
    nutritionGoals: { protein: 35 },
    profile,
    today: analysisDate,
    weights,
    ...overrides,
  }, { analysisDate, period: '30d', ...options })
}

describe('Health Dashboard V2 model', () => {
  it('builds a deterministic versioned dashboard model', () => {
    const first = model()
    const second = model()

    expect(first).toEqual(second)
    expect(first.modelVersion).toBe(healthDashboardV2ModelVersion)
    expect(first.analysisDate).toBe(analysisDate)
    expect(first.selectedPeriod.id).toBe('30d')
  })

  it('supports the required periods and comparison metadata', () => {
    expect(healthDashboardPeriods.map((period) => period.id)).toEqual(['7d', '30d', '90d', '180d', '365d', 'all'])

    const dashboard = model({}, { period: '7d' })
    expect(dashboard.period).toMatchObject({ days: 7, end: analysisDate })
    expect(dashboard.comparisons).toHaveProperty('hasComparison')
  })

  it('uses native long range periods instead of all-period fallback', () => {
    const longWeights = [
      { date: '2025-10-03', value: 92.2 },
      { date: '2025-12-31', value: 92 },
      ...weights,
    ]
    const halfYear = model({ weights: longWeights }, { period: '180d' })
    const fullYear = model({ weights: longWeights }, { period: '365d' })

    expect(halfYear.period).toMatchObject({ bucketStrategy: 'week', days: 180, id: '180d' })
    expect(fullYear.period).toMatchObject({ bucketStrategy: 'month', days: 365, id: '365d' })
    expect(halfYear.period.start).not.toBe('')
    expect(fullYear.period.start).not.toBe('')
    expect(halfYear.selectedPeriod.id).toBe('180d')
    expect(fullYear.selectedPeriod.id).toBe('365d')
  })

  it('builds reusable trend series with missing buckets separated from zero', () => {
    const dashboard = model({
      weights: [
        { date: '2025-10-03', value: 92.2 },
        { date: '2025-12-31', value: 92 },
        ...weights,
      ],
    }, { period: '365d' })

    expect(dashboard.trendSeries.weight.bucketType).toBe('month')
    expect(dashboard.trendSeries.weight.points.length).toBeGreaterThan(1)
    expect(dashboard.trendSeries.weight.points.some((point) => point.hasData === false && point.value === null)).toBe(true)
    expect(dashboard.trendSeries.nutrition.map((series) => series.id)).toEqual(['calories', 'protein'])
    expect(dashboard.trendSeries.activity.map((series) => series.id)).toEqual(['steps', 'energy'])
  })

  it('creates a safe user initiated export summary without auth or session fields', () => {
    const dashboard = model({}, { period: '180d' })
    const serialized = JSON.stringify(dashboard.exportSummary)

    expect(dashboard.exportSummary.period).toContain('6 månader')
    expect(serialized).not.toMatch(/auth|session|token|localStorage/i)
    expect(serialized).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('uses central weight facts and does not mix goal remaining with total change', () => {
    const dashboard = model()

    expect(dashboard.weightSummary.currentWeight).toBe(89.6)
    expect(dashboard.weightSummary.startWeight).toBe(91.8)
    expect(dashboard.weightSummary.goalRemaining).toBe(11.6)
    expect(dashboard.weightSummary.changeLabel).toContain('2,2 kg ned')
  })

  it('counts actual meals but not planned meals in nutrition summary', () => {
    const dashboard = model()

    expect(dashboard.nutritionSummary.mealCount).toBe(1)
    expect(dashboard.nutritionSummary.loggedDays).toBe(1)
    expect(dashboard.nutritionSummary.textAlternative).not.toContain('999')
  })

  it('summarizes activity check-ins and goals habits safely', () => {
    const dashboard = model()

    expect(dashboard.activitySummary.checkInCount).toBeGreaterThanOrEqual(1)
    expect(dashboard.activitySummary.trainingDays).toBeGreaterThanOrEqual(1)
    expect(dashboard.goalsSummary).toMatchObject({ focusTitle: 'Kort rörelse' })
  })

  it('handles empty data with neutral fallbacks and no technical values', () => {
    const dashboard = model({ checkIn: {}, goalsHabits: {}, meals: [], profile: {}, weights: [] })
    const serialized = JSON.stringify(dashboard)

    expect(dashboard.dataCoverage.level).toBe('missing')
    expect(dashboard.attentionItems.length).toBeGreaterThan(0)
    expect(serialized).not.toMatch(/NaN|Infinity|\[object Object\]/)
  })
})

describe('HealthDashboardV2 component', () => {
  it('renders period controls cards and accessible text fallback', () => {
    const markup = renderToStaticMarkup(
      <HealthDashboardV2
        checkIn={checkIn}
        goalsHabits={goalsHabits}
        meals={meals}
        nutritionGoals={{ protein: 35 }}
        onPeriodChange={vi.fn()}
        period="30d"
        profile={profile}
        today={analysisDate}
        weights={weights}
      />,
    )

    expect(markup).toContain('Hälsodashboard')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('Exportera översikt')
    expect(markup).toContain('Vikt')
    expect(markup).toContain('Nutrition')
    expect(markup).toContain('Mål &amp; vanor')
    expect(markup).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})

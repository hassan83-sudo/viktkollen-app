import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ProgressDashboard from './ProgressDashboard.jsx'
import GoalForecastCard from './progress/GoalForecastCard.jsx'
import HabitProgressCard from './progress/HabitProgressCard.jsx'
import NutritionProgressCard from './progress/NutritionProgressCard.jsx'
import ProgressInsights from './progress/ProgressInsights.jsx'
import ProgressSummaryCards from './progress/ProgressSummaryCards.jsx'
import ProgressTrendCard from './progress/ProgressTrendCard.jsx'
import { buildProgressDashboardAnalytics } from '../services/progress/progressAnalytics.js'
import { buildProgressInsightsModel } from '../services/progressInsights/progressInsightsEngine.js'

const weights = [
  { date: '2026-03-01', value: 91 },
  { date: '2026-03-15', value: 90.5 },
  { date: '2026-03-31', value: 90.1 },
]
const meals = [
  { calories: 500, date: '2026-03-31', id: 'm1', name: 'Lunch', protein: 40, time: '12:00', type: 'Lunch' },
]
const checkIn = { date: '2026-03-31', energy: 6, mood: 'Fokuserad', steps: 7200, workout: true }
const foods = [{ done: true, id: 'protein', label: 'Protein' }, { done: false, id: 'water', label: 'Vatten' }]
const nutritionGoals = { calories: 1800, protein: 100 }
const profile = { goalWeight: '78 kg', startWeight: '91 kg' }
const analysis = buildProgressDashboardAnalytics({
  checkIn,
  foods,
  meals,
  nutritionGoals,
  profile,
  today: new Date('2026-03-31T12:00:00.000Z'),
  weights,
}, { period: '30d', today: new Date('2026-03-31T12:00:00.000Z') })
const progressInsights = buildProgressInsightsModel({
  checkIn,
  foods,
  meals,
  nutritionGoals,
  profile,
  today: new Date('2026-03-31T12:00:00.000Z'),
  weights,
}, { period: '30d', today: new Date('2026-03-31T12:00:00.000Z') })
const bodyAnalysisHistory = [
  {
    createdAt: '2026-03-31T08:00:00.000Z',
    result: {
      estimatedMeasurements: { waist: { maxCm: 84, minCm: 80 } },
      estimatedWeight: { confidence: 'medium', maxKg: 91, minKg: 88 },
      scanInput: { imageCount: 3, views: ['front', 'side', 'back'] },
      summary: 'Stabil hållning.',
    },
  },
  {
    createdAt: '2026-03-20T08:00:00.000Z',
    result: {
      estimatedMeasurements: { waist: { maxCm: 88, minCm: 84 } },
      estimatedWeight: { confidence: 'low', maxKg: 92, minKg: 89 },
    },
  },
]

function html(props = {}) {
  return renderToStaticMarkup(
    <ProgressDashboard
      checkIn={checkIn}
      checkIns={[]}
      bodyAnalysisHistory={bodyAnalysisHistory}
      foods={foods}
      meals={meals}
      nutritionGoals={nutritionGoals}
      profile={profile}
      weeklyReportData={{ summary: 'Veckan var stabil.' }}
      weeklyReportLines={[]}
      weeklyReportStatus=""
      today={new Date('2026-03-31T12:00:00.000Z')}
      weights={weights}
      onCreateWeeklyReport={() => {}}
      {...props}
    />,
  )
}

describe('ProgressDashboard UI', () => {
  it.each([
    ['heading', 'Din utveckling'],
    ['eyebrow', 'Framsteg'],
    ['period control', 'Välj period för framsteg'],
    ['7 days', '7 dagar'],
    ['30 days', '30 dagar'],
    ['3 months', '3 månader'],
    ['all period', 'Alla'],
    ['summary label', 'Nuvarande vikt'],
    ['trend card', 'Viktutveckling'],
    ['nutrition card', 'Faktiskt intag'],
    ['habit card', 'Rutiner'],
    ['forecast card', 'Försiktig riktning'],
    ['insights card', 'AI Progress Insights V1'],
    ['progress insights title', 'Framstegsinsikter'],
    ['weekly report', 'Veckans sammanfattning'],
    ['period comparison', 'Period mot period'],
    ['body scan history', 'Body Scan-historik'],
    ['data quality', 'Datakvalitet'],
    ['measured provenance', 'Endast uppmätt vikt'],
  ])('renders %s', (_, expected) => {
    expect(html()).toContain(expected)
  })

  it('marks default period as pressed', () => {
    expect(html()).toContain('aria-pressed="true"')
  })

  it('does not render unsafe placeholders', () => {
    expect(html()).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('renders boolean workout as a neutral training label', () => {
    const markup = html({
      checkIn: { date: '2026-07-31', energy: 6, mood: 'Fokuserad', steps: 7200, workout: true },
      checkIns: [],
      today: new Date('2026-07-31T12:00:00.000Z'),
    })

    expect(markup).toContain('Träning markerad')
    expect(markup).not.toMatch(/Vanligaste träning<\/dt><dd>true|Vanligaste träning<\/dt><dd>false/)
  })

  it('does not render internal values in the habit card', () => {
    const markup = renderToStaticMarkup(<HabitProgressCard habits={{
      activeHabits: 0,
      averageEnergy: null,
      averageMood: 'undefined',
      averageSteps: null,
      bestStreak: 0,
      checkInCount: 1,
      completedHabits: 0,
      currentStreak: 0,
      trainingDays: 1,
      trainingForm: 'true',
    }} />)

    expect(markup).toContain('Saknas')
    expect(markup).not.toMatch(/>true<|>false<|>undefined<|>null<|\[object Object\]/)
  })

  it('renders normalized energy and mood labels in the habit card', () => {
    const markup = html({
      checkIn: { date: '2026-07-31', energy: { scale: 5, value: 4 }, mood: 'good', steps: '7200' },
      checkIns: [],
      today: new Date('2026-07-31T12:00:00.000Z'),
    })

    expect(markup).toContain('8 av 10')
    expect(markup).toContain('Positiv')
    expect(markup).not.toMatch(/<dd>good<\/dd>|<dd>low<\/dd>|<dd>neutral<\/dd>|<dd>true<\/dd>|<dd>false<\/dd>|<dd>undefined<\/dd>|<dd>null<\/dd>|NaN|\[object Object\]/)
  })

  it('renders normalized step labels without raw storage values', () => {
    const markup = html({
      checkIn: { date: '2026-07-31', steps: { count: '10 250' } },
      checkIns: [],
      today: new Date('2026-07-31T12:00:00.000Z'),
    })

    expect(markup).toContain('10')
    expect(markup).toContain('250 steg/dag')
    expect(markup).not.toMatch(/undefined|null|NaN|Infinity|\[object Object\]/)
  })

  it('renders empty weight state', () => {
    const markup = renderToStaticMarkup(<ProgressTrendCard weight={{ ...analysis.weight, registrationCount: 0 }} />)

    expect(markup).toContain('Ingen viktdata')
  })

  it.each([
    ['summary cards', <ProgressSummaryCards analysis={analysis} />, 'Kvar till mål'],
    ['trend card', <ProgressTrendCard weight={analysis.weight} />, 'Första i perioden'],
    ['nutrition card', <NutritionProgressCard nutrition={analysis.nutrition} planning={analysis.planning} />, 'Planerade måltider'],
    ['habit card', <HabitProgressCard habits={analysis.habits} />, 'Träningsdagar'],
    ['forecast card', <GoalForecastCard forecast={analysis.forecast} />, 'Trend per vecka'],
    ['insights card', <ProgressInsights model={progressInsights} weeklySummary={analysis.weeklySummary} />, 'Nästa steg'],
  ])('renders %s standalone', (_, element, expected) => {
    expect(renderToStaticMarkup(element)).toContain(expected)
  })

  it('renders safely with empty props', () => {
    expect(html({ checkIn: {}, foods: [], meals: [], nutritionGoals: {}, profile: {}, weights: [] })).toContain('Din utveckling')
  })

  it('keeps actual and planned nutrition separated in copy', () => {
    expect(html()).toContain('Planerade måltider och AI-estimat hålls markerade separat')
  })

  it('renders body scan estimates separately from measured weight', () => {
    const markup = html()

    expect(markup).toContain('AI-viktintervall')
    expect(markup).toContain('88–91 kg')
    expect(markup).toContain('AI-estimat separat')
  })
})

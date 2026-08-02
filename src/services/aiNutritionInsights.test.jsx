import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AINutritionInsights from '../components/AINutritionInsights.jsx'
import {
  buildAiNutritionCoachInsights,
  buildMinimalInsightAiPayload,
  buildMonthlyPersonalInsightSummary,
  buildWeeklyPersonalInsightSummary,
  dedupePersonalInsights,
  prioritizePersonalInsights,
  validateAiInsightRefinement,
} from './aiNutritionInsights.js'

const analysisDate = '2026-07-31'
const profile = { goalWeight: 78 }
const weights = [
  { date: '2026-07-01', value: 91.8 },
  { date: '2026-07-24', value: 90.4 },
  { date: '2026-07-30', value: 89.6 },
]
const nutritionGoals = {
  calories: 2100,
  protein: '108-144 g',
}
const meals = [
  { date: '2026-07-28', description: '200 g kyckling och ris', id: 'm1', time: '12:00' },
  { date: '2026-07-29', description: 'två ägg och kvarg', id: 'm2', time: '08:00' },
  { date: '2026-07-30', description: 'lax potatis broccoli', id: 'm3', time: '18:00' },
  { date: '2026-07-31', description: 'kyckling, ris och grönsaker', id: 'm4', time: '12:00' },
]
const checkIns = [
  { date: '2026-07-29', energy: 7, mood: 'focused', steps: 8200, workout: true },
  { date: '2026-07-30', energy: 6, mood: 'neutral', steps: 7600 },
  { date: '2026-07-31', energy: 8, mood: 'glad', steps: 9100, workoutType: 'gym' },
]

function report(overrides = {}) {
  return buildAiNutritionCoachInsights({
    checkIns,
    meals,
    nutritionGoals,
    profile,
    weights,
    ...overrides,
  }, {
    analysisDate,
    generatedAt: '2026-07-31T12:00:00.000Z',
  })
}

describe('AI Nutrition Coach V2 insights', () => {
  it('builds deterministic personal insights from weight nutrition and check-in data', () => {
    const first = report()
    const second = report()

    expect(first).toEqual(second)
    expect(first.insights.length).toBeGreaterThanOrEqual(4)
    expect(first.insights.some((insight) => insight.category === 'vikttrend')).toBe(true)
    expect(first.insights.some((insight) => insight.category === 'protein')).toBe(true)
    expect(first.insights.some((insight) => insight.category === 'steg')).toBe(true)
    expect(first.overview.keyProgress).not.toMatch(/påhitt|saknas/i)
  })

  it('uses central weight logic for current weight and change since start', () => {
    const weightInsight = report().insights.find((insight) => insight.category === 'vikttrend')

    expect(weightInsight.evidence.join(' ')).toContain('Start: 91,8 kg')
    expect(weightInsight.evidence.join(' ')).toContain('Nu: 89,6 kg')
    expect(weightInsight.summary).toContain('2,2 kg ned')
  })

  it('creates useful empty states for insufficient data', () => {
    const empty = report({ checkIns: [], meals: [], weights: [] })
    const text = empty.insights.map((insight) => `${insight.title} ${insight.summary}`).join(' ')

    expect(empty.dataCoverage.level).toBe('missing')
    expect(text).toMatch(/Mer viktdata|Mer kostdata|Check-ins/)
    expect(text).not.toMatch(/NaN|undefined|null|\[object Object\]/)
  })

  it('deduplicates and prioritizes a balanced set of insights', () => {
    const insights = report().insights
    const duplicated = dedupePersonalInsights([insights[0], { ...insights[0], id: `${insights[0].id}:copy`, priority: 'low' }])
    const prioritized = prioritizePersonalInsights(insights, { limit: 3 })

    expect(duplicated).toHaveLength(1)
    expect(prioritized).toHaveLength(3)
    expect(prioritized.some((insight) => insight.type === 'positive')).toBe(true)
  })

  it('builds a short derived action plan without storage side effects', () => {
    const plan = report().actionPlan

    expect(plan.length).toBeLessThanOrEqual(3)
    expect(plan.every((item) => item.status === 'suggested')).toBe(true)
    expect(JSON.stringify(plan)).not.toMatch(/auth|session|token|localStorage/i)
  })

  it('creates a minimized AI payload without raw user datasets', () => {
    const payload = buildMinimalInsightAiPayload(report())
    const text = JSON.stringify(payload)

    expect(payload.insights[0]).not.toHaveProperty('period')
    expect(text).not.toMatch(/auth|session|token|email|localStorage|chatHistory/i)
    expect(text).toContain('insights')
  })

  it('rejects AI refinements that invent numbers or unsafe advice', () => {
    const baseReport = report()

    expect(validateAiInsightRefinement({ summary: 'Du har gått ner 99 kg.' }, baseReport)).toBeNull()
    expect(validateAiInsightRefinement({ nextStep: 'Hoppa över måltider.' }, baseReport)).toBeNull()
    expect(validateAiInsightRefinement({ summary: baseReport.overview.summary }, baseReport).summary).toBe(baseReport.overview.summary)
  })

  it('renders insight UI with editable coach question and accessible content', () => {
    const onCoachQuestion = vi.fn()
    const markup = renderToStaticMarkup(
      <AINutritionInsights
        analysisDate={analysisDate}
        checkIns={checkIns}
        meals={meals}
        nutritionGoals={nutritionGoals}
        onCoachQuestion={onCoachQuestion}
        profile={profile}
        weights={weights}
      />,
    )

    expect(markup).toContain('Dina insikter')
    expect(markup).toContain('Föreslagen åtgärdsplan')
    expect(markup).toContain('Fråga coachen')
    expect(markup).toContain('aria-live')
    expect(markup).not.toMatch(/NaN|undefined|null|\[object Object\]/)
  })

  it('exposes weekly and monthly report summaries from the same engine', () => {
    const weekly = buildWeeklyPersonalInsightSummary({
      checkIns,
      meals,
      nutritionGoals,
      profile,
      weights,
    }, { analysisDate })
    const monthly = buildMonthlyPersonalInsightSummary({
      checkIns,
      meals,
      nutritionGoals,
      profile,
      weights,
    }, { analysisDate })

    expect(weekly.source).toBe('aiNutritionInsights')
    expect(monthly.source).toBe('aiNutritionInsights')
    expect(weekly.progress).toContain('vikttrend')
    expect(monthly.categories).toContain('vikttrend')
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildHealthPredictionModel,
  buildMinimalPredictionAiContext,
  buildPredictionReportSummary,
} from './healthPredictionEngine.js'

const today = '2026-07-31'

function data(overrides = {}) {
  return {
    adaptiveCoachFeedback: {
      actionPlans: [{
        confidence: 0.7,
        generatedAt: '2026-07-29T12:00:00.000Z',
        id: 'plan-1',
        days: [{
          date: today,
          actions: [
            { id: 'a1', status: 'completed' },
            { id: 'a2', status: 'skipped' },
            { id: 'a3', status: 'skipped' },
            { id: 'a4', status: 'skipped' },
          ],
        }],
      }],
      recommendations: [
        { id: 'r1', status: 'accepted', updatedAt: '2026-07-29T10:00:00.000Z' },
        { id: 'r2', status: 'dismissed', updatedAt: '2026-07-30T10:00:00.000Z' },
      ],
    },
    checkIns: [
      { date: '2026-07-25', energy: 5, steps: 3500 },
      { date: '2026-07-31', energy: 6, steps: 3900 },
    ],
    goalsHabits: {
      habits: [{ id: 'h1', title: 'Promenad', active: true, completions: [today] }],
      goals: [{ id: 'g1', title: 'Protein', active: true, progress: 40 }],
    },
    meals: [
      { date: '2026-07-25T08:00:00', name: 'Ägg', type: 'Frukost', calories: 220, protein: 18, carbs: 1, fat: 14, fiber: 0 },
      { date: '2026-07-26T12:00:00', name: 'Kyckling ris broccoli', type: 'Lunch', calories: 520, protein: 42, carbs: 55, fat: 12, fiber: 7 },
    ],
    nutritionGoals: { fiber: 25, protein: 120 },
    profile: { goalWeight: 78 },
    reminderState: {
      history: [
        { action: 'completed', at: '2026-07-29T08:00:00.000Z' },
        { action: 'skipped', at: '2026-07-30T08:00:00.000Z' },
      ],
    },
    today,
    weights: [
      { date: '2026-07-20T08:00:00', value: 91.8 },
      { date: '2026-07-28T08:00:00', value: 90.1 },
      { date: '2026-07-31T08:00:00', value: 89.6 },
    ],
    ...overrides,
  }
}

describe('healthPredictionEngine', () => {
  it('builds conservative predictions with confidence, factors and uncertainty', () => {
    const model = buildHealthPredictionModel(data(), { analysisDate: today })

    expect(model.modelVersion).toBe(1)
    expect(model.predictions.map((item) => item.id)).toContain('weight-7d')
    expect(model.predictions.map((item) => item.id)).toContain('weight-30d')
    expect(model.predictions.every((item) => Number.isFinite(item.confidence))).toBe(true)
    expect(model.predictions.every((item) => item.explanation && item.uncertainty)).toBe(true)
    expect(model.predictions.every((item) => Array.isArray(item.contributingFactors))).toBe(true)
    expect(model.dashboard.estimatedGoalDate).toBeTruthy()
    expect(model.dashboard.weightTrendLabel).toMatch(/Om nuvarande trend fortsätter|Fler viktvärden/)
    expect(['Hög', 'Medel', 'Låg']).toContain(model.dashboard.confidence.label)
    expect(model.dashboard.recommendation).toBeTruthy()
    expect(model.dashboard.insights.length).toBeLessThanOrEqual(4)
  })

  it('returns a low confidence empty dashboard state when history is missing', () => {
    const model = buildHealthPredictionModel(data({
      checkIn: null,
      checkIns: [],
      meals: [],
      weights: [],
    }), { analysisDate: today })

    expect(model.dashboard.empty).toBe(true)
    expect(model.dashboard.confidence.label).toBe('Låg')
    expect(model.dashboard.insights).toEqual([])
  })

  it('detects supportive warnings without diagnoses', () => {
    const model = buildHealthPredictionModel(data({ meals: [] }), { analysisDate: today })
    const text = JSON.stringify(model.warningSignals).toLocaleLowerCase('sv-SE')

    expect(model.warningSignals.map((item) => item.id)).toContain('repeated-skipped-actions')
    expect(model.warningSignals.map((item) => item.id)).toContain('missing-meals')
    expect(text).not.toMatch(/diagnos|sjukdom|medicin/)
  })

  it('detects positive opportunities from existing insights', () => {
    const model = buildHealthPredictionModel(data({
      checkIns: [
        { date: '2026-07-25', energy: 7, steps: 8000 },
        { date: '2026-07-26', energy: 7, steps: 8200 },
        { date: '2026-07-27', energy: 8, steps: 8500 },
        { date: '2026-07-28', energy: 8, steps: 8300 },
      ],
      meals: [
        { date: '2026-07-25T12:00:00', name: 'Kyckling broccoli', type: 'Lunch', calories: 500, protein: 40, carbs: 45, fat: 12, fiber: 7 },
        { date: '2026-07-26T12:00:00', name: 'Lax potatis', type: 'Lunch', calories: 520, protein: 35, carbs: 42, fat: 18, fiber: 5 },
        { date: '2026-07-27T12:00:00', name: 'Kvarg bär', type: 'Mellanmål', calories: 220, protein: 28, carbs: 20, fat: 2, fiber: 4 },
      ],
    }), { analysisDate: today })

    expect(model.opportunities.length).toBeGreaterThan(0)
    expect(model.opportunities.every((item) => item.nextStep)).toBe(true)
  })

  it('returns a minimized AI context with no raw history', () => {
    const model = buildHealthPredictionModel(data(), { analysisDate: today })
    const context = buildMinimalPredictionAiContext(model)

    expect(context).toEqual(expect.objectContaining({
      confidence: model.confidence,
      predictionCount: model.predictions.length,
    }))
    expect(JSON.stringify(context)).not.toContain('Kyckling')
    expect(JSON.stringify(context)).not.toContain('2026-07-25')
  })

  it('builds report summary from the same model', () => {
    const summary = buildPredictionReportSummary(data(), { analysisDate: today })

    expect(summary.predictedTrajectory).toMatch(/Confidence/)
    expect(summary.confidence).toBeGreaterThan(0)
    expect(Array.isArray(summary.cautionSignals)).toBe(true)
    expect(Array.isArray(summary.opportunities)).toBe(true)
  })
})

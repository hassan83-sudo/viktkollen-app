import { describe, expect, it } from 'vitest'
import {
  buildMinimalSmartHabitGoalAiPayload,
  buildSmartHabitGoalModel,
  buildSmartHabitGoalReportSummary,
} from './smartHabitGoalEngine.js'

const baseInput = {
  adaptiveCoachFeedback: {
    actionPlans: [{
      confidence: 0.62,
      generatedAt: '2026-07-31T08:00:00.000Z',
      days: [{ date: '2026-07-31', actions: [{ id: 'a1', status: 'completed' }] }],
    }],
  },
  checkIns: [
    { date: '2026-07-29', energy: 6, mood: 'Bra', steps: 6400 },
    { date: '2026-07-30', energy: 7, mood: 'Fokuserad', steps: 7200 },
    { date: '2026-07-31', energy: 7, mood: 'Fokuserad', steps: 7600 },
  ],
  goalsHabits: {
    goals: [{ category: 'weight', id: 'g1', status: 'active', target: 78, title: 'Målvikt' }],
    habits: [{ category: 'check_in', id: 'h1', status: 'active', title: 'Check-in', trackingMode: 'automatic' }],
  },
  meals: [
    { calories: 520, date: '2026-07-31T12:00:00', fiber: 4, id: 'm1', name: 'Kyckling ris', protein: 32, type: 'Lunch' },
  ],
  nutritionGoals: { fiber: 25, protein: 120 },
  profile: { goal: 'gå ner i vikt', goalWeight: 78 },
  today: '2026-07-31',
  weights: [
    { date: '2026-07-01', id: 'w1', value: 91.8 },
    { date: '2026-07-31', id: 'w2', value: 89.6 },
  ],
}

describe('smartHabitGoalEngine', () => {
  it('builds adaptive goals and habits from existing app data', () => {
    const model = buildSmartHabitGoalModel(baseInput, { analysisDate: '2026-07-31' })

    expect(model.version).toBe(1)
    expect(model.activeGoals[0].title).toBe('Målvikt')
    expect(model.recommendedGoals.length + model.recommendedHabits.length).toBeGreaterThan(0)
    expect(model.dashboard.todayHabit).toBeTruthy()
    expect(model.prediction.percent).toBeGreaterThan(0)
  })

  it('reduces difficulty when adherence is low', () => {
    const model = buildSmartHabitGoalModel({
      ...baseInput,
      goalsHabits: {
        habits: [
          { category: 'custom', id: 'h1', status: 'active', title: 'Manuell vana', trackingMode: 'manual' },
          { category: 'custom', id: 'h2', status: 'active', title: 'Manuell vana 2', trackingMode: 'manual' },
        ],
      },
    }, { analysisDate: '2026-07-31' })

    expect(model.adaptation.difficulty).toBe('easier')
    expect(model.recommendedHabits.every((item) => item.durationMinutes <= 5)).toBe(true)
  })

  it('can increase challenge only cautiously when completion is strong', () => {
    const strong = {
      ...baseInput,
      goalsHabits: {
        completions: [{ habitId: 'h1', date: '2026-07-31' }],
        habits: [{ category: 'custom', id: 'h1', status: 'active', title: 'Manuell vana', trackingMode: 'manual' }],
      },
    }
    const model = buildSmartHabitGoalModel(strong, { analysisDate: '2026-07-31' })

    expect(['balanced', 'slightly_harder']).toContain(model.adaptation.difficulty)
    expect(model.adaptation.durationMinutes).toBeLessThanOrEqual(15)
  })

  it('connects recommendations to action plans and nutrition coach', () => {
    const model = buildSmartHabitGoalModel(baseInput, { analysisDate: '2026-07-31' })

    expect(model.coachPlanLink.explanation).toBeTruthy()
    expect(model.recommendedHabits.some((item) => ['protein', 'meal_logging', 'steps', 'check_in'].includes(item.category))).toBe(true)
  })

  it('builds compact report summary without duplicating raw analysis', () => {
    const summary = buildSmartHabitGoalReportSummary(baseInput, { analysisDate: '2026-07-31' })

    expect(summary.summary).toContain('aktiva')
    expect(summary.probability).toMatch(/%|Saknas/)
    expect(JSON.stringify(summary)).not.toMatch(/"weights"|"meals"|"checkIns"/)
  })

  it('requires consent for AI payload', () => {
    const model = buildSmartHabitGoalModel(baseInput, { analysisDate: '2026-07-31' })

    expect(buildMinimalSmartHabitGoalAiPayload(model).allowed).toBe(false)
  })

  it('minimizes AI payload after consent', () => {
    const model = buildSmartHabitGoalModel(baseInput, { analysisDate: '2026-07-31' })
    const payload = buildMinimalSmartHabitGoalAiPayload(model, { consent: true })

    expect(payload.allowed).toBe(true)
    expect(payload).not.toHaveProperty('activeGoals')
    expect(payload).not.toHaveProperty('activeHabits')
    expect(JSON.stringify(payload)).not.toMatch(/w1|m1|session|provider|prompt|history|auth/i)
    expect(JSON.stringify(payload).length).toBeLessThan(900)
  })

  it('does not create storage sync backup or auth fields', () => {
    const model = buildSmartHabitGoalModel(baseInput, { analysisDate: '2026-07-31' })

    expect(JSON.stringify(model)).not.toMatch(/storageKey|syncKey|backupKey|auth|session|token/i)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildCoachActionPlan,
  buildCoachPlanCenterModel,
  saveCoachActionPlan,
  setCoachActionPlanActionStatus,
} from './coachActionPlanEngine.js'
import { normalizeAdaptiveCoachFeedback } from './adaptiveCoachFeedback.js'

const now = '2026-07-31T12:00:00.000Z'

function baseInput(overrides = {}) {
  return {
    adaptiveCoachFeedback: {},
    checkIns: [{ date: '2026-07-31', energy: 4, mood: 'Fokuserad', steps: 7200 }],
    goalsHabits: {
      goals: [{ id: 'g1', category: 'nutrition', status: 'active', title: 'Protein', target: 120 }],
      habits: [{ id: 'h1', category: 'steps', status: 'active', title: 'Promenad' }],
    },
    meals: [{ id: 'm1', date: '2026-07-31', protein: 32, calories: 520 }],
    nutritionGoals: { protein: { min: 108, max: 144 } },
    profile: { goalWeight: 78 },
    reminderState: {
      reminders: [{ id: 'r1', enabled: true, scheduleType: 'daily', time: '08:00', title: 'Check-in', type: 'check_in' }],
      notificationsV3: { settings: { quietHours: { enabled: true, start: '22:00', end: '07:00' } } },
    },
    weights: [
      { date: '2026-07-01', weight: 91.8 },
      { date: '2026-07-31', weight: 89.6 },
    ],
    ...overrides,
  }
}

describe('coachActionPlanEngine', () => {
  it('generates a deterministic 7-day plan with morning afternoon and evening actions', () => {
    const first = buildCoachActionPlan(baseInput(), { analysisDate: '2026-07-31', now })
    const second = buildCoachActionPlan(baseInput(), { analysisDate: '2026-07-31', now })

    expect(first.plan).toEqual(second.plan)
    expect(first.plan.days).toHaveLength(7)
    expect(first.plan.days[0].actions.map((action) => action.dayPart)).toEqual(['morning', 'afternoon', 'evening'])
    expect(first.plan.days[0].actions[0]).toMatchObject({
      status: 'pending',
    })
    expect(first.plan.days[0].actions[0].durationMinutes).toBeGreaterThan(0)
    expect(first.plan.days[0].actions[0].optionalReminder.time).not.toBe('22:30')
  })

  it('reduces difficulty after repeated skipped actions', () => {
    const skippedActions = Array.from({ length: 3 }, (_, index) => ({
      category: 'activity',
      dayPart: 'morning',
      description: 'Promenad',
      durationMinutes: 12,
      id: `skipped-${index}`,
      priority: 60,
      status: 'skipped',
      title: 'Promenad',
    }))
    const feedback = normalizeAdaptiveCoachFeedback({
      actionPlans: [{ days: [{ actions: skippedActions, date: '2026-07-28' }], generatedAt: now, id: 'old', weekStart: '2026-07-27' }],
    }, { now })
    const result = buildCoachActionPlan(baseInput({ adaptiveCoachFeedback: feedback }), { analysisDate: '2026-07-31', now })

    expect(result.adaptation.level).toBe('easier')
    expect(result.plan.days[0].actions[0].durationMinutes).toBeLessThanOrEqual(8)
    expect(result.plan.days[0].actions[0].description).toMatch(/extra liten/i)
  })

  it('gradually increases challenge after consistent completion', () => {
    const completedActions = Array.from({ length: 5 }, (_, index) => ({
      category: 'nutrition',
      completedAt: now,
      dayPart: 'morning',
      description: 'Protein',
      durationMinutes: 10,
      id: `completed-${index}`,
      priority: 60,
      status: 'completed',
      title: 'Protein',
    }))
    const feedback = normalizeAdaptiveCoachFeedback({
      actionPlans: [{ days: [{ actions: completedActions, date: '2026-07-28' }], generatedAt: now, id: 'old', weekStart: '2026-07-27' }],
    }, { now })
    const result = buildCoachActionPlan(baseInput({ adaptiveCoachFeedback: feedback }), { analysisDate: '2026-07-31', now })

    expect(result.adaptation.level).toBe('harder')
    expect(result.plan.days[0].actions[0].durationMinutes).toBeGreaterThanOrEqual(14)
  })

  it('stores plans in the existing adaptive coach feedback state and updates action status', () => {
    const result = buildCoachActionPlan(baseInput(), { analysisDate: '2026-07-31', now })
    const saved = saveCoachActionPlan({}, result.plan, { now })
    const actionId = saved.actionPlans[0].days[0].actions[0].id
    const completed = setCoachActionPlanActionStatus(saved, saved.actionPlans[0].id, actionId, 'completed', { now })

    expect(saved.actionPlans).toHaveLength(1)
    expect(completed.actionPlans[0].days[0].actions[0].status).toBe('completed')
    expect(completed.events[0].eventType).toBe('coachActionPlanActionCompleted')
  })

  it('builds center model from stored plan instead of creating a duplicate storage model', () => {
    const plan = buildCoachActionPlan(baseInput(), { analysisDate: '2026-07-31', now }).plan
    const feedback = saveCoachActionPlan({}, plan, { now })
    const model = buildCoachPlanCenterModel(baseInput({ adaptiveCoachFeedback: feedback }), { analysisDate: '2026-07-31', now })

    expect(model.plan.id).toBe(plan.id)
    expect(model.todayPlan.actions).toHaveLength(3)
    expect(model.confidenceScore).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'

import {
  buildAdaptiveCoachWeeklyPlan,
  commitAdaptiveCoachWeeklyPlan,
} from './adaptiveCoachWeeklyPlan.js'

const analysisDate = '2026-07-31'

function data(overrides = {}) {
  return {
    adaptiveCoachFeedback: {},
    checkIns: [
      { date: '2026-07-21', energy: 6, steps: 7200 },
      { date: '2026-07-22', energy: 6, steps: 7100 },
      { date: '2026-07-26', energy: 4, steps: 3000 },
      { date: '2026-07-27', energy: 4, steps: 3200 },
    ],
    goalsHabits: {},
    meals: [
      { date: '2026-07-21', protein: 90 },
      { date: '2026-07-22', protein: 92 },
      { date: '2026-07-26', protein: 38 },
      { date: '2026-07-27', protein: 42 },
    ],
    nutritionGoals: { protein: '108-144 g' },
    profile: { goalWeight: 78, startWeight: 91.8 },
    reminderState: {},
    weights: [
      { date: '2026-07-21', value: 91.8 },
      { date: analysisDate, value: 89.6 },
    ],
    ...overrides,
  }
}

describe('adaptiveCoachWeeklyPlan', () => {
  it('creates a draft without automatic persistence', () => {
    const input = data()
    const plan = buildAdaptiveCoachWeeklyPlan(input, { analysisDate })

    expect(plan.sourceStatus).toBe('derivedOnly')
    expect(plan.proposedActions.length).toBeGreaterThan(0)
    expect(input.goalsHabits.goals).toBeUndefined()
    expect(input.adaptiveCoachFeedback.recommendations).toBeUndefined()
  })

  it('limits focus areas and keeps recommendations safe', () => {
    const plan = buildAdaptiveCoachWeeklyPlan(data(), { analysisDate })

    expect(plan.focusAreas.length).toBeLessThanOrEqual(3)
    expect(JSON.stringify(plan)).not.toMatch(/diagnos|svält|hoppa över måltid|kommer att/i)
  })

  it('commits selected actions through existing domain states', () => {
    const plan = buildAdaptiveCoachWeeklyPlan(data(), { analysisDate })
    const result = commitAdaptiveCoachWeeklyPlan(plan, data(), {
      now: '2026-07-31T12:00:00.000Z',
      selectedActionIds: [plan.proposedActions[0].id],
    })

    expect(result.ok).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.feedback.events.some((event) => event.eventType === 'weeklyPlanConfirmed')).toBe(true)
  })

  it('prevents duplicates before committing', () => {
    const plan = buildAdaptiveCoachWeeklyPlan(data(), { analysisDate })
    const action = plan.proposedActions[0]
    const result = commitAdaptiveCoachWeeklyPlan(plan, data({
      adaptiveCoachFeedback: {
        recommendations: [{
          lastActionStatus: 'active',
          linkedEntityId: 'existing',
          linkedEntityType: action.draft.actionType,
          recommendationId: action.draft.sourceRecommendationId,
          status: 'accepted',
          title: action.title,
        }],
      },
    }), {
      now: '2026-07-31T12:00:00.000Z',
      selectedActionIds: [action.id],
    })

    expect(result.ok).toBe(false)
    expect(result.failures[0].status).toBe('duplicate')
    expect(result.rolledBack).toBe(true)
  })

  it('rolls back when one action fails validation', () => {
    const plan = buildAdaptiveCoachWeeklyPlan(data(), { analysisDate })
    const broken = {
      ...plan,
      proposedActions: [
        plan.proposedActions[0],
        {
          ...plan.proposedActions[1],
          draft: { ...plan.proposedActions[1].draft, title: '', description: '' },
        },
      ],
    }
    const result = commitAdaptiveCoachWeeklyPlan(broken, data(), {
      now: '2026-07-31T12:00:00.000Z',
    })

    expect(result.ok).toBe(false)
    expect(result.results).toHaveLength(0)
    expect(result.rolledBack).toBe(true)
  })
})

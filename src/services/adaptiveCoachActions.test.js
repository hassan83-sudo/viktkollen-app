import { describe, expect, it } from 'vitest'

import {
  buildCoachActionDraft,
  buildCoachActionSummary,
  commitCoachActionDraft,
  findCoachActionDuplicate,
  getCoachActionEligibility,
  validateCoachActionDraft,
} from './adaptiveCoachActions.js'
import { adaptiveCoachFeedbackStorageKey } from './adaptiveCoachFeedback.js'
import { goalsHabitsStorageKey } from './goalsHabits.js'
import { reminderStorageKey } from './reminders/reminderModel.js'

const now = '2026-07-31T12:00:00.000Z'
const recommendation = {
  action: 'Lägg till en enkel proteinkälla i nästa huvudmål.',
  area: 'nutrition',
  confidence: { value: 0.78 },
  coverage: { ratio: 0.7 },
  id: 'coach-nutrition-protein',
  priority: 86,
  text: 'Proteinmålet nås inte ofta på loggade dagar.',
  title: 'Stärk proteinbasen',
}

describe('adaptiveCoachActions', () => {
  it('builds editable drafts for all supported action types', () => {
    expect(buildCoachActionDraft(recommendation, { actionType: 'goal', analysisDate: '2026-07-31' })).toMatchObject({ actionType: 'goal', category: 'protein', target: 100 })
    expect(buildCoachActionDraft(recommendation, { actionType: 'habit', analysisDate: '2026-07-31' })).toMatchObject({ actionType: 'habit', frequency: 'daily' })
    expect(buildCoachActionDraft(recommendation, { actionType: 'reminder', analysisDate: '2026-07-31' })).toMatchObject({ actionType: 'reminder', reminderTime: '09:00' })
    expect(buildCoachActionDraft(recommendation, { actionType: 'weeklyFocus', analysisDate: '2026-07-31' })).toMatchObject({ actionType: 'weeklyFocus', weekStart: '2026-07-27' })
  })

  it('blocks unsafe or low-confidence recommendations', () => {
    expect(getCoachActionEligibility({ ...recommendation, action: 'Hoppa över måltider för snabb viktminskning.' }).eligible).toBe(false)
    expect(getCoachActionEligibility(recommendation, { confidence: 0.2, coverage: 0.8 })).toMatchObject({
      eligible: false,
      blockReason: expect.stringContaining('underlag'),
    })
  })

  it('validates numeric boundaries and concrete text', () => {
    expect(validateCoachActionDraft(buildCoachActionDraft(recommendation, { actionType: 'goal' })).ok).toBe(true)
    expect(validateCoachActionDraft({ ...buildCoachActionDraft(recommendation, { actionType: 'goal' }), target: 999 }).ok).toBe(false)
    expect(validateCoachActionDraft({ ...buildCoachActionDraft(recommendation, { actionType: 'habit' }), title: '' }).ok).toBe(false)
  })

  it('detects duplicates for goals habits reminders focus and feedback links', () => {
    const goalDraft = buildCoachActionDraft(recommendation, { actionType: 'goal' })
    const habitDraft = buildCoachActionDraft(recommendation, { actionType: 'habit' })
    const reminderDraft = buildCoachActionDraft(recommendation, { actionType: 'reminder' })
    const focusDraft = buildCoachActionDraft(recommendation, { actionType: 'weeklyFocus', analysisDate: '2026-07-31' })

    expect(findCoachActionDuplicate(goalDraft, { goalsHabits: { goals: [{ category: 'protein', id: 'g1', status: 'active', target: 100, title: 'Stärk proteinbasen' }] } }).duplicate).toBe(true)
    expect(findCoachActionDuplicate(habitDraft, { goalsHabits: { habits: [{ category: 'protein', id: 'h1', linkedDataSource: 'protein', status: 'active', title: 'Protein' }] } }).duplicate).toBe(true)
    expect(findCoachActionDuplicate(reminderDraft, { reminderState: { reminders: [{ archivedAt: '', id: 'r1', linkedEntityId: recommendation.id, time: '09:00', type: 'meal_log' }] } }).duplicate).toBe(true)
    expect(findCoachActionDuplicate(focusDraft, { goalsHabits: { weeklyFocus: [{ id: 'f1', linkedInsightId: recommendation.id, status: 'active', title: 'Stärk proteinbasen', weekStart: '2026-07-27' }] } }).duplicate).toBe(true)
    expect(findCoachActionDuplicate(goalDraft, { adaptiveCoachFeedback: { recommendations: [{ lastActionStatus: 'active', linkedEntityId: 'g1', linkedEntityType: 'goal', recommendationId: recommendation.id }] } }).duplicate).toBe(true)
  })

  it('commits a goal through goals habits state and links feedback after success', () => {
    const draft = buildCoachActionDraft(recommendation, { actionType: 'goal' })
    const result = commitCoachActionDraft(draft, { adaptiveCoachFeedback: {}, goalsHabits: {}, reminderState: {} }, { now, recommendation })

    expect(result.ok).toBe(true)
    expect(result.goalsHabits.goals).toHaveLength(1)
    expect(result.feedback.recommendations[0]).toMatchObject({ linkedEntityType: 'goal', lastActionStatus: 'active', status: 'accepted' })
  })

  it('commits a habit reminder and weekly focus without new storage keys', () => {
    const habit = commitCoachActionDraft(buildCoachActionDraft(recommendation, { actionType: 'habit' }), { adaptiveCoachFeedback: {}, goalsHabits: {}, reminderState: {} }, { now, recommendation })
    const reminder = commitCoachActionDraft(buildCoachActionDraft(recommendation, { actionType: 'reminder' }), { adaptiveCoachFeedback: {}, goalsHabits: {}, reminderState: {} }, { now, recommendation })
    const focus = commitCoachActionDraft(buildCoachActionDraft(recommendation, { actionType: 'weeklyFocus', analysisDate: '2026-07-31' }), { adaptiveCoachFeedback: {}, goalsHabits: {}, reminderState: {} }, { now, recommendation })

    expect(habit.goalsHabits.habits[0]).toMatchObject({ category: 'protein', linkedDataSource: 'protein' })
    expect(reminder.reminderState.reminders[0]).toMatchObject({ linkedEntityId: recommendation.id, source: 'adaptiveCoach' })
    expect(focus.goalsHabits.weeklyFocus[0]).toMatchObject({ linkedInsightId: recommendation.id, status: 'active' })
    expect([adaptiveCoachFeedbackStorageKey, goalsHabitsStorageKey, reminderStorageKey]).toEqual([
      'viktkollen.adaptiveCoach.v1',
      'viktkollen.goalsHabits.v2',
      'viktkollen.reminders.v2',
    ])
  })

  it('does not update feedback when mutation fails', () => {
    const result = commitCoachActionDraft({
      ...buildCoachActionDraft(recommendation, { actionType: 'goal' }),
      target: 999,
    }, {
      adaptiveCoachFeedback: { recommendations: [] },
      goalsHabits: {},
      reminderState: {},
    }, { now, recommendation })

    expect(result.ok).toBe(false)
    expect(result.feedback).toEqual({ recommendations: [] })
  })

  it('summarizes active created actions and conversion rate', () => {
    const summary = buildCoachActionSummary({
      recommendations: [
        { linkedEntityId: 'g1', linkedEntityType: 'goal', recommendationId: 'a', status: 'accepted' },
        { linkedEntityId: 'h1', linkedEntityType: 'habit', recommendationId: 'b', status: 'completed' },
        { recommendationId: 'c', status: 'dismissed' },
      ],
    })

    expect(summary).toMatchObject({
      completed: 1,
      conversionRate: 67,
      total: 2,
    })
    expect(summary.byType).toMatchObject({ goal: 1, habit: 1 })
  })
})

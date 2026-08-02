import { describe, expect, it } from 'vitest'

import {
  adaptiveCoachFeedbackStorageKey,
  applyFeedbackToRecommendations,
  buildAdaptiveCoachFeedbackSummary,
  getCoachRecommendationId,
  normalizeAdaptiveCoachFeedback,
  updateAdaptiveCoachFeedback,
} from './adaptiveCoachFeedback.js'
import {
  getBackupStorageKeys,
  userDataKeys,
} from './userDataRepository.js'
import { isAllowedSyncStorageKey } from './sync/syncMetadata.js'

const now = '2026-07-31T12:00:00.000Z'

const recommendation = {
  action: 'Lägg till protein i nästa måltid.',
  area: 'nutrition',
  priority: 86,
  text: 'Proteinmålet nås inte ofta på loggade dagar.',
  title: 'Stärk proteinbasen',
}

describe('adaptiveCoachFeedback', () => {
  it('creates stable recommendation ids', () => {
    expect(getCoachRecommendationId(recommendation)).toBe(getCoachRecommendationId({
      ...recommendation,
      priority: 12,
    }))
    expect(getCoachRecommendationId(recommendation)).toMatch(/^coach-nutrition-/)
  })

  it('normalizes malformed storage to the V1 contract', () => {
    const normalized = normalizeAdaptiveCoachFeedback({
      actions: [
        { ...recommendation, id: 'rec-1', status: 'accepted', updatedAt: now },
        { id: 'rec-1', status: 'completed', updatedAt: '2026-08-01T12:00:00.000Z' },
        null,
      ],
    }, { now })

    expect(normalized.version).toBe(1)
    expect(normalized.recommendations).toHaveLength(1)
    expect(normalized.recommendations[0]).toMatchObject({ id: 'rec-1', status: 'completed' })
    expect(normalized.history.length).toBeGreaterThan(0)
  })

  it('records accept postpone dismiss and completed actions', () => {
    const accepted = updateAdaptiveCoachFeedback({}, recommendation, 'accepted', { now })
    const postponed = updateAdaptiveCoachFeedback(accepted, recommendation, 'postponed', {
      now: '2026-08-01T12:00:00.000Z',
      postponedUntil: '2026-08-03T12:00:00.000Z',
    })
    const dismissed = updateAdaptiveCoachFeedback(postponed, recommendation, 'dismissed', {
      dismissedReason: 'Inte relevant',
      now: '2026-08-02T12:00:00.000Z',
    })
    const completed = updateAdaptiveCoachFeedback(dismissed, recommendation, 'completed', {
      now: '2026-08-04T12:00:00.000Z',
    })

    expect(completed.recommendations[0]).toMatchObject({
      completedAt: '2026-08-04T12:00:00.000Z',
      status: 'completed',
    })
    expect(completed.history.map((entry) => entry.status)).toEqual([
      'completed',
      'dismissed',
      'postponed',
      'accepted',
    ])
  })

  it('summarizes coach effectiveness and recent history', () => {
    const feedback = normalizeAdaptiveCoachFeedback({
      recommendations: [
        { ...recommendation, area: 'nutrition', id: 'a', status: 'completed', updatedAt: now },
        { ...recommendation, area: 'activity', id: 'b', status: 'dismissed', updatedAt: now },
        { ...recommendation, area: 'goals', id: 'c', status: 'accepted', updatedAt: now },
        { ...recommendation, area: 'weight', id: 'd', status: 'postponed', postponedUntil: '2026-08-02T12:00:00.000Z', updatedAt: now },
      ],
    }, { now })
    const summary = buildAdaptiveCoachFeedbackSummary(feedback, { now })

    expect(summary).toMatchObject({
      accepted: 1,
      completed: 1,
      dismissed: 1,
      postponed: 1,
      completionRate: 25,
      helpedMost: 'nutrition',
      ignoredMost: 'activity',
    })
    expect(summary.recentActions).toHaveLength(4)
  })

  it('lowers dismissed advice and hides postponed advice until later', () => {
    const feedback = updateAdaptiveCoachFeedback({}, recommendation, 'dismissed', { now })
    const postponedFeedback = updateAdaptiveCoachFeedback(feedback, {
      ...recommendation,
      area: 'activity',
      title: 'Promenad',
    }, 'postponed', {
      now,
      postponedUntil: '2026-08-03T12:00:00.000Z',
    })
    const ranked = applyFeedbackToRecommendations([
      { ...recommendation, id: getCoachRecommendationId(recommendation), priority: 90 },
      { ...recommendation, area: 'activity', id: getCoachRecommendationId({ ...recommendation, area: 'activity', title: 'Promenad' }), priority: 85, title: 'Promenad' },
      { ...recommendation, area: 'goals', id: 'fresh', priority: 70, title: 'Veckans fokus' },
    ], postponedFeedback, { now })

    expect(ranked.map((item) => item.area)).not.toContain('activity')
    expect(ranked[0].area).toBe('goals')
    expect(ranked.find((item) => item.area === 'nutrition').feedbackStatus).toBe('dismissed')
  })

  it('uses repository backup and sync contracts', () => {
    expect(adaptiveCoachFeedbackStorageKey).toBe('viktkollen.adaptiveCoach.v1')
    expect(userDataKeys.adaptiveCoachFeedback).toBe(adaptiveCoachFeedbackStorageKey)
    expect(getBackupStorageKeys()).toContain(adaptiveCoachFeedbackStorageKey)
    expect(isAllowedSyncStorageKey(adaptiveCoachFeedbackStorageKey)).toBe(true)
  })
})

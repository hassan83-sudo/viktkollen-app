import { describe, expect, it } from 'vitest'
import { appendAchievementEvents, normalizeAchievementState } from './achievementLedger.js'
import { getSafeAchievementDefinitions } from './achievementDefinitions.js'
import { buildAchievementEngine, buildAchievementSummary } from './achievementEngine.js'
import { buildWeightGoalMilestones } from './milestoneEngine.js'
import { calculateAchievementXp, calculateLevel } from './xpEngine.js'
import { validateAchievementSafety } from './achievementSafety.js'

const today = '2026-08-04'

function baseData(overrides = {}) {
  return {
    adaptiveCoachFeedback: {
      recommendations: [
        { id: 'c1', status: 'accepted', title: 'Protein' },
        { id: 'c2', status: 'completed', title: 'Promenad' },
      ],
    },
    checkIn: { date: today, energy: 7, mood: 'Fokuserad', steps: 7200, workout: true },
    checkIns: [
      { date: '2026-08-02', steps: 5000 },
      { date: '2026-08-03', steps: 6200 },
    ],
    goalsHabits: {
      achievements: {
        events: [{ at: '2026-08-01T10:00:00.000Z', definitionId: 'first-portability-event', eventId: 'export-1', type: 'exportCompleted' }],
      },
      goals: [
        { id: 'g1', status: 'active', title: 'Protein' },
        { id: 'g2', status: 'completed', title: 'Veckomål' },
      ],
      habits: [
        { completedDates: ['2026-08-01', '2026-08-02', '2026-08-03'], id: 'h1', status: 'active', title: 'Promenad' },
      ],
      weeklyFocus: [{ id: 'f1', status: 'completed', title: 'Lunchloggning' }],
    },
    meals: [
      { date: '2026-08-01', id: 'm1', protein: 35, text: 'Kyckling' },
      { date: '2026-08-02', id: 'm2', protein: 24, text: 'Kvarg' },
      { date: today, id: 'm3', protein: 20, text: 'Ägg' },
      { date: today, id: 'planned-1', planned: true, text: 'Planerad middag' },
    ],
    nutritionGoals: { protein: 30 },
    profile: { goalWeight: 78 },
    weights: [
      { date: '2026-07-01', value: 91.8 },
      { date: today, value: 89.6 },
    ],
    ...overrides,
  }
}

describe('achievement safety and definitions', () => {
  it('keeps all bundled definitions safe and uniquely identified', () => {
    const result = getSafeAchievementDefinitions()

    expect(result.blocked).toEqual([])
    expect(result.safe.length).toBeGreaterThan(10)
    expect(new Set(result.safe.map((definition) => definition.id)).size).toBe(result.safe.length)
  })

  it('blocks unsafe or aggressive motivation', () => {
    expect(validateAchievementSafety({
      category: 'nutrition',
      description: 'Hoppa över middag',
      id: 'unsafe',
      title: 'Snabb viktminskning',
      xp: 10,
    }).ok).toBe(false)
  })
})

describe('achievementEngine', () => {
  it('derives unlocked achievements from existing app data', () => {
    const model = buildAchievementEngine(baseData(), { analysisDate: today })
    const statuses = Object.fromEntries(model.achievements.map((achievement) => [achievement.definitionId, achievement.status]))

    expect(statuses['first-check-in']).toBe('unlocked')
    expect(statuses['first-meal']).toBe('unlocked')
    expect(statuses['first-weigh-in']).toBe('unlocked')
    expect(statuses['weight-progress-1kg']).toBe('unlocked')
    expect(statuses['protein-goal-first']).toBe('unlocked')
    expect(statuses['first-workout']).toBe('unlocked')
    expect(statuses['first-goal-created']).toBe('unlocked')
    expect(statuses['first-goal-completed']).toBe('unlocked')
    expect(statuses['habit-three-days']).toBe('unlocked')
    expect(model.summary.unlockedCount).toBeGreaterThan(6)
    expect(model.nextAchievement).toBeTruthy()
    expect(model.achievements.find((achievement) => achievement.definitionId === 'first-weigh-in').unlockedAt).toBe('2026-07-01')
  })

  it('tracks leveled nutrition logging protein and activity achievements', () => {
    const model = buildAchievementEngine(baseData({
      checkIn: { date: today, energy: 7, mood: 'Fokuserad', steps: 10000, workout: true },
      checkIns: [
        { date: '2026-08-01', steps: 12000 },
        { date: '2026-08-02', steps: 13000 },
        { date: '2026-08-03', steps: 15000 },
      ],
      meals: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-08-${String((index % 5) + 1).padStart(2, '0')}`,
        id: `meal-${index}`,
        protein: 35,
        text: 'Proteinmåltid',
      })),
      nutritionGoals: { protein: 60 },
    }), { analysisDate: today })
    const statuses = Object.fromEntries(model.achievements.map((achievement) => [achievement.definitionId, achievement.status]))

    expect(statuses['ten-actual-meals']).toBe('unlocked')
    expect(statuses['protein-goal-5-days']).toBe('unlocked')
    expect(statuses['steps-10000-day']).toBe('unlocked')
    expect(statuses['steps-50000-total']).toBe('unlocked')
  })

  it('does not count planned meals as actual achievement evidence', () => {
    const model = buildAchievementEngine(baseData({
      meals: [
        { date: today, id: 'planned-1', planned: true, text: 'Planerad lunch' },
      ],
    }), { analysisDate: today })
    const meal = model.achievements.find((achievement) => achievement.definitionId === 'first-meal')

    expect(meal.progress).toBe(0)
    expect(meal.status).toBe('locked')
  })

  it('generates at most three safe challenges without persisting them', () => {
    const model = buildAchievementEngine(baseData({ meals: [] }), { analysisDate: today })

    expect(model.challenges.length).toBeLessThanOrEqual(3)
    expect(model.challenges.map((challenge) => challenge.title).join(' ')).not.toMatch(/skuld|straff|svält/i)
    expect(model.ledger.challengeHistory).toEqual([])
  })

  it('returns summary values for dashboard and reports', () => {
    const summary = buildAchievementSummary(baseData(), { analysisDate: today })

    expect(summary.totalXp).toBeGreaterThan(0)
    expect(summary.coverage).toBeGreaterThan(0)
    expect(summary.confidence).toBeGreaterThan(0)
    expect(summary.latestAchievementTitle).not.toMatch(/undefined|null|NaN|\[object Object\]/)
  })
})

describe('milestoneEngine', () => {
  it('builds goal milestones from the real start-current-goal distance', () => {
    const milestones = buildWeightGoalMilestones(baseData())

    expect(milestones).toHaveLength(4)
    expect(milestones[0]).toMatchObject({ targetPercent: 25, status: 'upcoming' })
    expect(milestones.at(-1)).toMatchObject({ targetPercent: 100, targetWeight: 78 })
  })

  it('marks exact milestone hits as reached', () => {
    const milestones = buildWeightGoalMilestones(baseData({
      weights: [
        { date: '2026-07-01', value: 91.8 },
        { date: today, value: 88.35 },
      ],
    }))

    expect(milestones[0].status).toBe('reached')
  })

  it('supports weight gain goals with the opposite direction', () => {
    const milestones = buildWeightGoalMilestones({
      profile: { goalWeight: 80 },
      weights: [
        { date: '2026-07-01', value: 70 },
        { date: today, value: 75 },
      ],
    })

    expect(milestones[0].status).toBe('reached')
    expect(milestones[2].status).toBe('upcoming')
  })

  it('returns no milestones when goal data is missing or flat', () => {
    expect(buildWeightGoalMilestones({ weights: [{ date: today, value: 80 }] })).toEqual([])
    expect(buildWeightGoalMilestones({ profile: { goalWeight: 80 }, weights: [{ date: today, value: 80 }] })).toEqual([])
  })
})

describe('xp and ledger', () => {
  it('calculates capped XP and deterministic levels', () => {
    const xp = calculateAchievementXp([
      { definitionId: 'a', id: 'a', source: 'test', status: 'unlocked', xp: 20 },
      { definitionId: 'b', id: 'b', source: 'test', status: 'unlocked', xp: 200 },
    ])

    expect(xp.totalXp).toBe(100)
    expect(xp.events).toHaveLength(2)
    expect(calculateLevel(250).title).toBe('Stabil grund')
  })

  it('normalizes achievement state and deduplicates appended events', () => {
    const state = appendAchievementEvents(normalizeAchievementState(), [
      { definitionId: 'first-meal', eventId: 'e1', type: 'achievementUnlocked' },
      { definitionId: 'first-meal', eventId: 'e1', type: 'achievementUnlocked' },
      { definitionId: 'first-meal', eventId: 'xp-first-meal', type: 'xpGranted', xp: 20 },
    ], { now: '2026-08-04T12:00:00.000Z' })

    expect(state.events).toHaveLength(1)
    expect(state.xpLedger).toHaveLength(1)
    expect(state.unlocked).toContain('first-meal')
  })
})

import { describe, expect, it } from 'vitest'
import { createDashboardData } from './dashboardService.js'
import {
  calculateGoalProgress,
  getUnifiedWeightFacts,
  getWeightStats,
  normalizeDailyWeightEntries,
  normalizeWeightEntries,
} from './healthCalculations.js'
import { createAiCoachV2Report } from './aiCoachV2Service.js'
import { createMonthlyHealthReport } from './monthlyReportService.js'
import { buildAiCoachFacts } from './aiCoach/coachFacts.js'
import { buildAiCoachAppContextFromData } from './aiCoach/coachAppContext.js'
import { filterActualMealsForDate } from './nutrition/mealDateUtils.js'
import { createNutritionDashboardModel } from '../components/nutritionDashboard/nutritionDashboardViewModel.js'
import { buildProgressDashboardAnalytics } from './progress/progressAnalytics.js'
import { makePersonalCoachReply } from '../lib/coachReply.js'
import {
  analyzeWeights,
  buildProgressTimeline,
  createProgressReport,
  getEmptyWeightDraft,
  getWeightEntrySignature,
  migrateDuplicateWeightEntries,
  normalizeWeights,
  upsertWeight,
  weightSources,
  weightDraftToEntry,
} from './progressService.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import { buildAiUserContext } from './aiUserContext.js'

const oldWeight = {
  createdAt: '2026-07-28T08:00:00.000Z',
  date: '2026-07-28',
  id: 'old-weight',
  note: '',
  source: 'Manuell',
  time: '08:00',
  updatedAt: '2026-07-28T08:00:00.000Z',
  value: 88.6,
}

const savedDraft = {
  date: '2026-07-29',
  note: '',
  source: 'Manuell',
  time: '08:15',
  value: '90,1',
}

const morningDuplicateBase = {
  createdAt: '2026-07-30T04:02:00.000Z',
  date: '2026-07-30',
  id: 'morning-0402',
  note: '',
  source: 'Manuell',
  time: '04:02',
  updatedAt: '2026-07-30T04:02:00.000Z',
  value: 88.6,
}

describe('weight module regression flow', () => {
  it('one saved draft creates exactly one weight post even if submit is replayed', () => {
    const firstEntry = weightDraftToEntry(savedDraft)
    const secondEntry = weightDraftToEntry(savedDraft)
    const afterFirstSave = upsertWeight([oldWeight], firstEntry)
    const afterSecondSave = upsertWeight(afterFirstSave, secondEntry)

    expect(afterSecondSave.filter((entry) => entry.value === 90.1)).toHaveLength(1)
    expect(afterSecondSave).toHaveLength(2)
  })

  it('deduplicates existing stored weights with the same actual weighing', () => {
    const duplicateWeights = normalizeWeights([
      oldWeight,
      { ...oldWeight, id: 'old-weight-copy' },
      { ...oldWeight, id: 'old-weight-copy-2', value: '88,6' },
    ])

    expect(duplicateWeights).toHaveLength(1)
  })

  it('keeps separate weight entries when time differs', () => {
    const weights = normalizeWeights([
      oldWeight,
      { ...oldWeight, id: 'later-weight', time: '08:30' },
    ])

    expect(weights).toHaveLength(2)
  })

  it('uses a stable semantic signature for duplicate detection', () => {
    expect(getWeightEntrySignature({ ...oldWeight, id: 'a', value: '88,6' })).toBe(
      getWeightEntrySignature({ ...oldWeight, id: 'b', value: 88.6 }),
    )
  })

  it('progress timeline shows one weight activity for duplicate stored weights', () => {
    const timeline = buildProgressTimeline({
      weights: [
        oldWeight,
        { ...oldWeight, id: 'old-weight-copy' },
      ],
    })

    expect(timeline.filter((item) => item.type === 'Vikt')).toHaveLength(1)
  })

  it('dashboard activity shows one weight activity for duplicate stored weights', () => {
    const dashboard = createDashboardData({
      checkIn: {},
      foods: [],
      mealHistory: [],
      meals: [],
      profile: {},
      weights: [
        oldWeight,
        { ...oldWeight, id: 'old-weight-copy' },
      ],
    })

    expect(dashboard.activity.filter((item) => item.type === 'weight')).toHaveLength(1)
  })

  it('form draft after save uses the newly saved latest weight, not the previous one', () => {
    const nextEntry = weightDraftToEntry(savedDraft)
    const resetDraft = getEmptyWeightDraft(nextEntry)

    expect(resetDraft.value).toBe('90,1')
    expect(resetDraft.value).not.toBe('88,6')
  })

  it('health weight entries also deduplicate duplicate stored activity rows', () => {
    const entries = normalizeWeightEntries([
      { date: '2026-07-29T08:15:00.000Z', value: 90.1 },
      { date: '2026-07-29T08:15:00.000Z', value: '90,1' },
    ])

    expect(entries).toHaveLength(1)
  })

  it('migration removes historical duplicate weight entries once', () => {
    const migration = migrateDuplicateWeightEntries([
      oldWeight,
      { ...oldWeight, id: 'duplicate-a' },
      { ...oldWeight, id: 'duplicate-b', value: '88,6' },
      { ...oldWeight, id: 'newer', date: '2026-07-29', value: 90.1 },
    ])

    expect(migration.changed).toBe(true)
    expect(migration.removedCount).toBe(2)
    expect(migration.weights).toHaveLength(2)
  })

  it('migration is idempotent after duplicates are removed', () => {
    const first = migrateDuplicateWeightEntries([
      oldWeight,
      { ...oldWeight, id: 'duplicate-a' },
      { ...oldWeight, id: 'newer', date: '2026-07-29', value: 90.1 },
    ])
    const second = migrateDuplicateWeightEntries(first.weights)

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.removedCount).toBe(0)
    expect(second.weights).toEqual(first.weights)
  })

  it('migration keeps one post per unique weighing signature', () => {
    const migration = migrateDuplicateWeightEntries([
      oldWeight,
      { ...oldWeight, id: 'same-date-different-time', time: '08:30' },
      { ...oldWeight, id: 'same-time-different-note', note: 'Efter frukost' },
      { ...oldWeight, id: 'same-time-different-source', source: 'Check-in' },
    ])

    expect(migration.changed).toBe(false)
    expect(migration.weights).toHaveLength(4)
  })

  it('migration removes same weight within five minutes', () => {
    const migration = migrateDuplicateWeightEntries([
      morningDuplicateBase,
      { ...morningDuplicateBase, createdAt: '2026-07-30T04:05:00.000Z', id: 'morning-0405', time: '04:05', updatedAt: '2026-07-30T04:05:00.000Z' },
    ])

    expect(migration.changed).toBe(true)
    expect(migration.removedCount).toBe(1)
    expect(migration.weights).toHaveLength(1)
  })

  it('migration keeps the latest post in a historical duplicate group', () => {
    const migration = migrateDuplicateWeightEntries([
      morningDuplicateBase,
      { ...morningDuplicateBase, createdAt: '2026-07-30T04:05:00.000Z', id: 'morning-0405', time: '04:05', updatedAt: '2026-07-30T04:05:00.000Z' },
      { ...morningDuplicateBase, createdAt: '2026-07-30T04:08:00.000Z', id: 'morning-0408', time: '04:08', updatedAt: '2026-07-30T04:08:00.000Z' },
    ])

    expect(migration.weights).toHaveLength(1)
    expect(migration.weights[0]).toMatchObject({ id: 'morning-0408', time: '04:08', value: 88.6 })
  })

  it('migration keeps same weight after more than five minutes', () => {
    const migration = migrateDuplicateWeightEntries([
      morningDuplicateBase,
      { ...morningDuplicateBase, id: 'morning-0408', time: '04:08' },
    ])

    expect(migration.changed).toBe(false)
    expect(migration.weights.map((entry) => entry.time)).toEqual(['04:02', '04:08'])
  })

  it('migration keeps different weights within five minutes', () => {
    const migration = migrateDuplicateWeightEntries([
      morningDuplicateBase,
      { ...morningDuplicateBase, id: 'different-weight', time: '04:05', value: 90.1 },
    ])

    expect(migration.changed).toBe(false)
    expect(migration.weights.map((entry) => entry.value)).toEqual([88.6, 90.1])
  })

  it('migration keeps different notes and sources within five minutes', () => {
    const migration = migrateDuplicateWeightEntries([
      morningDuplicateBase,
      { ...morningDuplicateBase, id: 'different-note', note: 'Efter vatten', time: '04:03' },
      { ...morningDuplicateBase, id: 'different-source', source: 'Check-in', time: '04:04' },
    ])

    expect(migration.changed).toBe(false)
    expect(migration.weights).toHaveLength(3)
  })

  it('second migration run makes no changes after five-minute duplicates are removed', () => {
    const first = migrateDuplicateWeightEntries([
      morningDuplicateBase,
      { ...morningDuplicateBase, id: 'morning-0405', time: '04:05' },
      { ...morningDuplicateBase, id: 'morning-0412', time: '04:12' },
    ])
    const second = migrateDuplicateWeightEntries(first.weights)

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.weights).toEqual(first.weights)
  })

  it('migrated weights feed history, timelines, analysis and reports without duplicate rows', () => {
    const migration = migrateDuplicateWeightEntries([
      oldWeight,
      morningDuplicateBase,
      { ...morningDuplicateBase, id: 'morning-0405', time: '04:05' },
      { ...morningDuplicateBase, id: 'morning-0408', time: '04:08' },
    ])
    const timeline = buildProgressTimeline({ weights: migration.weights })
    const dashboard = createDashboardData({
      checkIn: {},
      foods: [],
      mealHistory: [],
      meals: [],
      profile: {},
      weights: migration.weights,
    })
    const analysis = analyzeWeights(migration.weights, {})
    const report = createProgressReport({ period: 'week', today: '2026-07-30', weights: migration.weights })

    expect(migration.weights).toHaveLength(2)
    expect(timeline.filter((item) => item.type === 'Vikt')).toHaveLength(2)
    expect(dashboard.activity.filter((item) => item.type === 'weight')).toHaveLength(2)
    expect(analysis.weighingCount).toBe(2)
    expect(report.insight).toContain('2')
  })

  it('central weight source provides latest weight consistently across dashboard and AI facts', () => {
    const profile = { goalWeight: '78 kg', startWeight: '91,8 kg' }
    const rawWeights = [
      { date: '2026-07-30', id: 'w1', source: 'Manuell', time: '04:05', value: 90.1 },
      { date: '2026-07-30', id: 'w2', source: 'Manuell', time: '04:09', value: 90.1 },
      { date: '2026-07-30', id: 'old', source: 'Manuell', time: '04:02', value: 88.6 },
    ]
    const migrated = migrateDuplicateWeightEntries(rawWeights).weights
    const healthStats = getWeightStats(migrated, { startWeight: profile.startWeight })
    const healthFacts = getUnifiedWeightFacts({ profile, weights: migrated })
    const dashboard = createDashboardData({ checkIn: {}, foods: [], mealHistory: [], meals: [], profile, weights: migrated })
    const smartProgress = buildProgressDashboardAnalytics({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile,
      weights: migrated,
    }, { period: 'all', today: new Date('2026-07-30T12:00:00.000Z') })
    const coachFacts = buildAiCoachFacts({ profile, weights: migrated })

    expect(healthStats.current).toBe(90.1)
    expect(healthFacts.latestWeight).toBe(90.1)
    expect(dashboard.goals.currentWeight).toBe(90.1)
    expect(smartProgress.weight.currentWeight).toBe(90.1)
    expect(coachFacts.latestWeight).toBe(90.1)
  })

  it('keeps AI body scan estimates out of the central measured weight source', () => {
    const profile = { goalWeight: '78 kg', startWeight: '91,8 kg' }
    const rawWeights = [
      { date: '2026-07-01', id: 'start', source: 'Manuell', time: '08:00', value: 91.8 },
      { date: '2026-07-31', id: 'measured-latest', source: 'Manuell', time: '08:00', value: 89.6 },
      { date: '2026-08-01', id: 'ai-estimate', source: 'Kroppsanalys', time: '08:00', value: 84.2 },
      { date: '2026-08-02', id: 'ai-provenance', provenance: 'ai_estimated', time: '08:00', value: 83.8 },
    ]
    const bodyAnalysisHistory = [
      {
        createdAt: '2026-08-02T10:00:00.000Z',
        result: {
          estimatedWeight: {
            confidence: 'low',
            maxKg: 85,
            minKg: 82,
          },
        },
      },
    ]
    const snapshot = buildHealthSnapshot({
      bodyAnalysisHistory,
      profile,
      today: '2026-08-02',
      weights: rawWeights,
    })
    const dashboard = createDashboardData({ bodyAnalysisHistory, checkIn: {}, foods: [], mealHistory: [], meals: [], profile, weights: rawWeights })
    const coachFacts = buildAiCoachFacts({ bodyAnalysisHistory, profile, weights: rawWeights })
    const aiContext = buildAiUserContext({ bodyAnalysisHistory, profile, today: '2026-08-02', weights: rawWeights })

    expect(weightSources).not.toContain('Kroppsanalys')
    expect(normalizeWeights(rawWeights).map((entry) => entry.id)).toEqual(['start', 'measured-latest'])
    expect(normalizeWeightEntries(rawWeights).map((entry) => entry.value)).toEqual([91.8, 89.6])
    expect(snapshot.weight.current).toBe(89.6)
    expect(snapshot.weight.provenance).toMatchObject({
      aiEstimatedCount: 2,
      excludedFromMeasuredSeriesCount: 2,
      measuredCount: 2,
      status: 'measured',
    })
    expect(snapshot.weight.provenance.latestBodyScanEstimate).toMatchObject({
      confidence: 'low',
      maxKg: 85,
      minKg: 82,
      provenance: 'ai_estimated',
    })
    expect(dashboard.goals.currentWeight).toBe(89.6)
    expect(coachFacts.latestWeight).toBe(89.6)
    expect(coachFacts.bodyScanEstimatedWeight).toMatchObject({ minKg: 82, maxKg: 85 })
    expect(aiContext.weight.currentWeight).toBe(89.6)
    expect(aiContext.bodyAnalysis.latestEstimatedWeight).toMatchObject({ minKg: 82, maxKg: 85 })
  })

  it('central weight source calculates start, total change and goal remaining consistently', () => {
    const profile = { goalWeight: '78 kg', startWeight: '91,8 kg' }
    const migrated = migrateDuplicateWeightEntries([
      { date: '2026-07-24', id: 'start', source: 'Manuell', time: '08:00', value: 91.8 },
      { date: '2026-07-30', id: 'latest-a', source: 'Manuell', time: '04:05', value: 90.1 },
      { date: '2026-07-30', id: 'latest-b', source: 'Manuell', time: '04:09', value: 90.1 },
    ]).weights
    const healthFacts = getUnifiedWeightFacts({ profile, weights: migrated })
    const analysis = analyzeWeights(migrated, profile)
    const smartProgress = buildProgressDashboardAnalytics({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile,
      weights: migrated,
    }, { period: 'all', today: new Date('2026-07-30T12:00:00.000Z') })
    const coachFacts = buildAiCoachFacts({ profile, weights: migrated })

    expect(healthFacts.startWeight).toBe(91.8)
    expect(healthFacts.weightLost).toBe(1.7)
    expect(healthFacts.goalRemaining).toBe(12.1)
    expect(analysis.target.startWeight).toBe(91.8)
    expect(analysis.changeTotal).toBe(-1.7)
    expect(smartProgress.weight.goalRemaining).toBe(12.1)
    expect(coachFacts.weightLost).toBe(1.7)
    expect(coachFacts.goalRemaining).toBe(12.1)
  })

  it('dashboard progress trend uses total change since start instead of goal remaining', () => {
    const dashboard = createDashboardData({
      checkIn: {},
      foods: [],
      mealHistory: [],
      meals: [],
      profile: { goalWeight: '78 kg', startWeight: '78 kg' },
      weights: [
        { date: '2026-07-01', id: 'start', source: 'Manuell', time: '08:00', value: 91.8 },
        { date: '2026-07-31', id: 'latest', source: 'Manuell', time: '04:09', value: 89.6 },
      ],
    })

    expect(dashboard.progress.weightTrend).toContain('2,2 kg ned sedan start')
    expect(dashboard.progress.weightTrend).not.toContain('11,6 kg upp sedan start')
    expect(dashboard.goals.remaining).toBe(11.6)
  })

  it('dashboard progress trend shows weight gain since start', () => {
    const dashboard = createDashboardData({
      checkIn: {},
      foods: [],
      mealHistory: [],
      meals: [],
      profile: { goalWeight: '78 kg', startWeight: '78 kg' },
      weights: [
        { date: '2026-07-01', id: 'start', source: 'Manuell', time: '08:00', value: 91.8 },
        { date: '2026-07-31', id: 'latest', source: 'Manuell', time: '04:09', value: 92.3 },
      ],
    })

    expect(dashboard.progress.weightTrend).toContain('0,5 kg upp sedan start')
  })

  it('dashboard progress trend shows unchanged weight since start', () => {
    const dashboard = createDashboardData({
      checkIn: {},
      foods: [],
      mealHistory: [],
      meals: [],
      profile: { goalWeight: '78 kg', startWeight: '78 kg' },
      weights: [
        { date: '2026-07-01', id: 'start', source: 'Manuell', time: '08:00', value: 91.8 },
        { date: '2026-07-31', id: 'latest', source: 'Manuell', time: '04:09', value: 91.8 },
      ],
    })

    expect(dashboard.progress.weightTrend).toContain('Oförändrat sedan start')
  })

  it('dashboard progress trend has a neutral fallback when weight data is missing', () => {
    const dashboard = createDashboardData({
      checkIn: {},
      foods: [],
      mealHistory: [],
      meals: [],
      profile: { goalWeight: '78 kg', startWeight: '78 kg' },
      weights: [],
    })

    expect(dashboard.progress.weightTrend).toBe('Logga vikt för att se trend')
  })

  it('central goal progress calculates loss milestones and percentages without using rounded kilos', () => {
    const facts = getUnifiedWeightFacts({
      profile: { goalWeight: '78 kg', startWeight: '78 kg' },
      weights: [
        { date: '2026-07-01', id: 'start', source: 'Manuell', time: '08:00', value: 91.8 },
        { date: '2026-07-31', id: 'latest', source: 'Manuell', time: '04:09', value: 89.6 },
      ],
    })

    expect(facts.startWeight).toBe(91.8)
    expect(facts.latestWeight).toBe(89.6)
    expect(facts.goalWeight).toBe(78)
    expect(facts.goalProgress.totalDistance).toBe(13.8)
    expect(facts.goalProgress.completedKg).toBe(2.2)
    expect(facts.completePercent).toBe(15.9)
    expect(facts.percentRemaining).toBe(84.1)
    expect(facts.goalProgress.passedMilestones.map((milestone) => milestone.weight)).toEqual([90.4])
    expect(facts.goalProgress.nextMilestone).toMatchObject({ percent: 25, weight: 88.4 })
  })

  it('AI Coach V2 uses central milestones for weight loss', () => {
    const report = createAiCoachV2Report({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile: { goalWeight: '78 kg', startWeight: '78 kg' },
      weights: [
        { date: '2026-07-01', id: 'start', source: 'Manuell', time: '08:00', value: 91.8 },
        { date: '2026-07-31', id: 'latest', source: 'Manuell', time: '04:09', value: 89.6 },
      ],
    })

    expect(report.goalCenter.latestMilestone).toBe('90,4 kg passerad')
    expect(report.goalCenter.latestMilestone).not.toContain('88 kg')
    expect(report.goalCenter.nextMilestone).toBe('88,4 kg är nästa.')
    expect(report.goalCenter.nextMilestone).not.toContain('Målet 78 kg är nästa')
    expect(report.goalCenter.percentRemainingLabel).toBe('84,1 % kvar')
    expect(report.goalCenter.remainingKgLabel).toBe('11,6 kg kvar')
  })

  it('central goal progress calculates gain milestones with the opposite direction', () => {
    const progress = calculateGoalProgress({
      currentWeight: 82.1,
      goalWeight: 90,
      startWeight: 80,
    })

    expect(progress.completePercent).toBe(21)
    expect(progress.remainingPercent).toBe(79)
    expect(progress.passedMilestones.map((milestone) => milestone.weight)).toEqual([81])
    expect(progress.nextMilestone).toMatchObject({ percent: 25, weight: 82.5 })
  })

  it('central goal progress counts an exact milestone hit as passed', () => {
    const progress = calculateGoalProgress({
      currentWeight: 88.4,
      goalWeight: 78,
      startWeight: 91.8,
    })

    expect(progress.passedMilestones.map((milestone) => milestone.percent)).toEqual([10, 25])
    expect(progress.nextMilestone).toMatchObject({ percent: 50, weight: 84.9 })
  })

  it('central goal progress handles identical start and goal weights', () => {
    const progress = calculateGoalProgress({
      currentWeight: 80,
      goalWeight: 80,
      startWeight: 80,
    })

    expect(progress.completePercent).toBe(100)
    expect(progress.remainingPercent).toBe(0)
    expect(progress.milestones).toEqual([])
    expect(progress.nextMilestone).toBeNull()
  })

  it('central goal progress returns null when required weight data is missing', () => {
    expect(calculateGoalProgress({ currentWeight: 89.6, goalWeight: 78 })).toBeNull()
    expect(calculateGoalProgress({ startWeight: 91.8, goalWeight: 78 })).toBeNull()
    expect(calculateGoalProgress({ startWeight: 91.8, currentWeight: 89.6 })).toBeNull()
  })

  it('migrated duplicates do not inflate dashboard, progress analytics or reports', () => {
    const profile = { goalWeight: '78 kg', startWeight: '91,8 kg' }
    const migrated = migrateDuplicateWeightEntries([
      { date: '2026-07-24', id: 'start', source: 'Manuell', time: '08:00', value: 91.8 },
      { date: '2026-07-30', id: 'latest-a', source: 'Manuell', time: '04:05', value: 90.1 },
      { date: '2026-07-30', id: 'latest-b', source: 'Manuell', time: '04:08', value: 90.1 },
      { date: '2026-07-30', id: 'latest-c', source: 'Manuell', time: '04:09', value: 90.1 },
    ]).weights
    const dashboard = createDashboardData({ checkIn: {}, foods: [], mealHistory: [], meals: [], profile, weights: migrated })
    const smartProgress = buildProgressDashboardAnalytics({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile,
      weights: migrated,
    }, { period: 'all', today: new Date('2026-07-30T12:00:00.000Z') })
    const report = createProgressReport({
      period: 'week',
      profile,
      today: new Date('2026-07-30T12:00:00.000Z'),
      weights: migrated,
    })

    expect(migrated).toHaveLength(2)
    expect(dashboard.activity.filter((item) => item.type === 'weight')).toHaveLength(2)
    expect(smartProgress.weight.registrationCount).toBe(2)
    expect(report.insight).toContain('2')
  })

  it('older storage format with weight field still feeds the central source', () => {
    const profile = { goalWeight: '78 kg', startWeight: '91,8 kg' }
    const legacyWeights = [
      { date: '2026-07-01', id: 'start', source: 'Manuell', time: '08:00', weight: '91,8 kg' },
      { createdAt: '2026-07-30T04:05:00.000Z', id: 'legacy-a', source: 'Manuell', weight: '90,1 kg' },
      { createdAt: '2026-07-30T04:09:00.000Z', id: 'legacy-b', source: 'Manuell', weight: 90.1 },
    ]
    const entries = normalizeWeightEntries(legacyWeights)
    const facts = getUnifiedWeightFacts({ profile, weights: legacyWeights })

    expect(entries).toHaveLength(2)
    expect(facts.latestWeight).toBe(90.1)
    expect(facts.startWeight).toBe(91.8)
    expect(facts.weightLost).toBe(1.7)
    expect(facts.goalRemaining).toBe(12.1)
  })

  it('legacy AI chat answers current weight from the central migrated source', () => {
    const weights = [
      { date: '2026-07-30', id: 'latest', source: 'Manuell', time: '04:12', value: 89.6 },
      { date: '2026-07-30', id: 'older-duplicate', source: 'Manuell', time: '04:09', value: 90.1 },
    ]
    const central = getWeightStats(weights).current
    const reply = makePersonalCoachReply({
      checkIn: {},
      currentWeight: central,
      foods: [],
      message: 'Hur mycket väger jag nu?',
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights,
    })

    expect(central).toBe(89.6)
    expect(reply).toContain('89,6 kg')
    expect(reply).not.toContain('90,1 kg')
  })

  it('central daily weights keep the latest weighing per calendar day for analytics', () => {
    const weights = [
      { date: '2026-07-23', id: 'previous', source: 'Manuell', time: '08:00', value: 90.1 },
      { date: '2026-07-30', id: 'early-low', source: 'Manuell', time: '04:08', value: 88.6 },
      { date: '2026-07-30', id: 'early-high', source: 'Manuell', time: '04:09', value: 90.1 },
      { date: '2026-07-30', id: 'evening-a', source: 'Manuell', time: '19:05', value: 89.7 },
      { date: '2026-07-30', id: 'evening-b', source: 'Manuell', time: '19:25', value: 89.6 },
    ]

    expect(normalizeWeights(weights)).toHaveLength(5)
    expect(normalizeDailyWeightEntries(weights)).toEqual([
      { date: '2026-07-23', value: 90.1 },
      { date: '2026-07-30', value: 89.6 },
    ])
  })

  it('one calendar day with many weighings does not create a false period change', () => {
    const weights = [
      { date: '2026-07-30', id: 'early-low', source: 'Manuell', time: '04:08', value: 88.6 },
      { date: '2026-07-30', id: 'early-high', source: 'Manuell', time: '04:09', value: 90.1 },
      { date: '2026-07-30', id: 'evening-b', source: 'Manuell', time: '19:25', value: 89.6 },
    ]
    const analysis = analyzeWeights(weights, {})
    const dashboard = buildProgressDashboardAnalytics({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile: {},
      weights,
    }, { period: '7d', today: new Date('2026-07-30T08:00:00.000Z') })

    expect(normalizeWeights(weights)).toHaveLength(3)
    expect(analysis.change7).toBeNull()
    expect(dashboard.weight.periodChangeKg).toBe(0)
    expect(dashboard.weight.latestWeight).toBe(89.6)
  })

  it('AI Coach V2 weekly summary uses the same 7-day daily weight change as weight analysis', () => {
    const weights = [
      { date: '2026-07-23', id: 'previous', source: 'Manuell', time: '08:00', value: 90.1 },
      { date: '2026-07-30', id: 'early-low', source: 'Manuell', time: '04:08', value: 88.6 },
      { date: '2026-07-30', id: 'early-high', source: 'Manuell', time: '04:09', value: 90.1 },
      { date: '2026-07-30', id: 'evening-b', source: 'Manuell', time: '19:25', value: 89.6 },
    ]
    const expected = analyzeWeights(weights, {}).change7
    const report = createAiCoachV2Report({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile: {},
      weights,
    })

    expect(expected).toBe(-0.5)
    expect(report.weeklySummary.weightChangeLabel).toBe('-0,5 kg')
    expect(report.weeklySummary.weightChangeLabel).not.toContain('1 kg')
  })

  it('monthly report uses the same 30-day daily weight change as weight analysis', () => {
    const weights = [
      { date: '2026-07-23', id: 'previous', source: 'Manuell', time: '08:00', value: 90.1 },
      { date: '2026-07-30', id: 'early-low', source: 'Manuell', time: '04:08', value: 88.6 },
      { date: '2026-07-30', id: 'early-high', source: 'Manuell', time: '04:09', value: 90.1 },
      { date: '2026-07-30', id: 'evening-b', source: 'Manuell', time: '19:25', value: 89.6 },
    ]
    const expected = analyzeWeights(weights, {}).change30
    const report = createMonthlyHealthReport({ mealHistory: [], meals: [], weights })

    expect(expected).toBe(-0.5)
    expect(report.weightChange).toBe(expected)
    expect(report.weightChangeLabel).toBe('Ned 0,5 kg')
    expect(report.weightChangeLabel).not.toBe('Upp 1 kg')
  })

  it('daily weight normalization uses local dates near midnight', () => {
    const weights = [
      { createdAt: '2026-07-29T23:30:00.000Z', id: 'late-utc', source: 'Manuell', value: 90.1 },
      { createdAt: '2026-07-30T22:30:00.000Z', id: 'next-local-day', source: 'Manuell', value: 89.6 },
    ]

    expect(normalizeDailyWeightEntries(weights)).toEqual([
      { date: '2026-07-30', value: 90.1 },
      { date: '2026-07-31', value: 89.6 },
    ])
  })

  it('daily weight normalization excludes future calendar days but keeps later times today', () => {
    const weights = [
      { date: '2026-07-30', id: 'today-later', source: 'Manuell', time: '19:25', value: 89.6 },
      { date: '2026-07-31', id: 'future-day', source: 'Manuell', time: '08:00', value: 88.8 },
    ]
    const daily = normalizeDailyWeightEntries(weights, { today: new Date('2026-07-30T08:00:00.000Z') })
    const dashboard = buildProgressDashboardAnalytics({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile: {},
      weights,
    }, { period: '7d', today: new Date('2026-07-30T08:00:00.000Z') })

    expect(daily).toEqual([{ date: '2026-07-30', value: 89.6 }])
    expect(dashboard.weight.currentWeight).toBe(89.6)
    expect(dashboard.weight.currentWeight).not.toBe(88.8)
  })

  it('reports avoid NaN and misleading direction text when period weight data is insufficient', () => {
    const coachReport = createAiCoachV2Report({
      checkIn: {},
      foods: [],
      meals: [],
      nutritionGoals: {},
      profile: {},
      weights: [{ date: '2026-07-30', id: 'only', source: 'Manuell', time: '19:25', value: 89.6 }],
    })
    const monthlyReport = createMonthlyHealthReport({
      mealHistory: [],
      meals: [],
      weights: [{ date: '2026-07-30', id: 'only', source: 'Manuell', time: '19:25', value: 89.6 }],
    })

    expect(coachReport.weeklySummary.weightChangeLabel).toBe('Saknas')
    expect(monthlyReport.weightChangeLabel).toBe('Stabil')
    expect(JSON.stringify({ coachReport, monthlyReport })).not.toMatch(/NaN|undefined/)
  })

  it('AI Coach V2 and nutrition dashboard show zero meals today when meals are historical', () => {
    const today = '2026-07-31'
    const meals = [
      { calories: 400, date: '2026-07-26', fiber: 4, id: 'old-1', name: 'Frukost', protein: 20, time: '08:00' },
      { calories: 650, date: '2026-07-26', fiber: 6, id: 'old-2', name: 'Lunch', protein: 35, time: '12:00' },
      { calories: 500, date: '2026-07-26', fiber: 5, id: 'old-3', name: 'Middag', protein: 30, time: '18:00' },
    ]
    const nutritionModel = createNutritionDashboardModel({ date: today, meals, nutritionGoals: {} })
    const coachReport = createAiCoachV2Report({
      checkIn: {},
      meals,
      nutritionGoals: {},
      profile: {},
      today,
      weights: [],
    })
    const coachContext = buildAiCoachAppContextFromData({ meals }, { today })
    const coachFacts = buildAiCoachFacts(coachContext)

    expect(meals).toHaveLength(3)
    expect(nutritionModel.summary.mealCount).toBe(0)
    expect(nutritionModel.summary.calories).toBe('0 kcal')
    expect(nutritionModel.summary.protein).toBe('0 g')
    expect(coachReport.dailyAnalysis.mealCount).toBe(0)
    expect(coachReport.dailyAnalysis.caloriesLabel).toBe('0 kcal idag')
    expect(coachReport.dailyAnalysis.proteinLabel).toBe('0 g idag')
    expect(coachReport.dailyAnalysis.fiberLabel).toBe('0 g')
    expect(coachReport.dailyAnalysis.summary).not.toContain('3 loggade måltider')
    expect(coachFacts.todayMeals).toHaveLength(0)
  })

  it('today meal filtering counts one or several actual meals for the selected local date', () => {
    const today = '2026-07-31'
    const meals = [
      { calories: 300, date: today, id: 'today-1', name: 'Ägg', protein: 18, time: '08:00' },
      { calories: 500, date: today, id: 'today-2', name: 'Kyckling', protein: 35, time: '12:00' },
      { calories: 400, date: '2026-07-30', id: 'old', name: 'Pizza', protein: 20, time: '18:00' },
    ]

    expect(createAiCoachV2Report({ meals: meals.slice(0, 1), today }).dailyAnalysis.mealCount).toBe(1)
    expect(createAiCoachV2Report({ meals, today }).dailyAnalysis.mealCount).toBe(2)
    expect(createNutritionDashboardModel({ date: today, meals }).summary.mealCount).toBe(2)
  })

  it('today meal filtering handles local midnight and future calendar days', () => {
    const meals = [
      { createdAt: '2026-07-30T22:30:00.000Z', id: 'local-july-31', name: 'Kvarg', protein: 25 },
      { date: '2026-08-01', id: 'future', name: 'Framtidsmål', protein: 99 },
    ]

    expect(filterActualMealsForDate(meals, '2026-07-31').map((meal) => meal.id)).toEqual(['local-july-31'])
    expect(createNutritionDashboardModel({ date: '2026-07-31', meals }).summary.mealCount).toBe(1)
    expect(createNutritionDashboardModel({ date: '2026-07-30', meals }).summary.mealCount).toBe(0)
  })

  it('planned meals are not counted as actual intake today', () => {
    const today = '2026-07-31'
    const meals = [
      { date: today, id: 'planned-meal-1', protein: 40, title: 'Planerad lunch' },
      { date: today, id: 'actual-1', name: 'Faktisk lunch', protein: 30 },
    ]

    expect(filterActualMealsForDate(meals, today).map((meal) => meal.id)).toEqual(['actual-1'])
    expect(createNutritionDashboardModel({ date: today, meals }).summary.mealCount).toBe(1)
    expect(createAiCoachV2Report({ meals, today }).dailyAnalysis.mealCount).toBe(1)
  })

  it('same today value gives deterministic meal counts regardless of runtime date', () => {
    const meals = [
      { date: '2026-07-26', id: 'old', name: 'Historisk måltid', protein: 20 },
      { date: '2026-07-31', id: 'today', name: 'Dagens måltid', protein: 25 },
    ]

    expect(createAiCoachV2Report({ meals, today: '2026-07-31' }).dailyAnalysis.mealCount).toBe(1)
    expect(createAiCoachV2Report({ meals, today: '2026-07-31' }).dailyAnalysis.mealCount).toBe(1)
    expect(createNutritionDashboardModel({ date: '2026-07-31', meals }).summary.mealCount).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { createDashboardData } from './dashboardService.js'
import { getUnifiedWeightFacts, getWeightStats, normalizeWeightEntries } from './healthCalculations.js'
import { buildAiCoachFacts } from './aiCoach/coachFacts.js'
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
  weightDraftToEntry,
} from './progressService.js'

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
    const report = createProgressReport({ period: 'week', weights: migration.weights })

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
})

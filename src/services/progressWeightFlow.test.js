import { describe, expect, it } from 'vitest'
import { createDashboardData } from './dashboardService.js'
import { normalizeWeightEntries } from './healthCalculations.js'
import {
  buildProgressTimeline,
  getEmptyWeightDraft,
  getWeightEntrySignature,
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
})

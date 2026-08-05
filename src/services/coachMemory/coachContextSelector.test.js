import { describe, expect, it } from 'vitest'
import { selectCoachMemoryContext } from './coachContextSelector.js'

const now = '2026-08-05T12:00:00.000Z'

describe('coachContextSelector', () => {
  it('returns no items when personalization is disabled', () => {
    const selected = selectCoachMemoryContext({ consent: { personalizationEnabled: false } }, { now })

    expect(selected.memoryEnabled).toBe(false)
    expect(selected.items).toEqual([])
  })

  it('selects relevant high-confidence categories and explicit preferences', () => {
    const selected = selectCoachMemoryContext({
      consent: { personalizationEnabled: true, remoteAiMemoryEnabled: true },
      preferences: { preferredActionSize: 'liten', preferredCoachTone: 'lugn', preferredFocusAreas: ['nutrition'] },
      successfulStrategies: [{ category: 'nutrition', confidence: 0.8, evidenceCount: 3, staleAfter: '2026-09-01T12:00:00.000Z' }],
      declinedStrategies: [{ category: 'activity', confidence: 0.8, evidenceCount: 3, staleAfter: '2026-09-01T12:00:00.000Z' }],
    }, { intents: ['nutrition'], now })

    expect(selected.remoteAllowed).toBe(true)
    expect(selected.explicitPreferences.coachStyle).toBe('lugn')
    expect(selected.items).toHaveLength(1)
    expect(selected.items[0]).toMatchObject({ category: 'nutrition', kind: 'successfulStrategy' })
  })

  it('excludes stale low-confidence and excluded focus areas', () => {
    const selected = selectCoachMemoryContext({
      consent: { personalizationEnabled: true, remoteAiMemoryEnabled: true },
      preferences: { excludedFocusAreas: ['nutrition'] },
      successfulStrategies: [
        { category: 'nutrition', confidence: 0.9, evidenceCount: 4, staleAfter: '2026-09-01T12:00:00.000Z' },
        { category: 'activity', confidence: 0.2, evidenceCount: 4, staleAfter: '2026-09-01T12:00:00.000Z' },
        { category: 'goals', confidence: 0.9, evidenceCount: 4, staleAfter: '2026-01-01T12:00:00.000Z' },
      ],
    }, { intents: ['nutrition'], now })

    expect(selected.items).toEqual([])
    expect(JSON.stringify(selected)).not.toMatch(/raw|history|token|session/i)
  })
})

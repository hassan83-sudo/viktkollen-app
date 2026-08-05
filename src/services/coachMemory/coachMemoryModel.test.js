import { describe, expect, it } from 'vitest'
import {
  coachMemoryVersion,
  forgetCoachMemoryItem,
  forgetDerivedCoachMemory,
  normalizeCoachMemory,
  updateCoachMemoryPreferences,
} from './coachMemoryModel.js'

describe('coachMemoryModel', () => {
  it('creates safe defaults and versioned structure', () => {
    const memory = normalizeCoachMemory({}, { now: '2026-08-05T12:00:00.000Z' })

    expect(memory.version).toBe(coachMemoryVersion)
    expect(memory.preferences.preferredCoachTone).toBe('neutral')
    expect(memory.preferences.preferredActionSize).toBe('normal')
    expect(memory.consent.personalizationEnabled).toBe(false)
  })

  it('normalizes corrupt unknown and sensitive fields', () => {
    const memory = normalizeCoachMemory({
      email: 'x@example.com',
      preferences: {
        preferredActionSize: 'extrem',
        preferredCoachTone: 'tough-love',
        preferredFocusAreas: ['nutrition', 'diagnos secret'],
      },
      successfulStrategies: [
        { category: 'nutrition', confidence: 2, evidenceCount: 3, rawEvidence: 'token=secret' },
        { category: 'diagnosis', evidenceCount: 10 },
      ],
    })

    expect(memory.preferences.preferredActionSize).toBe('normal')
    expect(memory.preferences.preferredCoachTone).toBe('neutral')
    expect(memory.preferences.preferredFocusAreas).toEqual(['nutrition'])
    expect(memory.successfulStrategies).toHaveLength(1)
    expect(JSON.stringify(memory)).not.toMatch(/x@example|token=secret|diagnosis/)
  })

  it('updates explicit preferences without deleting derived memory', () => {
    const memory = normalizeCoachMemory({
      successfulStrategies: [{ category: 'activity', confidence: 0.8, evidenceCount: 2 }],
    })
    const updated = updateCoachMemoryPreferences(memory, { preferredCoachTone: 'lugn', preferredActionSize: 'liten' })

    expect(updated.preferences.preferredCoachTone).toBe('lugn')
    expect(updated.preferences.preferredActionSize).toBe('liten')
    expect(updated.successfulStrategies).toHaveLength(1)
    expect(updated.adaptationMetadata.userEdited).toBe(true)
  })

  it('forgets one item or all derived items without touching preferences', () => {
    const memory = normalizeCoachMemory({
      preferences: { preferredCoachTone: 'rak' },
      successfulStrategies: [{ category: 'nutrition', confidence: 0.8, evidenceCount: 3, id: 'm1' }],
    })

    expect(forgetCoachMemoryItem(memory, 'm1').successfulStrategies).toHaveLength(0)
    const allForgotten = forgetDerivedCoachMemory(memory)
    expect(allForgotten.successfulStrategies).toHaveLength(0)
    expect(allForgotten.preferences.preferredCoachTone).toBe('rak')
  })
})

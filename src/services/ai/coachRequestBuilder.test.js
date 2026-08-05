import { describe, expect, it } from 'vitest'
import {
  buildCoachRemoteRequestPayload,
  coachRequestBuilderInternals,
  fingerprintCoachPayload,
} from './coachRequestBuilder.js'

describe('coachRequestBuilder', () => {
  it('builds minimal deterministic payload without raw history identity fields', () => {
    const input = {
      adaptiveCoachFeedback: {},
      analysisDate: '2026-08-04',
      checkIn: { energy: 6, mood: 'Fokuserad', session: 'bad' },
      goalsHabits: { goals: [{ id: 'goal-1', name: 'TESTDATA protein' }] },
      meals: [{ id: 'meal-1', text: 'raw meal text', calories: 500 }],
      profile: { email: 'test@example.com', name: 'Private' },
      weights: [{ id: 'weight-1', value: 89.6 }],
    }
    const result = buildCoachRemoteRequestPayload(input, { analysisDate: '2026-08-04', consent: true })
    const serialized = JSON.stringify(result.payload)

    expect(result.payload.consent).toBe(true)
    expect(result.payload.analysisDate).toBe('2026-08-04')
    expect(serialized).not.toMatch(/test@example.com|session|deviceId|localStorage|raw meal text/)
    expect(fingerprintCoachPayload(result.payload)).toBe(fingerprintCoachPayload(result.payload))
  })

  it('redacts unsafe text tokens', () => {
    expect(coachRequestBuilderInternals.stripUnsafeText('email a@b.com token abc')).not.toMatch(/a@b.com|token/)
  })

  it('adds only safe memory context when remote memory is enabled', () => {
    const result = buildCoachRemoteRequestPayload({
      adaptiveCoachFeedback: {
        coachMemory: {
          consent: { personalizationEnabled: true, remoteAiMemoryEnabled: true },
          preferences: { preferredActionSize: 'liten', preferredCoachTone: 'lugn', preferredFocusAreas: ['nutrition'] },
          recentContext: { currentCoverage: 0.8, currentMomentum: 'reinforceSuccess', safeWeeklySummary: 'Stabil sammanfattning utan rådata.' },
          successfulStrategies: [{ category: 'nutrition', confidence: 0.8, evidenceCount: 3, id: 'private-id', staleAfter: '2026-09-01T12:00:00.000Z' }],
        },
      },
    }, { analysisDate: '2026-08-04', consent: true, intents: ['nutrition'] })

    expect(result.payload.memoryContext).toMatchObject({
      actionSize: 'liten',
      coachStyle: 'lugn',
      remoteAllowed: true,
    })
    expect(result.preview.memory).toContain('lugn')
    expect(JSON.stringify(result.payload.memoryContext)).not.toMatch(/private-id|auth|session|token|raw|meal|weight|prompt|provider/i)
  })
})

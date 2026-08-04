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
})

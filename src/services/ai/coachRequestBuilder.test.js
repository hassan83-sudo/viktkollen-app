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

  it('includes the selected app locale in the remote payload', () => {
    const result = buildCoachRemoteRequestPayload({
      locale: 'zh-HK',
      profile: { locale: 'ar' },
    }, { analysisDate: '2026-08-04', consent: true })

    expect(result.payload.locale).toBe('zh-TW')
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

  it('adds minimized action plan context only with remote consent', () => {
    const input = {
      adaptiveCoachFeedback: {
        actionPlans: [{
          adaptiveChange: 'Planen kortades ned.',
          confidence: 0.72,
          days: [{
            actions: [
              { category: 'nutrition', id: 'private-action-1', status: 'completed', title: 'Protein', description: 'raw detail' },
              { category: 'activity', id: 'private-action-2', status: 'skipped', title: 'Promenad', description: 'raw detail' },
            ],
            date: '2026-08-04',
          }],
          generatedAt: '2026-08-04T12:00:00.000Z',
        }],
      },
    }
    const enabled = buildCoachRemoteRequestPayload(input, { analysisDate: '2026-08-04', consent: true })
    const disabled = buildCoachRemoteRequestPayload(input, { analysisDate: '2026-08-04', consent: false })

    expect(enabled.payload.actionPlanContext).toMatchObject({
      categories: ['nutrition', 'activity'],
      completed: 1,
      remoteAllowed: true,
      skipped: 1,
    })
    expect(enabled.preview.actionPlan).toContain('1 klara')
    expect(JSON.stringify(enabled.payload.actionPlanContext)).not.toMatch(/private-action|raw detail/)
    expect(disabled.payload.actionPlanContext.remoteAllowed).toBe(false)
  })

  it('adds minimized prediction context only with remote consent', () => {
    const coachModel = {
      confidence: { value: 0.7 },
      coverage: { ratio: 0.6 },
      recommendations: [],
      remotePredictionContext: {
        categories: ['weight', 'nutrition'],
        confidence: 66,
        opportunities: ['momentum'],
        predictionCount: 2,
        warningSignals: ['adherence'],
      },
      riskAreas: [],
      summary: { todayFocus: 'Litet steg', workingWell: [] },
    }
    const enabled = buildCoachRemoteRequestPayload({}, { analysisDate: '2026-08-04', coachModel, consent: true })
    const disabled = buildCoachRemoteRequestPayload({}, { analysisDate: '2026-08-04', coachModel, consent: false })

    expect(enabled.payload.predictionContext).toMatchObject({
      categories: ['weight', 'nutrition'],
      confidence: 66,
      predictionCount: 2,
      warningCategories: ['adherence'],
    })
    expect(enabled.preview.predictions).toContain('2 aggregerade prognoser')
    expect(JSON.stringify(enabled.payload.predictionContext)).not.toMatch(/history|raw|image|meal|weight-id|auth|token/i)
    expect(disabled.payload.predictionContext.remoteAllowed).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  clearWellbeingPlan,
  createPreparedSupportMessage,
  createWellbeingCheckIn,
  evaluateWellbeingSafety,
  getAgeLanguage,
  getWellbeingCoachCapabilities,
  normalizeWellbeingState,
  updateWellbeingPlan,
  wellbeingRetentionDays,
  wellbeingStorageKey,
} from './wellbeingModel.js'

describe('wellbeingModel', () => {
  it('normalizes corrupt local-first data and documents storage', () => {
    const state = normalizeWellbeingState({ checkIns: 'bad', plan: { safePeople: 42 } }, { now: '2026-08-28T10:00:00.000Z' })

    expect(wellbeingStorageKey).toBe('viktkollen.wellbeing.v1')
    expect(wellbeingRetentionDays).toBe(90)
    expect(state).toMatchObject({ schemaVersion: 1, checkIns: [], notes: [] })
    expect(state.plan.safePeople).toBe('42')
  })

  it('creates check-ins only when the user chooses a mood', () => {
    const skipped = createWellbeingCheckIn({}, { mood: '', reasons: ['stress'] }, { now: '2026-08-28T10:00:00.000Z' })
    const saved = createWellbeingCheckIn(skipped, { mood: 'heavy', reasons: ['stress', 'preferNot', 'unknown'] }, { now: '2026-08-28T10:01:00.000Z' })

    expect(skipped.checkIns).toHaveLength(0)
    expect(saved.checkIns).toHaveLength(1)
    expect(saved.checkIns[0]).toMatchObject({ mood: 'heavy', reasons: ['stress', 'preferNot'] })
  })

  it('supports editable and confirmed-clear safety plans', () => {
    const saved = updateWellbeingPlan({}, { helps: 'Andas', safePeople: 'Mamma', warningSigns: 'Sover dåligt' }, { now: '2026-08-28T10:00:00.000Z' })
    const cleared = clearWellbeingPlan(saved, { now: '2026-08-28T10:05:00.000Z' })

    expect(saved.plan.safePeople).toBe('Mamma')
    expect(cleared.plan.safePeople).toBe('')
    expect(cleared.plan.updatedAt).toBe('2026-08-28T10:05:00.000Z')
  })

  it('keeps the AI coach in honest placeholder and safety mode unless a backend exists', () => {
    expect(getWellbeingCoachCapabilities()).toMatchObject({ aiAvailable: false, canUseMicrophone: false, placeholder: true, safetyMode: true })
    expect(evaluateWellbeingSafety('Jag känner mig inte säker')).toMatchObject({ immediateRisk: true, recommendedAction: 'emergency' })
  })

  it('prepares but does not send a support message', () => {
    expect(createPreparedSupportMessage()).toContain('Har du möjlighet?')
  })

  it('adapts language from existing school level when available', () => {
    expect(getAgeLanguage({}, { level: 'gymnasium' })).toBe('teen')
    expect(getAgeLanguage({ schoolLevel: 'mellanstadiet' })).toBe('child')
    expect(getAgeLanguage({}, {})).toBe('general')
  })
})

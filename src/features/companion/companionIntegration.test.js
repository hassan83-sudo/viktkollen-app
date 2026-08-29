import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readySource = readFileSync(new URL('../../components/sections/ReadySection.jsx', import.meta.url), 'utf8')
const wellbeingSource = readFileSync(new URL('../wellbeing/WellbeingCenter.jsx', import.meta.url), 'utf8')
const coachSource = readFileSync(new URL('../../components/sections/CoachSection.jsx', import.meta.url), 'utf8')
const signLanguageSource = readFileSync(new URL('../education/SignLanguageSection.jsx', import.meta.url), 'utf8')
const modelSource = readFileSync(new URL('./companionModel.js', import.meta.url), 'utf8')

describe('shared AI companion integration', () => {
  it('uses one versioned local-first storage key', () => {
    expect(modelSource).toContain("companionStorageKey = 'viktkollen.ai-companion.v1'")
    expect(modelSource).toContain('migrateReadyCompanionProfile')
    expect(modelSource).toContain('readyStorageKey')
  })

  it('shows the same companion profile in Ready, Wellbeing and AI Coach', () => {
    expect(readySource).toContain('CompanionProfilePanel')
    expect(readySource).toContain('surface="ready"')
    expect(wellbeingSource).toContain('CompanionProfilePanel')
    expect(wellbeingSource).toContain('surface="wellbeing"')
    expect(coachSource).toContain('CompanionProfilePanel')
    expect(coachSource).toContain('surface="coach"')
  })

  it('reuses the same communication profile in Teckensprak', () => {
    expect(signLanguageSource).toContain('loadCompanionProfile')
    expect(signLanguageSource).toContain('saveCompanionProfile')
    expect(signLanguageSource).not.toContain('saveReadyState')
  })

  it('keeps safety policy separate from personality settings', () => {
    expect(modelSource).toContain('safetyOverridesPersonality: true')
    expect(modelSource).toContain('noRomanceOrSexualMinors: true')
    expect(modelSource).toContain('emergency112First: true')
  })
})

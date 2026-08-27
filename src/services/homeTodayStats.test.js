import { describe, expect, it } from 'vitest'
import { getWeightEntryProvenance } from './weightProvenance.js'
import {
  formatHomeStepsLabel,
  formatHomeWeightLabel,
  isHomeCurrentWeightEntry,
  resolveHomeSteps,
  resolveHomeWeightKg,
} from './homeTodayStats.js'

describe('homeTodayStats weight provenance', () => {
  it('accepts measured manual weight', () => {
    expect(getWeightEntryProvenance({ source: 'Manuell', value: 89 }).kind).toBe('measured')
    expect(isHomeCurrentWeightEntry({ source: 'Manuell', value: 89 })).toBe(true)
    expect(resolveHomeWeightKg({
      weights: [{ date: '2026-08-21', source: 'Manuell', value: 89 }],
    })).toBe(89)
  })

  it('accepts user_entered weight without source markers', () => {
    expect(getWeightEntryProvenance({ value: 88.5 }).kind).toBe('user_entered')
    expect(isHomeCurrentWeightEntry({ value: 88.5 })).toBe(true)
    expect(resolveHomeWeightKg({
      weights: [{ date: '2026-08-21', value: 88.5 }],
    })).toBe(88.5)
  })

  it('accepts derived only as Importerad real weight (same as main weight graph)', () => {
    const imported = { date: '2026-08-20', source: 'Importerad', value: 87.2 }
    expect(getWeightEntryProvenance(imported).kind).toBe('derived')
    expect(isHomeCurrentWeightEntry(imported)).toBe(true)
    expect(resolveHomeWeightKg({ weights: [imported] })).toBe(87.2)
  })

  it('excludes ai_estimated and Body Scan estimated weight', () => {
    const bodyScan = {
      date: '2026-08-22',
      source: 'Body Scan',
      estimatedWeight: { minKg: 90, maxKg: 92 },
      value: 91,
    }
    const ai = { date: '2026-08-22', provenance: 'ai_estimated', value: 91 }
    expect(getWeightEntryProvenance(bodyScan).kind).toBe('ai_estimated')
    expect(getWeightEntryProvenance(ai).kind).toBe('ai_estimated')
    expect(isHomeCurrentWeightEntry(bodyScan)).toBe(false)
    expect(isHomeCurrentWeightEntry(ai)).toBe(false)
    expect(resolveHomeWeightKg({ currentWeight: 91, weights: [bodyScan, ai] })).toBe(null)
    expect(formatHomeWeightLabel(null)).toBe('Ingen vikt')
  })

  it('never treats estimate-marked entries as home current weight even with import wording', () => {
    const fakeDerivedEstimate = {
      date: '2026-08-22',
      source: 'Importerad AI-estimat',
      value: 90,
      isEstimated: true,
    }
    expect(getWeightEntryProvenance(fakeDerivedEstimate).kind).toBe('ai_estimated')
    expect(isHomeCurrentWeightEntry(fakeDerivedEstimate)).toBe(false)
    expect(resolveHomeWeightKg({ weights: [fakeDerivedEstimate] })).toBe(null)
  })

  it('uses latest measured/user_entered/imported in mixed history', () => {
    expect(resolveHomeWeightKg({
      currentWeight: 99,
      weights: [
        { date: '2026-08-18', source: 'Body Scan', estimatedWeight: { minKg: 90, maxKg: 92 }, value: 91 },
        { date: '2026-08-19', source: 'Importerad', value: 88 },
        { date: '2026-08-20', source: 'Manuell', value: 87.5 },
        { date: '2026-08-21', provenance: 'ai_estimated', value: 92 },
      ],
    })).toBe(87.5)
  })

  it('uses missing-weight empty state instead of 0 kg', () => {
    expect(resolveHomeWeightKg({ currentWeight: 0, weights: [] })).toBe(null)
    expect(resolveHomeWeightKg({ currentWeight: undefined, weights: [] })).toBe(null)
    expect(formatHomeWeightLabel(null)).toBe('Ingen vikt')
    expect(formatHomeWeightLabel(0)).toBe('Ingen vikt')
    expect(formatHomeWeightLabel(89)).toBe('89,0 kg')
  })
})

describe('homeTodayStats steps', () => {
  it('does not invent steps when no real source exists', () => {
    const missing = resolveHomeSteps({ checkIn: {} })
    expect(missing.connected).toBe(false)
    expect(formatHomeStepsLabel(missing, String)).toBe('Inte anslutet')
  })

  it('uses logged check-in steps when present', () => {
    const steps = resolveHomeSteps({ checkIn: { steps: 6842 } })
    expect(steps).toMatchObject({ connected: true, source: 'check-in', value: 6842 })
  })
})

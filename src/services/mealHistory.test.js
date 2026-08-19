import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./userDataRepository.js', () => ({
  getMealHistory: vi.fn(() => []),
  saveMealHistory: vi.fn(),
}))

import {
  exportMealHistory,
  getMealWeekSummary,
  normalizeMealEntry,
} from './mealHistory.js'
import { getMealHistory } from './userDataRepository.js'

describe('mealHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps old entries compatible while adding schema metadata', () => {
    const entry = normalizeMealEntry({
      analysis: {
        proteinStatus: 'Medel',
        summary: 'Lunch med kyckling.',
        vegetableStatus: 'Bra',
      },
      createdAt: '2026-07-31T12:00:00.000Z',
      image: 'data:image/png;base64,abc',
    })

    expect(entry.schemaVersion).toBe(2)
    expect(entry.image).toBe('')
    expect(entry.analysis.summary).toBe('Lunch med kyckling.')
  })

  it('exports meal history without base64 previews', () => {
    getMealHistory.mockReturnValueOnce([
      normalizeMealEntry({
        analysis: { summary: 'Fotoanalys', proteinStatus: 'Högt', vegetableStatus: 'Bra' },
        createdAt: '2026-07-31T12:00:00.000Z',
        image: 'data:image/png;base64,abc',
      }),
    ])

    const exported = exportMealHistory()

    expect(exported.version).toBe(2)
    expect(JSON.stringify(exported)).not.toMatch(/data:image|base64/)
  })

  it('summarizes trends from legacy and V2 meal entries', () => {
    const summary = getMealWeekSummary([
      normalizeMealEntry({
        analysis: { improvementSuggestion: 'Lägg till mer protein.', mealType: 'Lunch', proteinStatus: 'Högt', vegetableStatus: 'Bra' },
        createdAt: new Date().toISOString(),
      }),
    ])

    expect(summary.analysisCount).toBe(1)
    expect(summary.commonMealType).toBe('Lunch')
    expect(summary.proteinTrend).toContain('Protein')
  })
})

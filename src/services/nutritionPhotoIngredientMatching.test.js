import { describe, expect, it } from 'vitest'

import {
  applyPhotoIngredientDatabaseSuggestion,
  buildPhotoIngredientMatchSummary,
  matchPhotoIngredientToDatabase,
  normalizePhotoIngredientName,
} from './nutritionPhotoIngredientMatching.js'

describe('nutritionPhotoIngredientMatching', () => {
  it('normalizes Swedish ingredient names deterministically', () => {
    expect(normalizePhotoIngredientName('  Kycklingfilé med ris! ')).toBe('kycklingfile ris')
  })

  it('finds exact matches from the existing nutrition database', () => {
    const match = matchPhotoIngredientToDatabase({ name: 'pizza' })

    expect(match.status).toBe('exactMatch')
    expect(match.matchedFood.name).toBe('Pizza')
  })

  it('finds normalized matches without fuzzy AI merging', () => {
    const match = matchPhotoIngredientToDatabase({ name: 'kycklingbrost' })

    expect(['exactMatch', 'normalizedMatch']).toContain(match.status)
    expect(match.suggestions[0].source).toBe('nutritionDatabase')
  })

  it('returns multiple matches when the safe text match is ambiguous', () => {
    const match = matchPhotoIngredientToDatabase({ name: 'cola' })

    expect(['exactMatch', 'multipleMatches']).toContain(match.status)
    expect(match.suggestions.length).toBeGreaterThan(0)
  })

  it('returns noMatch for unknown ingredients', () => {
    const match = matchPhotoIngredientToDatabase({ name: 'hemlig gryta' })

    expect(match.status).toBe('noMatch')
    expect(match.suggestions).toHaveLength(0)
  })

  it('summarizes match statuses for review UI', () => {
    const summary = buildPhotoIngredientMatchSummary([
      { id: '1', name: 'pizza' },
      { id: '2', name: 'okänd rätt' },
    ])

    expect(summary.matches).toHaveLength(2)
    expect(summary.counts.exactMatch + summary.counts.normalizedMatch).toBe(1)
    expect(summary.counts.noMatch).toBe(1)
  })

  it('applies database suggestion only when the user has not edited the value', () => {
    const match = matchPhotoIngredientToDatabase({ name: 'pizza' })
    const applied = applyPhotoIngredientDatabaseSuggestion({ estimatedAmount: 100, id: '1', name: 'pizza' }, match.matchedFood)
    const preserved = applyPhotoIngredientDatabaseSuggestion({ estimatedAmount: 100, id: '1', name: 'Min pizza', userEdited: true }, match.matchedFood)

    expect(applied.dataSource).toBe('nutritionDatabase')
    expect(applied.calories).toBeGreaterThan(0)
    expect(preserved.name).toBe('Min pizza')
    expect(preserved.dataSource).toBeUndefined()
  })
})

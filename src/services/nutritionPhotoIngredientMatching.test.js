import { describe, expect, it } from 'vitest'

import {
  applyPhotoIngredientDatabaseSuggestion,
  buildPhotoIngredientMatchStatusCounts,
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

  it('does not auto-match fried chicken to plain chicken', () => {
    const match = matchPhotoIngredientToDatabase({ name: 'Friterad kyckling' })

    expect(match.status).toBe('noMatch')
    expect(match.matchedFood).toBeNull()
  })

  it('matches pommes aliases conservatively', () => {
    const match = matchPhotoIngredientToDatabase({ name: 'french fries' })

    expect(['exactMatch', 'normalizedMatch']).toContain(match.status)
    expect(match.matchedFood.name).toBe('Pommes')
  })

  it('does not auto-apply ambiguous sauce alternatives', () => {
    const mayo = matchPhotoIngredientToDatabase({
      alternatives: ['aioli', 'crème fraîche'],
      name: 'Majonnäs',
    })
    const hummus = matchPhotoIngredientToDatabase({
      alternatives: ['tahini', 'vitlökssås'],
      name: 'Hummus eller liknande sås',
    })

    expect(mayo.status).toBe('multipleMatches')
    expect(mayo.matchedFood).toBeNull()
    expect(hummus.status).not.toMatch(/exactMatch|normalizedMatch/)
    expect(hummus.matchedFood).toBeNull()
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

  it('counts every ingredient in an explainable database status bucket', () => {
    const items = [
      { dataSource: 'aiEstimate', id: 'exact', name: 'pizza' },
      { dataSource: 'aiEstimate', id: 'normalized', name: 'kyckling file' },
      { dataSource: 'nutritionDatabase', id: 'manual', name: 'Egen vald mat' },
      { alternatives: ['aioli', 'crème fraîche'], dataSource: 'aiEstimate', id: 'choice', name: 'Majonnäs' },
      { dataSource: 'aiEstimate', id: 'ai', name: 'okänd rätt' },
    ]
    const summary = buildPhotoIngredientMatchSummary(items)
    const counts = buildPhotoIngredientMatchStatusCounts(items, summary.matches)

    expect(counts).toEqual({
      aiEstimate: 1,
      exactMatch: 1,
      manualDatabase: 1,
      needsSelection: 1,
      normalizedMatch: 1,
      total: 5,
    })
    expect(counts.exactMatch + counts.normalizedMatch + counts.manualDatabase + counts.needsSelection + counts.aiEstimate).toBe(items.length)
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

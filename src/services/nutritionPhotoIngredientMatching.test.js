import { describe, expect, it } from 'vitest'

import { normalizeNutritionPhotoAnalysis } from './nutritionPhotoAnalysis.js'
import {
  applyPhotoIngredientDatabaseSuggestion,
  applyPhotoIngredientPatch,
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

  describe('gram corrections', () => {
    const chicken = {
      calories: 211.4,
      carbohydrates: 0,
      dataSource: 'databaseDerived',
      estimatedAmount: 140,
      fat: 4.3,
      id: 'a',
      name: 'Kycklingfilé',
      per100: { calories: 151, carbs: 0, fat: 3.1, protein: 30.5 },
      protein: 42.7,
      unit: 'g',
    }

    it('recalculates macros from the per-100 g value when the user corrects grams', () => {
      const corrected = applyPhotoIngredientPatch(chicken, { estimatedAmount: 200, userEdited: true })
      expect(corrected).toMatchObject({ calories: 302, carbohydrates: 0, dataSource: 'databaseDerived', estimatedAmount: 200, fat: 6.2, protein: 61, userEdited: true })
    })

    it('never overwrites macros the user typed in', () => {
      const typed = applyPhotoIngredientPatch(chicken, { calories: 250, userEdited: true })
      expect(typed).toMatchObject({ calories: 250, dataSource: 'manual', macrosEdited: true })
      expect(applyPhotoIngredientPatch(typed, { estimatedAmount: 300 }).calories).toBe(250)
    })

    it('drops the per-100 g value when the food is renamed or the unit is not grams', () => {
      expect(applyPhotoIngredientPatch(chicken, { name: 'Fisk' })).toMatchObject({ dataSource: 'manual', per100: null, sourceFood: null })
      const pieces = applyPhotoIngredientPatch(chicken, { unit: 'st' })
      expect(applyPhotoIngredientPatch(pieces, { estimatedAmount: 2 }).calories).toBe(211.4)
    })

    it('keeps per-100 g values from a chosen database suggestion for later corrections', () => {
      const applied = applyPhotoIngredientDatabaseSuggestion({ estimatedAmount: 100, name: 'Ris' }, {
        id: 'livsmedelsverket:8', name: 'Ris vitt kokt', nutritionPer100g: { calories: 132, carbs: 28.6, fat: 0.4, protein: 2.6 }, source: 'livsmedelsverket',
      })
      expect(applyPhotoIngredientPatch(applied, { estimatedAmount: 250 })).toMatchObject({ calories: 330, carbohydrates: 71.5, dataSource: 'nutritionDatabase' })
    })

    it('keeps per-100 g values and the source food through client normalization', () => {
      const analysis = normalizeNutritionPhotoAnalysis({
        detectedItems: [{ ...chicken, sourceFood: { id: 'livsmedelsverket:2', name: 'Kyckling bröstfilé stekt', source: 'livsmedelsverket' } }],
      })
      expect(analysis.detectedItems[0]).toMatchObject({
        per100: { calories: 151, carbs: 0, fat: 3.1, protein: 30.5 },
        sourceFood: { id: 'livsmedelsverket:2' },
      })
    })
  })
})

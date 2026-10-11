import { describe, expect, it } from 'vitest'

import {
  buildFoodBankQuery,
  foodBankSearchPrefixes,
  normalizeFoodBankName,
  selectFoodBankMatch,
  tokensMatch,
} from './nutritionFoodBankMatcher.js'

// Representativa rader i Livsmedelsverkets namnstil. Värdena är testdata,
// inte kopior av den riktiga databasen.
function row(id, name, kcal, protein, carbs, fat) {
  return {
    calories_per_100g: kcal,
    carbs_per_100g: carbs,
    fat_per_100g: fat,
    name,
    normalized_name: normalizeFoodBankName(name),
    protein_per_100g: protein,
    source: 'livsmedelsverket',
    source_food_id: String(id),
    source_version: 'test',
  }
}

const bank = [
  row(1, 'Kyckling bröstfilé u. skinn rå', 106, 23, 0, 1.2),
  row(2, 'Kyckling bröstfilé u. skinn stekt', 151, 30.5, 0, 3.1),
  row(3, 'Kyckling lårfilé stekt', 190, 26, 0, 9.5),
  row(4, 'Kycklingnuggets panerade ugnsstekta', 250, 15, 17, 13),
  row(5, 'Lax odlad rå', 220, 20, 0, 15.5),
  row(6, 'Lax odlad ugnsstekt', 240, 23, 0, 16),
  row(7, 'Torsk rå', 75, 17, 0, 0.6),
  row(8, 'Ris vitt långkornigt kokt', 132, 2.6, 28.6, 0.4),
  row(9, 'Ris vitt långkornigt okokt', 355, 7.5, 78, 0.8),
  row(10, 'Broccoli kokt', 30, 2.8, 2.6, 0.4),
  row(11, 'Broccoli rå', 34, 3.6, 2.3, 0.4),
  row(12, 'Potatis kokt', 77, 2, 16, 0.1),
  row(13, 'Pommes frites ugnsstekta', 210, 3.3, 30, 8),
  row(14, 'Pommes frites friterade', 290, 3.4, 35, 15),
  row(15, 'Gräddsås', 140, 2, 6, 12),
  row(16, 'Bearnaisesås', 520, 1.5, 1.5, 56),
]

const chicken = { bankName: 'Kyckling bröstfilé stekt', confidence: 'high', cookingMethods: ['fried'], name: 'Kycklingfilé' }

describe('food bank matching', () => {
  it('normalizes like the importer and handles Swedish compounds', () => {
    expect(normalizeFoodBankName('Kyckling bröstfilé u. skinn, stekt')).toBe('kyckling brostfile u skinn stekt')
    expect(tokensMatch('kycklingbrost', 'kyckling')).toBe(true)
    expect(tokensMatch('ris', 'riskaka')).toBe(false)
    expect(buildFoodBankQuery(chicken)).toMatchObject({ cooking: ['fried'], head: 'kyckling' })
    // Tillagningsord blir aldrig huvudord: "Kokt ris" söker på ris.
    expect(foodBankSearchPrefixes({ bankName: 'Ris vitt kokt', name: 'Kokt ris' })).toEqual(['ris'])
  })

  it('matches fried chicken breast to the fried, not the raw, database row', () => {
    const result = selectFoodBankMatch(chicken, bank)
    expect(result.status).toBe('matched')
    expect(result.food).toMatchObject({ id: 'livsmedelsverket:2', name: 'Kyckling bröstfilé u. skinn stekt', per100: { calories: 151 } })
  })

  it('never matches chicken to fish, or fish to chicken', () => {
    const chickenResult = selectFoodBankMatch(chicken, bank)
    expect(chickenResult.food.name).not.toMatch(/lax|torsk/i)
    expect(chickenResult.suggestions.every((food) => food.name.startsWith('Kyckling'))).toBe(true)

    const salmon = selectFoodBankMatch({ bankName: 'Lax ugnsstekt', confidence: 'high', cookingMethods: ['baked'], name: 'Lax' }, bank)
    expect(salmon.food).toMatchObject({ name: 'Lax odlad ugnsstekt' })
  })

  it('uses the cooked state: boiled rice, not dry rice; boiled broccoli, not raw', () => {
    expect(selectFoodBankMatch({ bankName: 'Ris vitt kokt', confidence: 'high', cookingMethods: ['boiled'], name: 'Kokt ris' }, bank).food.name)
      .toBe('Ris vitt långkornigt kokt')
    expect(selectFoodBankMatch({ bankName: 'Broccoli kokt', confidence: 'high', name: 'Broccoli' }, bank).food.name)
      .toBe('Broccoli kokt')
    // Utan synlig tillagning väljs inte rå kyckling för mat på tallriken.
    const unknownCooking = selectFoodBankMatch({ bankName: 'Kyckling bröstfilé', confidence: 'high', name: 'Kyckling' }, bank)
    expect(unknownCooking.food?.name || '').not.toMatch(/rå/)
  })

  it('keeps fries cooking methods apart and rejects contradicting cooking', () => {
    expect(selectFoodBankMatch({ bankName: 'Pommes frites ugnsstekta', confidence: 'high', cookingMethods: ['baked'], name: 'Pommes' }, bank).food.name)
      .toBe('Pommes frites ugnsstekta')
    expect(selectFoodBankMatch({ bankName: 'Pommes frites friterade', confidence: 'high', cookingMethods: ['fried'], name: 'Pommes' }, bank).food.name)
      .toBe('Pommes frites friterade')
    const raw = selectFoodBankMatch({ bankName: 'Torsk stekt', confidence: 'high', cookingMethods: ['fried'], name: 'Torsk' }, bank)
    expect(raw).toMatchObject({ food: null, reason: 'cooking_conflict', status: 'needsReview' })
  })

  it('does not auto-match an uncertain identity, but still offers suggestions', () => {
    const result = selectFoodBankMatch({ ...chicken, confidence: 'low' }, bank)
    expect(result).toMatchObject({ food: null, reason: 'low_identity_confidence', status: 'needsReview' })
    expect(result.suggestions[0].name).toBe('Kyckling bröstfilé u. skinn stekt')
  })

  it('refuses an implausible energy density instead of trusting a weak name match', () => {
    // Bilden visar något mycket energitätare (600 kcal/100 g) än stekt filé (151).
    const result = selectFoodBankMatch({ ...chicken, aiPer100: { calories: 600 } }, bank)
    expect(result).toMatchObject({ food: null, reason: 'implausible_energy', status: 'needsReview' })
  })

  it('treats ties between rows with different energy as ambiguous', () => {
    const ambiguous = selectFoodBankMatch({ bankName: 'Kyckling stekt', confidence: 'high', cookingMethods: ['fried'], name: 'Kyckling' }, bank)
    expect(ambiguous.status).toBe('needsReview')
    expect(ambiguous.reason).toMatch(/ambiguous|weak_match/)
  })

  it('returns noMatch for foods missing in the bank, so the labelled AI fallback is used', () => {
    expect(selectFoodBankMatch({ bankName: 'Halloumi grillad', confidence: 'high', cookingMethods: ['grilled'], name: 'Halloumi' }, bank))
      .toMatchObject({ food: null, status: 'noMatch' })
  })

  it('matches a sauce by name only when it is certain', () => {
    expect(selectFoodBankMatch({ bankName: 'Bearnaisesås', confidence: 'high', name: 'Bearnaisesås' }, bank).food.name).toBe('Bearnaisesås')
    expect(selectFoodBankMatch({ bankName: 'Gräddsås', confidence: 'medium', name: 'Krämig sås' }, bank).food.name).toBe('Gräddsås')
  })
})

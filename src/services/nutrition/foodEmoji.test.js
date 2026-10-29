import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { matchPhotoIngredientToDatabase } from '../nutritionPhotoIngredientMatching.js'
import { describe, expect, it } from 'vitest'
import { getFoodEmoji } from './foodEmoji.js'
import { getNutritionFoodById, nutritionFoods, nutritionReferenceFoods, getNutritionAliases } from './nutritionDatabase.js'

describe('food emojis', () => {
  it.each([
    ['Pizza med champinjoner och lök', '🍕'],
    ['Persilja', '🌿'],
    ['Chorizo', '🍽️'],
    ['Rå morot', '🥕'],
    ['Kokt ris', '🍚'],
    ['Jordgubbar', '🍓'],
    ['Päron', '🍐'],
    ['Kiwi grön', '🥝'],
    ['Cashewnötter rostade u. salt', '🥜'],
    ['Vattenmelon', '🍉'],
    ['Hamburgare med ost', '🍔'],
    [null, '🍽️'],
    ['Okänt livsmedel', '🍽️'],
  ])('maps %s without substring collisions', (name, emoji) => {
    expect(getFoodEmoji(name)).toBe(emoji)
  })
})

describe('extended local food bank', () => {
  it('loads in native Node without a bundler, as the server does', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', "import('./nutritionDatabase.js').then(bank => console.log(bank.nutritionReferenceFoods.length))"], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8' })
    expect(output.trim()).toBe('2606')
  })

  it('has unique IDs and finite serving nutrition', () => {
    expect(new Set(nutritionFoods.map(food => food.id)).size).toBe(nutritionFoods.length)
    for (const food of nutritionFoods) {
      expect(food.emoji).toBeTruthy()
      for (const key of ['calories', 'protein', 'carbs', 'fat']) {
        expect(Number.isFinite(food[key])).toBe(true)
        expect(food[key]).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('includes every official entry exactly once in the local bank', () => {
    expect(nutritionReferenceFoods).toHaveLength(2606)
    const official = nutritionFoods.filter(food => food.source === 'livsmedelsverket')
    expect(official).toHaveLength(2606)
    expect(new Set(official.map(food => food.sourceFoodId)).size).toBe(2606)
    expect(new Set(official.map(food => food.sourceFoodId))).toEqual(new Set(nutritionReferenceFoods.map(food => food.sourceFoodId)))
    expect(getNutritionAliases().some(entry => entry.food.sourceFoodId === '830')).toBe(true)
  })

  it('matches a full-bank food and keeps ambiguous names unselected', () => {
    const frozenPineapple = matchPhotoIngredientToDatabase({ name: 'Ananas frysvara' })
    expect(frozenPineapple.status).toBe('exactMatch')
    expect(frozenPineapple.matchedFood.id).toBe('livsmedelsverket:4225')
    expect(frozenPineapple.matchedFood.nutritionPer100g.calories).toBe(53)
    const orange = matchPhotoIngredientToDatabase({ name: 'Apelsin' })
    expect(orange.status).toBe('multipleMatches')
    expect(orange.matchedFood).toBeNull()
  })

  it('preserves source IDs and cooked preparation for added grains', () => {
    const bulgur = getNutritionFoodById('bulgur-kokt')
    expect(bulgur.sourceFoodId).toBe('830')
    expect(bulgur.source).toBe('livsmedelsverket')
    expect(bulgur.name).toBe('Bulgur kokt')
    expect(bulgur.calories).toBe(129)
    expect(bulgur.aliases).not.toContain('bulgur')
    expect(getNutritionFoodById('couscous-tillagad').aliases).not.toContain('couscous')
  })
})

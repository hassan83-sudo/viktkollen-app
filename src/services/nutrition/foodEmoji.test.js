import { describe, expect, it } from 'vitest'
import { getFoodEmoji } from './foodEmoji.js'
import { getNutritionFoodById, nutritionFoods } from './nutritionDatabase.js'

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
  it('has unique IDs and aliases and finite serving nutrition', () => {
    expect(new Set(nutritionFoods.map(food => food.id)).size).toBe(nutritionFoods.length)
    const aliases = nutritionFoods.flatMap(food => food.aliases.map(alias => alias.toLowerCase()))
    expect(new Set(aliases).size).toBe(aliases.length)
    for (const food of nutritionFoods) {
      expect(food.emoji).toBeTruthy()
      for (const key of ['calories', 'protein', 'carbs', 'fat']) {
        expect(Number.isFinite(food[key])).toBe(true)
        expect(food[key]).toBeGreaterThanOrEqual(0)
      }
    }
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

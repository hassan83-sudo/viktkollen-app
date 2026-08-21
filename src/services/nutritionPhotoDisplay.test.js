import { describe, expect, it } from 'vitest'

import {
  getNutritionPhotoDisplayText,
  getNutritionPhotoFoodDisplayName,
  getNutritionPhotoPortionDisplayName,
} from './nutritionPhotoDisplay.js'

describe('nutritionPhotoDisplay', () => {
  it('maps known English food names to Swedish display names', () => {
    expect(getNutritionPhotoFoodDisplayName('fried chicken')).toBe('Friterad kyckling')
    expect(getNutritionPhotoFoodDisplayName('french fries')).toBe('Pommes frites')
    expect(getNutritionPhotoFoodDisplayName('fries')).toBe('Pommes frites')
    expect(getNutritionPhotoFoodDisplayName('pickled vegetables')).toBe('Inlagda grönsaker')
    expect(getNutritionPhotoFoodDisplayName('picklade grönsaker')).toBe('Inlagda grönsaker')
    expect(getNutritionPhotoFoodDisplayName('lemon wedge')).toBe('Citronklyfta')
  })

  it('keeps existing Swedish names unchanged', () => {
    expect(getNutritionPhotoFoodDisplayName('Friterad kyckling')).toBe('Friterad kyckling')
    expect(getNutritionPhotoFoodDisplayName('Gurka och tomat')).toBe('Gurka och tomat')
  })

  it('maps known English portion phrases to Swedish display names', () => {
    expect(getNutritionPhotoPortionDisplayName('medium lunch portion')).toBe('Normal lunchportion')
    expect(getNutritionPhotoPortionDisplayName('small portion')).toBe('Liten portion')
    expect(getNutritionPhotoPortionDisplayName('medium portion')).toBe('Normal portion')
    expect(getNutritionPhotoPortionDisplayName('large portion')).toBe('Stor portion')
  })

  it('maps known food phrases inside safe display summaries without changing raw values', () => {
    expect(getNutritionPhotoDisplayText('Friterad kyckling med picklade grönsaker.')).toBe('Friterad kyckling med Inlagda grönsaker.')
    expect(getNutritionPhotoDisplayText('fried chicken, fries and lemon wedge')).toBe('Friterad kyckling, Pommes frites and Citronklyfta')
  })
})

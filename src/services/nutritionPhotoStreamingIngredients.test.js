import { describe, expect, it } from 'vitest'
import {
  extractStreamingIngredientNames,
  illustrationForIngredientName,
  toEarlyIngredientViews,
} from './nutritionPhotoStreamingIngredients.js'

describe('nutritionPhotoStreamingIngredients', () => {
  it('extracts only completed item names from a partial items stream', () => {
    const partial = '{"dishShape":"unknown","items":[{"name":"Kyckling","bank":"Kyckling bröstfilé stekt","cat":"protein"},{"name":"Ri'
    expect(extractStreamingIngredientNames(partial)).toEqual(['Kyckling'])
    expect(extractStreamingIngredientNames('{"dishShape":"unknown","note":"väntar"}')).toEqual([])
  })

  it('never invents ingredients and keeps stable order without duplicates', () => {
    const first = extractStreamingIngredientNames(
      '{"items":[{"name":"Ris"},{"name":"Broccoli"}]}',
    )
    const second = extractStreamingIngredientNames(
      '{"items":[{"name":"Ris"},{"name":"Broccoli"},{"name":"Sås"}]}',
      first,
    )
    expect(second).toEqual(['Ris', 'Broccoli', 'Sås'])
    expect(toEarlyIngredientViews(['', 'Okänd komponent', 'Ris', 'Ris'])).toEqual([
      { illustration: expect.any(String), name: 'Ris' },
    ])
  })

  it('maps known foods to illustrations without inventing names', () => {
    expect(illustrationForIngredientName('Kyckling')).toBeTruthy()
    expect(illustrationForIngredientName('')).toBe('🍽️')
  })
})

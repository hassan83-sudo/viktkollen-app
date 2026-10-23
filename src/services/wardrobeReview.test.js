import { describe, expect, it } from 'vitest'
import { validateWardrobeReview } from './wardrobeReview.js'
const accepted = { verdict: 'garment', reason: null, personPresent: false, singleItem: true, name: 'Blå skjorta', category: 'Skjorta', colorName: 'Blå', colorHex: '#446FA4' }
describe('wardrobe AI review', () => {
  it('accepts a complete explicit single garment verdict', () => {
    expect(validateWardrobeReview(accepted)).toEqual({ ...accepted, colorHex: '#446fa4' })
  })
  it.each([null, {}, { items: ['Tröja'] }, { ...accepted, personPresent: true }, { ...accepted, personPresent: undefined }, { ...accepted, singleItem: false }, { ...accepted, category: 'Människa' }, { ...accepted, colorHex: 'blue' }, { ...accepted, reason: 'person' }, { ...accepted, name: '<script>' }])('fails closed for incomplete, contradictory and malformed results: %j', (input) => {
    expect(validateWardrobeReview(input)).toEqual({ verdict: 'reject', reason: 'uncertain' })
  })
  it.each(['person', 'multiple', 'not_clothing', 'uncertain'])('preserves rejection %s without descriptive fields', (reason) => {
    expect(validateWardrobeReview({ ...accepted, verdict: 'reject', reason })).toEqual({ verdict: 'reject', reason })
  })
})

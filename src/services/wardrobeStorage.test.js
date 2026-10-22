// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readWardrobe, updateWardrobe, wardrobeStorageKey, removeWardrobeGarment, markWardrobeWorn, isWardrobePhoto } from './wardrobeStorage.js'
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('wardrobe compatibility and privacy', () => {
  it('preserves legacy clothes, history and additional metadata when saving new outfit fields', () => {
    localStorage.setItem(wardrobeStorageKey, JSON.stringify({ garments: [{ id: 'a', name: 'Tröja' }], worn: [{ date: '2026-01-01', garmentIds: ['a'] }], extra: 'preserved' }))
    updateWardrobe((s) => ({ ...s, outfits: [{ id: 'o', name: 'Min outfit', garmentIds: ['a'] }] }))
    expect(readWardrobe()).toMatchObject({ extra: 'preserved', garments: [{ id: 'a' }], worn: [{ garmentIds: ['a'] }], outfits: [{ id: 'o' }] })
    removeWardrobeGarment('a')
    expect(readWardrobe()).toMatchObject({ garments: [], worn: [{ garmentIds: [] }], outfits: [{ garmentIds: [] }] })
  })
  it('rejects remote and SVG pictures and keeps used clothes separate from outfit selection', () => {
    expect(isWardrobePhoto('https://example.com/private.jpg')).toBe(false)
    expect(isWardrobePhoto('data:image/svg+xml;base64,AAAA')).toBe(false)
    updateWardrobe((s) => ({ ...s, garments: [{ id: 'a', name: 'Tröja' }], selectedGarmentIds: ['a'] }))
    expect(readWardrobe().worn).toEqual([])
    markWardrobeWorn(['a', 'unknown'])
    expect(readWardrobe().worn[0].garmentIds).toEqual(['a'])
  })
  it('does not replace stored data when quota or capacity validation fails', () => {
    updateWardrobe((s) => ({ ...s, garments: [{ id: 'a', name: 'Tröja' }] }))
    const original = localStorage.getItem(wardrobeStorageKey)
    expect(() => updateWardrobe((s) => ({ ...s, extra: 'x'.repeat(2500001) }))).toThrow()
    expect(localStorage.getItem(wardrobeStorageKey)).toBe(original)
  })
  it('ignores malformed wear entries and duplicate selection without breaking deletion', () => {
    localStorage.setItem(wardrobeStorageKey, JSON.stringify({ garments: [{ id: 'a', name: 'Tröja' }], worn: [null, { date: '2026-10-22', garmentIds: 'a' }], selectedGarmentIds: ['a', 'a', null] }))
    expect(readWardrobe().selectedGarmentIds).toEqual(['a'])
    expect(readWardrobe().worn).toEqual([])
    removeWardrobeGarment('a')
    expect(readWardrobe().garments).toEqual([])
  })
})

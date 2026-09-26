import { describe, expect, it } from 'vitest'
import { nextTabForKey } from './useRovingTabs.js'

// A11Y-8Z1: key handling for the ARIA tabs pattern (Stället, Ekonomi).
describe('nextTabForKey', () => {
  const tabs = ['a', 'b', 'c']

  it('moves with the arrow keys and wraps', () => {
    expect(nextTabForKey(tabs, 'a', 'ArrowRight')).toBe('b')
    expect(nextTabForKey(tabs, 'c', 'ArrowRight')).toBe('a')
    expect(nextTabForKey(tabs, 'b', 'ArrowLeft')).toBe('a')
    expect(nextTabForKey(tabs, 'a', 'ArrowLeft')).toBe('c')
  })

  it('goes to the first and last tab with Home and End; other keys do nothing', () => {
    expect(nextTabForKey(tabs, 'b', 'Home')).toBe('a')
    expect(nextTabForKey(tabs, 'b', 'End')).toBe('c')
    expect(nextTabForKey(tabs, 'b', 'Tab')).toBeNull()
    expect(nextTabForKey(tabs, 'x', 'ArrowRight')).toBeNull()
  })
})

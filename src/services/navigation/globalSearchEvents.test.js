import { describe, expect, it } from 'vitest'
import { isEditableSearchShortcutTarget } from './globalSearchEvents.js'

describe('globalSearchEvents', () => {
  it('treats text fields as protected shortcut targets', () => {
    expect(isEditableSearchShortcutTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableSearchShortcutTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isEditableSearchShortcutTarget({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isEditableSearchShortcutTarget({ tagName: 'INPUT', type: 'search' })).toBe(true)
    expect(isEditableSearchShortcutTarget({ isContentEditable: true, tagName: 'DIV' })).toBe(true)
  })

  it('allows shortcuts from buttons and non-text controls', () => {
    expect(isEditableSearchShortcutTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableSearchShortcutTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isEditableSearchShortcutTarget(null)).toBe(false)
  })
})

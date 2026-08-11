import { describe, expect, it } from 'vitest'
import {
  getGlobalSearchKeyboardAction,
  getNextSearchSelection,
  isGlobalSearchOpenShortcut,
  normalizeSearchText,
  searchGlobalNavigation,
} from './globalSearchIndex.js'

function titles(query) {
  return searchGlobalNavigation(query).map((item) => item.title)
}

describe('globalSearchIndex', () => {
  it('finds AI Kroppsanalys with body scan aliases', () => {
    expect(titles('bodyscan')).toContain('AI Kroppsanalys')
    expect(titles('body scan')).toContain('AI Kroppsanalys')
    expect(titles('body-scan')).toContain('AI Kroppsanalys')
    expect(titles('kropp')).toContain('AI Kroppsanalys')
  })

  it('finds key release features by Swedish and English aliases', () => {
    expect(titles('backup')).toContain('Cloud Backup')
    expect(titles('matplan')).toContain('Meal Planner')
    expect(titles('röst')).toContain('AI Coach')
    expect(titles('RÖST')).toContain('AI Coach')
  })

  it('normalizes case, diacritics, whitespace and hyphens', () => {
    expect(normalizeSearchText('  MÅLTIDS-plan  ')).toBe('maltids plan')
    expect(titles('SÄKERHETSKOPIA')).toContain('Cloud Backup')
  })

  it('returns no results for empty or unknown queries', () => {
    expect(searchGlobalNavigation('')).toEqual([])
    expect(searchGlobalNavigation('zzzzzz')).toEqual([])
  })

  it('supports keyboard selection wrapping', () => {
    expect(getNextSearchSelection(0, 3, 1)).toBe(1)
    expect(getNextSearchSelection(0, 3, -1)).toBe(2)
    expect(getNextSearchSelection(-1, 0, 1)).toBe(-1)
  })

  it('maps keyboard events to search actions', () => {
    expect(getGlobalSearchKeyboardAction({ key: 'Escape' }, 0, 3)).toEqual({ type: 'close' })
    expect(getGlobalSearchKeyboardAction({ key: 'Enter' }, 1, 3)).toEqual({ index: 1, type: 'navigate' })
    expect(getGlobalSearchKeyboardAction({ key: 'ArrowDown' }, 0, 3)).toEqual({ index: 1, type: 'select' })
    expect(getGlobalSearchKeyboardAction({ key: 'ArrowUp' }, 0, 3)).toEqual({ index: 2, type: 'select' })
  })

  it('detects Ctrl+K and Cmd+K shortcuts', () => {
    expect(isGlobalSearchOpenShortcut({ ctrlKey: true, key: 'k' })).toBe(true)
    expect(isGlobalSearchOpenShortcut({ key: 'k', metaKey: true })).toBe(true)
    expect(isGlobalSearchOpenShortcut({ key: 'k' })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  getDefaultGlobalSearchGroups,
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
    expect(titles('bodyscan')).toContain('Kroppsscanning')
    expect(titles('body scan')).toContain('Kroppsscanning')
    expect(titles('body-scan')).toContain('Kroppsscanning')
    expect(titles('kropp')).toContain('Kroppsscanning')
  })

  it('finds key release features by Swedish and English aliases', () => {
    expect(titles('backup')).toContain('Cloud Backup')
    expect(titles('matplan')).toContain('Meal Planner')
    expect(titles('röst')).toContain('AI Coach')
    expect(titles('RÖST')).toContain('AI Coach')
    expect(titles('må bra')).toContain('Må bra')
    expect(titles('trygghetsplan')).toContain('Må bra')
    expect(titles('ekonomi')).toContain('Ekonomi')
    expect(titles('budget')).toContain('Ekonomi')
    expect(titles('teckenspråk')).toContain('Teckenspråk')
    expect(titles('djur')).toContain('Djurvärlden')
    expect(titles('graviditet')).toContain('Graviditet & första året')
  })

  it('routes new education search hits to More folder targets', () => {
    expect(searchGlobalNavigation('sts')[0]).toMatchObject({
      section: 'more',
      targetId: 'sign-language',
    })
    expect(searchGlobalNavigation('axolotl')[0]).toMatchObject({
      section: 'more',
      targetId: 'animal-world',
    })
    expect(searchGlobalNavigation('1177')[0]).toMatchObject({
      section: 'more',
      targetId: 'pregnancy-first-year',
    })
  })

  it('finds AI Progress Insights by trend and plateau aliases', () => {
    expect(titles('progress insights')).toContain('AI Progress Insights')
    expect(titles('framstegsinsikter')).toContain('AI Progress Insights')
    expect(titles('platå')).toContain('AI Progress Insights')
  })

  it('normalizes case, diacritics, whitespace and hyphens', () => {
    expect(normalizeSearchText('  MÅLTIDS-plan  ')).toBe('maltids plan')
    expect(titles('SÄKERHETSKOPIA')).toContain('Cloud Backup')
  })

  it('returns no results for empty or unknown queries', () => {
    expect(searchGlobalNavigation('')).toEqual([])
    expect(searchGlobalNavigation('zzzzzz')).toEqual([])
  })

  it('provides grouped default suggestions before typing', () => {
    const groups = getDefaultGlobalSearchGroups()
    const groupedTitles = groups.flatMap((group) => group.items.map((item) => item.title))

    expect(groups.map((group) => group.title)).toContain('Populärt')
    expect(groups.map((group) => group.title)).toContain('Snabbåtgärder')
    expect(groupedTitles).toContain('AI Coach')
    expect(groupedTitles).toContain('Logga vikt')
    expect(groupedTitles).toContain('Viktkollen Live')
  })

  it('matches typed app terms, synonyms and related words', () => {
    expect(titles('mat')).toEqual(expect.arrayContaining(['Lägg till måltid', 'Matscanning', 'Recept']))
    expect(titles('vikt')).toEqual(expect.arrayContaining(['Logga vikt', 'Health Prediction']))
    expect(titles('foto')).toEqual(expect.arrayContaining(['Progress Photos', 'Kroppsscanning', 'Matscanning']))
    expect(titles('scan')).toEqual(expect.arrayContaining(['Kroppsscanning', 'Matscanning']))
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

import { describe, expect, it } from 'vitest'
import { getFeatureFlags } from '../../features/featureRegistry.js'
import {
  getDefaultGlobalSearchGroups,
  getGlobalSearchKeyboardAction,
  getNextSearchSelection,
  getVisibleGlobalSearchItems,
  globalSearchItems,
  isGlobalSearchOpenShortcut,
  normalizeSearchText,
  resolveGlobalSearchDestination,
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

function item(id) {
  return globalSearchItems.find((entry) => entry.id === id)
}

describe('globalSearchIndex current destinations', () => {
  it('keeps unique ids and required destination fields', () => {
    const ids = globalSearchItems.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    globalSearchItems.forEach((entry) => {
      expect(entry.id).toBeTruthy()
      expect(entry.title).toBeTruthy()
      expect(entry.section).toBeTruthy()
      expect(entry.targetId).toBeTruthy()
      expect(Array.isArray(entry.keywords)).toBe(true)
    })
  })

  it('adds current primary sections and More folders', () => {
    expect(item('redo')).toMatchObject({ section: 'redo', targetId: 'app-section-redo' })
    expect(item('place')).toMatchObject({ section: 'place', targetId: 'app-section-place' })
    expect(item('journey')).toMatchObject({ section: 'journey', targetId: 'app-section-journey' })
    expect(item('activity')).toMatchObject({ section: 'more', targetId: 'aktivitet' })
    expect(item('senior-65-plus')).toMatchObject({ section: 'more', targetId: 'senior-65-plus' })
    expect(item('inkasso')).toMatchObject({ section: 'more', targetId: 'inkasso' })
    expect(item('kronofogden')).toMatchObject({ section: 'more', targetId: 'kronofogden' })
    expect(item('archive-history')).toMatchObject({ section: 'more', targetId: 'arkiv-historik' })
    expect(item('language-settings')).toMatchObject({ section: 'more', targetId: 'language-settings' })
    expect(item('smart-camera')).toMatchObject({ action: 'openSmartCamera', featureFlag: 'smartCamera' })
  })

  it('removes dead notification and reminder centers', () => {
    expect(item('notification-center')).toBeUndefined()
    expect(item('reminders')).toBeUndefined()
    expect(titles('notiser')).toContain('Notiser')
  })

  it('resolves search hits to current app destinations', () => {
    expect(resolveGlobalSearchDestination(item('home-dashboard'))).toMatchObject({
      sectionId: 'home',
      targetId: 'app-section-home',
    })
    expect(resolveGlobalSearchDestination(item('redo'))).toMatchObject({ sectionId: 'redo', targetId: 'app-section-redo' })
    expect(resolveGlobalSearchDestination(item('place'))).toMatchObject({ sectionId: 'place' })
    expect(resolveGlobalSearchDestination(item('journey'))).toMatchObject({ sectionId: 'journey' })
    expect(resolveGlobalSearchDestination(item('social'))).toMatchObject({ sectionId: 'social', blocked: false })
    expect(resolveGlobalSearchDestination(item('notices'))).toMatchObject({ sectionId: 'notices', targetId: 'app-section-notices' })
    expect(resolveGlobalSearchDestination(item('activity'))).toMatchObject({ sectionId: 'more', moreFolder: 'aktivitet' })
    expect(resolveGlobalSearchDestination(item('scanner'))).toMatchObject({
      sectionId: 'more',
      moreFolder: 'mat',
      nutritionIntent: { panel: 'scanner' },
      targetId: 'nutrition-scanner-v2',
    })
    expect(resolveGlobalSearchDestination(item('ai-coach'))).toMatchObject({ sectionId: 'more', moreFolder: 'ai-coach' })
    expect(resolveGlobalSearchDestination(item('wellbeing'))).toMatchObject({ sectionId: 'more', moreFolder: 'ma-bra' })
    expect(resolveGlobalSearchDestination(item('economy'))).toMatchObject({ sectionId: 'more', moreFolder: 'ekonomi' })
    expect(resolveGlobalSearchDestination(item('senior-65-plus'))).toMatchObject({ moreFolder: 'senior-65-plus' })
    expect(resolveGlobalSearchDestination(item('inkasso'))).toMatchObject({ moreFolder: 'inkasso' })
    expect(resolveGlobalSearchDestination(item('kronofogden'))).toMatchObject({ moreFolder: 'kronofogden' })
    expect(resolveGlobalSearchDestination(item('archive-history'))).toMatchObject({ moreFolder: 'arkiv-historik' })
    expect(resolveGlobalSearchDestination(item('language-settings'))).toMatchObject({
      moreFolder: 'installningar',
      targetId: 'language-settings',
    })
    expect(resolveGlobalSearchDestination(item('meals'))).toMatchObject({ moreFolder: 'mat', targetId: 'maltider' })
    expect(resolveGlobalSearchDestination(item('weight-progress'))).toMatchObject({ moreFolder: 'mal-framsteg', targetId: 'vikt' })
    expect(resolveGlobalSearchDestination(item('smart-camera'))).toMatchObject({
      homeIntent: { mode: 'forgotten' },
      sectionId: 'home',
    })
  })

  it('hides feature-gated results when flags are off', () => {
    const off = getFeatureFlags({ smartCamera: false, socialUi: false, reminderHubUi: false })
    const visibleIds = getVisibleGlobalSearchItems(off).map((entry) => entry.id)
    expect(visibleIds).not.toContain('smart-camera')
    expect(visibleIds).not.toContain('social')
    expect(visibleIds).not.toContain('notices')
    expect(resolveGlobalSearchDestination(item('social'), off)).toMatchObject({ blocked: true })
    expect(resolveGlobalSearchDestination(item('notices'), off)).toMatchObject({ blocked: true })
    expect(resolveGlobalSearchDestination(item('smart-camera'), off)).toMatchObject({ blocked: true })
  })
})

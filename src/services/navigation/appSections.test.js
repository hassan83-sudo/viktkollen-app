import { describe, expect, it } from 'vitest'
import {
  appSections,
  defaultAppSectionId,
  getAdjacentAppSection,
  getAppSection,
  getAppSectionIndex,
  getBottomNavActiveSectionId,
  isAppSectionId,
  isPrimaryAppSectionId,
  normalizeAppSectionId,
  secondaryAppSectionIds,
} from './appSections.js'

describe('appSections', () => {
  it('exposes Hem, Redo!, Plats, Notis, Stället and Mer in bottom nav order', () => {
    expect(appSections.map((section) => section.id)).toEqual([
      'home',
      'redo',
      'place',
      'notices',
      'social',
      'more',
    ])
    expect(appSections.find((section) => section.id === 'social')?.label).toBe('Stället')
    expect(defaultAppSectionId).toBe('home')
  })

  it('keeps More destinations routable as secondary sections', () => {
    expect(secondaryAppSectionIds).toEqual([
      'coach',
      'nutrition',
      'progress',
      'wellbeing',
      'economy',
      'sign-language',
      'animal-world',
      'pregnancy-first-year',
    ])
    expect(isAppSectionId('coach')).toBe(true)
    expect(isAppSectionId('nutrition')).toBe(true)
    expect(isAppSectionId('progress')).toBe(true)
    expect(isAppSectionId('wellbeing')).toBe(true)
    expect(isAppSectionId('economy')).toBe(true)
    expect(isAppSectionId('sign-language')).toBe(true)
    expect(isPrimaryAppSectionId('coach')).toBe(false)
    expect(isPrimaryAppSectionId('wellbeing')).toBe(false)
    expect(isPrimaryAppSectionId('economy')).toBe(false)
    expect(isPrimaryAppSectionId('pregnancy-first-year')).toBe(false)
    expect(isPrimaryAppSectionId('redo')).toBe(true)
  })

  it('maps secondary sections to Mer in bottom nav', () => {
    expect(getBottomNavActiveSectionId('progress')).toBe('more')
    expect(getBottomNavActiveSectionId('nutrition')).toBe('more')
    expect(getBottomNavActiveSectionId('coach')).toBe('more')
    expect(getBottomNavActiveSectionId('wellbeing')).toBe('more')
    expect(getBottomNavActiveSectionId('economy')).toBe('more')
    expect(getBottomNavActiveSectionId('sign-language')).toBe('more')
    expect(getBottomNavActiveSectionId('animal-world')).toBe('more')
    expect(getBottomNavActiveSectionId('pregnancy-first-year')).toBe('more')
    expect(getBottomNavActiveSectionId('place')).toBe('place')
  })

  it('validates and normalizes section ids', () => {
    expect(isAppSectionId('redo')).toBe(true)
    expect(isAppSectionId('place')).toBe(true)
    expect(isAppSectionId('unknown')).toBe(false)
    expect(normalizeAppSectionId('place')).toBe('place')
    expect(normalizeAppSectionId('unknown')).toBe('home')
  })

  it('returns section metadata and indexes', () => {
    expect(getAppSection('notices')).toMatchObject({
      id: 'notices',
      label: 'Notis',
    })
    expect(getAppSection('unknown').id).toBe('home')
    expect(getAppSectionIndex('redo')).toBe(1)
    expect(getAppSectionIndex('social')).toBe(4)
    expect(getAppSectionIndex('unknown')).toBe(0)
  })

  it('moves between primary sections with wraparound', () => {
    expect(getAdjacentAppSection('home', 1).id).toBe('redo')
    expect(getAdjacentAppSection('home', -1).id).toBe('more')
    expect(getAdjacentAppSection('more', 1).id).toBe('home')
    expect(getAdjacentAppSection('social', 1).id).toBe('more')
    expect(getAdjacentAppSection('place', -1).id).toBe('redo')
  })

  it('provides accessible labels for every primary section', () => {
    appSections.forEach((section) => {
      expect(section.ariaLabel).toBeTruthy()
      expect(section.icon).toBeTruthy()
      expect(section.label).toBeTruthy()
    })
  })
})

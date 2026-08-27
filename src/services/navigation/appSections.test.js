import { describe, expect, it } from 'vitest'
import {
  appSections,
  defaultAppSectionId,
  getAdjacentAppSection,
  getAppSection,
  getAppSectionIndex,
  isAppSectionId,
  normalizeAppSectionId,
} from './appSections.js'

describe('appSections', () => {
  it('exposes Notices directly before Social Room and More', () => {
    expect(appSections.map((section) => section.id)).toEqual([
      'home',
      'coach',
      'nutrition',
      'notices',
      'social',
      'more',
    ])

    expect(defaultAppSectionId).toBe('home')
  })

  it('validates and normalizes section ids', () => {
    expect(isAppSectionId('coach')).toBe(true)
    expect(isAppSectionId('unknown')).toBe(false)
    expect(normalizeAppSectionId('nutrition')).toBe('nutrition')
    expect(normalizeAppSectionId('unknown')).toBe('home')
  })

  it('returns section metadata and indexes', () => {
    expect(getAppSection('notices')).toMatchObject({
      id: 'notices',
      label: 'Notis',
    })

    expect(getAppSection('unknown').id).toBe('home')
    expect(getAppSectionIndex('coach')).toBe(1)
    expect(getAppSectionIndex('social')).toBe(4)
    expect(getAppSectionIndex('unknown')).toBe(0)
  })

  it('moves between sections with wraparound', () => {
    expect(getAdjacentAppSection('home', 1).id).toBe('coach')
    expect(getAdjacentAppSection('home', -1).id).toBe('more')
    expect(getAdjacentAppSection('more', 1).id).toBe('home')
    expect(getAdjacentAppSection('social', 1).id).toBe('more')
    expect(getAdjacentAppSection('nutrition', -1).id).toBe('coach')
  })

  it('provides accessible labels for every section', () => {
    appSections.forEach((section) => {
      expect(section.ariaLabel).toBeTruthy()
      expect(section.icon).toBeTruthy()
      expect(section.label).toBeTruthy()
    })
  })
})

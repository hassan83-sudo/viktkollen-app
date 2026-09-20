/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  accessibilityPreferencesKey,
  defaultAccessibilityPreferences,
  readAccessibilityPreferences,
  resetAccessibilityPreferences,
  saveAccessibilityPreferences,
} from './accessibilityPreferences.js'

describe('accessibility preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('uses safe defaults for missing or corrupt local data', () => {
    expect(readAccessibilityPreferences().preferences).toEqual(defaultAccessibilityPreferences)
    window.localStorage.setItem(accessibilityPreferencesKey, '{not json')
    expect(readAccessibilityPreferences().preferences).toEqual(defaultAccessibilityPreferences)
  })

  it('validates and persists only supported preference values', () => {
    saveAccessibilityPreferences({ textSize: 'extra-large', highContrast: true, unknown: 'ignored' })
    expect(readAccessibilityPreferences().preferences).toMatchObject({
      textSize: 'extra-large',
      highContrast: true,
    })
    expect(readAccessibilityPreferences().preferences.unknown).toBeUndefined()
  })

  it('removes only the namespaced accessibility preference key on reset', () => {
    window.localStorage.setItem('unrelated', 'safe')
    saveAccessibilityPreferences({ largeControls: true })

    expect(resetAccessibilityPreferences()).toBe(true)
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toBeNull()
    expect(window.localStorage.getItem('unrelated')).toBe('safe')
  })
})

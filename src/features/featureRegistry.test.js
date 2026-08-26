import { afterEach, describe, expect, it } from 'vitest'
import {
  FEATURE_FLAGS_STORAGE_KEY,
  defaultFeatureFlags,
  getFeatureFlags,
  getHubEntries,
  isFeatureEnabled,
  listEnabledFeatures,
  setFeatureFlag,
} from './featureRegistry.js'
import { canExposeFamilySafety } from './family-safety/familySafetyFeature.js'
import { getSmartCameraHubModes } from './smart-camera/smartCameraModes.js'

describe('featureRegistry', () => {
  afterEach(() => {
    if (typeof window !== 'undefined') window.localStorage?.removeItem(FEATURE_FLAGS_STORAGE_KEY)
  })

  it('uses safe defaults', () => {
    expect(defaultFeatureFlags).toMatchObject({
      eyes: true,
      familySafety: false,
      memory: true,
      mouth: true,
      smartCamera: true,
      social: false,
    })
    expect(getFeatureFlags().walkieTalkie).toBe(false)
    expect(getFeatureFlags().dayMap).toBe(false)
  })

  it('can enable and disable features without crashing lookups', () => {
    const off = getFeatureFlags({
      eyes: false,
      familySafety: false,
      memory: false,
      mouth: false,
      smartCamera: false,
    })

    expect(isFeatureEnabled('smartCamera', off)).toBe(false)
    expect(isFeatureEnabled('eyes', off)).toBe(false)
    expect(isFeatureEnabled('mouth', off)).toBe(false)
    expect(isFeatureEnabled('memory', off)).toBe(false)
    expect(isFeatureEnabled('familySafety', off)).toBe(false)
    expect(listEnabledFeatures(off)).toEqual([])
    expect(canExposeFamilySafety(off)).toBe(false)
  })

  it('hides Smart Camera, Eyes, Mouth and Family entries from the hub when disabled', () => {
    const flags = getFeatureFlags({
      eyes: false,
      familySafety: false,
      memory: false,
      mouth: false,
      smartCamera: true,
    })
    const hub = getSmartCameraHubModes(flags)
    const ids = [...hub.primary, ...hub.secondary].map((mode) => mode.id)

    expect(ids).toContain('check-me')
    expect(ids).toContain('outfit')
    expect(ids).toContain('food')
    expect(ids).toContain('body')
    expect(ids).not.toContain('eyes')
    expect(ids).not.toContain('mouth')
    expect(ids).not.toContain('items')
    expect(ids).not.toContain('where')
    expect(ids).not.toContain('family')
    expect(ids).not.toContain('family-safety')
    expect(getHubEntries(flags)).toMatchObject({
      eyes: false,
      familySafety: false,
      memory: false,
      mouth: false,
      smartCamera: true,
      social: false,
    })
  })

  it('shows Eyes and Mouth hub entries only when those features are on', () => {
    const on = getSmartCameraHubModes(getFeatureFlags({ eyes: true, mouth: true }))
    const off = getSmartCameraHubModes(getFeatureFlags({ eyes: false, mouth: false }))
    expect(on.secondary.some((mode) => mode.id === 'eyes')).toBe(true)
    expect(on.secondary.some((mode) => mode.id === 'mouth')).toBe(true)
    expect(off.secondary.some((mode) => mode.id === 'eyes')).toBe(false)
    expect(off.secondary.some((mode) => mode.id === 'mouth')).toBe(false)
  })

  it('ignores unknown flags and accepts explicit overrides', () => {
    expect(setFeatureFlag('not-a-feature', true).smartCamera).toBe(true)
    expect(getFeatureFlags({ familySafety: true }).familySafety).toBe(true)
    expect(canExposeFamilySafety({ familySafety: false })).toBe(false)
  })
})

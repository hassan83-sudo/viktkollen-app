import { describe, expect, it } from 'vitest'
import {
  createEmptyPlaceState,
  getPlaceFeatureAvailability,
  placeAvailability,
  setBatterySaver,
  setPlaceConsent,
  setPlaceSharing,
} from './placeModel.js'

describe('placeModel', () => {
  it('starts without consent or sharing', () => {
    const state = createEmptyPlaceState()
    expect(state.consentGranted).toBe(false)
    expect(state.sharingEnabled).toBe(false)
    expect(getPlaceFeatureAvailability('childLocation', state)).toBe(placeAvailability.requiresConsent)
  })

  it('never reports fake connected GPS features', () => {
    const state = setPlaceConsent(createEmptyPlaceState(), true)
    expect(getPlaceFeatureAvailability('familyMap', state)).toBe(placeAvailability.notConnected)
    expect(getPlaceFeatureAvailability('status', state)).toBe(placeAvailability.notConnected)
    expect(getPlaceFeatureAvailability('sos', state)).toBe(placeAvailability.notConnected)
  })

  it('requires consent before sharing or battery saver can be enabled', () => {
    let state = setPlaceSharing(createEmptyPlaceState(), true)
    expect(state.sharingEnabled).toBe(false)
    state = setPlaceConsent(state, true)
    state = setPlaceSharing(state, true)
    expect(state.sharingEnabled).toBe(true)
    state = setBatterySaver(state, true)
    expect(state.batterySaverEnabled).toBe(true)
    expect(getPlaceFeatureAvailability('batterySaver', state)).toBe(placeAvailability.comingSoon)
  })
})

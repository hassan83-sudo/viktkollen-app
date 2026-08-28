import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const placeSource = readFileSync(new URL('./PlaceSection.jsx', import.meta.url), 'utf8')
const placeModelSource = readFileSync(new URL('../../features/place/placeModel.js', import.meta.url), 'utf8')

describe('PlaceSection', () => {
  it('shows honest placeholder statuses without fake map data', () => {
    expect(placeSource).toContain("t('consent.title')")
    expect(placeSource).toContain('getPlaceFeatureAvailability')
    expect(placeSource).toContain("t('status.requiresConsent')")
    expect(placeSource).not.toContain('geolocation')
    expect(placeSource).not.toContain('navigator.geolocation')
    expect(placeModelSource).not.toContain('latitude')
    expect(placeModelSource).not.toContain('longitude')
  })

  it('requires consent before sharing controls appear', () => {
    expect(placeSource).toContain('state.consentGranted')
    expect(placeSource).toContain('setPlaceSharing')
    expect(placeSource).toContain('setPlaceConsent')
  })

  it('keeps SOS disabled and honest', () => {
    expect(placeSource).toContain('place-action is-disabled')
    expect(placeSource).toContain('disabled')
    expect(placeSource).toContain("t('features.sos.action')")
    expect(placeSource).toContain("t('limits.noEmergency')")
  })
})

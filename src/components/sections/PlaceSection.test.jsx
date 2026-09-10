import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const placeSource = readFileSync(new URL('./PlaceSection.jsx', import.meta.url), 'utf8')
const placeModelSource = readFileSync(new URL('../../features/place/placeModel.js', import.meta.url), 'utf8')
const placeResourcesSource = readFileSync(new URL('../../i18n/readyPlaceResources.js', import.meta.url), 'utf8')

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

  it('makes Familjekarta openable only after consent, scoped to that one card', () => {
    expect(placeSource).toContain("featureId === 'familyMap' && state.consentGranted")
    expect(placeSource).toContain('setIsFamilyMapOpen(true)')
    expect(placeSource).toContain("role: 'button'")
    // The click/keyboard affordance is only ever wired up for familyMap — every
    // other card keeps rendering with an empty props spread, unchanged.
    expect(placeSource).toContain(': {}')
  })

  it('closes the Familjekarta modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsFamilyMapOpen(false)')
  })

  it('shows an honest empty state for Familjekarta with no fabricated position, person or time', () => {
    expect(placeSource).toContain('isFamilyMapOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.familyMap.title')")
    expect(placeSource).toContain("t('features.familyMap.empty')")
    expect(placeSource).toContain("t('features.familyMap.emptyBody')")
    expect(placeSource).toContain("t('common:actions.close')")
    expect(placeSource).not.toContain('latitude')
    expect(placeSource).not.toContain('longitude')
    expect(placeSource).not.toContain('mockFamilyMember')
    expect(placeResourcesSource).toContain('Ingen delar sin plats med dig ännu.')
    expect(placeResourcesSource).toContain('No one is sharing their location with you yet.')
  })
})

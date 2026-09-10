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

  it('makes Barnets plats openable only after consent, without changing Familjekarta', () => {
    expect(placeSource).toContain("featureId === 'childLocation' && state.consentGranted")
    expect(placeSource).toContain('setIsChildLocationOpen(true)')
    expect(placeSource).toContain('const isCardOpenable =')
    expect(placeSource).toContain('familyMapOpenable || childLocationOpenable')
    // Familjekarta's own gating condition and handler are still present, byte for byte.
    expect(placeSource).toContain("featureId === 'familyMap' && state.consentGranted")
    expect(placeSource).toContain('setIsFamilyMapOpen(true)')
  })

  it('closes the Barnets plats modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsChildLocationOpen(false)')
  })

  it('shows an honest empty state for Barnets plats with no fabricated position, time or battery level', () => {
    expect(placeSource).toContain('isChildLocationOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.childLocation.title')")
    expect(placeSource).toContain("t('features.childLocation.empty')")
    expect(placeSource).toContain("t('features.childLocation.emptyBody')")
    expect(placeSource).not.toContain('batteryLevel')
    expect(placeSource).not.toContain('live')
    expect(placeResourcesSource).toContain('Ingen aktuell plats är delad ännu.')
    expect(placeResourcesSource).toContain('No current location has been shared yet.')
  })

  it('makes Status openable only after consent, without changing Familjekarta or Barnets plats', () => {
    expect(placeSource).toContain("featureId === 'status' && state.consentGranted")
    expect(placeSource).toContain('setIsStatusOpen(true)')
    expect(placeSource).toContain('const isCardOpenable =')
    expect(placeSource).toContain('familyMapOpenable || childLocationOpenable || statusOpenable')
    // Familjekarta's and Barnets plats's own gating conditions and handlers are
    // still present, byte for byte — this sprint only added a sibling branch.
    expect(placeSource).toContain("featureId === 'familyMap' && state.consentGranted")
    expect(placeSource).toContain('setIsFamilyMapOpen(true)')
    expect(placeSource).toContain("featureId === 'childLocation' && state.consentGranted")
    expect(placeSource).toContain('setIsChildLocationOpen(true)')
  })

  it('closes the Status modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsStatusOpen(false)')
  })

  it('shows an honest empty state for Status with no fabricated status, time or tracking', () => {
    expect(placeSource).toContain('isStatusOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.status.title')")
    expect(placeSource).toContain("t('features.status.empty')")
    expect(placeSource).toContain("t('features.status.emptyBody')")
    expect(placeSource).not.toContain('watchPosition')
    expect(placeSource).not.toContain('getCurrentPosition')
    expect(placeSource).not.toContain('navigator.geolocation')
    expect(placeSource).not.toContain('setInterval')
    expect(placeSource).not.toContain('Hemma')
    expect(placeSource).not.toContain('I skolan')
    expect(placeSource).not.toContain('Senast sedd')
    expect(placeResourcesSource).toContain('Status kan inte fastställas ännu.')
    expect(placeResourcesSource).toContain('Status cannot be determined yet.')
  })

  it('makes Trygga platser openable only after consent, without changing earlier Plats cards', () => {
    expect(placeSource).toContain("featureId === 'safePlaces' && state.consentGranted")
    expect(placeSource).toContain('setIsSafePlacesOpen(true)')
    expect(placeSource).toContain('const isCardOpenable =')
    expect(placeSource).toContain(
      'familyMapOpenable || childLocationOpenable || statusOpenable || safePlacesOpenable',
    )
    // Familjekarta's, Barnets plats's and Status's own gating conditions and
    // handlers are still present, byte for byte — only a sibling branch was added.
    expect(placeSource).toContain("featureId === 'familyMap' && state.consentGranted")
    expect(placeSource).toContain('setIsFamilyMapOpen(true)')
    expect(placeSource).toContain("featureId === 'childLocation' && state.consentGranted")
    expect(placeSource).toContain('setIsChildLocationOpen(true)')
    expect(placeSource).toContain("featureId === 'status' && state.consentGranted")
    expect(placeSource).toContain('setIsStatusOpen(true)')
  })

  it('closes the Trygga platser modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsSafePlacesOpen(false)')
  })

  it('shows an honest empty state for Trygga platser with no fabricated address, coordinate or radius', () => {
    expect(placeSource).toContain('isSafePlacesOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.safePlaces.title')")
    expect(placeSource).toContain("t('features.safePlaces.empty')")
    expect(placeSource).toContain("t('features.safePlaces.emptyBody')")
    expect(placeSource).not.toContain('radius')
    expect(placeSource).not.toContain('address')
    expect(placeSource).not.toContain('latitude')
    expect(placeSource).not.toContain('longitude')
    expect(placeResourcesSource).toContain('Inga trygga platser är tillagda ännu.')
    expect(placeResourcesSource).toContain('No safe places have been added yet.')
  })

  it('makes Platsnotiser openable only after consent, without changing earlier Plats cards', () => {
    expect(placeSource).toContain("featureId === 'placeNotifications' && state.consentGranted")
    expect(placeSource).toContain('setIsPlaceNotificationsOpen(true)')
    expect(placeSource).toContain(
      'familyMapOpenable || childLocationOpenable || statusOpenable || safePlacesOpenable || placeNotificationsOpenable',
    )
    // Every earlier card's own gating condition and handler is still present,
    // byte for byte — only a sibling branch was added this sprint.
    expect(placeSource).toContain("featureId === 'familyMap' && state.consentGranted")
    expect(placeSource).toContain('setIsFamilyMapOpen(true)')
    expect(placeSource).toContain("featureId === 'childLocation' && state.consentGranted")
    expect(placeSource).toContain('setIsChildLocationOpen(true)')
    expect(placeSource).toContain("featureId === 'status' && state.consentGranted")
    expect(placeSource).toContain('setIsStatusOpen(true)')
    expect(placeSource).toContain("featureId === 'safePlaces' && state.consentGranted")
    expect(placeSource).toContain('setIsSafePlacesOpen(true)')
  })

  it('closes the Platsnotiser modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsPlaceNotificationsOpen(false)')
  })

  it('shows an honest empty state for Platsnotiser with no fabricated events, people or times', () => {
    expect(placeSource).toContain('isPlaceNotificationsOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.placeNotifications.title')")
    expect(placeSource).toContain("t('features.placeNotifications.empty')")
    expect(placeSource).toContain("t('features.placeNotifications.emptyBody')")
    expect(placeSource).not.toContain('Notification.')
    expect(placeSource).not.toContain('serviceWorker')
    expect(placeSource).not.toContain('geofence')
    expect(placeSource).not.toContain('anlände')
    expect(placeSource).not.toContain('lämnade')
    expect(placeResourcesSource).toContain('Inga platsnotiser är aktiverade ännu.')
    expect(placeResourcesSource).toContain('No place notifications are enabled yet.')
  })

  it('makes SOS openable only after consent, without changing earlier Plats cards', () => {
    expect(placeSource).toContain("featureId === 'sos' && state.consentGranted")
    expect(placeSource).toContain('setIsSosOpen(true)')
    expect(placeSource).toContain(
      'familyMapOpenable || childLocationOpenable || statusOpenable || safePlacesOpenable || placeNotificationsOpenable || sosOpenable',
    )
    // Every earlier card's own gating condition and handler is still present,
    // byte for byte — only a sibling branch was added this sprint.
    expect(placeSource).toContain("featureId === 'familyMap' && state.consentGranted")
    expect(placeSource).toContain('setIsFamilyMapOpen(true)')
    expect(placeSource).toContain("featureId === 'childLocation' && state.consentGranted")
    expect(placeSource).toContain('setIsChildLocationOpen(true)')
    expect(placeSource).toContain("featureId === 'status' && state.consentGranted")
    expect(placeSource).toContain('setIsStatusOpen(true)')
    expect(placeSource).toContain("featureId === 'safePlaces' && state.consentGranted")
    expect(placeSource).toContain('setIsSafePlacesOpen(true)')
    expect(placeSource).toContain("featureId === 'placeNotifications' && state.consentGranted")
    expect(placeSource).toContain('setIsPlaceNotificationsOpen(true)')
    // The pre-existing disabled SOS button is untouched by this sprint.
    expect(placeSource).toContain('place-action is-disabled')
    expect(placeSource).toContain("t('features.sos.action')")
  })

  it('closes the SOS modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsSosOpen(false)')
  })

  it('shows an honest not-connected SOS status with the 112 fallback and no fabricated dispatch', () => {
    expect(placeSource).toContain('isSosOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.sos.title')")
    expect(placeSource).toContain("t('features.sos.empty')")
    expect(placeSource).toContain("t('features.sos.emptyBody')")
    expect(placeSource).not.toContain('tel:')
    expect(placeSource).not.toContain('sms:')
    expect(placeSource).not.toContain('fetch(')
    expect(placeSource).not.toContain('navigator.geolocation')
    expect(placeSource).not.toContain('Notification.')
    expect(placeSource).not.toContain('serviceWorker')
    expect(placeSource).not.toContain('setInterval')
    expect(placeSource).not.toContain('112')
    expect(placeResourcesSource).toContain('SOS är inte anslutet till någon nödkontakt ännu.')
    expect(placeResourcesSource).toContain('SOS is not connected to any emergency contact yet.')
    expect(placeResourcesSource).toContain('Vid akut fara, ring 112.')
    expect(placeResourcesSource).toContain('In case of immediate danger, call 112.')
  })
})

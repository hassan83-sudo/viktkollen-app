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

  it('does not make Allt är okej openable without consent', () => {
    expect(placeSource).toContain("featureId === 'allOkCheckin' && state.consentGranted")
  })

  it('makes Allt är okej openable with consent, without changing the six earlier openable cards', () => {
    expect(placeSource).toContain('setIsAllOkOpen(true)')
    expect(placeSource).toContain(
      'familyMapOpenable || childLocationOpenable || statusOpenable || safePlacesOpenable || placeNotificationsOpenable || sosOpenable || allOkOpenable',
    )
    expect(placeSource).toContain("role: 'button'")
    expect(placeSource).toContain('tabIndex: 0')
    // Every earlier card's own gating condition and handler — click and keyboard —
    // is still present, byte for byte; only a sibling branch was added this sprint.
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
    expect(placeSource).toContain("featureId === 'sos' && state.consentGranted")
    expect(placeSource).toContain('setIsSosOpen(true)')
    // Enter and Space follow the same shared keyboard handler as every other card.
    expect(placeSource).toContain("if (event.key === 'Enter' || event.key === ' ')")
  })

  it('closes the Allt är okej modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsAllOkOpen(false)')
  })

  it('shows an honest not-yet-connected check-in with no fabricated recipient, time or position', () => {
    expect(placeSource).toContain('isAllOkOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.allOkCheckin.title')")
    expect(placeSource).toContain("t('features.allOkCheckin.empty')")
    expect(placeSource).toContain("t('features.allOkCheckin.emptyBody')")
    expect(placeSource).toContain("t('common:actions.close')")
    // No working send action was introduced for this card.
    expect(placeSource).not.toContain('setIsAllOkOpen(false)}>{t(\'features.allOkCheckin.action\')')
    expect(placeSource).not.toContain('features.allOkCheckin.action')
    expect(placeSource).not.toContain('tel:')
    expect(placeSource).not.toContain('sms:')
    expect(placeSource).not.toContain('mailto:')
    expect(placeSource).not.toContain('fetch(')
    expect(placeSource).not.toContain('axios')
    expect(placeSource).not.toContain('WebSocket')
    expect(placeSource).not.toContain('supabase')
    expect(placeSource).not.toContain('Notification.')
    expect(placeSource).not.toContain('serviceWorker')
    expect(placeSource).not.toContain('setInterval')
    expect(placeSource).not.toContain('setTimeout')
    expect(placeSource).not.toContain('navigator.geolocation')
    expect(placeSource).not.toContain('getCurrentPosition')
    expect(placeSource).not.toContain('watchPosition')
    expect(placeSource).not.toContain('latitude')
    expect(placeSource).not.toContain('longitude')
    expect(placeSource).not.toContain('Skickat')
    expect(placeSource).not.toContain('skickades')
    expect(placeResourcesSource).toContain('Check-in är inte ansluten till någon mottagare ännu.')
    expect(placeResourcesSource).toContain('Check-in is not connected to any recipient yet.')
    expect(placeResourcesSource).toContain('När funktionen är ansluten kan du meddela familjen att allt är okej.')
    expect(placeResourcesSource).toContain('Once the feature is connected, you will be able to let your family know that everything is okay.')
  })

  it('does not make Platshistorik openable without consent', () => {
    expect(placeSource).toContain("featureId === 'placeHistory' && state.consentGranted")
  })

  it('makes Platshistorik openable with consent, without changing the seven earlier openable cards', () => {
    expect(placeSource).toContain('setIsPlaceHistoryOpen(true)')
    expect(placeSource).toContain(
      'familyMapOpenable || childLocationOpenable || statusOpenable || safePlacesOpenable || placeNotificationsOpenable || sosOpenable || allOkOpenable || placeHistoryOpenable',
    )
    expect(placeSource).toContain("role: 'button'")
    expect(placeSource).toContain('tabIndex: 0')
    // role="button"/tabIndex=0 are only ever applied through the shared
    // openableProps spread — every non-openable card still renders with `: {}`.
    expect(placeSource).toContain(': {}')
    // Enter and Space follow the same shared keyboard handler as every other card.
    expect(placeSource).toContain("if (event.key === 'Enter' || event.key === ' ')")
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
    expect(placeSource).toContain("featureId === 'sos' && state.consentGranted")
    expect(placeSource).toContain('setIsSosOpen(true)')
    expect(placeSource).toContain("featureId === 'allOkCheckin' && state.consentGranted")
    expect(placeSource).toContain('setIsAllOkOpen(true)')
  })

  it('closes the Platshistorik modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsPlaceHistoryOpen(false)')
  })

  it('shows an honest empty state for Platshistorik with no fabricated history and no tracking, storage or backend introduced', () => {
    expect(placeSource).toContain('isPlaceHistoryOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.placeHistory.title')")
    expect(placeSource).toContain("t('features.placeHistory.empty')")
    expect(placeSource).toContain("t('features.placeHistory.emptyBody')")
    expect(placeSource).toContain("t('common:actions.close')")
    // No fabricated history entries: no addresses, coordinates, dates/times,
    // people, routes, arrival/departure or entry counts.
    expect(placeSource).not.toContain('adress')
    expect(placeSource).not.toContain('address')
    expect(placeSource).not.toContain('latitude')
    expect(placeSource).not.toContain('longitude')
    expect(placeSource).not.toContain('rutt')
    expect(placeSource).not.toContain('resa')
    expect(placeSource).not.toContain('anlände')
    expect(placeSource).not.toContain('lämnade')
    expect(placeSource).not.toContain('Hemma')
    expect(placeSource).not.toContain('I skolan')
    expect(placeSource).not.toContain('Senast sedd')
    // No tracking, storage, timers or network/backend code was introduced.
    expect(placeSource).not.toContain('navigator.geolocation')
    expect(placeSource).not.toContain('getCurrentPosition')
    expect(placeSource).not.toContain('watchPosition')
    expect(placeSource).not.toContain('setInterval')
    expect(placeSource).not.toContain('setTimeout')
    expect(placeSource).not.toContain('localStorage')
    expect(placeSource).not.toContain('IndexedDB')
    expect(placeSource).not.toContain('indexedDB')
    expect(placeSource).not.toContain('fetch(')
    expect(placeSource).not.toContain('axios')
    expect(placeSource).not.toContain('WebSocket')
    expect(placeSource).not.toContain('supabase')
    expect(placeSource).not.toContain('Notification.')
    expect(placeSource).not.toContain('serviceWorker')
    expect(placeResourcesSource).toContain('Ingen platshistorik finns ännu.')
    expect(placeResourcesSource).toContain('No location history exists yet.')
    expect(placeResourcesSource).toContain(
      'Platshistorik visas här först när funktionen har aktiverats och verkliga platsuppdateringar har sparats.',
    )
    expect(placeResourcesSource).toContain(
      'Location history will appear here once the feature has been enabled and real location updates have been saved.',
    )
  })

  it('does not make Batterisnålt läge openable without consent', () => {
    expect(placeSource).toContain("featureId === 'batterySaver' && state.consentGranted")
  })

  it('makes Batterisnålt läge openable with consent, without changing the eight earlier openable cards', () => {
    expect(placeSource).toContain('setIsBatterySaverOpen(true)')
    expect(placeSource).toContain(
      'familyMapOpenable || childLocationOpenable || statusOpenable || safePlacesOpenable || placeNotificationsOpenable || sosOpenable || allOkOpenable || placeHistoryOpenable || batterySaverOpenable',
    )
    expect(placeSource).toContain("role: 'button'")
    expect(placeSource).toContain('tabIndex: 0')
    // role="button"/tabIndex=0 are only ever applied through the shared
    // openableProps spread — every non-openable card still renders with `: {}`.
    expect(placeSource).toContain(': {}')
    // Enter and Space follow the same shared keyboard handler as every other card.
    expect(placeSource).toContain("if (event.key === 'Enter' || event.key === ' ')")
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
    expect(placeSource).toContain("featureId === 'sos' && state.consentGranted")
    expect(placeSource).toContain('setIsSosOpen(true)')
    expect(placeSource).toContain("featureId === 'allOkCheckin' && state.consentGranted")
    expect(placeSource).toContain('setIsAllOkOpen(true)')
    expect(placeSource).toContain("featureId === 'placeHistory' && state.consentGranted")
    expect(placeSource).toContain('setIsPlaceHistoryOpen(true)')
  })

  it('closes the Batterisnålt läge modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsBatterySaverOpen(false)')
  })

  it('shows the real batterySaverEnabled status in the Batterisnålt läge modal, on and off, with no fake toggle', () => {
    expect(placeSource).toContain('isBatterySaverOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.batterySaver.title')")
    // Status text is driven directly off state.batterySaverEnabled, not a
    // separate local value.
    expect(placeSource).toContain(
      "state.batterySaverEnabled ? t('features.batterySaver.statusOn') : t('features.batterySaver.statusOff')",
    )
    expect(placeSource).toContain("t('features.batterySaver.disclaimer')")
    expect(placeSource).toContain("t('common:actions.close')")
    // The modal's toggle reuses the existing legitimate update flow — the same
    // checked source and updater as the card's own pre-existing toggle.
    expect(placeSource).toContain('checked={state.batterySaverEnabled}')
    expect(placeSource).toContain('setState((current) => setBatterySaver(current, event.target.checked))')
    expect(placeResourcesSource).toContain('Batterisnålt läge är på.')
    expect(placeResourcesSource).toContain('Batterisnålt läge är av.')
    expect(placeResourcesSource).toContain('Battery saver mode is on.')
    expect(placeResourcesSource).toContain('Battery saver mode is off.')
  })

  it('describes Batterisnålt läge truthfully, without claiming GPS frequency or real battery savings', () => {
    expect(placeResourcesSource).toContain(
      'Batterisnålt läge är en sparad inställning för platsfunktionen. Ingen automatisk ändring av GPS eller bakgrundsspårning är ansluten ännu.',
    )
    expect(placeResourcesSource).toContain(
      'Battery saver mode is a saved setting for the location feature. No automatic change to GPS or background tracking is connected yet.',
    )
    // No new tracking, storage, timers or network/backend code was introduced
    // anywhere in the file by this sprint.
    expect(placeSource).not.toContain('navigator.geolocation')
    expect(placeSource).not.toContain('getCurrentPosition')
    expect(placeSource).not.toContain('watchPosition')
    expect(placeSource).not.toContain('setInterval')
    expect(placeSource).not.toContain('setTimeout')
    expect(placeSource).not.toContain('localStorage')
    expect(placeSource).not.toContain('sessionStorage')
    expect(placeSource).not.toContain('IndexedDB')
    expect(placeSource).not.toContain('indexedDB')
    expect(placeSource).not.toContain('fetch(')
    expect(placeSource).not.toContain('axios')
    expect(placeSource).not.toContain('WebSocket')
    expect(placeSource).not.toContain('supabase')
    expect(placeSource).not.toContain('Notification.')
    expect(placeSource).not.toContain('serviceWorker')
  })

  it('does not make Inställningar för platsdelning openable without consent', () => {
    expect(placeSource).toContain("featureId === 'sharingSettings' && state.consentGranted")
  })

  it('makes Inställningar för platsdelning openable with consent, without changing the nine earlier openable cards', () => {
    expect(placeSource).toContain('setIsSharingSettingsOpen(true)')
    expect(placeSource).toContain(
      'familyMapOpenable || childLocationOpenable || statusOpenable || safePlacesOpenable || placeNotificationsOpenable || sosOpenable || allOkOpenable || placeHistoryOpenable || batterySaverOpenable || sharingSettingsOpenable',
    )
    expect(placeSource).toContain("role: 'button'")
    expect(placeSource).toContain('tabIndex: 0')
    // role="button"/tabIndex=0 are only ever applied through the shared
    // openableProps spread — every non-openable card still renders with `: {}`.
    expect(placeSource).toContain(': {}')
    // Enter and Space follow the same shared keyboard handler as every other card.
    expect(placeSource).toContain("if (event.key === 'Enter' || event.key === ' ')")
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
    expect(placeSource).toContain("featureId === 'sos' && state.consentGranted")
    expect(placeSource).toContain('setIsSosOpen(true)')
    expect(placeSource).toContain("featureId === 'allOkCheckin' && state.consentGranted")
    expect(placeSource).toContain('setIsAllOkOpen(true)')
    expect(placeSource).toContain("featureId === 'placeHistory' && state.consentGranted")
    expect(placeSource).toContain('setIsPlaceHistoryOpen(true)')
    expect(placeSource).toContain("featureId === 'batterySaver' && state.consentGranted")
    expect(placeSource).toContain('setIsBatterySaverOpen(true)')
  })

  it('closes the Inställningar för platsdelning modal automatically if consent is revoked', () => {
    expect(placeSource).toContain('if (!state.consentGranted) setIsSharingSettingsOpen(false)')
  })

  it('shows the real sharingEnabled status in the sharing settings modal, on and off, with no fake toggle or recipient', () => {
    expect(placeSource).toContain('isSharingSettingsOpen && state.consentGranted')
    expect(placeSource).toContain("t('features.sharingSettings.title')")
    // Status text is driven directly off state.sharingEnabled, not a separate
    // local value.
    expect(placeSource).toContain(
      "state.sharingEnabled ? t('features.sharingSettings.statusOn') : t('features.sharingSettings.statusOff')",
    )
    expect(placeSource).toContain("t('features.sharingSettings.disclaimer')")
    expect(placeSource).toContain("t('common:actions.close')")
    // The modal's toggle reuses the existing legitimate update flow — the same
    // checked source and updater as the consent card's own pre-existing toggle.
    expect(placeSource).toContain('checked={state.sharingEnabled}')
    expect(placeSource).toContain('setState((current) => setPlaceSharing(current, event.target.checked))')
    // No fabricated recipient, family member or child was introduced.
    expect(placeSource).not.toContain('familyMember')
    expect(placeSource).not.toContain('recipient')
    expect(placeResourcesSource).toContain('Platsdelning är på.')
    expect(placeResourcesSource).toContain('Platsdelning är av.')
    expect(placeResourcesSource).toContain('Location sharing is on.')
    expect(placeResourcesSource).toContain('Location sharing is off.')
  })

  it('describes Inställningar för platsdelning truthfully, without claiming real GPS or family sharing is active', () => {
    expect(placeResourcesSource).toContain(
      'Platsdelning är en sparad inställning. Ingen automatisk GPS- eller bakgrundsdelning startas av den här inställningen ännu.',
    )
    expect(placeResourcesSource).toContain(
      'Location sharing is a saved setting. No automatic GPS or background sharing is started by this setting yet.',
    )
    // No new tracking, storage, timers or network/backend code was introduced
    // anywhere in the file by this sprint.
    expect(placeSource).not.toContain('navigator.geolocation')
    expect(placeSource).not.toContain('getCurrentPosition')
    expect(placeSource).not.toContain('watchPosition')
    expect(placeSource).not.toContain('setInterval')
    expect(placeSource).not.toContain('setTimeout')
    expect(placeSource).not.toContain('localStorage')
    expect(placeSource).not.toContain('sessionStorage')
    expect(placeSource).not.toContain('IndexedDB')
    expect(placeSource).not.toContain('indexedDB')
    expect(placeSource).not.toContain('cookie')
    expect(placeSource).not.toContain('fetch(')
    expect(placeSource).not.toContain('axios')
    expect(placeSource).not.toContain('WebSocket')
    expect(placeSource).not.toContain('supabase')
    expect(placeSource).not.toContain('Notification.')
    expect(placeSource).not.toContain('serviceWorker')
    expect(placeSource).not.toContain('push')
  })
})

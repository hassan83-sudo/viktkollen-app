import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppSection from '../app/AppSection.jsx'
import {
  getPlaceFeatureAvailability,
  placeAvailability,
  placeFeatureIds,
  setBatterySaver,
  setPlaceConsent,
  setPlaceSharing,
} from '../../features/place/placeModel.js'
import { loadPlaceState, savePlaceState } from '../../features/place/placeStore.js'
import { loadFamilyLatestLocations } from '../../features/place/placeFamilyMapService.js'
import {
  createSafePlaceFromOwnLatestLocation,
  deleteSafePlace,
  loadSafePlaces,
} from '../../features/place/placeSafePlacesService.js'

const featureIcons = {
  familyMap: '🗺',
  childLocation: '📍',
  status: '🏫',
  safePlaces: '🏠',
  sos: '🛡️',
  allOkCheckin: '✓',
  placeHistory: '🕘',
  batterySaver: '🔋',
  sharingSettings: '⚙',
}

const safetyAlertChoices = [
  ['🚨', 'Jag känner mig hotad'],
  ['🧭', 'Jag har gått vilse'],
  ['🩹', 'Jag har skadat mig'],
  ['😟', 'Jag känner mig otrygg'],
  ['🚗', 'Jag behöver bli hämtad'],
  ['🆘', 'Annat – jag behöver hjälp'],
]

function PlaceSection({ activeSection }) {
  const { t } = useTranslation('place')
  const [state, setState] = useState(() => loadPlaceState())
  const [isFamilyMapOpen, setIsFamilyMapOpen] = useState(false)
  const [familyLocations, setFamilyLocations] = useState([])
  const [familyLocationsLoaded, setFamilyLocationsLoaded] = useState(false)
  const [isChildLocationOpen, setIsChildLocationOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [isSafePlacesOpen, setIsSafePlacesOpen] = useState(false)
  const [safePlaces, setSafePlaces] = useState([])
  const [safePlacesLoaded, setSafePlacesLoaded] = useState(false)
  const [safePlacesError, setSafePlacesError] = useState('')
  const [safePlaceName, setSafePlaceName] = useState('')
  const [safePlaceSaving, setSafePlaceSaving] = useState(false)
  const [isSosOpen, setIsSosOpen] = useState(false)
  const [isAllOkOpen, setIsAllOkOpen] = useState(false)
  const [isPlaceHistoryOpen, setIsPlaceHistoryOpen] = useState(false)
  const [isBatterySaverOpen, setIsBatterySaverOpen] = useState(false)
  const [isSharingSettingsOpen, setIsSharingSettingsOpen] = useState(false)

  useEffect(() => {
    savePlaceState(state)
  }, [state])

  useEffect(() => {
    if (!state.consentGranted) setIsFamilyMapOpen(false)
  }, [state.consentGranted])

  useEffect(() => {
    let cancelled = false

    if (!state.consentGranted) {
      setFamilyLocations([])
      setFamilyLocationsLoaded(false)
      return () => {
        cancelled = true
      }
    }

    setFamilyLocationsLoaded(false)
    loadFamilyLatestLocations()
      .then(({ data }) => {
        if (cancelled) return
        setFamilyLocations(Array.isArray(data) ? data : [])
        setFamilyLocationsLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setFamilyLocations([])
        setFamilyLocationsLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [state.consentGranted])

  useEffect(() => {
    if (!state.consentGranted) setIsChildLocationOpen(false)
  }, [state.consentGranted])

  useEffect(() => {
    if (!state.consentGranted) setIsStatusOpen(false)
  }, [state.consentGranted])

  useEffect(() => {
    if (!state.consentGranted) setIsSafePlacesOpen(false)
  }, [state.consentGranted])

  useEffect(() => {
    let cancelled = false

    if (!state.consentGranted) {
      setSafePlaces([])
      setSafePlacesLoaded(false)
      setSafePlacesError('')
      return () => {
        cancelled = true
      }
    }

    setSafePlacesLoaded(false)
    setSafePlacesError('')
    loadSafePlaces()
      .then(({ data, error }) => {
        if (cancelled) return
        setSafePlaces(Array.isArray(data) ? data : [])
        setSafePlacesError(error?.message || '')
        setSafePlacesLoaded(true)
      })
      .catch((error) => {
        if (cancelled) return
        setSafePlaces([])
        setSafePlacesError(error?.message || 'Trygga platser kunde inte hämtas.')
        setSafePlacesLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [state.consentGranted])

  useEffect(() => {
    if (!state.consentGranted) setIsSosOpen(false)
  }, [state.consentGranted])

  useEffect(() => {
    if (!state.consentGranted) setIsAllOkOpen(false)
  }, [state.consentGranted])

  useEffect(() => {
    if (!state.consentGranted) setIsPlaceHistoryOpen(false)
  }, [state.consentGranted])

  useEffect(() => {
    if (!state.consentGranted) setIsBatterySaverOpen(false)
  }, [state.consentGranted])

  useEffect(() => {
    if (!state.consentGranted) setIsSharingSettingsOpen(false)
  }, [state.consentGranted])

  async function handleAddSafePlace(event) {
    event.preventDefault()
    if (!safePlaceName.trim() || safePlaceSaving) return

    setSafePlaceSaving(true)
    setSafePlacesError('')
    const { data, error } = await createSafePlaceFromOwnLatestLocation(safePlaceName)

    if (error) {
      setSafePlacesError(error.message || 'Platsen kunde inte sparas.')
    } else if (data) {
      setSafePlaces((current) => [...current, data])
      setSafePlaceName('')
    }

    setSafePlaceSaving(false)
  }

  async function handleDeleteSafePlace(id) {
    setSafePlacesError('')
    const { error } = await deleteSafePlace(id)
    if (error) {
      setSafePlacesError(error.message || 'Platsen kunde inte raderas.')
      return
    }
    setSafePlaces((current) => current.filter((place) => place.id !== id))
  }

  function availabilityLabel(featureId, availability) {
    if ((featureId === 'familyMap' || featureId === 'childLocation' || featureId === 'status') && familyLocationsLoaded && familyLocations.length > 0) return 'Ansluten'
    if (featureId === 'safePlaces' && safePlacesLoaded && !safePlacesError) return 'Ansluten'
    if ((featureId === 'batterySaver' || featureId === 'sharingSettings') && state.consentGranted) return 'Ansluten'
    if (availability === placeAvailability.requiresConsent) return t('status.requiresConsent')
    if (availability === placeAvailability.comingSoon) return t('status.comingSoon')
    return t('status.notConnected')
  }

  return (
    <AppSection activeSection={activeSection} id="place" label={t('title')}>
      <div className="place-shell">
        <header className="place-header">
          <div>
            <p className="place-kicker" aria-hidden="true">📍</p>
            <h1>{t('title')}</h1>
            <p>{t('subtitle')}</p>
          </div>
        </header>

        <section className="place-consent-card" aria-labelledby="place-consent-title">
          <h2 id="place-consent-title">{t('consent.title')}</h2>
          <p>{t('consent.body')}</p>
          <label className="place-toggle">
            <input checked={state.consentGranted} type="checkbox" onChange={(event) => setState((current) => setPlaceConsent(current, event.target.checked))} />
            <span>{t('consent.toggle')}</span>
          </label>
          {state.consentGranted ? (
            <label className="place-toggle">
              <input checked={state.sharingEnabled} type="checkbox" onChange={(event) => setState((current) => setPlaceSharing(current, event.target.checked))} />
              <span>{t('consent.sharingToggle')}</span>
            </label>
          ) : null}
          <p className="place-consent-note">{t('consent.note')}</p>
        </section>

        <section className="place-feature-grid" aria-label={t('featuresAria')}>
          {placeFeatureIds.map((featureId) => {
            const availability = getPlaceFeatureAvailability(featureId, state)
            const familyMapOpenable = featureId === 'familyMap' && state.consentGranted
            const childLocationOpenable = featureId === 'childLocation' && state.consentGranted
            const statusOpenable = featureId === 'status' && state.consentGranted
            const safePlacesOpenable = featureId === 'safePlaces' && state.consentGranted
            const sosOpenable = featureId === 'sos' && state.consentGranted
            const allOkOpenable = featureId === 'allOkCheckin' && state.consentGranted
            const placeHistoryOpenable = featureId === 'placeHistory' && state.consentGranted
            const batterySaverOpenable = featureId === 'batterySaver' && state.consentGranted
            const sharingSettingsOpenable = featureId === 'sharingSettings' && state.consentGranted
            const isCardOpenable = familyMapOpenable || childLocationOpenable || statusOpenable || safePlacesOpenable || sosOpenable || allOkOpenable || placeHistoryOpenable || batterySaverOpenable || sharingSettingsOpenable
            const openableProps = isCardOpenable ? {
              onPointerUp: () => {
                if (familyMapOpenable) setIsFamilyMapOpen(true)
                else if (childLocationOpenable) setIsChildLocationOpen(true)
                else if (statusOpenable) setIsStatusOpen(true)
                else if (safePlacesOpenable) setIsSafePlacesOpen(true)
                else if (sosOpenable) setIsSosOpen(true)
                else if (allOkOpenable) setIsAllOkOpen(true)
                else if (placeHistoryOpenable) setIsPlaceHistoryOpen(true)
                else if (batterySaverOpenable) setIsBatterySaverOpen(true)
                else if (sharingSettingsOpenable) setIsSharingSettingsOpen(true)
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (familyMapOpenable) setIsFamilyMapOpen(true)
                  else if (childLocationOpenable) setIsChildLocationOpen(true)
                  else if (statusOpenable) setIsStatusOpen(true)
                  else if (safePlacesOpenable) setIsSafePlacesOpen(true)
                  else if (sosOpenable) setIsSosOpen(true)
                  else if (allOkOpenable) setIsAllOkOpen(true)
                  else if (placeHistoryOpenable) setIsPlaceHistoryOpen(true)
                  else if (batterySaverOpenable) setIsBatterySaverOpen(true)
                  else if (sharingSettingsOpenable) setIsSharingSettingsOpen(true)
                }
              },
              role: 'button',
              tabIndex: 0,
            } : {}
            return (
              <article className={`place-feature-card is-${availability}${isCardOpenable ? ' is-openable' : ''}`} key={featureId} {...openableProps}>
                <div className="place-feature-top">
                  <span aria-hidden="true">{featureIcons[featureId]}</span>
                  <span className={`place-status is-${availability}`}>{availabilityLabel(featureId, availability)}</span>
                </div>
                <h3>{featureId === 'sos' ? 'Trygghetslarm' : t(`features.${featureId}.title`)}</h3>
                <p>{featureId === 'sos' ? 'Skicka snabbt ett larm och din senaste plats till godkända familjemedlemmar.' : t(`features.${featureId}.body`)}</p>
                {featureId === 'batterySaver' && state.consentGranted ? (
                  <label className="place-toggle">
                    <input checked={state.batterySaverEnabled} type="checkbox" onChange={(event) => setState((current) => setBatterySaver(current, event.target.checked))} />
                    <span>{t('features.batterySaver.toggle')}</span>
                  </label>
                ) : null}
              </article>
            )
          })}
        </section>

        <section className="place-card place-disclaimer" aria-labelledby="place-disclaimer-title">
          <h2 id="place-disclaimer-title">{t('disclaimer.title')}</h2>
          <ul>
            <li>{t('limits.noGps')}</li>
            <li>{t('limits.noTracking')}</li>
            <li>{t('limits.noEmergency')}</li>
            <li>{t('limits.separateSprint')}</li>
          </ul>
        </section>

        {isFamilyMapOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('features.familyMap.title')}>
            <h3>{t('features.familyMap.title')}</h3>
            {familyLocationsLoaded && familyLocations.length > 0 ? (
              <ul>{familyLocations.map((location) => (
                <li key={`${location.family_id}:${location.user_id}`}>
                  <strong>{Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}</strong>
                  {location.accuracy_meters != null ? <span> ±{Math.round(location.accuracy_meters)} m</span> : null}
                  {location.location_recorded_at ? <small> {new Date(location.location_recorded_at).toLocaleString()}</small> : null}
                </li>
              ))}</ul>
            ) : familyLocationsLoaded ? <><p>{t('features.familyMap.empty')}</p><p>{t('features.familyMap.emptyBody')}</p></> : null}
            <button type="button" onClick={() => setIsFamilyMapOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {isChildLocationOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('features.childLocation.title')}>
            <h3>{t('features.childLocation.title')}</h3>
            {familyLocationsLoaded && familyLocations.length > 0 ? <>
              <p><strong>Senaste delade plats</strong></p>
              <p><strong>{Number(familyLocations[0].latitude).toFixed(5)}, {Number(familyLocations[0].longitude).toFixed(5)}</strong>{familyLocations[0].accuracy_meters != null ? <span> ±{Math.round(familyLocations[0].accuracy_meters)} m</span> : null}</p>
              {familyLocations[0].location_recorded_at ? <p>Uppdaterad {new Date(familyLocations[0].location_recorded_at).toLocaleString()}</p> : null}
            </> : familyLocationsLoaded ? <><p>{t('features.childLocation.empty')}</p><p>{t('features.childLocation.emptyBody')}</p></> : null}
            <button type="button" onClick={() => setIsChildLocationOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {isStatusOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('features.status.title')}>
            <h3>{t('features.status.title')}</h3>
            {familyLocationsLoaded && familyLocations.length > 0 ? <>
              <p><strong>Platsdelning aktiv</strong></p><p>Senaste platsen har tagits emot från familjen.</p>
              {familyLocations[0].location_recorded_at ? <p>Senast uppdaterad {new Date(familyLocations[0].location_recorded_at).toLocaleString()}</p> : null}
              {familyLocations[0].accuracy_meters != null ? <p>Noggrannhet ±{Math.round(familyLocations[0].accuracy_meters)} m</p> : null}
            </> : familyLocationsLoaded ? <><p>{t('features.status.empty')}</p><p>{t('features.status.emptyBody')}</p></> : null}
            <button type="button" onClick={() => setIsStatusOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {isSafePlacesOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('features.safePlaces.title')}>
            <h3>{t('features.safePlaces.title')}</h3>
            {safePlacesLoaded && safePlaces.length > 0 ? <ul>{safePlaces.map((place) => (
              <li key={place.id}>
                <strong>{place.name}</strong>{' '}<span>{Number(place.latitude).toFixed(5)}, {Number(place.longitude).toFixed(5)}</span>{' '}<small>radie {Math.round(place.radius_meters)} m</small>{' '}
                <button type="button" onClick={() => handleDeleteSafePlace(place.id)}>Radera</button>
                <div><strong>Platsnotiser</strong>
                  <label className="place-toggle"><input type="checkbox" disabled /><span>Notis när personen kommer hit</span></label>
                  <label className="place-toggle"><input type="checkbox" disabled /><span>Notis när personen lämnar platsen</span></label>
                  <small>Inte ansluten ännu</small>
                </div>
              </li>
            ))}</ul> : safePlacesLoaded && !safePlacesError ? <><p>{t('features.safePlaces.empty')}</p><p>Spara din senaste egna delade GPS-position som Hem, Skola eller en annan trygg plats.</p></> : null}
            <form onSubmit={handleAddSafePlace}>
              <label>Namn på trygg plats<input type="text" maxLength={80} placeholder="Hem eller Skola" value={safePlaceName} onChange={(event) => setSafePlaceName(event.target.value)} /></label>
              <button type="submit" disabled={!safePlaceName.trim() || safePlaceSaving}>{safePlaceSaving ? 'Sparar…' : 'Spara senaste plats'}</button>
            </form>
            {safePlacesError ? <p role="alert">{safePlacesError}</p> : null}
            <button type="button" onClick={() => setIsSafePlacesOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {isSosOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label="Trygghetslarm">
            <h3>🛡️ Trygghetslarm</h3>
            <p><strong>Vad har hänt?</strong></p>
            <div className="place-safety-alert-choices">
              {safetyAlertChoices.map(([icon, label]) => (
                <button key={label} type="button" disabled title="Inte ansluten ännu">
                  <span aria-hidden="true">{icon}</span> {label}
                </button>
              ))}
            </div>
            <p><small>Trygghetslarm till familjen är inte anslutet ännu. När det kopplas skickas vald anledning, tid och senaste kända plats.</small></p>
            <p><strong>Vid akut fara – ring 112.</strong></p>
            <button type="button" onClick={() => setIsSosOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {isAllOkOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('features.allOkCheckin.title')}>
            <h3>{t('features.allOkCheckin.title')}</h3><p>{t('features.allOkCheckin.empty')}</p><p>{t('features.allOkCheckin.emptyBody')}</p>
            <button type="button" onClick={() => setIsAllOkOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {isPlaceHistoryOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('features.placeHistory.title')}>
            <h3>{t('features.placeHistory.title')}</h3><p>{t('features.placeHistory.empty')}</p><p>{t('features.placeHistory.emptyBody')}</p>
            <button type="button" onClick={() => setIsPlaceHistoryOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {isBatterySaverOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('features.batterySaver.title')}>
            <h3>{t('features.batterySaver.title')}</h3><p>{state.batterySaverEnabled ? t('features.batterySaver.statusOn') : t('features.batterySaver.statusOff')}</p><p>{t('features.batterySaver.disclaimer')}</p>
            <label className="place-toggle"><input checked={state.batterySaverEnabled} type="checkbox" onChange={(event) => setState((current) => setBatterySaver(current, event.target.checked))} /><span>{t('features.batterySaver.toggle')}</span></label>
            <button type="button" onClick={() => setIsBatterySaverOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {isSharingSettingsOpen && state.consentGranted ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('features.sharingSettings.title')}>
            <h3>{t('features.sharingSettings.title')}</h3><p>{state.sharingEnabled ? t('features.sharingSettings.statusOn') : t('features.sharingSettings.statusOff')}</p><p>{t('features.sharingSettings.disclaimer')}</p>
            <label className="place-toggle"><input checked={state.sharingEnabled} type="checkbox" onChange={(event) => setState((current) => setPlaceSharing(current, event.target.checked))} /><span>{t('consent.sharingToggle')}</span></label>
            <button type="button" onClick={() => setIsSharingSettingsOpen(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}
      </div>
    </AppSection>
  )
}

export default PlaceSection

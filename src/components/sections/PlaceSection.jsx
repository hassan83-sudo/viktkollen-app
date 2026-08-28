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

const featureIcons = {
  familyMap: '🗺',
  childLocation: '📍',
  status: '🏫',
  safePlaces: '🏠',
  placeNotifications: '🔔',
  sos: '🆘',
  allOkCheckin: '✓',
  placeHistory: '🕘',
  batterySaver: '🔋',
  sharingSettings: '⚙',
}

function PlaceSection({ activeSection }) {
  const { t } = useTranslation('place')
  const [state, setState] = useState(() => loadPlaceState())

  useEffect(() => {
    savePlaceState(state)
  }, [state])

  function availabilityLabel(availability) {
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
            <input
              checked={state.consentGranted}
              type="checkbox"
              onChange={(event) => setState((current) => setPlaceConsent(current, event.target.checked))}
            />
            <span>{t('consent.toggle')}</span>
          </label>
          {state.consentGranted ? (
            <label className="place-toggle">
              <input
                checked={state.sharingEnabled}
                type="checkbox"
                onChange={(event) => setState((current) => setPlaceSharing(current, event.target.checked))}
              />
              <span>{t('consent.sharingToggle')}</span>
            </label>
          ) : null}
          <p className="place-consent-note">{t('consent.note')}</p>
        </section>

        <section className="place-feature-grid" aria-label={t('featuresAria')}>
          {placeFeatureIds.map((featureId) => {
            const availability = getPlaceFeatureAvailability(featureId, state)
            return (
              <article className={`place-feature-card is-${availability}`} key={featureId}>
                <div className="place-feature-top">
                  <span aria-hidden="true">{featureIcons[featureId]}</span>
                  <span className={`place-status is-${availability}`}>{availabilityLabel(availability)}</span>
                </div>
                <h3>{t(`features.${featureId}.title`)}</h3>
                <p>{t(`features.${featureId}.body`)}</p>
                {featureId === 'batterySaver' && state.consentGranted ? (
                  <label className="place-toggle">
                    <input
                      checked={state.batterySaverEnabled}
                      type="checkbox"
                      onChange={(event) => setState((current) => setBatterySaver(current, event.target.checked))}
                    />
                    <span>{t('features.batterySaver.toggle')}</span>
                  </label>
                ) : null}
                {featureId === 'sos' ? (
                  <button className="place-action is-disabled" disabled type="button">
                    {t('features.sos.action')}
                  </button>
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
      </div>
    </AppSection>
  )
}

export default PlaceSection

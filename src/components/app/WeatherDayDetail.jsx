import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { formatWeatherValue } from '../../services/overviewLiveContext.js'
import { loadOverviewWeather } from '../../services/overviewWeather.js'
import useOverviewStageLock from './useOverviewStageLock.js'

function formatUpdatedAt(value, locale) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function WeatherDayDetail({
  initialWeather = null,
  onClose,
  preferDevice = false,
}) {
  const { t, i18n } = useTranslation('home')
  useOverviewStageLock(onClose)
  const [weather, setWeather] = useState(initialWeather)
  const [status, setStatus] = useState(initialWeather?.hasLiveWeather ? 'ready' : 'loading')
  const [errorLabel, setErrorLabel] = useState('')
  const overlay = typeof document === 'undefined' ? null : document.body

  useEffect(() => {
    let cancelled = false

    async function loadDay() {
      const needsHourly = !initialWeather?.hourly?.length
      if (initialWeather?.hasLiveWeather && !needsHourly) {
        setWeather(initialWeather)
        setStatus('ready')
        return
      }

      setStatus('loading')
      setErrorLabel('')
      try {
        const next = await loadOverviewWeather({ preferDevice, includeHourly: true })
        if (cancelled) return
        setWeather(next)
        setStatus(next.hasLiveWeather ? 'ready' : 'error')
        if (!next.hasLiveWeather) setErrorLabel(t('weatherNotConnected'))
      } catch {
        if (cancelled) return
        setStatus('error')
        setErrorLabel(t('weatherNotConnected'))
      }
    }

    loadDay()
    return () => {
      cancelled = true
    }
  }, [initialWeather, preferDevice, t])

  if (!overlay) return null

  const locale = i18n.language || 'sv-SE'
  const hourly = weather?.hourly || []
  const updatedLabel = formatUpdatedAt(weather?.updatedAt, locale)

  return createPortal(
    <div
      className="overview-weather-day-detail"
      role="dialog"
      aria-labelledby="overview-weather-day-title"
      aria-modal="true"
    >
      <header className="overview-weather-day-bar">
        <div>
          <p className="eyebrow">{weather?.city || t('weatherDay.fallbackCity')}</p>
          <h2 id="overview-weather-day-title">{t('weatherDay.title')}</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>
          {t('weatherDay.close')}
        </button>
      </header>

      {status === 'loading' && (
        <p className="overview-weather-day-status" aria-live="polite">{t('fetchingWeather')}</p>
      )}

      {status === 'error' && (
        <p className="overview-weather-day-status is-error" aria-live="polite">
          {errorLabel || t('weatherNotConnected')}
        </p>
      )}

      {status === 'ready' && weather?.hasLiveWeather && (
        <>
          <div className="overview-weather-day-summary">
            <span className="overview-weather-day-icon" aria-hidden="true">{weather.icon}</span>
            <div>
              <strong>{formatWeatherValue(weather.temperatureC, '°C')}</strong>
              <small>{weather.condition}</small>
            </div>
            <div className="overview-weather-day-facts">
              <span>{formatWeatherValue(weather.windSpeedMs, ' m/s')}</span>
              <span>{formatWeatherValue(weather.precipitationRiskPercent, ' %')}</span>
              <span>{weather.sunriseLabel} · {weather.sunsetLabel}</span>
            </div>
          </div>

          {hourly.length > 0 ? (
            <ul className="overview-weather-hourly-list" aria-label={t('weatherDay.hourlyAria')}>
              {hourly.map((hour) => (
                <li key={hour.time}>
                  <strong>{hour.timeLabel}</strong>
                  <span aria-hidden="true">{hour.icon}</span>
                  <span>{formatWeatherValue(hour.temperatureC, '°C')}</span>
                  <span>{formatWeatherValue(hour.precipitationRiskPercent, ' %')}</span>
                  <span>{formatWeatherValue(hour.windSpeedMs, ' m/s')}</span>
                  {hour.uvIndex !== null ? (
                    <span>{t('weatherDay.uv', { value: Math.round(hour.uvIndex) })}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="overview-weather-day-status">{t('weatherDay.noHourly')}</p>
          )}

          <footer className="overview-weather-day-footer">
            {updatedLabel ? (
              <span>{t('weatherDay.updated', { time: updatedLabel })}</span>
            ) : null}
            <span>{t('weatherDay.source', { source: weather.sourceLabel || 'Open-Meteo' })}</span>
          </footer>
        </>
      )}
    </div>,
    overlay,
  )
}

export default WeatherDayDetail

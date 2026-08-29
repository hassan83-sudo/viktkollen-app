import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import BodyAvatarTalkBar from './BodyAvatarTalkBar.jsx'
import BodyAvatarViewer from './BodyAvatarViewer.jsx'
import { getScanInputLabel } from '../../services/bodyAnalysisEstimates.js'
import { getAnalysisHistory, getLatestAnalysis } from '../../services/bodyAnalysisHistory.js'
import {
  BODY_AVATAR_REGIONS,
  VISUAL_SIMULATION_DISCLAIMER,
  buildBodyTimeline,
  createDefaultBodySimulationState,
  getBodySimulationSliders,
  isBodySimulationActive,
  normalizeBodySimulationState,
} from '../../services/bodyAvatarModel.js'
import {
  buildHomeBodyToday,
  formatCmLabel,
  formatKgLabel,
  formatSignedChange,
} from '../../services/homeBodyToday.js'

function formatScanDateTime(value, language) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat(language || 'sv-SE', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(parsed)
}

function listItems(value) {
  return (Array.isArray(value) ? value : [value]).map((item) => String(item || '').trim()).filter(Boolean)
}

function AvatarAccordion({ children, icon, id, isOpen, label, onToggle }) {
  return (
    <section className={`body-avatar-accordion ${isOpen ? 'is-open' : ''}`}>
      <button
        className="body-avatar-accordion-trigger"
        type="button"
        aria-controls={`body-avatar-section-${id}`}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>{icon} {label}</span>
        <span aria-hidden="true">{isOpen ? '⌃' : '›'}</span>
      </button>
      {isOpen && (
        <div className="body-avatar-accordion-content" id={`body-avatar-section-${id}`}>
          {children}
        </div>
      )}
    </section>
  )
}

function OverviewBodyScanStage({
  chatInput = '',
  currentWeight = null,
  isAiSpeaking = false,
  isListening = false,
  isVoiceConversationActive = false,
  isVoiceMuted = false,
  onChatInputChange,
  onClose,
  onLiveContextChange,
  onSendChatMessage,
  onStartScan,
  onStartVoiceInput,
  onStopAiVoiceResponse,
  onSurfaceChange,
  onToggleVoiceMute,
  onVoiceCleanup,
  onOpenSmartCamera,
  profile = {},
  smartCameraEnabled = false,
  voiceStatus = '',
  weather = null,
  weights = [],
}) {
  const { t, i18n } = useTranslation(['bodyScan', 'common'])
  const [history, setHistory] = useState(() => getAnalysisHistory())
  const [view, setView] = useState('front')
  const [compareMode, setCompareMode] = useState('simulation')
  const [holdOriginal, setHoldOriginal] = useState(false)
  const [showText, setShowText] = useState(false)
  const [openSection, setOpenSection] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [simulation, setSimulation] = useState(() => createDefaultBodySimulationState())

  const analysis = history[0] || getLatestAnalysis()
  const result = analysis?.result || null
  const today = useMemo(
    () => buildHomeBodyToday({ currentWeight, history, weather, weights }),
    [currentWeight, history, weather, weights],
  )
  const timeline = useMemo(
    () => buildBodyTimeline({
      currentKg: currentWeight,
      goalKg: profile?.goalWeight,
      startKg: profile?.startWeight,
    }),
    [currentWeight, profile?.goalWeight, profile?.startWeight],
  )
  const sliders = getBodySimulationSliders()
  const simulationActive = isBodySimulationActive(simulation)

  function toggleSection(section) {
    setOpenSection((current) => current === section ? '' : section)
  }

  useEffect(() => {
    function refresh() {
      setHistory(getAnalysisHistory())
    }
    window.addEventListener('viktkollen:body-analysis-history-changed', refresh)
    return () => window.removeEventListener('viktkollen:body-analysis-history-changed', refresh)
  }, [])

  // Scroll-lock, Escape handling and voice cleanup must only run on actual
  // mount/unmount of this stage - not on every weather/clothing refresh,
  // which would otherwise stop an active voice conversation mid-sentence.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    onSurfaceChange?.('body-avatar')

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      onSurfaceChange?.('coach')
      onVoiceCleanup?.()
    }
  }, [onClose, onSurfaceChange, onVoiceCleanup])

  useEffect(() => {
    onLiveContextChange?.({
      clothingAdvice: today.clothing,
      liveWeather: weather,
    })
  }, [onLiveContextChange, today.clothing, weather])

  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay) return null

  const { clothing, scan, untilSunset, weightTrend, wind } = today
  const strengths = listItems(result?.strengths).slice(0, 3)
  const improvements = listItems(result?.improvementAreas).slice(0, 3)
  const weatherReady = Boolean(weather?.hasLiveWeather)
  const kg30Ago = weightTrend.currentKg !== null && weightTrend.change30dKg !== null
    ? weightTrend.currentKg - weightTrend.change30dKg
    : null

  return createPortal(
    <div className="overview-body-scan-stage" role="dialog" aria-labelledby="overview-body-today-title" aria-modal="true">
      <div className="overview-body-scan-hero is-full-art">
        <p className="overview-body-scan-kicker">{t('yourBodyToday')}</p>
        <button className="overview-body-scan-close" type="button" onClick={onClose}>
          {t('close')}
        </button>
        <BodyAvatarViewer
          compareMode={compareMode}
          holdOriginal={holdOriginal}
          onViewChange={setView}
          selectedRegion={selectedRegion}
          simulationActive={simulationActive}
          view={view}
        />
      </div>

      <div className="overview-body-scan-panel">
        <BodyAvatarTalkBar
          chatInput={chatInput}
          isAiSpeaking={isAiSpeaking}
          isListening={isListening}
          isVoiceConversationActive={isVoiceConversationActive}
          isVoiceMuted={isVoiceMuted}
          onChatInputChange={onChatInputChange}
          onSendChatMessage={onSendChatMessage}
          onStartVoiceInput={onStartVoiceInput}
          onStopAiVoiceResponse={onStopAiVoiceResponse}
          onToggleText={() => setShowText((current) => !current)}
          onToggleVoiceMute={onToggleVoiceMute}
          showText={showText}
          voiceStatus={voiceStatus}
        />

        <div className="body-avatar-compare" role="group" aria-label={t('compareAria')}>
          <button className={compareMode === 'original' ? 'is-active' : ''} type="button" onClick={() => setCompareMode('original')}>
            {t('original')}
          </button>
          <button className={compareMode === 'simulation' ? 'is-active' : ''} type="button" onClick={() => setCompareMode('simulation')}>
            {t('simulation')}
          </button>
          <button
            type="button"
            onPointerDown={() => setHoldOriginal(true)}
            onPointerUp={() => setHoldOriginal(false)}
            onPointerLeave={() => setHoldOriginal(false)}
          >
            {t('showOriginal')}
          </button>
        </div>

        <section className="body-avatar-weight-summary" aria-label={t('yourBodyToday')}>
          {weightTrend.currentKg !== null ? (
            <>
              <p className="overview-body-today-weight">{formatKgLabel(weightTrend.currentKg)}</p>
              <div className="body-avatar-weight-change">
                {weightTrend.change7dKg !== null && (
                  <p>{formatSignedChange(weightTrend.change7dKg, 'kg')} · {t('days7')}</p>
                )}
                {weightTrend.change30dKg !== null && (
                  <p>{formatSignedChange(weightTrend.change30dKg, 'kg')} · {t('days30')}</p>
                )}
              </div>
              {weightTrend.change7dKg === null && weightTrend.change30dKg === null && (
                <p className="overview-body-scan-note">{t('noWeightChangeYet')}</p>
              )}
            </>
          ) : (
            <p>{t('noCurrentWeight')}</p>
          )}
        </section>

        <div className="body-avatar-accordion-list">
          <AvatarAccordion
            icon="↘"
            id="change"
            isOpen={openSection === 'change'}
            label={t('bodyChange')}
            onToggle={() => toggleSection('change')}
          >
            {scan.latest ? (
              <p>
                {t('latestScan')} {formatScanDateTime(scan.latest.createdAt, i18n.language) || t('unknownDate')}
                {scan.confidenceLabel ? ` · ${t('confidence')} ${scan.confidenceLabel}` : ''}
              </p>
            ) : (
              <p>{t('noPreviousScan')}</p>
            )}
            <div className="body-avatar-timeline">
              {timeline.startKg !== null && <p>{t('start')} {formatKgLabel(timeline.startKg)}</p>}
              {timeline.currentKg !== null && <p>{t('now')} {formatKgLabel(timeline.currentKg)}</p>}
              {timeline.goalKg !== null && <p>{t('goal')} {formatKgLabel(timeline.goalKg)}</p>}
            </div>
            {kg30Ago !== null && (
              <p>
                {t('ago30')} {formatKgLabel(kg30Ago)} → {t('now').toLocaleLowerCase(i18n.language)} {formatKgLabel(weightTrend.currentKg)}
              </p>
            )}
            {scan.previous ? (
              <>
                {scan.weight?.change !== null && scan.weight?.previous != null && (
                  <p>
                    {t('weight')} {formatKgLabel(scan.weight.previous)} → {formatKgLabel(scan.weight.current)}
                    {' '}
                    ({formatSignedChange(scan.weight.change, 'kg')})
                  </p>
                )}
                {scan.measurements.map((item) => (
                  <p key={item.key}>
                    {item.name}
                    {item.previous !== null && item.current !== null
                      ? ` ${formatCmLabel(item.previous)} → ${formatCmLabel(item.current)} · ${item.changeLabel}`
                      : ` ${item.changeLabel}`}
                  </p>
                ))}
                <p className="overview-body-scan-note">
                  {t('aiEstimateNote')}
                </p>
              </>
            ) : (
              <p>{t('noPreviousCompare')}</p>
            )}
            {strengths.length > 0 && (
              <>
                <h3>{t('strengths')}</h3>
                <ul>{strengths.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            {improvements.length > 0 && (
              <>
                <h3>{t('followUp')}</h3>
                <ul>{improvements.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            {result?.scanInput && <p>{t('basis')}: {getScanInputLabel(result.scanInput)}</p>}
            {result?.bodyComposition && <p>{t('bodyComposition')}: {result.bodyComposition}</p>}
            {result?.posture && <p>{t('posture')}: {result.posture}</p>}
            <p className="overview-body-scan-note">
              {result?.safetyNote || result?.limitations?.[0] || t('safetyFallback')}
            </p>
          </AvatarAccordion>

          <AvatarAccordion
            icon="☀"
            id="weather"
            isOpen={openSection === 'weather'}
            label={t('weatherClothes')}
            onToggle={() => toggleSection('weather')}
          >
            <h3>{weatherReady ? t('weatherTodayIn', { city: weather.city }) : t('weatherToday')}</h3>
            {weatherReady ? (
              <>
                <p>{weather.icon} {Math.round(weather.temperatureC)}°C · {weather.condition}</p>
                <p>
                  {t('feelsLike')} {Number.isFinite(weather.feelsLikeC) ? `${Math.round(weather.feelsLikeC)}°C` : t('missing')}
                </p>
                <p>
                  {t('wind')} {Number.isFinite(weather.windSpeedMs) ? `${Math.round(weather.windSpeedMs)} m/s` : t('missing')}
                  {wind.label ? ` · ${wind.label}` : ''}
                </p>
                <p>
                  {t('rainRisk')} {Number.isFinite(weather.precipitationRiskPercent)
                    ? `${Math.round(weather.precipitationRiskPercent)} %`
                    : t('missing')}
                </p>
                <p>{t('sunrise')} {weather.sunrise ? weather.sunriseLabel : t('missing')}</p>
                <p>
                  {t('sunset')} {weather.sunset ? weather.sunsetLabel : t('missing')}
                  {untilSunset ? ` · ${untilSunset}` : ''}
                </p>
              </>
            ) : (
              <p>{t('noWeather')}</p>
            )}
            <h3>{t('clothingAdvice')}</h3>
            {clothing.available
              ? clothing.lines.map((line) => <p key={line}>{line}</p>)
              : <p>{clothing.emptyLabel}</p>}
          </AvatarAccordion>

          <AvatarAccordion
            icon="✨"
            id="editor"
            isOpen={openSection === 'editor'}
            label={t('changeBody')}
            onToggle={() => toggleSection('editor')}
          >
            <h3>{t('bodyShape')}</h3>
            <p>{t('visualSimulation')}</p>
            <p className="overview-body-scan-note">{VISUAL_SIMULATION_DISCLAIMER}</p>
            <div className="body-avatar-regions">
              {BODY_AVATAR_REGIONS.map((region) => (
                <button
                  className={selectedRegion === region.label ? 'is-active' : ''}
                  key={region.id}
                  type="button"
                  onClick={() => setSelectedRegion(region.label)}
                >
                  {region.label}
                </button>
              ))}
            </div>
            {sliders.map((slider) => (
              <label className="body-avatar-slider" key={slider.id}>
                <span>{slider.label}</span>
                <input
                  max={100}
                  min={-100}
                  type="range"
                  value={simulation[slider.id]}
                  onChange={(event) => {
                    setSimulation((current) => normalizeBodySimulationState({
                      ...current,
                      [slider.id]: event.target.value,
                    }))
                  }}
                />
                <span>{slider.less} · {slider.more}</span>
              </label>
            ))}
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSimulation(createDefaultBodySimulationState())
                setSelectedRegion('')
              }}
            >
              {t('reset')}
            </button>
          </AvatarAccordion>

          {smartCameraEnabled && (
          <AvatarAccordion
            icon="⌾"
            id="camera"
            isOpen={openSection === 'camera'}
            label={t('smartCamera')}
            onToggle={() => toggleSection('camera')}
          >
            <h3>{t('smartCamera')}</h3>
            <p className="overview-body-scan-note">
              {t('smartCameraNote')}
            </p>
            {onOpenSmartCamera && (
              <button className="secondary-button" type="button" onClick={onOpenSmartCamera}>
                {t('openSmartCamera')}
              </button>
            )}
            <button className="secondary-button" type="button" onClick={onStartScan}>
              {t('openBodyScan')}
            </button>
          </AvatarAccordion>
          )}
        </div>

        <div className="overview-body-scan-actions">
          <button className="primary-button" type="button" onClick={onStartScan}>
            {analysis ? t('newScan') : t('startScan')}
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            {t('back')}
          </button>
        </div>
      </div>
    </div>,
    overlay,
  )
}

export default OverviewBodyScanStage

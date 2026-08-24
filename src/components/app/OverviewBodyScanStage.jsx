import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

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
import {
  futureSmartCameraModes,
  futureSmartCameraPrivacy,
  getExistingCameraEntryPoints,
} from '../../services/smartCameraIntent.js'

function formatScanDateTime(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(parsed)
}

function listItems(value) {
  return (Array.isArray(value) ? value : [value]).map((item) => String(item || '').trim()).filter(Boolean)
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
  profile = {},
  voiceStatus = '',
  weather = null,
  weights = [],
}) {
  const [history, setHistory] = useState(() => getAnalysisHistory())
  const [view, setView] = useState('front')
  const [compareMode, setCompareMode] = useState('simulation')
  const [holdOriginal, setHoldOriginal] = useState(false)
  const [showText, setShowText] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [showCameraHub, setShowCameraHub] = useState(false)
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
  const cameras = getExistingCameraEntryPoints()

  useEffect(() => {
    function refresh() {
      setHistory(getAnalysisHistory())
    }
    window.addEventListener('viktkollen:body-analysis-history-changed', refresh)
    return () => window.removeEventListener('viktkollen:body-analysis-history-changed', refresh)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    onSurfaceChange?.('body-avatar')
    onLiveContextChange?.({
      clothingAdvice: today.clothing,
      liveWeather: weather,
    })

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
  }, [onClose, onLiveContextChange, onSurfaceChange, onVoiceCleanup, today.clothing, weather])

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
        <p className="overview-body-scan-kicker">Din kropp idag</p>
        <button className="overview-body-scan-close" type="button" onClick={onClose}>
          Stäng
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
        <p className="eyebrow">Kroppsscanning</p>
        <h2 id="overview-body-today-title">Din kropp idag</h2>

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

        <div className="body-avatar-compare" role="group" aria-label="Original eller simulering">
          <button className={compareMode === 'original' ? 'is-active' : ''} type="button" onClick={() => setCompareMode('original')}>
            Original
          </button>
          <button className={compareMode === 'simulation' ? 'is-active' : ''} type="button" onClick={() => setCompareMode('simulation')}>
            Simulering
          </button>
          <button
            type="button"
            onPointerDown={() => setHoldOriginal(true)}
            onPointerUp={() => setHoldOriginal(false)}
            onPointerLeave={() => setHoldOriginal(false)}
          >
            Visa original
          </button>
        </div>

        <section className="overview-body-today-card" aria-label="Din kropp idag">
          {weightTrend.currentKg !== null ? (
            <>
              <p className="overview-body-today-weight">{formatKgLabel(weightTrend.currentKg)}</p>
              {weightTrend.change7dKg !== null && (
                <p>{formatSignedChange(weightTrend.change7dKg, 'kg')} senaste 7 dagarna</p>
              )}
              {weightTrend.change30dKg !== null && (
                <p>{formatSignedChange(weightTrend.change30dKg, 'kg')} senaste 30 dagarna</p>
              )}
              {weightTrend.change7dKg === null && weightTrend.change30dKg === null && (
                <p>Ingen viktförändring att jämföra ännu.</p>
              )}
              {weightTrend.trendLabel ? <p>{weightTrend.trendLabel}</p> : null}
            </>
          ) : (
            <p>Ingen aktuell vikt registrerad.</p>
          )}
          {scan.latest ? (
            <p>
              Senaste scanning {formatScanDateTime(scan.latest.createdAt) || 'okänt datum'}
              {scan.confidenceLabel ? ` · Säkerhet ${scan.confidenceLabel}` : ''}
            </p>
          ) : (
            <p>Ingen tidigare scanning.</p>
          )}
        </section>

        <section className="overview-body-today-card" aria-label="Kroppsförändring över tid">
          <h3>Kroppsförändring</h3>
          {timeline.startKg !== null && <p>Start {formatKgLabel(timeline.startKg)}</p>}
          {timeline.currentKg !== null && <p>Nu {formatKgLabel(timeline.currentKg)}</p>}
          {timeline.goalKg !== null && <p>Mål {formatKgLabel(timeline.goalKg)}</p>}
          {kg30Ago !== null && (
            <p>
              För 30 dagar sedan {formatKgLabel(kg30Ago)} → nu {formatKgLabel(weightTrend.currentKg)}
            </p>
          )}
          {timeline.startKg === null && timeline.goalKg === null && kg30Ago === null && (
            <p>Ingen start-, mål- eller 30-dagarsvikt att visa ännu.</p>
          )}
        </section>

        <section className="overview-body-today-card" aria-label="Din förändring">
          <h3>Din förändring</h3>
          {scan.previous ? (
            <>
              <p>Sedan förra scanningen</p>
              {scan.weight?.change !== null && scan.weight?.previous != null && (
                <p>
                  Vikt {formatKgLabel(scan.weight.previous)} → {formatKgLabel(scan.weight.current)}
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
                AI-uppskattade mått är ungefärliga, inte exakta medicinska mätningar.
              </p>
            </>
          ) : (
            <p>Ingen tidigare scanning att jämföra med.</p>
          )}
        </section>

        <section className="overview-body-today-card" aria-label="Vädret idag">
          <h3>{weatherReady ? `Vädret idag i ${weather.city}` : 'Vädret idag'}</h3>
          {weatherReady ? (
            <>
              <p>{weather.icon} {Math.round(weather.temperatureC)}°C · {weather.condition}</p>
              <p>
                Känns som
                {' '}
                {Number.isFinite(weather.feelsLikeC) ? `${Math.round(weather.feelsLikeC)}°C` : 'saknas'}
              </p>
              <p>
                Vind {Number.isFinite(weather.windSpeedMs) ? `${Math.round(weather.windSpeedMs)} m/s` : 'saknas'}
                {wind.label ? ` · ${wind.label}` : ''}
              </p>
              <p>
                Regnrisk
                {' '}
                {Number.isFinite(weather.precipitationRiskPercent)
                  ? `${Math.round(weather.precipitationRiskPercent)} %`
                  : 'saknas'}
              </p>
              <p>Soluppgång {weather.sunrise ? weather.sunriseLabel : 'saknas'}</p>
              <p>
                Solnedgång {weather.sunset ? weather.sunsetLabel : 'saknas'}
                {untilSunset ? ` · ${untilSunset}` : ''}
              </p>
            </>
          ) : (
            <p>Ingen väderdata.</p>
          )}
        </section>

        <section className="overview-body-today-card" aria-label="Vad passar att ha på sig">
          <h3>Vad passar att ha på sig?</h3>
          {clothing.available ? clothing.lines.map((line) => <p key={line}>{line}</p>) : <p>{clothing.emptyLabel}</p>}
        </section>

        {showEditor && (
          <section className="overview-body-today-card" aria-label="Kroppsform">
            <h3>KROPPSFORM</h3>
            <p>VISUELL SIMULERING</p>
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
              Återställ
            </button>
          </section>
        )}

        {showCameraHub && (
          <section className="overview-body-today-card" aria-label="Smart kamera">
            <h3>Smart kamera</h3>
            <p className="overview-body-scan-note">
              Ingen visuell detektion är aktiv. Live preview ska stanna lokalt.
              {futureSmartCameraPrivacy.noHiddenRecording ? ' Ingen dold inspelning.' : ''}
            </p>
            {futureSmartCameraModes.map((mode) => (
              <p key={mode}>
                {mode === 'body-scan'
                  ? `body-scan · tillgänglig via ${cameras.bodyVideo}`
                  : `${mode} · inte implementerat`}
              </p>
            ))}
            <button className="secondary-button" type="button" onClick={onStartScan}>
              Öppna kroppsscanning
            </button>
          </section>
        )}

        {strengths.length > 0 && (
          <section>
            <h3>Styrkor</h3>
            <ul>{strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        )}
        {improvements.length > 0 && (
          <section>
            <h3>Att följa</h3>
            <ul>{improvements.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        )}
        {result?.scanInput && <p>Underlag: {getScanInputLabel(result.scanInput)}</p>}
        {result?.bodyComposition && <p>Kroppssammansättning: {result.bodyComposition}</p>}
        {result?.posture && <p>Hållning: {result.posture}</p>}

        <p className="overview-body-scan-note">
          {result?.safetyNote || result?.limitations?.[0] || 'En bildanalys är en visuell uppskattning, inte en medicinsk mätning.'}
        </p>

        <div className="overview-body-scan-actions">
          <button className="secondary-button" type="button" onClick={() => setShowEditor((current) => !current)}>
            Ändra kropp
          </button>
          <button className="secondary-button" type="button" onClick={() => setShowCameraHub((current) => !current)}>
            Smart kamera
          </button>
          <button className="primary-button" type="button" onClick={onStartScan}>
            {analysis ? 'Ny scanning' : 'Starta scanning'}
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            Tillbaka
          </button>
        </div>
      </div>
    </div>,
    overlay,
  )
}

export default OverviewBodyScanStage

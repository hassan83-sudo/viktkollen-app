import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  getConfidenceLabel,
  getScanInputLabel,
} from '../../services/bodyAnalysisEstimates.js'
import { getLatestAnalysis } from '../../services/bodyAnalysisHistory.js'

const bodyScanImage = '/viktkollen-body-scan.png'

const bodyOverviewMarkers = [
  { label: 'Axlar', key: 'shoulderWidthCm', x: 50, y: 18 },
  { label: 'Armar', key: null, x: 18, y: 38 },
  { label: 'Midja', key: 'waistCm', x: 78, y: 46 },
  { label: 'Höfter', key: 'hipCm', x: 22, y: 60 },
  { label: 'Bröst', key: 'chestCm', x: 76, y: 30 },
]

function formatKg(value) {
  if (!Number.isFinite(Number(value))) return ''
  return Number(value).toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
  })
}

function formatRange(min, max, unit) {
  if (!Number.isFinite(Number(min)) || !Number.isFinite(Number(max))) return ''
  return `${formatKg(min)}–${formatKg(max)} ${unit}`
}

function formatScanDate(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

function listItems(value) {
  return (Array.isArray(value) ? value : [value]).map((item) => String(item || '').trim()).filter(Boolean)
}

function measurementLabel(key) {
  return {
    chestCm: 'Bröst',
    hipCm: 'Höft',
    shoulderWidthCm: 'Axlar',
    waistCm: 'Midja',
  }[key] || key
}

function OverviewBodyScanStage({ onClose, onStartScan }) {
  const [analysis, setAnalysis] = useState(() => getLatestAnalysis())
  const result = analysis?.result || null

  useEffect(() => {
    function refresh() {
      setAnalysis(getLatestAnalysis())
    }

    window.addEventListener('viktkollen:body-analysis-history-changed', refresh)
    return () => window.removeEventListener('viktkollen:body-analysis-history-changed', refresh)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const facts = useMemo(() => {
    if (!result) return []

    const factsList = [
      result.summary && { label: 'Sammanfattning', value: result.summary },
      result.bodyComposition && { label: 'Kroppssammansättning', value: result.bodyComposition },
      result.posture && { label: 'Hållning', value: result.posture },
      result.estimatedWeight && {
        label: 'Uppskattad vikt',
        value: formatRange(result.estimatedWeight.minKg, result.estimatedWeight.maxKg, 'kg'),
      },
      result.measuredWeight?.valueKg && {
        label: 'Registrerad vikt',
        value: `${formatKg(result.measuredWeight.valueKg)} kg`,
      },
      (result.dataQuality || result.confidence) && {
        label: 'Säkerhet',
        value: getConfidenceLabel(result.dataQuality || result.confidence),
      },
      result.scanInput && { label: 'Underlag', value: getScanInputLabel(result.scanInput) },
    ].filter(Boolean)

    Object.entries(result.estimatedMeasurements || {}).forEach(([key, estimate]) => {
      const range = formatRange(estimate?.min, estimate?.max, 'cm')
      if (!range) return
      factsList.push({ label: measurementLabel(key), value: range })
    })

    return factsList
  }, [result])

  const strengths = listItems(result?.strengths).slice(0, 4)
  const improvements = listItems(result?.improvementAreas).slice(0, 4)
  const nextSteps = listItems(result?.nextSteps).slice(0, 3)
  const overlay = typeof document === 'undefined' ? null : document.body

  if (!overlay) return null

  return createPortal(
    <div className="overview-body-scan-stage" role="dialog" aria-labelledby="overview-body-scan-title" aria-modal="true">
      <div className="overview-body-scan-hero">
        <img alt="Kroppsscanning" src={bodyScanImage} />
        {bodyOverviewMarkers.map((marker) => {
          const estimate = marker.key ? result?.estimatedMeasurements?.[marker.key] : null
          const range = estimate ? formatRange(estimate.min, estimate.max, 'cm') : ''
          return (
            <span
              className="overview-body-scan-marker"
              key={marker.label}
              style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            >
              <strong>{marker.label}</strong>
              <small>{range || 'Följs över tid'}</small>
            </span>
          )
        })}
        <button className="overview-body-scan-close" type="button" onClick={onClose}>
          Stäng
        </button>
      </div>

      <div className="overview-body-scan-panel">
        <p className="eyebrow">Kroppsscanning</p>
        <h2 id="overview-body-scan-title">Din kropp, i full bild</h2>
        {analysis ? (
          <p className="overview-body-scan-meta">
            Senaste analys {formatScanDate(analysis.createdAt) || 'okänt datum'}
            {result?.source === 'ai' ? ' · AI-analys' : result?.source === 'mock' ? ' · Demoresultat' : ''}
          </p>
        ) : (
          <p className="overview-body-scan-meta">Ingen scanning sparad ännu. Ta tre vinklar för att se fakta här.</p>
        )}

        {facts.length > 0 && (
          <dl className="overview-body-scan-facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
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
        {nextSteps.length > 0 && (
          <section>
            <h3>Nästa steg</h3>
            <ul>{nextSteps.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        )}

        <p className="overview-body-scan-note">
          {result?.safetyNote || result?.limitations?.[0] || 'En bildanalys är en visuell uppskattning, inte en medicinsk mätning.'}
        </p>

        <div className="overview-body-scan-actions">
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
export const overviewBodyScanStageInternals = {
  bodyOverviewMarkers,
  formatRange,
}

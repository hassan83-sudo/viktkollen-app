import {
  getConfidenceLabel,
  getScanInputLabel,
} from '../services/bodyAnalysisEstimates'

function formatKg(value) {
  if (!Number.isFinite(Number(value))) return ''
  return Number(value).toLocaleString('sv-SE', { maximumFractionDigits: 1, minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1 })
}

function formatRange(min, max, unit) {
  if (!Number.isFinite(Number(min)) || !Number.isFinite(Number(max))) return ''
  return `${formatKg(min)}-${formatKg(max)} ${unit}`
}

function formatMeasuredWeightDate(date) {
  if (!date) return ''
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed)
}

const measurementLabels = {
  chestCm: 'Bröst',
  hipCm: 'Höft',
  shoulderWidthCm: 'Axelbredd',
  waistCm: 'Midja',
}

function BodyAnalysisResult({
  activeBodyMarker,
  angleComparison = [],
  bodyOverviewMarkers,
  formatAnalysisDate,
  getResultSections,
  getResultSourceLabel,
  onMarkerChange,
  renderResultValue,
  savedAnalysis,
}) {
  const result = savedAnalysis?.result
  const meaningText =
    result?.progressSummary ||
    result?.summary ||
    'Resultatet är en försiktig visuell uppskattning som främst hjälper dig följa utveckling över tid.'
  const nextActionText =
    result?.routineFeedback ||
    result?.nextSteps?.[0] ||
    'Ta nästa analys med liknande ljus, avstånd och kläder.'
  const limitationText =
    result?.limitations?.[0] ||
    result?.safetyNote ||
    'Analysen kan inte avgöra medicinska tillstånd, exakt vikt eller exakt kroppsfett.'
  const estimatedMeasurements = result?.estimatedMeasurements || {}
  const visibleMeasurements = Object.entries(measurementLabels)
    .map(([key, label]) => ({
      estimate: estimatedMeasurements[key],
      key,
      label,
    }))
    .filter((item) => item.estimate)

  if (!savedAnalysis) {
    return (
      <div className="progress-photo-ai-comparison">
        <div className="progress-photo-ai-heading">
          <div>
            <p className="eyebrow">Resultat</p>
            <h3>Ingen analys ännu</h3>
          </div>
          <span>Väntar</span>
        </div>
        <p>
          Resultatet visas här efter att du valt tre bilder och klickat på
          Analysera kroppen.
        </p>
      </div>
    )
  }

  return (
    <div className="progress-photo-ai-comparison">
      <div className="progress-photo-ai-heading">
        <div>
          <p className="eyebrow">Senaste sparade analys</p>
          <h3>{formatAnalysisDate(savedAnalysis.createdAt)}</h3>
        </div>
        <span>{getResultSourceLabel(savedAnalysis.result)}</span>
      </div>
      {savedAnalysis.result.source === 'mock' && (
        <p className="progress-photo-safety">
          Demoresultat visas eftersom AI inte kunde användas just nu.
        </p>
      )}
      {(savedAnalysis.frontPhoto?.preview || savedAnalysis.sidePhoto?.preview || savedAnalysis.backPhoto?.preview) && (
        <div className="progress-photo-ai-images is-three-angle">
          {[
            ['frontPhoto', 'Sparad bild framifrån'],
            ['sidePhoto', 'Sparad bild från sidan'],
            ['backPhoto', 'Sparad bild bakifrån'],
          ].map(([photoKey, alt]) => {
            const photo = savedAnalysis[photoKey]

            if (!photo?.preview) return null

            return (
              <figure key={photoKey}>
                <img src={photo.preview} alt={alt} />
                <figcaption>{photo.name}</figcaption>
              </figure>
            )
          })}
        </div>
      )}
      {angleComparison.length > 0 && (
        <div className="body-analysis-angle-comparison">
          <p className="report-heading">Före/efter per vinkel</p>
          {angleComparison.map((item) => (
            <div className="body-analysis-angle-row" key={item.view}>
              <strong>{item.label}</strong>
              <figure>
                <img src={item.before.preview} alt={`${item.label} före`} />
                <figcaption>Före</figcaption>
              </figure>
              <figure>
                <img src={item.after.preview} alt={`${item.label} efter`} />
                <figcaption>Efter</figcaption>
              </figure>
            </div>
          ))}
        </div>
      )}
      <div className="body-analysis-recommended-steps">
        <div>
          <p className="eyebrow">Analysrapport</p>
          <h3>Det här betyder resultatet</h3>
        </div>
        <p>{meaningText}</p>
        <p className="report-heading">Vad du kan göra till nästa gång</p>
        <p>{nextActionText}</p>
        <p className="report-heading">Vad analysen inte kan avgöra</p>
        <p>{limitationText}</p>
      </div>
      <div className="body-analysis-recommended-steps">
        <div>
          <p className="eyebrow">AI-kroppsanalys</p>
          <h3>Underlag och uppskattningar</h3>
        </div>
        <div className="progress-stat-grid">
          <div>
            <span>Underlag</span>
            <strong>{getScanInputLabel(result?.scanInput)}</strong>
          </div>
          <div>
            <span>Datakvalitet</span>
            <strong>{getConfidenceLabel(result?.dataQuality || result?.confidence)}</strong>
          </div>
          <div>
            <span>Senast registrerad vikt</span>
            <strong>{result?.measuredWeight ? `${formatKg(result.measuredWeight.valueKg)} kg` : 'Saknas'}</strong>
          </div>
          <div>
            <span>Registrerad</span>
            <strong>{result?.measuredWeight ? formatMeasuredWeightDate(result.measuredWeight.date) : 'Inte angivet'}</strong>
          </div>
          <div>
            <span>AI-uppskattad vikt</span>
            <strong>{result?.estimatedWeight ? formatRange(result.estimatedWeight.minKg, result.estimatedWeight.maxKg, 'kg') : 'Otillräckligt underlag'}</strong>
          </div>
          <div>
            <span>Säkerhet</span>
            <strong>{result?.estimatedWeight ? getConfidenceLabel(result.estimatedWeight.confidence) : 'Låg'}</strong>
          </div>
        </div>
        {result?.estimatedWeight && (
          <p className="settings-note">
            Mittpunkt cirka {formatKg(result.estimatedWeight.midpointKg)} kg. {result.estimatedWeight.basis} AI-uppskattning - inte en vägning.
          </p>
        )}
        {!result?.estimatedWeight && (
          <p className="settings-note">
            AI:n hittade inte tillräckligt underlag för en ansvarsfull viktuppskattning.
          </p>
        )}
      </div>
      <div className="body-analysis-recommended-steps">
        <div>
          <p className="eyebrow">Försiktiga estimat</p>
          <h3>Kroppsmått och sammansättning</h3>
        </div>
        {visibleMeasurements.length > 0 ? (
          <div className="progress-stat-grid">
            {visibleMeasurements.map(({ estimate, key, label }) => (
              <div key={key}>
                <span>{label}</span>
                <strong>{formatRange(estimate.min, estimate.max, 'cm')}</strong>
                <small>Säkerhet: {getConfidenceLabel(estimate.confidence)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="settings-note">
            Måttuppskattningar visas bara när längd/skala och bildkvalitet räcker.
          </p>
        )}
        {result?.bodyFatEstimate ? (
          <p className="settings-note">
            Möjligt visuellt intervall: {formatRange(result.bodyFatEstimate.minPercent, result.bodyFatEstimate.maxPercent, '%')}. Säkerhet: {getConfidenceLabel(result.bodyFatEstimate.confidence)}. Detta är inte en kroppsfettmätning.
          </p>
        ) : (
          <p className="settings-note">
            Kroppssammansättning visas utan kroppsfettstal när underlaget inte är defensibelt.
          </p>
        )}
        <p className="progress-photo-safety">
          Bildanalysen är en AI-uppskattning och ersätter inte våg, måttband eller medicinsk bedömning.
        </p>
      </div>
      {getResultSections(savedAnalysis.result).map((section) => (
        <div key={section.key}>
          <p className="report-heading">{section.label}</p>
          {renderResultValue(section.key, section.value)}
        </div>
      ))}
      <p className="report-heading">Visuell kroppsöversikt</p>
      <div className="progress-photo-ai-images" style={{ position: 'relative' }}>
        <figure>
          <svg
            aria-label="Enkel kroppsöversikt"
            role="img"
            viewBox="0 0 120 220"
          >
            <circle cx="60" cy="24" fill="currentColor" r="14" />
            <path
              d="M43 46 Q60 38 77 46 L88 108 Q75 122 72 151 L67 205 H53 L48 151 Q45 122 32 108 Z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="8"
            />
            <path
              d="M42 62 L18 118 M78 62 L102 118 M50 148 L40 205 M70 148 L80 205"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="8"
            />
          </svg>
          <figcaption>{activeBodyMarker.text}</figcaption>
        </figure>
        {bodyOverviewMarkers.map((marker) => (
          <button
            className="progress-photo-view-badge"
            key={marker.label}
            style={{
              left: `${marker.x}%`,
              position: 'absolute',
              top: `${marker.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            title={marker.text}
            type="button"
            onClick={() => onMarkerChange(marker)}
            onFocus={() => onMarkerChange(marker)}
          >
            {marker.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default BodyAnalysisResult

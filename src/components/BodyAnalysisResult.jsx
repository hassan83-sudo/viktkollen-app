function BodyAnalysisResult({
  activeBodyMarker,
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
          Resultatet visas här efter att du valt två bilder och klickat på
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
      {(savedAnalysis.frontPhoto?.preview || savedAnalysis.sidePhoto?.preview) && (
        <div className="progress-photo-ai-images">
          {savedAnalysis.frontPhoto?.preview && (
            <figure>
              <img
                src={savedAnalysis.frontPhoto.preview}
                alt="Sparad bild framifrån"
              />
              <figcaption>{savedAnalysis.frontPhoto.name}</figcaption>
            </figure>
          )}
          {savedAnalysis.sidePhoto?.preview && (
            <figure>
              <img
                src={savedAnalysis.sidePhoto.preview}
                alt="Sparad bild från sidan"
              />
              <figcaption>{savedAnalysis.sidePhoto.name}</figcaption>
            </figure>
          )}
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

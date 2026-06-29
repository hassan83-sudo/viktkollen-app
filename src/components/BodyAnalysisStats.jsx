function StatGrid({ items }) {
  return (
    <div className="body-analysis-stats">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}

function BodyAnalysisStats({
  analysisCount,
  latestAnalysisDate,
  latestInsights,
  nextAnalysisRecommendation,
  nextRecommendedSteps,
  progressIndicators,
  progressOverviewStats,
  progressStats,
  summaryText,
  weeklyFocus,
}) {
  return (
    <>
      <div className="body-analysis-summary">
        <div>
          <p className="eyebrow">Analystidslinje</p>
          <h3>
            {analysisCount > 0
              ? `${analysisCount} sparade analyser`
              : 'Ingen analys sparad ännu'}
          </h3>
        </div>
        <p>{summaryText}</p>
        <p>Du kan när som helst radera din lokala analysdata.</p>
      </div>
      <StatGrid items={progressStats} />
      <div className="body-analysis-progress">
        <div>
          <p className="eyebrow">Utveckling över tid</p>
          <h3>Samlad översikt</h3>
        </div>
        <div className="body-analysis-progress-grid">
          {progressOverviewStats.map((item) => (
            <div key={item.label}>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="body-analysis-weekly-focus">
        <p className="eyebrow">Nästa rekommenderade analys</p>
        <h3>{nextAnalysisRecommendation}</h3>
      </div>
      <div className="body-analysis-recommended-steps">
        <div>
          <p className="eyebrow">Mina insikter</p>
          <h3>Från senaste analysen</h3>
        </div>
        <ul>
          {latestInsights.map((insight) => (
            <li key={insight}>{insight}</li>
          ))}
        </ul>
      </div>
      <div className="body-analysis-weekly-focus">
        <p className="eyebrow">Veckans AI-fokus</p>
        <h3>{weeklyFocus}</h3>
      </div>
      <div className="body-analysis-recommended-steps">
        <div>
          <p className="eyebrow">Nästa rekommenderade steg</p>
          <h3>Fortsätt framåt</h3>
        </div>
        <ul>
          {nextRecommendedSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </div>
      <div className="body-analysis-progress">
        <div>
          <p className="eyebrow">Status</p>
          <h3>Översikt</h3>
        </div>
        <div className="body-analysis-progress-grid">
          {progressIndicators.map((indicator) => (
            <div key={indicator.label}>
              <span
                className={`body-analysis-status-dot is-${indicator.status}`}
                aria-hidden="true"
              />
              <small>{indicator.label}</small>
              <strong>{indicator.value}</strong>
            </div>
          ))}
        </div>
      </div>
      {analysisCount === 0 && !latestAnalysisDate && (
        <p className="progress-photo-safety">
          Ingen lokal analystidslinje finns just nu. Skapa din första analys för
          att börja följa förändringar över tid.
        </p>
      )}
    </>
  )
}

export default BodyAnalysisStats

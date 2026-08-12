import { useState } from 'react'

const typeLabels = {
  INSUFFICIENT_DATA: 'För lite data',
  NEEDS_ATTENTION: 'Följ upp',
  POSITIVE_TREND: 'Positiv trend',
  STABLE: 'Stabilt',
}

function ProgressInsightItem({ insight }) {
  return (
    <li className={`is-${insight.type.toLocaleLowerCase('sv-SE').replace(/_/g, '-')}`}>
      <div>
        <strong>{typeLabels[insight.type] || 'Insikt'}</strong>
        <span>{insight.title}</span>
      </div>
      <details>
        <summary>Varför?</summary>
        <p>{insight.why}</p>
        {insight.evidence.length > 0 && (
          <ul>
            {insight.evidence.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </details>
    </li>
  )
}

function ProgressInsights({ model, weeklySummary }) {
  const [showAll, setShowAll] = useState(false)
  const visibleInsights = showAll ? model.allInsights : model.mainInsights

  return (
    <section className="nutrition-card progress-card ai-progress-insights-card" id="progress-insights" aria-labelledby="progress-insights-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">AI Progress Insights V1</p>
          <h3 id="progress-insights-title">Framstegsinsikter</h3>
        </div>
        <span className="insight-coverage">{model.confidence.text}</span>
      </div>

      {visibleInsights.length ? (
        <ul className="progress-insight-list ai-progress-insight-list">
          {visibleInsights.map((insight) => (
            <ProgressInsightItem insight={insight} key={insight.id} />
          ))}
        </ul>
      ) : (
        <div className="nutrition-empty">
          <span>Fler registrerade dagar behövs för tydliga framstegsinsikter.</span>
        </div>
      )}

      <article className="insight-plan ai-progress-next-action">
        <span>Nästa steg</span>
        <p>{model.nextBestAction}</p>
      </article>

      <div className="coach-note">
        Datatäckning: {model.coverage.weightDays} viktdagar, {model.coverage.mealDays} måltidsdagar och {model.coverage.checkInDays} check-ins.
      </div>

      {weeklySummary && <div className="coach-note">Veckans sammanfattning: {weeklySummary}</div>}

      {model.allInsights.length > model.mainInsights.length && (
        <button className="secondary-button" type="button" onClick={() => setShowAll((current) => !current)}>
          {showAll ? 'Visa färre insikter' : 'Visa alla insikter'}
        </button>
      )}
    </section>
  )
}

export default ProgressInsights

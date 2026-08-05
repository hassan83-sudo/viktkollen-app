import { useMemo } from 'react'
import { buildHealthPredictionModel } from '../services/prediction/healthPredictionEngine.js'

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PredictionList({ emptyText, items, kind = 'prediction' }) {
  if (!items.length) return <p className="estimate-note">{emptyText}</p>

  return (
    <ul className="goals-list reminder-card-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title || item.metric || item.signal}</strong>
          <span>{item.explanation}</span>
          {kind === 'prediction' && <span>Confidence {item.confidence}%. {item.uncertainty}</span>}
          {item.contributingFactors?.length > 0 && (
            <span>Faktorer: {item.contributingFactors.join(' · ')}</span>
          )}
          {item.nextStep && <span>Nästa steg: {item.nextStep}</span>}
          {item.support && <span>Stöd: {item.support}</span>}
        </li>
      ))}
    </ul>
  )
}

function TrendGraph({ points }) {
  if (!points.length) return null

  return (
    <div className="report-v3-grid compact" aria-label="Härledda trendvärden">
      {points.map((point) => (
        <div className="report-v3-card" key={point.id}>
          <span>{point.label}</span>
          <strong>{point.value === null ? 'Saknas' : point.value}</strong>
          <p>Confidence {point.confidence}%</p>
        </div>
      ))}
    </div>
  )
}

function PredictionCenter({
  adaptiveCoachFeedback = {},
  checkIn = {},
  checkIns = [],
  goalsHabits = {},
  healthSnapshot = null,
  meals = [],
  nutritionGoals = {},
  profile = {},
  reminderState = {},
  today = '',
  weights = [],
}) {
  const model = useMemo(
    () => buildHealthPredictionModel({
      adaptiveCoachFeedback,
      checkIn,
      checkIns,
      goalsHabits,
      healthSnapshot,
      meals,
      nutritionGoals,
      profile,
      reminderState,
      today,
      weights,
    }, { analysisDate: today }),
    [adaptiveCoachFeedback, checkIn, checkIns, goalsHabits, healthSnapshot, meals, nutritionGoals, profile, reminderState, today, weights],
  )

  return (
    <section className="panel reminder-center" id="prediction-center" aria-labelledby="prediction-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Predictive Health Intelligence V1</p>
          <h2 id="prediction-center-heading">Prediction Center</h2>
        </div>
        <span className="insight-coverage">Confidence {model.confidence}%</span>
      </div>

      <div className="reminder-summary-grid">
        <Metric label="Coverage" value={model.coverage.text} />
        <Metric label="Predictions" value={model.predictions.length} />
        <Metric label="Warnings" value={model.warningSignals.length} />
        <Metric label="Opportunities" value={model.opportunities.length} />
      </div>

      <article>
        <h3>Trend graphs</h3>
        <TrendGraph points={model.trendGraph} />
      </article>

      <div className="reminder-columns">
        <article>
          <h3>Predictions</h3>
          <PredictionList emptyText="Mer data behövs för trygga prognoser." items={model.predictions} />
        </article>
        <article>
          <h3>Warning signals</h3>
          <PredictionList emptyText="Inga försiktiga varningssignaler just nu." items={model.warningSignals} kind="warning" />
        </article>
      </div>

      <article>
        <h3>Opportunities</h3>
        <PredictionList emptyText="Positiva möjligheter visas när underlaget räcker." items={model.opportunities} kind="opportunity" />
      </article>

      <p className="estimate-note">
        Prognoserna är regelbaserade, stödjande och ersätter inte medicinsk rådgivning.
      </p>
    </section>
  )
}

export default PredictionCenter

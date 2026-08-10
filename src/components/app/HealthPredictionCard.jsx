import { memo, useMemo } from 'react'
import { buildHealthPredictionModel } from '../../services/prediction/healthPredictionEngine.js'

function formatValue(value, suffix = '') {
  if (!Number.isFinite(Number(value))) return 'Saknas'

  return `${Math.round(Number(value)).toLocaleString('sv-SE')}${suffix}`
}

function HealthPredictionCard({
  adaptiveCoachFeedback = {},
  analysisDate,
  checkIn,
  foods = [],
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const model = useMemo(() => buildHealthPredictionModel({
    adaptiveCoachFeedback,
    checkIn,
    foods,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    profile,
    reminderState,
    today: analysisDate,
    weights,
  }, { analysisDate }), [
    adaptiveCoachFeedback,
    analysisDate,
    checkIn,
    foods,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    profile,
    reminderState,
    weights,
  ])
  const prediction = model.dashboard

  if (prediction.empty) {
    return (
      <section className="health-prediction-card is-empty" aria-label="Health Prediction">
        <div>
          <p className="eyebrow">Health Prediction</p>
          <h2>Logga några dagar till</h2>
          <span>Logga vikt, mat eller check-in några dagar till så börjar vi göra personliga prognoser.</span>
        </div>
        <strong>{prediction.confidence.label}</strong>
      </section>
    )
  }

  return (
    <section className="health-prediction-card" aria-label="Health Prediction">
      <div className="health-prediction-heading">
        <div>
          <p className="eyebrow">Health Prediction</p>
          <h2>Om nuvarande trend fortsätter...</h2>
        </div>
        <span className={`health-prediction-trend is-${prediction.trendStatus.color}`}>
          {prediction.trendStatus.symbol} {prediction.trendStatus.label}
        </span>
      </div>

      <div className="health-prediction-metrics">
        <div><span>📅 Beräknad måldag</span><strong>{prediction.estimatedGoalDate}</strong></div>
        <div><span>⚖️ Vikttrend 7 dagar</span><strong>{prediction.trend7Label}</strong></div>
        <div><span>📉 kg/vecka</span><strong>{prediction.kgPerWeek === null ? 'Saknas' : `${prediction.kgPerWeek.toLocaleString('sv-SE')} kg`}</strong></div>
        <div><span>❤️ Health Score nästa vecka</span><strong>{formatValue(prediction.healthScoreNextWeek, '/100')}</strong></div>
      </div>

      <div className="health-prediction-callout">
        <span>Rekommendation</span>
        <strong>{prediction.recommendation}</strong>
      </div>

      {prediction.insights.length > 0 && (
        <ul className="health-prediction-insights" aria-label="Personliga prediction-insikter">
          {prediction.insights.map((insight) => (
            <li key={insight}>{insight}</li>
          ))}
        </ul>
      )}

      <div className="health-prediction-footer">
        <span>Confidence: {prediction.confidence.label}</span>
        <span>{prediction.confidence.historyDays} dagar historik</span>
      </div>
    </section>
  )
}

export default memo(HealthPredictionCard)

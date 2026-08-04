import { useMemo } from 'react'
import { buildInsightsEngine } from '../services/insights/insightsEngine.js'

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function InsightList({ emptyText, items }) {
  if (!items.length) return <p className="estimate-note">{emptyText}</p>

  return (
    <ul className="goals-list reminder-card-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  )
}

function InsightsCenter({
  adaptiveCoachFeedback = {},
  checkIn = {},
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
    () => buildInsightsEngine({
      adaptiveCoachFeedback,
      checkIn,
      goalsHabits,
      healthSnapshot,
      meals,
      nutritionGoals,
      profile,
      reminderState,
      today,
      weights,
    }, { analysisDate: today, period: '90d' }),
    [adaptiveCoachFeedback, checkIn, goalsHabits, healthSnapshot, meals, nutritionGoals, profile, reminderState, today, weights],
  )

  return (
    <section className="panel reminder-center" id="insights-center" aria-labelledby="insights-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Insights V1</p>
          <h2 id="insights-center-heading">Insights Center</h2>
        </div>
        <span className="insight-coverage">Score {model.score}</span>
      </div>

      <div className="reminder-summary-grid">
        <Metric label="Momentum" value={model.momentum} />
        <Metric label="Consistency" value={model.consistency} />
        <Metric label="Adherence" value={model.adherence} />
        <Metric label="Coverage" value={`${model.coverage}%`} />
        <Metric label="Confidence" value={`${model.confidence}%`} />
      </div>

      <div className="reminder-columns">
        <article>
          <h3>Trends</h3>
          <InsightList
            emptyText="Mer data behövs för tydliga trender."
            items={[
              model.trends.weight,
              model.trends.protein,
              model.trends.calories,
              model.trends.steps,
              model.trends.reminderCompletion,
              model.trends.coachAcceptance,
            ].map((trend) => ({
              id: trend.id,
              text: trend.text,
              title: trend.label,
            }))}
          />
        </article>
        <article>
          <h3>Milestones</h3>
          <InsightList emptyText="Milstolpar visas när underlaget räcker." items={model.milestones} />
        </article>
      </div>

      <div className="reminder-columns">
        <article>
          <h3>Senaste förbättringar</h3>
          <InsightList emptyText="Inga tydliga förbättringssignaler ännu." items={model.improvementSignals} />
        </article>
        <article>
          <h3>Områden att fokusera på</h3>
          <InsightList emptyText="Inga tydliga regressionssignaler just nu." items={model.regressionSignals} />
        </article>
      </div>
    </section>
  )
}

export default InsightsCenter

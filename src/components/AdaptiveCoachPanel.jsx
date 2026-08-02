import { useMemo } from 'react'
import { buildAdaptiveCoach } from '../services/adaptiveCoachEngine.js'
import {
  buildAdaptiveCoachFeedbackSummary,
  updateAdaptiveCoachFeedback,
} from '../services/adaptiveCoachFeedback.js'

function MetricBadge({ label, value }) {
  return (
    <div className="health-dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function addDaysIso(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)

  return date.toISOString()
}

function RecommendationList({ onFeedback, recommendations }) {
  if (!recommendations.length) {
    return (
      <div className="empty-state">
        <h3>Mer historik behövs</h3>
        <p>Coachen behöver vikt, måltider eller check-ins för att prioritera nästa steg.</p>
      </div>
    )
  }

  return (
    <ol className="health-dashboard-list adaptive-coach-steps">
      {recommendations.map((item) => (
        <li key={item.id || `${item.area}-${item.title}`}>
          <strong>{item.title}</strong>
          <span>{item.text}</span>
          <small>{item.action}</small>
          <small>Senaste status: {item.feedbackStatusLabel || 'Ny'}</small>
          <div className="report-v3-actions adaptive-coach-actions">
            <button type="button" onClick={() => onFeedback(item, 'accepted')}>Acceptera</button>
            <button type="button" onClick={() => onFeedback(item, 'postponed', { postponedUntil: addDaysIso(1) })}>Skjut upp</button>
            <button type="button" onClick={() => onFeedback(item, 'completed')}>Klar</button>
            <button type="button" onClick={() => onFeedback(item, 'dismissed', { dismissedReason: 'Inte relevant' })}>Inte relevant</button>
          </div>
        </li>
      ))}
    </ol>
  )
}

function CompactList({ emptyText, items }) {
  if (!items.length) return <p>{emptyText}</p>

  return (
    <ul className="health-dashboard-list">
      {items.map((item) => (
        <li key={`${item.title}-${item.text}`}>
          <strong>{item.title}</strong>
          <span>{item.text || item.evidence}</span>
        </li>
      ))}
    </ul>
  )
}

function FeedbackHistory({ recentActions }) {
  if (!recentActions.length) return <p>Ingen feedback registrerad ännu.</p>

  return (
    <ul className="health-dashboard-list">
      {recentActions.map((entry) => (
        <li key={entry.id}>
          <strong>{entry.statusLabel}</strong>
          <span>{entry.title}</span>
          <small>{entry.at}</small>
        </li>
      ))}
    </ul>
  )
}

function AdaptiveCoachPanel({
  adaptiveCoachFeedback = {},
  analysisDate,
  checkIn,
  checkIns = [],
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  onAdaptiveCoachFeedbackChange,
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const data = useMemo(() => ({
    adaptiveCoachFeedback,
    checkIn,
    checkIns,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    profile,
    reminderState,
    weights,
  }), [adaptiveCoachFeedback, checkIn, checkIns, goalsHabits, healthSnapshot, meals, nutritionGoals, profile, reminderState, weights])
  const model = useMemo(
    () => buildAdaptiveCoach(data, { analysisDate, period: '30d' }),
    [analysisDate, data],
  )
  const feedbackSummary = useMemo(
    () => buildAdaptiveCoachFeedbackSummary(adaptiveCoachFeedback, {
      now: analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined,
    }),
    [adaptiveCoachFeedback, analysisDate],
  )
  const nextAction = model.recommendations[0]?.action || model.summary.todayFocus

  function handleFeedback(recommendation, status, options = {}) {
    if (!onAdaptiveCoachFeedbackChange) return

    onAdaptiveCoachFeedbackChange(updateAdaptiveCoachFeedback(
      adaptiveCoachFeedback,
      recommendation,
      status,
      options,
    ))
  }

  return (
    <section className="panel health-dashboard-v2 adaptive-coach-panel" id="adaptive-coach" aria-labelledby="adaptive-coach-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Smart Coach V4</p>
          <h2 id="adaptive-coach-heading">Adaptiv coachning</h2>
          <span>{model.analysisDate}. {model.coverage.text}</span>
        </div>
        <span className="insight-coverage">{model.confidence.label}</span>
      </div>

      <div className="health-dashboard-metrics">
        <MetricBadge label="Confidence" value={`${Math.round(model.confidence.value * 100).toLocaleString('sv-SE')}%`} />
        <MetricBadge label="Coverage" value={model.coverage.label} />
        <MetricBadge label="Coach score" value={feedbackSummary.completionRateLabel} />
        <MetricBadge label="Viktdata" value={`${model.coverage.weightDays} dagar`} />
        <MetricBadge label="Måltider" value={`${model.coverage.mealDays} dagar`} />
        <MetricBadge label="Check-ins" value={`${model.coverage.checkInDays} dagar`} />
      </div>

      <div className="health-dashboard-grid">
        <article className="health-dashboard-card">
          <div>
            <h3>Dagens fokus</h3>
            <p>{model.summary.todayFocus}</p>
          </div>
        </article>

        <article className="health-dashboard-card">
          <div>
            <h3>Veckans viktigaste förbättring</h3>
            <p>{model.summary.weeklyImprovement}</p>
          </div>
        </article>

        <article className="health-dashboard-card">
          <div>
            <h3>Vad som fungerar bra</h3>
          </div>
          <CompactList emptyText="Mer data behövs innan coachen lyfter framsteg." items={model.summary.workingWell} />
        </article>

        <article className="health-dashboard-card">
          <div>
            <h3>Riskområden</h3>
          </div>
          <CompactList emptyText="Inga tydliga riskområden i underlaget." items={model.riskAreas} />
        </article>
      </div>

      <div className="insight-plan">
        <h3>Rekommenderade nästa steg</h3>
        <p>Nästa rekommenderade åtgärd: {nextAction}</p>
        <RecommendationList onFeedback={handleFeedback} recommendations={model.recommendations} />
      </div>

      <div className="insight-plan">
        <h3>Senaste coachåtgärder</h3>
        <FeedbackHistory recentActions={feedbackSummary.recentActions} />
      </div>

      <p className="estimate-note">{model.safetyNote}</p>
    </section>
  )
}

export default AdaptiveCoachPanel

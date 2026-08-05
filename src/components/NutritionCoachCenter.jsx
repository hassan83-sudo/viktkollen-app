import { useMemo, useState } from 'react'
import { requestRemoteCoachSuggestions } from '../services/ai/remoteCoachService.js'
import { readDietaryPreferences } from '../services/nutrition/dietaryPreferences.js'
import {
  buildMinimalNutritionCoachAiContext,
  buildNutritionCoachModel,
} from '../services/nutrition/nutritionCoachEngine.js'

function ScoreBadge({ label, value }) {
  return (
    <div className="health-dashboard-metric">
      <span>{label}</span>
      <strong>{value === null || value === undefined ? 'Saknas' : `${value}/100`}</strong>
    </div>
  )
}

function MealQualityList({ entries }) {
  if (!entries.length) return <p>Inga måltider att analysera ännu.</p>

  return (
    <ul className="health-dashboard-list">
      {entries.slice(0, 8).map((entry) => (
        <li key={entry.meal.id || `${entry.date}-${entry.quality.title}`}>
          <strong>{entry.quality.title}: {entry.quality.score}/100</strong>
          <span>{entry.quality.explanation}</span>
          <details>
            <summary>Visa poängförklaring</summary>
            <ul>
              {Object.entries(entry.quality.components).map(([key, component]) => (
                <li key={key}>{key}: {component.score}/{component.max}. {component.explanation}</li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  )
}

function Timeline({ timeline }) {
  return (
    <ul className="health-dashboard-list">
      {timeline.byType.map((entry) => (
        <li key={entry.type}>
          <strong>{entry.type}</strong>
          <span>{entry.missing ? 'Saknas i dagens logg' : `${entry.mealCount} måltid(er)`}</span>
        </li>
      ))}
    </ul>
  )
}

export default function NutritionCoachCenter({
  adaptiveCoachFeedback = {},
  analysisDate,
  checkIn,
  checkIns = [],
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const [remoteStatus, setRemoteStatus] = useState('')
  const [remoteResult, setRemoteResult] = useState(null)
  const dietaryPreferences = useMemo(() => readDietaryPreferences(), [])
  const context = useMemo(() => ({
    adaptiveCoachFeedback,
    checkIn,
    checkIns,
    dietaryPreferences,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    profile,
    reminderState,
    weights,
  }), [adaptiveCoachFeedback, checkIn, checkIns, dietaryPreferences, goalsHabits, healthSnapshot, meals, nutritionGoals, profile, reminderState, weights])
  const model = useMemo(
    () => buildNutritionCoachModel(context, { analysisDate }),
    [analysisDate, context],
  )
  const remoteConsent = adaptiveCoachFeedback?.remoteAiConsent?.coachRemoteEnabled === true
  const aiContext = useMemo(() => buildMinimalNutritionCoachAiContext(model), [model])

  async function refineWithAi() {
    if (!remoteConsent) {
      setRemoteStatus('Aktivera remote coach-samtycke innan AI kan förfina nutritionplanen.')
      return
    }

    setRemoteStatus('Skickar aggregerad nutritionkontext till befintlig coachroute...')
    const result = await requestRemoteCoachSuggestions(context, {
      analysisDate,
      consent: true,
      intents: ['nutrition'],
      period: '30d',
      question: `Förfina nutritionplanen utifrån aggregerad nutritionkontext: ${JSON.stringify(aiContext)}`,
    })
    setRemoteResult(result)
    setRemoteStatus(result.ok ? 'AI-förslag mottaget och säkerhetsgranskat.' : (result.warning || 'AI-förfining kunde inte användas.'))
  }

  return (
    <section className="panel health-dashboard-v2" id="nutrition-coach-center" aria-labelledby="nutrition-coach-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Nutrition Coach V2</p>
          <h2 id="nutrition-coach-center-heading">Nutrition Coach Center</h2>
          <span>{model.analysisDate}. Vikttrend: {model.weightTrend}</span>
        </div>
        <span className="insight-coverage">{model.confidenceScore}% confidence</span>
      </div>

      <div className="health-dashboard-metrics">
        <ScoreBadge label="Dagens score" value={model.dailyScore} />
        <ScoreBadge label="Veckans score" value={model.weeklyScore} />
        <div className="health-dashboard-metric"><span>Måltider idag</span><strong>{model.dailyTimeline.mealCount}</strong></div>
        <div className="health-dashboard-metric"><span>Scanner</span><strong>{model.scannerSummary.photoMealCount}</strong></div>
      </div>

      <div className="health-dashboard-grid">
        <article className="health-dashboard-card">
          <h3>Meal quality</h3>
          <MealQualityList entries={model.mealQuality.filter((entry) => entry.date === model.analysisDate)} />
        </article>
        <article className="health-dashboard-card">
          <h3>Daily nutrition timeline</h3>
          <Timeline timeline={model.dailyTimeline} />
        </article>
      </div>

      <article className="insight-plan">
        <h3>Nutrition gaps</h3>
        {model.gaps.length ? (
          <ul className="health-dashboard-list">{model.gaps.map((gap) => <li key={gap}><span>{gap}</span></li>)}</ul>
        ) : <p>Inga tydliga luckor i dagens underlag.</p>}
      </article>

      <article className="insight-plan">
        <h3>Recommendations</h3>
        <ul className="health-dashboard-list">
          {model.recommendations.map((item) => <li key={item}><span>{item}</span></li>)}
        </ul>
      </article>

      <article className="insight-plan">
        <h3>Smart food suggestions</h3>
        <ul className="health-dashboard-list">
          {model.suggestions.map((suggestion) => (
            <li key={suggestion.name}>
              <strong>{suggestion.name}</strong>
              <span>{suggestion.description}</span>
              <small>{suggestion.quick ? 'Snabbt' : 'Planerat'} · {suggestion.budgetFriendly ? 'budgetvänligt' : 'normal budget'} · {suggestion.reason}</small>
            </li>
          ))}
        </ul>
      </article>

      <article className="insight-plan">
        <h3>AI refinement</h3>
        <p className="estimate-note">Remote AI får bara aggregerade nutritionmått, måltidskategorier och counts. Inga råa bilder eller rå historik skickas.</p>
        <button type="button" className="primary-button" onClick={refineWithAi}>Förfina med AI</button>
        {remoteStatus && <p className="form-success" role="status">{remoteStatus}</p>}
        {remoteResult?.coach?.recommendations?.length ? (
          <ul className="health-dashboard-list">
            {remoteResult.coach.recommendations.map((item) => (
              <li key={item.id}><strong>{item.title}</strong><span>{item.description}</span></li>
            ))}
          </ul>
        ) : null}
      </article>
    </section>
  )
}

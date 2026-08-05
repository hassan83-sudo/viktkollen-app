import { useMemo, useState } from 'react'
import {
  buildMinimalSmartHabitGoalAiPayload,
  buildSmartHabitGoalModel,
} from '../services/smartHabitGoalEngine.js'

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function RecommendationList({ emptyText, items }) {
  if (!items.length) return <p className="estimate-note">{emptyText}</p>

  return (
    <ul className="goals-list reminder-card-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.action}</span>
          <span>{item.category} · prioritet {item.priority} · {item.durationMinutes} min</span>
          <p>{item.explanation}</p>
        </li>
      ))}
    </ul>
  )
}

function HabitGoalCenter({
  adaptiveCoachFeedback = {},
  checkIn = {},
  checkIns = [],
  goalsHabits = {},
  healthSnapshot = null,
  meals = [],
  nutritionGoals = {},
  onRequestAiRefinement,
  profile = {},
  reminderState = {},
  today = '',
  weights = [],
}) {
  const [aiConsent, setAiConsent] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const model = useMemo(
    () => buildSmartHabitGoalModel({
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

  async function requestAiRefinement() {
    const payload = buildMinimalSmartHabitGoalAiPayload(model, { consent: aiConsent })
    if (!payload.allowed) {
      setAiStatus('Samtycke krävs innan AI kan formulera om mål och vanor.')
      return
    }

    if (!onRequestAiRefinement) {
      setAiStatus('Minimal AI-sammanfattning är förberedd. Regelbaserade formuleringar visas tills remote coach används.')
      return
    }

    try {
      const result = await onRequestAiRefinement(payload)
      setAiStatus(result?.text || 'AI-förfining klar.')
    } catch {
      setAiStatus('AI-förfining är inte tillgänglig. Regelbaserade formuleringar visas.')
    }
  }

  return (
    <section className="panel reminder-center" id="habit-goal-center" aria-labelledby="habit-goal-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Smart Habit & Goal System V2</p>
          <h2 id="habit-goal-center-heading">Habit Goal Center</h2>
          <span>{model.dashboard.nextStep}</span>
        </div>
        <span className="insight-coverage">Confidence {model.confidence}%</span>
      </div>

      <div className="reminder-summary-grid" aria-live="polite">
        <Metric label="Veckoframsteg" value={model.weeklyProgress.label} />
        <Metric label="Följsamhet" value={`${model.weeklyProgress.completionRate}%`} />
        <Metric label="Prognos" value={model.prediction.text} />
        <Metric label="Coverage" value={`${model.coverage}%`} />
      </div>

      <div className="reminder-columns">
        <article>
          <h3>Aktiva mål</h3>
          {model.activeGoals.length ? (
            <ul className="goals-list">
              {model.activeGoals.map((goal) => (
                <li key={goal.id}>
                  <strong>{goal.title}</strong>
                  <span>{goal.progress?.label || 'Följs när data finns'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Inga extra aktiva mål ännu.</p>
          )}
        </article>
        <article>
          <h3>Vanor</h3>
          {model.activeHabits.length ? (
            <ul className="goals-list">
              {model.activeHabits.map((habit) => (
                <li key={habit.id}>
                  <strong>{habit.title}</strong>
                  <span>{habit.status.done ? 'Klar idag' : habit.status.paused ? 'Pausad' : 'Väntar idag'} · {habit.streak.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Inga aktiva vanor ännu.</p>
          )}
        </article>
      </div>

      <div className="reminder-columns">
        <article>
          <h3>Rekommenderade mål</h3>
          <RecommendationList emptyText="Inga nya veckomål rekommenderas just nu." items={model.recommendedGoals} />
        </article>
        <article>
          <h3>Rekommenderade vanor</h3>
          <RecommendationList emptyText="Inga nya dagliga vanor rekommenderas just nu." items={model.recommendedHabits} />
        </article>
      </div>

      <div className="reminder-columns">
        <article>
          <h3>Milstolpar och prognos</h3>
          <p>{model.prediction.explanation}</p>
          <ul className="health-dashboard-list">
            {model.milestones.map((milestone) => <li key={milestone}>{milestone}</li>)}
          </ul>
        </article>
        <article>
          <h3>Förklaringar</h3>
          <p>{model.adaptation.text}</p>
          <p>{model.coachPlanLink.explanation}</p>
        </article>
      </div>

      <article>
        <h3>Begränsningar</h3>
        <ul className="health-dashboard-list">
          {model.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </article>

      <article>
        <h3>AI-förfining</h3>
        <label className="checkbox-row">
          <input
            checked={aiConsent}
            type="checkbox"
            onChange={(event) => setAiConsent(event.target.checked)}
          />
          Jag vill att AI endast får en minimal mål- och vanesammanfattning.
        </label>
        <button className="secondary-button" type="button" onClick={requestAiRefinement}>
          Förfina formuleringar
        </button>
        {aiStatus && <p className="analysis-status" aria-live="polite">{aiStatus}</p>}
      </article>

      <p className="estimate-note">
        Rekommendationerna är regelbaserade och sparas inte förrän du väljer att skapa mål, vana eller veckofokus i målpanelen.
      </p>
    </section>
  )
}

export default HabitGoalCenter

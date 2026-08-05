import { useMemo, useState } from 'react'
import {
  buildCoachActionPlan,
  buildCoachPlanCenterModel,
  saveCoachActionPlan,
  setCoachActionPlanActionStatus,
} from '../services/coachActionPlanEngine.js'

const dayPartLabels = {
  afternoon: 'Eftermiddag',
  evening: 'Kväll',
  morning: 'Morgon',
}

function ActionCard({ action, onStatus }) {
  return (
    <li>
      <strong>{dayPartLabels[action.dayPart] || action.dayPart}: {action.title}</strong>
      <span>{action.description}</span>
      <small>
        {action.category} · prioritet {action.priority} · cirka {action.durationMinutes} min
        {action.optionalReminder?.enabled ? ` · reminder ${action.optionalReminder.time}` : ''}
      </small>
      <small>Varför: {action.reason || 'Vald från coachens aktuella underlag.'}</small>
      <div className="report-v3-actions">
        <button type="button" disabled={action.status === 'completed'} onClick={() => onStatus(action.id, 'completed')}>Klar</button>
        <button type="button" disabled={action.status === 'skipped'} onClick={() => onStatus(action.id, 'skipped')}>Hoppa över</button>
        {action.status !== 'pending' && (
          <button type="button" className="secondary-button" onClick={() => onStatus(action.id, 'pending')}>Återställ</button>
        )}
      </div>
    </li>
  )
}

function ActionList({ emptyText, items, onStatus }) {
  if (!items.length) return <p>{emptyText}</p>

  return (
    <ul className="health-dashboard-list">
      {items.map((action) => (
        <ActionCard action={action} key={action.id} onStatus={onStatus} />
      ))}
    </ul>
  )
}

export default function CoachPlanCenter({
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
  const [status, setStatus] = useState('')
  const context = useMemo(() => ({
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
    () => buildCoachPlanCenterModel(context, { analysisDate }),
    [analysisDate, context],
  )

  function regeneratePlan() {
    const result = buildCoachActionPlan(context, { analysisDate })
    onAdaptiveCoachFeedbackChange?.(saveCoachActionPlan(adaptiveCoachFeedback, result.plan))
    setStatus('Coachplanen uppdaterades.')
  }

  function updateStatus(actionId, nextStatus) {
    if (!model.plan?.id) return
    onAdaptiveCoachFeedbackChange?.(setCoachActionPlanActionStatus(adaptiveCoachFeedback, model.plan.id, actionId, nextStatus))
    setStatus(nextStatus === 'completed' ? 'Steget markerades som klart.' : nextStatus === 'skipped' ? 'Steget hoppades över.' : 'Steget återställdes.')
  }

  const todayActions = model.todayPlan?.actions || []

  return (
    <section className="panel health-dashboard-v2" id="coach-plan-center" aria-labelledby="coach-plan-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Coach Action Plans V1</p>
          <h2 id="coach-plan-center-heading">Coach Plan Center</h2>
          <span>{model.plan.weekStart} till {model.plan.weekEnd}</span>
        </div>
        <span className="insight-coverage">{model.confidenceScore}% confidence</span>
      </div>

      <div className="health-dashboard-metrics">
        <div className="health-dashboard-metric"><span>Dagens steg</span><strong>{todayActions.length}</strong></div>
        <div className="health-dashboard-metric"><span>Klara</span><strong>{model.completedActions.length}</strong></div>
        <div className="health-dashboard-metric"><span>Hoppade över</span><strong>{model.skippedActions.length}</strong></div>
        <div className="health-dashboard-metric"><span>Adaptiv ändring</span><strong>{model.adaptiveChanges}</strong></div>
      </div>

      <div className="report-v3-actions">
        <button type="button" className="primary-button" onClick={regeneratePlan}>Regenerera plan</button>
      </div>
      {status && <p className="form-success" role="status" aria-live="polite">{status}</p>}

      <article className="insight-plan">
        <h3>Dagens plan</h3>
        <ActionList emptyText="Ingen plan för idag ännu." items={todayActions} onStatus={updateStatus} />
      </article>

      <article className="insight-plan">
        <h3>Veckans plan</h3>
        <div className="health-dashboard-grid">
          {model.weekPlan.map((day) => (
            <div className="health-dashboard-card" key={day.date}>
              <h4>{day.label}</h4>
              <p>{day.date}</p>
              <ActionList emptyText="Inga steg." items={day.actions} onStatus={updateStatus} />
            </div>
          ))}
        </div>
      </article>

      <article className="insight-plan">
        <h3>Genomförda och hoppade steg</h3>
        <div className="health-dashboard-grid">
          <div className="health-dashboard-card">
            <h4>Klara actions</h4>
            <ActionList emptyText="Inga klara plansteg ännu." items={model.completedActions} onStatus={updateStatus} />
          </div>
          <div className="health-dashboard-card">
            <h4>Hoppade actions</h4>
            <ActionList emptyText="Inga hoppade plansteg ännu." items={model.skippedActions} onStatus={updateStatus} />
          </div>
        </div>
      </article>

      <article className="insight-plan">
        <h3>Varför dessa steg valdes</h3>
        <ul className="health-dashboard-list">
          {model.explanation.map((entry) => <li key={entry}><span>{entry}</span></li>)}
        </ul>
        <p className="estimate-note">{model.plan.safetyNote}</p>
      </article>
    </section>
  )
}

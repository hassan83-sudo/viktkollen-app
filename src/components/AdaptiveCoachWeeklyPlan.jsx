import { useEffect, useMemo, useRef, useState } from 'react'
import { appendAdaptiveCoachTimelineEvent } from '../services/adaptiveCoachTimeline.js'
import {
  buildAdaptiveCoachWeeklyPlan,
  commitAdaptiveCoachWeeklyPlan,
} from '../services/adaptiveCoachWeeklyPlan.js'

const actionTypeLabels = {
  goal: 'Mål',
  habit: 'Vana',
  reminder: 'Reminder',
  weeklyFocus: 'Veckofokus',
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function updateActionDraft(action, patch) {
  const nextDraft = { ...action.draft, ...patch }

  return {
    ...action,
    ...patch,
    draft: nextDraft,
  }
}

function EditableAction({ action, checked, describedBy, disabled, onChange, onToggle }) {
  return (
    <li>
      <label className="checkbox-row">
        <input
          checked={checked}
          disabled={disabled}
          type="checkbox"
          onChange={() => onToggle(action.id)}
        />
        <span>{action.title}</span>
      </label>
      <label>
        <span>Titel</span>
        <input
          aria-describedby={describedBy}
          aria-invalid={!action.draft.title}
          disabled={disabled}
          value={action.draft.title}
          onChange={(event) => onChange(action.id, { title: event.target.value })}
        />
      </label>
      <label>
        <span>Handling</span>
        <textarea
          aria-describedby={describedBy}
          aria-invalid={!action.draft.description}
          disabled={disabled}
          value={action.draft.description}
          onChange={(event) => onChange(action.id, { description: event.target.value })}
        />
      </label>
      <label>
        <span>Actiontyp</span>
        <select
          disabled={disabled}
          value={action.draft.actionType}
          onChange={(event) => onChange(action.id, { actionType: event.target.value })}
        >
          {Object.entries(actionTypeLabels).map(([type, label]) => (
            <option key={type} value={type}>{label}</option>
          ))}
        </select>
      </label>
      {(action.draft.actionType === 'reminder' || action.draft.actionType === 'habit') && (
        <label>
          <span>Tid</span>
          <input
            disabled={disabled}
            type="time"
            value={action.draft.reminderTime}
            onChange={(event) => onChange(action.id, { reminderTime: event.target.value })}
          />
        </label>
      )}
      <small>{action.reason}</small>
    </li>
  )
}

function AdaptiveCoachWeeklyPlan({
  adaptiveCoachFeedback = {},
  analysisDate,
  checkIn,
  checkIns = [],
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  onAdaptiveCoachFeedbackChange,
  onCancel,
  onGoalsHabitsChange,
  onReminderStateChange,
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const headingRef = useRef(null)
  const openedEventRef = useRef(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const baseData = useMemo(() => ({
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
  const basePlan = useMemo(
    () => buildAdaptiveCoachWeeklyPlan(baseData, { analysisDate }),
    [analysisDate, baseData],
  )
  const [planTitle, setPlanTitle] = useState(basePlan.title)
  const [actions, setActions] = useState(basePlan.proposedActions)
  const [selectedIds, setSelectedIds] = useState(() => new Set(basePlan.proposedActions.map((action) => action.id)))

  useEffect(() => {
    headingRef.current?.focus()
    if (openedEventRef.current) return
    openedEventRef.current = true
    onAdaptiveCoachFeedbackChange?.(appendAdaptiveCoachTimelineEvent(adaptiveCoachFeedback, {
      eventType: 'weeklyPlanDraftOpened',
      occurredAt: new Date().toISOString(),
      source: 'adaptiveCoachWeeklyPlan',
      summary: 'Användaren öppnade ett veckoplansutkast.',
      title: 'Veckoplan öppnad',
    }))
  }, [adaptiveCoachFeedback, onAdaptiveCoachFeedbackChange])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        handleCancel()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function toggleAction(id) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setStatus('')
    setError('')
  }

  function changeAction(id, patch) {
    setActions((current) => current.map((action) => action.id === id ? updateActionDraft(action, patch) : action))
    setStatus('')
    setError('')
  }

  function handleCancel() {
    onAdaptiveCoachFeedbackChange?.(appendAdaptiveCoachTimelineEvent(adaptiveCoachFeedback, {
      eventType: 'weeklyPlanCancelled',
      occurredAt: new Date().toISOString(),
      source: 'adaptiveCoachWeeklyPlan',
      summary: 'Veckoplansutkastet avbröts utan att skapa actions.',
      title: 'Veckoplan avbruten',
    }))
    onCancel?.()
  }

  function confirmSelected(event) {
    event.preventDefault()
    if (isSaving) return
    setIsSaving(true)
    setStatus('')
    setError('')

    const result = commitAdaptiveCoachWeeklyPlan({
      ...basePlan,
      proposedActions: actions,
      title: planTitle,
    }, {
      adaptiveCoachFeedback,
      goalsHabits,
      reminderState,
    }, {
      selectedActionIds: [...selectedIds],
    })

    if (!result.ok) {
      setError(result.failures.map((failure) => failure.error).join(' ') || 'Veckoplanen kunde inte sparas.')
      if (result.feedback !== adaptiveCoachFeedback) onAdaptiveCoachFeedbackChange?.(result.feedback)
      setIsSaving(false)
      return
    }

    onGoalsHabitsChange?.(result.goalsHabits)
    onReminderStateChange?.(result.reminderState)
    onAdaptiveCoachFeedbackChange?.(result.feedback)
    setStatus(`${result.results.length} action${result.results.length === 1 ? '' : 's'} skapades från veckoplanen.`)
    setIsSaving(false)
  }

  const selectedCount = safeArray(actions).filter((action) => selectedIds.has(action.id)).length

  return (
    <section className="report-v3-card adaptive-coach-weekly-plan" aria-labelledby="adaptive-coach-weekly-plan-heading">
      <div>
        <p className="eyebrow">Smart Coach V7</p>
        <h3 id="adaptive-coach-weekly-plan-heading" ref={headingRef} tabIndex={-1}>Redigerbar veckoplan</h3>
        <p>{basePlan.weekStart} till {basePlan.weekEnd}. Confidence {Math.round(basePlan.confidence * 100).toLocaleString('sv-SE')}% · Coverage {Math.round(basePlan.coverage * 100).toLocaleString('sv-SE')}%.</p>
      </div>
      <p>{basePlan.rationale}</p>
      <p className="estimate-note">{basePlan.safetyNote}</p>
      <div aria-live="polite">
        {status && <p className="form-success">{status}</p>}
        {error && <p className="analysis-status" id="weekly-plan-error" role="alert">{error}</p>}
      </div>

      <form aria-describedby={error ? 'weekly-plan-error' : 'weekly-plan-help'} onSubmit={confirmSelected}>
        <p id="weekly-plan-help">Inget sparas innan du bekräftar valda actions. Du kan redigera eller välja bort förslag.</p>
        <label>
          <span>Planens titel</span>
          <input value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} />
        </label>

        <h4>Observerade mönster</h4>
        <ul className="health-dashboard-list">
          {basePlan.focusAreas.length ? basePlan.focusAreas.map((item) => (
            <li key={item.patternId}>
              <strong>{item.category}</strong>
              <span>{item.text}</span>
            </li>
          )) : (
            <li>
              <strong>Underlag</strong>
              <span>{basePlan.fallbackPlan}</span>
            </li>
          )}
        </ul>

        <h4>Befintliga aktiva actions</h4>
        <ul className="health-dashboard-list">
          {basePlan.existingActions.length ? basePlan.existingActions.map((action) => (
            <li key={action.id || action.recommendationId}>
              <strong>{action.title}</strong>
              <span>{action.linkedEntityType || action.status}</span>
            </li>
          )) : (
            <li>
              <strong>Saknas</strong>
              <span>Inga aktiva coachactions hittades.</span>
            </li>
          )}
        </ul>

        <h4>Föreslagna actions</h4>
        <ul className="health-dashboard-list coach-weekly-actions">
          {actions.map((action) => (
            <EditableAction
              action={action}
              checked={selectedIds.has(action.id)}
              describedBy={error ? 'weekly-plan-error' : 'weekly-plan-help'}
              disabled={isSaving}
              key={action.id}
              onChange={changeAction}
              onToggle={toggleAction}
            />
          ))}
        </ul>

        <div className="habit-actions">
          <button className="primary-button" disabled={isSaving || selectedCount === 0} type="submit">
            {isSaving ? 'Sparar...' : `Bekräfta ${selectedCount} valda`}
          </button>
          <button disabled={isSaving} type="button" onClick={handleCancel}>Avbryt</button>
        </div>
      </form>
    </section>
  )
}

export default AdaptiveCoachWeeklyPlan

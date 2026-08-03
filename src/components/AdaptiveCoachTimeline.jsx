import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildAdaptiveCoachTimeline,
  buildAdaptiveCoachTimelineSummary,
} from '../services/adaptiveCoachTimeline.js'

const periodOptions = [
  ['7d', '7 dagar'],
  ['30d', '30 dagar'],
  ['90d', '90 dagar'],
  ['180d', '180 dagar'],
  ['all', 'Hela historiken'],
]

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Datum saknas'

  return date.toLocaleString('sv-SE', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function cleanType(value) {
  const labels = {
    goal: 'Mål',
    habit: 'Vana',
    reminder: 'Reminder',
    weeklyFocus: 'Veckofokus',
  }

  return labels[value] || value || 'Saknas'
}

function TimelineItem({ event }) {
  const [open, setOpen] = useState(false)
  const detailsId = `coach-event-details-${event.id}`

  return (
    <li className="health-dashboard-card">
      <div>
        <strong>{event.title}</strong>
        <span>{formatDate(event.occurredAt)}</span>
        <p>{event.summary || event.reason || 'Coachhändelse registrerad.'}</p>
        <small>{cleanType(event.actionType)} · {event.outcome || event.status || 'unknown'}</small>
      </div>
      <button
        aria-controls={detailsId}
        aria-expanded={open}
        className="secondary-button"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? 'Dölj detaljer' : 'Visa detaljer'}
      </button>
      {open && (
        <div id={detailsId}>
          <p>Orsak: {event.reason || 'Saknas'}</p>
          <p>Källa: {event.source || 'Adaptive Coach'}.</p>
          <p>Koppling: {cleanType(event.linkedEntityType)}.</p>
          {event.confidence !== null && <p>Confidence: {Math.round(event.confidence * 100)}%.</p>}
          {event.coverage !== null && <p>Coverage: {Math.round(event.coverage * 100)}%.</p>}
          {event.linkedEntityType && (
            <a className="secondary-button" href={event.linkedEntityType === 'reminder' ? '#reminder-center' : '#mal-vanor'}>
              Öppna kopplat objekt
            </a>
          )}
        </div>
      )}
    </li>
  )
}

function AdaptiveCoachTimeline({
  adaptiveCoachFeedback = {},
  analysisDate,
  coachModel,
  goalsHabits = {},
  onClose,
  reminderState = {},
}) {
  const headingRef = useRef(null)
  const [period, setPeriod] = useState('30d')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [actionType, setActionType] = useState('')
  const timeline = useMemo(
    () => buildAdaptiveCoachTimeline({
      adaptiveCoachFeedback,
      coachModel,
      goalsHabits,
      reminderState,
    }, {
      analysisDate,
      filter: { actionType, category, period, status },
      now: analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined,
    }),
    [actionType, adaptiveCoachFeedback, analysisDate, category, coachModel, goalsHabits, period, reminderState, status],
  )
  const summary = useMemo(
    () => buildAdaptiveCoachTimelineSummary({
      adaptiveCoachFeedback,
      coachModel,
      goalsHabits,
      reminderState,
    }, {
      analysisDate,
      filter: { period },
      now: analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined,
    }),
    [adaptiveCoachFeedback, analysisDate, coachModel, goalsHabits, period, reminderState],
  )

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section className="panel health-dashboard-v2 coach-timeline-panel" aria-labelledby="coach-timeline-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Coach Timeline V6</p>
          <h2 id="coach-timeline-heading" ref={headingRef} tabIndex={-1}>Coachhistorik</h2>
          <span>{summary.totalEvents} händelser. {summary.insufficient ? 'Mer historik behövs.' : 'Bygger på sparad coachfeedback.'}</span>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>Tillbaka till coachen</button>
      </div>

      <div className="health-dashboard-metrics">
        <div className="health-dashboard-metric"><span>Rekommendationer</span><strong>{summary.recommendations}</strong></div>
        <div className="health-dashboard-metric"><span>Actions</span><strong>{summary.activeActions}</strong></div>
        <div className="health-dashboard-metric"><span>Klara</span><strong>{summary.completed}</strong></div>
        <div className="health-dashboard-metric"><span>Conversion</span><strong>{summary.conversionRate === null ? 'Saknas' : `${summary.conversionRate}%`}</strong></div>
      </div>

      <div className="segmented-control health-period-toggle" role="group" aria-label="Filtrera coachhistorik">
        {periodOptions.map(([value, label]) => (
          <button
            aria-pressed={period === value}
            className={period === value ? 'active' : ''}
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="report-v3-actions">
        <label>
          <span>Kategori</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Alla</option>
            {timeline.filters.categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Alla</option>
            {timeline.filters.statuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Actiontyp</span>
          <select value={actionType} onChange={(event) => setActionType(event.target.value)}>
            <option value="">Alla</option>
            {timeline.filters.actionTypes.map((value) => <option key={value} value={value}>{cleanType(value)}</option>)}
          </select>
        </label>
      </div>
      <p className="sr-only" aria-live="polite">{timeline.events.length} coachhändelser visas.</p>

      {timeline.events.length ? (
        <ol className="health-dashboard-list adaptive-coach-steps">
          {timeline.events.slice(0, 80).map((event) => <TimelineItem event={event} key={event.id} />)}
        </ol>
      ) : (
        <div className="empty-state">
          <h3>Ingen coachhistorik i filtret</h3>
          <p>När coachråd accepteras, skjuts upp, avfärdas eller blir actions visas de här.</p>
        </div>
      )}
    </section>
  )
}

export default AdaptiveCoachTimeline

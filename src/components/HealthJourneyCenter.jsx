import { useEffect, useMemo, useRef, useState } from 'react'
import { buildHealthJourney, buildMinimalHealthJourneyAiPayload } from '../services/healthJourney/healthJourneyBuilder.js'
import { buildHealthJourneySummary } from '../services/healthJourney/healthJourneySummary.js'

const themeOptions = [
  ['all', 'Alla teman'],
  ['weight', 'Vikt'],
  ['nutrition', 'Nutrition'],
  ['activity', 'Aktivitet'],
  ['habits', 'Vanor'],
  ['coach', 'Coach'],
  ['motivation', 'Motivation'],
  ['recovery', 'Återhämtning'],
  ['dataQuality', 'Datakvalitet'],
]

const periodOptions = [
  ['all', 'Alla perioder'],
  ['7d', '7 dagar'],
  ['30d', '30 dagar'],
  ['90d', '90 dagar'],
  ['prediction', 'Prognos'],
]

const toneOptions = [
  ['all', 'Alla signaler'],
  ['positive', 'Positiv'],
  ['neutral', 'Neutral'],
  ['caution', 'Caution'],
]

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function eventMatches(event, filters) {
  return (filters.theme === 'all' || event.category === filters.theme)
    && (filters.period === 'all' || event.period === filters.period)
    && (filters.tone === 'all' || event.tone === filters.tone)
}

function eventToneLabel(tone) {
  if (tone === 'positive') return 'Positiv'
  if (tone === 'caution') return 'Caution'
  return 'Neutral'
}

function HealthJourneyCenter({
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
  const [filters, setFilters] = useState({ period: 'all', theme: 'all', tone: 'all' })
  const [expandedId, setExpandedId] = useState('')
  const [aiConsent, setAiConsent] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const triggerRef = useRef(null)
  const model = useMemo(
    () => buildHealthJourney({
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
    }, { analysisDate: today, period: '90d' }),
    [adaptiveCoachFeedback, checkIn, checkIns, goalsHabits, healthSnapshot, meals, nutritionGoals, profile, reminderState, today, weights],
  )
  const summary = useMemo(() => buildHealthJourneySummary(model), [model])
  const visibleEvents = model.events.filter((event) => eventMatches(event, filters))

  useEffect(() => {
    if (!expandedId) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setExpandedId('')
        triggerRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedId])

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
    setExpandedId('')
  }

  async function requestAiRefinement() {
    const payload = buildMinimalHealthJourneyAiPayload(model, {
      consent: aiConsent,
      question: 'Förklara min health journey kort.',
    })

    if (!payload.allowed) {
      setAiStatus('Samtycke krävs innan AI kan formulera en förklaring.')
      return
    }

    if (!onRequestAiRefinement) {
      setAiStatus('Minimal AI-payload är förberedd. Regelbaserad sammanfattning visas tills remote coach används.')
      return
    }

    try {
      const result = await onRequestAiRefinement(payload)
      setAiStatus(result?.text || 'AI-förfining klar.')
    } catch {
      setAiStatus('AI-förfining är inte tillgänglig. Den regelbaserade sammanfattningen visas.')
    }
  }

  function printSafeView() {
    if (typeof window !== 'undefined') window.print()
  }

  return (
    <section className="panel reminder-center" id="health-journey-center" aria-labelledby="health-journey-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Health Journey V1</p>
          <h2 id="health-journey-heading">Health Journey</h2>
          <span>{summary.text}</span>
        </div>
        <button className="secondary-button" type="button" onClick={printSafeView}>Print/export-safe view</button>
      </div>

      <div className="reminder-summary-grid" aria-live="polite">
        <Metric label="Fas" value={summary.currentPhase} />
        <Metric label="Coverage" value={`${summary.dataCoverage}%`} />
        <Metric label="Confidence" value={`${summary.confidence}%`} />
        <Metric label="Events" value={model.events.length} />
      </div>

      <div className="reminder-columns">
        <article>
          <h3>Dagens resa</h3>
          <p>{summary.strongestPositiveTrend}</p>
          <p>{summary.mainCurrentFocus}</p>
          <p>{summary.recentMilestone}</p>
        </article>
        <article>
          <h3>Nuvarande signaler</h3>
          <p>{summary.currentOpportunity}</p>
          <p>{summary.currentCautionSignal}</p>
          <p>{summary.predictionSummary}</p>
        </article>
      </div>

      <div className="report-v3-actions" aria-label="Journey-filter">
        <label>
          <span>Tema</span>
          <select value={filters.theme} onChange={(event) => updateFilter('theme', event.target.value)}>
            {themeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Period</span>
          <select value={filters.period} onChange={(event) => updateFilter('period', event.target.value)}>
            {periodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Signal</span>
          <select value={filters.tone} onChange={(event) => updateFilter('tone', event.target.value)}>
            {toneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <article>
        <h3>Timeline</h3>
        {visibleEvents.length === 0 ? (
          <p className="estimate-note">Inga journey-händelser matchar filtret.</p>
        ) : (
          <ul className="goals-list reminder-card-list">
            {visibleEvents.map((event) => {
              const controlsId = `health-journey-event-${event.id}`
              const expanded = expandedId === event.id
              return (
                <li key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{event.summary}</span>
                  <span>{eventToneLabel(event.tone)} · {event.category} · {event.period || 'period saknas'} · {event.source}</span>
                  <button
                    aria-controls={controlsId}
                    aria-expanded={expanded}
                    className="secondary-button"
                    ref={expanded ? triggerRef : null}
                    type="button"
                    onClick={(clickEvent) => {
                      triggerRef.current = clickEvent.currentTarget
                      setExpandedId(expanded ? '' : event.id)
                    }}
                  >
                    {expanded ? 'Dölj förklaring' : 'Varför detta visas'}
                  </button>
                  {expanded && (
                    <div id={controlsId}>
                      <p>{event.explanationDetails.whatHappened}</p>
                      <p>{event.explanationDetails.whyShown}</p>
                      <p>Confidence {event.confidence}%. {event.explanationDetails.uncertainty}</p>
                      <p>Datakategorier: {event.explanationDetails.dataCategories.join(' · ')}</p>
                      <p>Nästa steg: {event.explanationDetails.nextStep}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </article>

      <div className="reminder-columns">
        <article>
          <h3>Milestones</h3>
          {model.aggregation.milestones.length ? (
            <ul className="health-dashboard-list">
              {model.aggregation.milestones.slice(0, 5).map((event) => (
                <li key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{event.summary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Milstolpar visas när befintliga motorer bekräftar dem.</p>
          )}
        </article>
        <article>
          <h3>Begränsningar</h3>
          <ul className="health-dashboard-list">
            {summary.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </article>
      </div>

      <article>
        <h3>AI-förfining</h3>
        <label className="checkbox-row">
          <input
            checked={aiConsent}
            type="checkbox"
            onChange={(event) => setAiConsent(event.target.checked)}
          />
          Jag vill att AI endast får en minimal journey-sammanfattning.
        </label>
        <button className="secondary-button" type="button" onClick={requestAiRefinement}>
          Förfina förklaring
        </button>
        {aiStatus && <p className="analysis-status" aria-live="polite">{aiStatus}</p>}
      </article>

      <p className="estimate-note">
        Health Journey är härledd, regelbaserad och visar inte rå historik, bilder, AI-instruktioner eller leverantörssvar.
      </p>
    </section>
  )
}

export default HealthJourneyCenter

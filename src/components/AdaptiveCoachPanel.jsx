import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { buildAdaptiveCoach } from '../services/adaptiveCoachEngine.js'
import {
  buildAdaptiveCoachFeedbackSummary,
  updateAdaptiveCoachFeedback,
} from '../services/adaptiveCoachFeedback.js'
import {
  buildCoachActionDraft,
  coachActionTypes,
  commitCoachActionDraft,
  findCoachActionDuplicate,
  getCoachActionEligibility,
  validateCoachActionDraft,
} from '../services/adaptiveCoachActions.js'
import {
  appendAdaptiveCoachTimelineEvent,
  buildAdaptiveCoachTimelineSummary,
  explainCoachAdaptation,
} from '../services/adaptiveCoachTimeline.js'
import { buildAdaptiveCoachPatternSummary } from '../services/adaptiveCoachPatterns.js'
import { buildAdaptiveCoachStrategy } from '../services/adaptiveCoachStrategy.js'
import {
  buildRemoteCoachPreview,
  requestRemoteCoachSuggestions,
} from '../services/ai/remoteCoachService.js'
import { makeRuleBasedFallbackResult } from '../services/ai/aiResponseSafety.js'
import { buildMinimalPredictionAiContext, buildPredictionReportSummary } from '../services/prediction/healthPredictionEngine.js'

const AdaptiveCoachTimeline = lazy(() => import('./AdaptiveCoachTimeline.jsx'))
const AdaptiveCoachWeeklyPlan = lazy(() => import('./AdaptiveCoachWeeklyPlan.jsx'))
const CoachMemoryReview = lazy(() => import('./CoachMemoryReview.jsx'))

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

const actionTypeLabels = {
  goal: 'Mål',
  habit: 'Vana',
  reminder: 'Reminder',
  weeklyFocus: 'Veckofokus',
}

function RecommendationList({ onAction, onFeedback, recommendations }) {
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
            <button type="button" onClick={() => onAction(item)}>Gör detta</button>
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
  onGoalsHabitsChange,
  onReminderStateChange,
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const actionFormRef = useRef(null)
  const lastActionTriggerRef = useRef(null)
  const [actionDraft, setActionDraft] = useState(null)
  const [actionRecommendation, setActionRecommendation] = useState(null)
  const [actionStatus, setActionStatus] = useState('')
  const [actionError, setActionError] = useState('')
  const [isSavingAction, setIsSavingAction] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showWeeklyPlan, setShowWeeklyPlan] = useState(false)
  const [showMemoryReview, setShowMemoryReview] = useState(false)
  const [remoteCoachResult, setRemoteCoachResult] = useState(null)
  const [remoteCoachStatus, setRemoteCoachStatus] = useState('')
  const [remoteCoachError, setRemoteCoachError] = useState('')
  const [remoteCoachLoading, setRemoteCoachLoading] = useState(false)
  const remoteCoachAbortRef = useRef(null)
  const remoteConsent = adaptiveCoachFeedback?.remoteAiConsent?.coachRemoteEnabled === true
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
  const predictionSummary = useMemo(
    () => buildPredictionReportSummary(baseData, {
      analysisDate,
      now: analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined,
    }),
    [analysisDate, baseData],
  )
  const predictionAiContext = useMemo(
    () => remoteConsent ? buildMinimalPredictionAiContext({
      confidence: predictionSummary.confidence,
      opportunities: predictionSummary.opportunities,
      predictions: predictionSummary.summary?.categories?.map((category) => ({ category })) || [],
      warningSignals: predictionSummary.cautionSignals,
    }) : null,
    [predictionSummary, remoteConsent],
  )
  const data = useMemo(() => ({
    ...baseData,
    predictionAiContext,
    predictionSummary,
  }), [baseData, predictionAiContext, predictionSummary])
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
  const timelineSummary = useMemo(
    () => buildAdaptiveCoachTimelineSummary({
      adaptiveCoachFeedback,
      coachModel: model,
      goalsHabits,
      reminderState,
    }, {
      analysisDate,
      now: analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined,
    }),
    [adaptiveCoachFeedback, analysisDate, goalsHabits, model, reminderState],
  )
  const patternSummary = useMemo(
    () => buildAdaptiveCoachPatternSummary(data, {
      analysisDate,
      days: 30,
      now: analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined,
    }),
    [analysisDate, data],
  )
  const strategy = useMemo(
    () => buildAdaptiveCoachStrategy({
      ...data,
      coachModel: model,
      patternSummary,
    }, {
      analysisDate,
      now: analysisDate ? `${analysisDate}T12:00:00.000Z` : undefined,
    }),
    [analysisDate, data, model, patternSummary],
  )
  const duplicate = useMemo(
    () => actionDraft
      ? findCoachActionDuplicate(actionDraft, { adaptiveCoachFeedback, goalsHabits, reminderState })
      : { duplicate: false, message: '' },
    [actionDraft, adaptiveCoachFeedback, goalsHabits, reminderState],
  )
  const draftValidation = useMemo(
    () => actionDraft ? validateCoachActionDraft(actionDraft) : { errors: [], ok: true },
    [actionDraft],
  )
  const remotePreview = useMemo(
    () => buildRemoteCoachPreview(data, {
      analysisDate,
      coachModel: model,
      consent: remoteConsent,
      period: '30d',
    }),
    [analysisDate, data, model, remoteConsent],
  )
  const remoteRecommendations = useMemo(
    () => (remoteCoachResult?.coach?.recommendations || []).map((item) => ({
      action: item.description,
      aiGenerated: true,
      area: item.category,
      confidence: { value: item.confidence },
      evidence: item.sourceFacts,
      id: `ai-${item.id}`,
      priority: item.priority,
      source: 'remoteAi',
      text: item.reason,
      title: item.title,
    })),
    [remoteCoachResult],
  )

  useEffect(() => {
    if (actionDraft) actionFormRef.current?.focus()
  }, [actionDraft])

  useEffect(() => () => {
    remoteCoachAbortRef.current?.abort?.()
  }, [])

  useEffect(() => {
    if (!actionDraft) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') closeActionDraft()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actionDraft])

  function handleFeedback(recommendation, status, options = {}) {
    if (!onAdaptiveCoachFeedbackChange) return

    onAdaptiveCoachFeedbackChange(updateAdaptiveCoachFeedback(
      adaptiveCoachFeedback,
      recommendation,
      status,
      options,
    ))
  }

  function updateRemoteConsent(enabled) {
    if (!onAdaptiveCoachFeedbackChange) return
    onAdaptiveCoachFeedbackChange({
      ...adaptiveCoachFeedback,
      remoteAiConsent: {
        ...(adaptiveCoachFeedback.remoteAiConsent || {}),
        coachRemoteEnabled: enabled,
        policyVersion: 'openai-production-integration-v1',
        updatedAt: new Date().toISOString(),
        ...(enabled
          ? { consentedAt: adaptiveCoachFeedback.remoteAiConsent?.consentedAt || new Date().toISOString() }
          : {}),
      },
    })
    setRemoteCoachError('')
    setRemoteCoachStatus(enabled ? 'Remote AI ar aktiverad for coachforslag.' : 'Remote AI ar avstangd. Regelbaserad coach anvands.')
  }

  async function requestRemoteCoach() {
    if (remoteCoachLoading) return
    if (!remoteConsent) {
      setRemoteCoachError('Aktivt samtycke kravs innan remote AI anvands.')
      return
    }

    setRemoteCoachLoading(true)
    setRemoteCoachError('')
    setRemoteCoachStatus('Skickar minimerad sammanfattning till extern AI...')
    const controller = new AbortController()
    remoteCoachAbortRef.current = controller
    const result = await requestRemoteCoachSuggestions(data, {
      analysisDate,
      coachModel: model,
      consent: remoteConsent,
      period: '30d',
      signal: controller.signal,
    })
    remoteCoachAbortRef.current = null
    setRemoteCoachLoading(false)

    if (!result.ok) {
      setRemoteCoachResult({
        coach: makeRuleBasedFallbackResult(model, result.warning),
        providerType: 'ruleBased',
      })
      setRemoteCoachError(result.warning || 'Remote AI kunde inte anvandas. Regelbaserad coach visas.')
      setRemoteCoachStatus('Regelbaserad fallback anvands.')
      return
    }

    setRemoteCoachResult(result)
    setRemoteCoachStatus('AI-genererat forslag mottaget och sakerhetsgranskat.')
  }

  function cancelRemoteCoachRequest() {
    remoteCoachAbortRef.current?.abort?.()
    setRemoteCoachLoading(false)
    setRemoteCoachStatus('AI-anropet avbrots.')
  }

  function openActionDraft(recommendation, event) {
    const eligibility = getCoachActionEligibility(recommendation, {
      confidence: model.confidence.value,
      coverage: model.coverage.ratio,
    })
    lastActionTriggerRef.current = event?.currentTarget || null
    setActionRecommendation(recommendation)
    setActionDraft(buildCoachActionDraft(recommendation, {
      actionType: eligibility.actionTypes[0],
      analysisDate,
      confidence: model.confidence.value,
      coverage: model.coverage.ratio,
    }))
    setActionError(eligibility.blockReason)
    setActionStatus('')
  }

  function closeActionDraft() {
    setActionDraft(null)
    setActionRecommendation(null)
    setActionError('')
    setActionStatus('')
    setIsSavingAction(false)
    lastActionTriggerRef.current?.focus?.()
  }

  function updateActionDraft(patch) {
    setActionDraft((current) => current ? { ...current, ...patch } : current)
    setActionStatus('')
    setActionError('')
  }

  function saveCoachAction(event) {
    event.preventDefault()
    if (!actionDraft || !actionRecommendation || isSavingAction) return
    if (duplicate.duplicate) {
      setActionError(duplicate.message)
      onAdaptiveCoachFeedbackChange?.(appendAdaptiveCoachTimelineEvent(adaptiveCoachFeedback, {
        eventType: 'actionDuplicatePrevented',
        linkedEntityId: duplicate.entityId,
        linkedEntityType: duplicate.entityType,
        occurredAt: new Date().toISOString(),
        recommendationId: actionDraft.sourceRecommendationId,
        summary: duplicate.message,
        title: actionDraft.title,
      }))
      return
    }
    if (!draftValidation.ok) {
      setActionError(draftValidation.errors.join(' '))
      return
    }

    setIsSavingAction(true)
    const result = commitCoachActionDraft(actionDraft, {
      adaptiveCoachFeedback,
      goalsHabits,
      reminderState,
    }, {
      recommendation: actionRecommendation,
    })

    if (!result.ok) {
      setActionError(result.error || 'Action kunde inte skapas.')
      setIsSavingAction(false)
      return
    }

    onGoalsHabitsChange?.(result.goalsHabits)
    onReminderStateChange?.(result.reminderState)
    onAdaptiveCoachFeedbackChange?.(result.feedback)
    setActionStatus(`${actionTypeLabels[actionDraft.actionType]} skapad.`)
    setIsSavingAction(false)
    window.setTimeout(closeActionDraft, 0)
  }

  return (
    <section className="panel health-dashboard-v2 adaptive-coach-panel" id="adaptive-coach" aria-labelledby="adaptive-coach-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Smart Coach V7</p>
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
        <MetricBadge label="Aktiva actions" value={timelineSummary.activeActions} />
        <MetricBadge label="Strategi" value={strategy.title} />
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
        <h3>Observerat mönster</h3>
        <p>{patternSummary.text}</p>
        <p>Aktuell coachstrategi: {strategy.title}. {strategy.explanation}</p>
        <div className="report-v3-actions">
          <button
            aria-controls="coach-memory-review"
            aria-expanded={showMemoryReview}
            className="secondary-button"
            type="button"
            onClick={() => setShowMemoryReview((current) => !current)}
          >
            {showMemoryReview ? 'Dölj coachminne' : 'Granska coachminne'}
          </button>
          <button
            aria-controls="adaptive-coach-weekly-plan"
            aria-expanded={showWeeklyPlan}
            className="primary-button"
            type="button"
            onClick={() => setShowWeeklyPlan((current) => !current)}
          >
            {showWeeklyPlan ? 'Dölj veckoplan' : 'Skapa veckoplan'}
          </button>
        </div>
      </div>

      {showMemoryReview && (
        <div id="coach-memory-review">
          <Suspense fallback={<div className="report-v3-card" role="status">Laddar coachminne...</div>}>
            <CoachMemoryReview
              adaptiveCoachFeedback={adaptiveCoachFeedback}
              analysisDate={analysisDate}
              context={data}
              onClose={() => setShowMemoryReview(false)}
              onFeedbackChange={onAdaptiveCoachFeedbackChange}
            />
          </Suspense>
        </div>
      )}

      {showWeeklyPlan && (
        <div id="adaptive-coach-weekly-plan">
          <Suspense fallback={<div className="report-v3-card" role="status">Laddar veckoplan...</div>}>
            <AdaptiveCoachWeeklyPlan
              adaptiveCoachFeedback={adaptiveCoachFeedback}
              analysisDate={analysisDate}
              checkIn={checkIn}
              checkIns={checkIns}
              goalsHabits={goalsHabits}
              healthSnapshot={healthSnapshot}
              meals={meals}
              nutritionGoals={nutritionGoals}
              onAdaptiveCoachFeedbackChange={onAdaptiveCoachFeedbackChange}
              onCancel={() => setShowWeeklyPlan(false)}
              onGoalsHabitsChange={onGoalsHabitsChange}
              onReminderStateChange={onReminderStateChange}
              profile={profile}
              reminderState={reminderState}
              weights={weights}
            />
          </Suspense>
        </div>
      )}

      <div className="insight-plan" aria-live="polite">
        <h3>AI-förslag</h3>
        <p>
          Regelbaserade råd visas alltid direkt. Remote AI kan formulera upp till tre förslag från en minimerad sammanfattning, men ändrar aldrig verifierade fakta.
        </p>
        <dl className="metric-list" id="remote-coach-data-preview">
          <div><dt>Vikttrend</dt><dd>{remotePreview.weight}</dd></div>
          <div><dt>Nutrition</dt><dd>{remotePreview.nutrition}</dd></div>
          <div><dt>Aktivitet</dt><dd>{remotePreview.activity}</dd></div>
          <div><dt>Mål</dt><dd>{remotePreview.goals}</dd></div>
          <div><dt>Coachminne</dt><dd>{remotePreview.memory}</dd></div>
          <div><dt>Coverage</dt><dd>{remotePreview.coverage}</dd></div>
          <div><dt>Confidence</dt><dd>{remotePreview.confidence}</dd></div>
        </dl>
        <p className="estimate-note">
          Skickas inte: e-post, session, device-ID, rå måltidshistorik, full viktlogg, bilder, localStorage eller exportdata.
        </p>
        <div className="report-v3-actions">
          <button
            className={remoteConsent ? 'secondary-button' : 'primary-button'}
            type="button"
            onClick={() => updateRemoteConsent(!remoteConsent)}
          >
            {remoteConsent ? 'Stäng av remote AI' : 'Aktivera remote AI'}
          </button>
          <button
            aria-busy={remoteCoachLoading}
            aria-describedby="remote-coach-data-preview"
            className="primary-button"
            disabled={!remoteConsent || remoteCoachLoading}
            type="button"
            onClick={requestRemoteCoach}
          >
            {remoteCoachLoading ? 'Analyserar...' : 'Skapa AI-förslag'}
          </button>
          {remoteCoachLoading && (
            <button type="button" onClick={cancelRemoteCoachRequest}>Avbryt</button>
          )}
        </div>
        {remoteCoachStatus && <p className="form-success" role="status">{remoteCoachStatus}</p>}
        {remoteCoachError && <p className="analysis-status" role="alert">{remoteCoachError}</p>}
        {remoteCoachResult?.coach && (
          <div className="report-v3-card">
            <h4>{remoteCoachResult.providerType === 'ruleBased' ? 'Regelbaserad fallback' : 'AI-genererat förslag'}</h4>
            <p>{remoteCoachResult.coach.summary}</p>
            <p className="estimate-note">
              Provider: {remoteCoachResult.providerType || remoteCoachResult.coach.providerType}. Genererad: {remoteCoachResult.coach.generatedAt || remoteCoachResult.generatedAt || 'nyss'}.
            </p>
            {remoteRecommendations.length > 0 && (
              <RecommendationList onAction={openActionDraft} onFeedback={handleFeedback} recommendations={remoteRecommendations} />
            )}
            <p className="estimate-note">{remoteCoachResult.coach.safetyNote}</p>
          </div>
        )}
      </div>

      <div className="insight-plan">
        <h3>Rekommenderade nästa steg</h3>
        <p>Nästa rekommenderade åtgärd: {nextAction}</p>
        <RecommendationList onAction={openActionDraft} onFeedback={handleFeedback} recommendations={model.recommendations} />
        {model.recommendations[0] && (
          <p className="estimate-note">Varför detta prioriteras: {explainCoachAdaptation(model.recommendations[0], model)}</p>
        )}
      </div>

      {actionDraft && (
        <form
          aria-describedby={actionError ? 'coach-action-error' : 'coach-action-help'}
          className="inline-edit-form coach-action-form"
          onSubmit={saveCoachAction}
        >
          <h3 tabIndex={-1} ref={actionFormRef}>Skapa coachaction</h3>
          <p id="coach-action-help">
            Redigera förslaget innan du sparar. Inget sparas förrän du bekräftar.
          </p>
          {actionStatus && <p className="form-success" role="status" aria-live="polite">{actionStatus}</p>}
          {(actionError || duplicate.duplicate || !draftValidation.ok) && (
            <p className="analysis-status" id="coach-action-error" role="alert">
              {actionError || duplicate.message || draftValidation.errors.join(' ')}
            </p>
          )}
          <label>
            <span>Actiontyp</span>
            <select
              value={actionDraft.actionType}
              onChange={(event) => updateActionDraft(buildCoachActionDraft(actionRecommendation, {
                ...actionDraft,
                actionType: event.target.value,
                analysisDate,
              }))}
            >
              {coachActionTypes.map((type) => (
                <option key={type} value={type}>{actionTypeLabels[type]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Titel</span>
            <input
              aria-invalid={!actionDraft.title}
              value={actionDraft.title}
              onChange={(event) => updateActionDraft({ title: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Konkret handling</span>
            <textarea
              aria-invalid={!actionDraft.description}
              value={actionDraft.description}
              onChange={(event) => updateActionDraft({ description: event.target.value })}
              required
            />
          </label>
          {actionDraft.actionType !== 'weeklyFocus' && (
            <label>
              <span>Mål/antal</span>
              <input
                inputMode="decimal"
                value={actionDraft.target}
                onChange={(event) => updateActionDraft({ target: event.target.value })}
              />
            </label>
          )}
          {(actionDraft.actionType === 'reminder' || actionDraft.actionType === 'habit') && (
            <label>
              <span>Tid</span>
              <input
                type="time"
                value={actionDraft.reminderTime}
                onChange={(event) => updateActionDraft({ reminderTime: event.target.value })}
              />
            </label>
          )}
          <p>
            Rekommenderas eftersom: {actionRecommendation?.text}
          </p>
          <p>
            Confidence {Math.round(actionDraft.confidence * 100).toLocaleString('sv-SE')}% · Coverage {Math.round(actionDraft.coverage * 100).toLocaleString('sv-SE')}%.
          </p>
          <p className="estimate-note">Säkerhetsnotis: bara neutrala och realistiska actions kan sparas.</p>
          <div className="habit-actions">
            <button type="submit" className="primary-button" disabled={isSavingAction || duplicate.duplicate || !draftValidation.ok}>
              {isSavingAction ? 'Sparar...' : 'Bekräfta och spara'}
            </button>
            <button type="button" onClick={closeActionDraft}>Avbryt</button>
            {duplicate.duplicate && duplicate.entityId && (
              <a className="secondary-button" href={duplicate.entityType === 'reminder' ? '#reminder-center' : '#mal-vanor'}>
                Öppna befintligt objekt
              </a>
            )}
          </div>
        </form>
      )}

      <div className="insight-plan">
        <h3>Senaste coachåtgärder</h3>
        <p>Senaste tidslinjehändelse: {timelineSummary.latestEvent?.title || 'Ingen historik ännu'}.</p>
        <p>Senaste positiva outcome: {timelineSummary.positiveOutcome?.title || 'Saknas ännu'}.</p>
        <button
          aria-controls="adaptive-coach-timeline"
          aria-expanded={showTimeline}
          className="secondary-button"
          type="button"
          onClick={() => setShowTimeline((current) => !current)}
        >
          {showTimeline ? 'Dölj coachhistorik' : 'Visa coachhistorik'}
        </button>
        <FeedbackHistory recentActions={feedbackSummary.recentActions} />
      </div>

      {showTimeline && (
        <div id="adaptive-coach-timeline">
          <Suspense fallback={<div className="report-v3-card" role="status">Laddar coachhistorik...</div>}>
            <AdaptiveCoachTimeline
              adaptiveCoachFeedback={adaptiveCoachFeedback}
              analysisDate={analysisDate}
              coachModel={model}
              goalsHabits={goalsHabits}
              onClose={() => setShowTimeline(false)}
              reminderState={reminderState}
            />
          </Suspense>
        </div>
      )}

      <p className="estimate-note">{model.safetyNote}</p>
    </section>
  )
}

export default AdaptiveCoachPanel

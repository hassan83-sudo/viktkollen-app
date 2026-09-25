import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CompanionProfilePanel from '../companion/CompanionProfilePanel.jsx'
import {
  clearWellbeingPlan,
  createPreparedSupportMessage,
  createWellbeingCheckIn,
  evaluateWellbeingSafety,
  getAgeLanguage,
  getWellbeingCoachCapabilities,
  moodOptions,
  readWellbeingState,
  reasonOptions,
  saveWellbeingState,
  updateWellbeingPlan,
  wellbeingRetentionDays,
  wellbeingStorageKey,
} from './wellbeingModel.js'

const quickActions = ['breathe', 'grounding', 'distract', 'write', 'contact', 'helpNow']
const emergencyChoices = ['calm', 'contact', 'unsafe', 'otherDanger']
const planFields = ['warningSigns', 'helps', 'safePeople', 'safePlaces', 'careContacts', 'personalSupportLine']

function AccordionHeader({ contentId, eyebrow, isOpen, meta, onToggle, title, titleId }) {
  return (
    <h2 id={titleId} className="wellbeing-accordion-heading">
      <button
        aria-controls={contentId}
        aria-expanded={isOpen}
        className="wellbeing-accordion-trigger"
        type="button"
        onClick={onToggle}
      >
        <span className="wellbeing-accordion-trigger-title">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <span>{title}</span>
        </span>
        {meta ? <span className="wellbeing-accordion-trigger-meta">{meta}</span> : null}
        <span aria-hidden="true" className="wellbeing-accordion-icon">{isOpen ? '−' : '+'}</span>
      </button>
    </h2>
  )
}

function WellbeingCenter({ onOpenAiCoach, profile = {}, readyState = {} }) {
  const { t } = useTranslation('wellbeing')
  const [state, setState] = useState(readWellbeingState)
  const [draft, setDraft] = useState({ mood: '', note: '', reasons: [] })
  const [selectedExercise, setSelectedExercise] = useState('breathe')
  const [emergencyChoice, setEmergencyChoice] = useState('')
  const [coachDraft, setCoachDraft] = useState('')
  const [contactName, setContactName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [status, setStatus] = useState('')
  const [openSections, setOpenSections] = useState({
    checkin: true,
    actions: false,
    exercise: false,
    coach: false,
    contact: false,
    emergency: false,
    plan: false,
  })
  const coachCapabilities = getWellbeingCoachCapabilities()
  const safety = evaluateWellbeingSafety(coachDraft)
  const ageLanguage = getAgeLanguage(profile, readyState)
  const preparedMessage = createPreparedSupportMessage()
  const latestCheckIn = state.checkIns.at(-1) || null
  const hasPlan = planFields.some((field) => state.plan[field])

  function toggleSection(key) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }))
  }

  function openSection(key) {
    setOpenSections((current) => ({ ...current, [key]: true }))
  }

  function persist(next, message = '') {
    setState(saveWellbeingState(next))
    if (message) setStatus(message)
  }

  function toggleReason(reason) {
    setDraft((current) => ({
      ...current,
      reasons: current.reasons.includes(reason)
        ? current.reasons.filter((item) => item !== reason)
        : [...current.reasons, reason],
    }))
  }

  function saveCheckIn() {
    if (!draft.mood) {
      setStatus(t('status.skipped'))
      return
    }
    persist(createWellbeingCheckIn(state, draft), t('status.checkInSaved'))
    setDraft({ mood: '', note: '', reasons: [] })
  }

  function skipCheckIn() {
    setDraft({ mood: '', note: '', reasons: [] })
    setStatus(t('status.skipped'))
  }

  function updatePlanField(field, value) {
    persist(updateWellbeingPlan(state, { ...state.plan, [field]: value }))
    setDeleteConfirm(false)
  }

  function clearPlan() {
    persist(clearWellbeingPlan(state), t('status.planCleared'))
    setDeleteConfirm(false)
  }

  function chooseQuickAction(action) {
    if (action === 'helpNow') {
      openSection('emergency')
      return
    }
    if (action === 'contact') {
      openSection('contact')
      return
    }
    setSelectedExercise(action)
    openSection('exercise')
  }

  const exercise = useMemo(() => ({
    steps: t(`exercises.${selectedExercise}.steps`, { returnObjects: true }),
    title: t(`exercises.${selectedExercise}.title`),
  }), [selectedExercise, t])

  return (
    <div className="wellbeing-center" id="wellbeing-center">
      <header className="wellbeing-hero">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2>{t('title')}</h2>
        <p>{t(`intro.${ageLanguage}`)}</p>
      </header>

      {status && <p className="form-success" role="status" aria-live="polite">{status}</p>}

      <CompanionProfilePanel mode="compact" surface="wellbeing" />

      <section className="wellbeing-panel wellbeing-coach-entry" aria-labelledby="wellbeing-coach-entry-title">
        <div className="wellbeing-panel-heading">
          <h2 id="wellbeing-coach-entry-title">{t('coachEntry.title')}</h2>
        </div>
        <p>{t('coachEntry.body')}</p>
        <button className="primary-button" type="button" onClick={() => onOpenAiCoach?.()}>
          {t('coachEntry.cta')}
        </button>
      </section>

      <section className="wellbeing-panel" aria-labelledby="wellbeing-checkin-title">
        <AccordionHeader
          contentId="wellbeing-checkin-content"
          isOpen={openSections.checkin}
          meta={latestCheckIn ? t('checkIn.saved') : t('checkIn.private')}
          onToggle={() => toggleSection('checkin')}
          title={t('checkIn.title')}
          titleId="wellbeing-checkin-title"
        />
        {openSections.checkin && (
          <div className="wellbeing-accordion-content" id="wellbeing-checkin-content">
            <div className="wellbeing-choice-grid" role="group" aria-label={t('checkIn.moodAria')}>
              {moodOptions.map((mood) => (
                <button
                  aria-pressed={draft.mood === mood}
                  className={draft.mood === mood ? 'is-selected' : ''}
                  key={mood}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, mood }))}
                >
                  {t(`moods.${mood}`)}
                </button>
              ))}
            </div>
            <div className="wellbeing-reasons" role="group" aria-label={t('checkIn.reasonsAria')}>
              {reasonOptions.map((reason) => (
                <label key={reason}>
                  <input type="checkbox" checked={draft.reasons.includes(reason)} onChange={() => toggleReason(reason)} />
                  {t(`reasons.${reason}`)}
                </label>
              ))}
            </div>
            <label>{t('checkIn.note')}<textarea rows="3" value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} /></label>
            <div className="wellbeing-actions">
              <button className="primary-button" type="button" onClick={saveCheckIn}>{t('checkIn.save')}</button>
              <button type="button" onClick={skipCheckIn}>{t('checkIn.skip')}</button>
            </div>
          </div>
        )}
      </section>

      <section className="wellbeing-panel" aria-labelledby="wellbeing-actions-title">
        <AccordionHeader
          contentId="wellbeing-actions-content"
          isOpen={openSections.actions}
          onToggle={() => toggleSection('actions')}
          title={t('quick.title')}
          titleId="wellbeing-actions-title"
        />
        {openSections.actions && (
          <div className="wellbeing-accordion-content" id="wellbeing-actions-content">
            <div className="wellbeing-quick-grid">
              {quickActions.map((action) => (
                <button key={action} type="button" onClick={() => chooseQuickAction(action)}>
                  <span aria-hidden="true">{t(`quick.${action}.icon`)}</span>
                  <strong>{t(`quick.${action}.title`)}</strong>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="wellbeing-panel" aria-labelledby="wellbeing-exercise-title">
        <AccordionHeader
          contentId="wellbeing-exercise-content"
          isOpen={openSections.exercise}
          onToggle={() => toggleSection('exercise')}
          title={exercise.title}
          titleId="wellbeing-exercise-title"
        />
        {openSections.exercise && (
          <div className="wellbeing-accordion-content" id="wellbeing-exercise-content">
            <ol className="wellbeing-steps">
              {Array.isArray(exercise.steps) ? exercise.steps.map((step) => <li key={step}>{step}</li>) : null}
            </ol>
            <p className="estimate-note">{t('exercises.limits')}</p>
            <div className="wellbeing-actions">
              <button type="button" onClick={() => setSelectedExercise('breathe')}>{t('exercises.stop')}</button>
            </div>
          </div>
        )}
      </section>

      <section className="wellbeing-panel" aria-labelledby="wellbeing-coach-title">
        <AccordionHeader
          contentId="wellbeing-coach-content"
          eyebrow={t('coach.eyebrow')}
          isOpen={openSections.coach}
          meta={<span className="wellbeing-pill">{coachCapabilities.placeholder ? t('coach.preview') : t('coach.available')}</span>}
          onToggle={() => toggleSection('coach')}
          title={t('coach.title')}
          titleId="wellbeing-coach-title"
        />
        {openSections.coach && (
          <div className="wellbeing-accordion-content" id="wellbeing-coach-content">
            <p>{t('coach.body')}</p>
            <label>{t('coach.prompt')}<textarea rows="3" value={coachDraft} onChange={(event) => setCoachDraft(event.target.value)} /></label>
            {safety.immediateRisk ? (
              <div className="wellbeing-urgent" role="alert">
                <strong>{t('emergency.call112')}</strong>
                <p>{t('coach.safety')}</p>
              </div>
            ) : (
              <p className="estimate-note">{t('coach.placeholder')}</p>
            )}
          </div>
        )}
      </section>

      <section className="wellbeing-panel" aria-labelledby="wellbeing-contact-title">
        <AccordionHeader
          contentId="wellbeing-contact-content"
          isOpen={openSections.contact}
          onToggle={() => toggleSection('contact')}
          title={t('contact.title')}
          titleId="wellbeing-contact-title"
        />
        {openSections.contact && (
          <div className="wellbeing-accordion-content" id="wellbeing-contact-content">
            <label>{t('contact.name')}<input value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
            <label>{t('contact.message')}<textarea readOnly rows="3" value={preparedMessage} /></label>
            <p className="estimate-note">{t('contact.limit')}</p>
          </div>
        )}
      </section>

      <section className="wellbeing-panel" aria-labelledby="wellbeing-emergency-title">
        <AccordionHeader
          contentId="wellbeing-emergency-content"
          isOpen={openSections.emergency}
          onToggle={() => toggleSection('emergency')}
          title={t('emergency.title')}
          titleId="wellbeing-emergency-title"
        />
        {openSections.emergency && (
          <div className="wellbeing-accordion-content" id="wellbeing-emergency-content">
            <div className="wellbeing-choice-grid">
              {emergencyChoices.map((choice) => (
                <button
                  className={emergencyChoice === choice ? 'is-selected' : ''}
                  key={choice}
                  type="button"
                  onClick={() => setEmergencyChoice(choice)}
                >
                  {t(`emergency.choices.${choice}`)}
                </button>
              ))}
            </div>
            {(emergencyChoice === 'unsafe' || emergencyChoice === 'otherDanger') && (
              <div className="wellbeing-urgent" role="alert">
                <strong>{t('emergency.call112')}</strong>
                <p>{t('emergency.noDelay')}</p>
              </div>
            )}
            <p className="estimate-note">{t('emergency.future')}</p>
          </div>
        )}
      </section>

      <section className="wellbeing-panel" aria-labelledby="wellbeing-plan-title">
        <AccordionHeader
          contentId="wellbeing-plan-content"
          isOpen={openSections.plan}
          meta={t('plan.private')}
          onToggle={() => toggleSection('plan')}
          title={t('plan.title')}
          titleId="wellbeing-plan-title"
        />
        {openSections.plan && (
          <div className="wellbeing-accordion-content" id="wellbeing-plan-content">
            {planFields.map((field) => (
              <label key={field}>{t(`plan.fields.${field}`)}<textarea rows="2" value={state.plan[field]} onChange={(event) => updatePlanField(field, event.target.value)} /></label>
            ))}
            <div className="wellbeing-actions">
              {!deleteConfirm ? (
                <button type="button" disabled={!hasPlan} onClick={() => setDeleteConfirm(true)}>{t('plan.delete')}</button>
              ) : (
                <>
                  <button className="secondary-button" type="button" onClick={clearPlan}>{t('plan.confirmDelete')}</button>
                  <button type="button" onClick={() => setDeleteConfirm(false)}>{t('plan.cancelDelete')}</button>
                </>
              )}
            </div>
            <p className="estimate-note">{t('privacy', { key: wellbeingStorageKey, days: wellbeingRetentionDays })}</p>
          </div>
        )}
      </section>
    </div>
  )
}

export default WellbeingCenter

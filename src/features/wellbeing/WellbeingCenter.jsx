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

function CompactWellbeingSection({ children, id, isOpen, meta = '', onToggle, title }) {
  return (
    <section className="wellbeing-panel wellbeing-compact-section" aria-labelledby={`${id}-title`}>
      <button
        aria-expanded={isOpen}
        className="wellbeing-section-toggle"
        id={`${id}-title`}
        type="button"
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className="wellbeing-section-toggle-end">
          {meta && <small>{meta}</small>}
          <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
        </span>
      </button>
      {isOpen && <div className="wellbeing-section-content">{children}</div>}
    </section>
  )
}

function WellbeingCenter({ profile = {}, readyState = {} }) {
  const { t } = useTranslation('wellbeing')
  const [state, setState] = useState(readWellbeingState)
  const [draft, setDraft] = useState({ mood: '', note: '', reasons: [] })
  const [selectedExercise, setSelectedExercise] = useState('breathe')
  const [emergencyChoice, setEmergencyChoice] = useState('')
  const [coachDraft, setCoachDraft] = useState('')
  const [contactName, setContactName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [status, setStatus] = useState('')
  const [openSection, setOpenSection] = useState('checkIn')
  const coachCapabilities = getWellbeingCoachCapabilities()
  const safety = evaluateWellbeingSafety(coachDraft)
  const ageLanguage = getAgeLanguage(profile, readyState)
  const preparedMessage = createPreparedSupportMessage()
  const latestCheckIn = state.checkIns.at(-1) || null
  const hasPlan = planFields.some((field) => state.plan[field])

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

  function toggleSection(section) {
    setOpenSection((current) => current === section ? '' : section)
  }

  function chooseQuickAction(action) {
    if (action === 'helpNow') {
      setOpenSection('emergency')
      return
    }
    if (action === 'contact') {
      setSelectedExercise('contact')
      setOpenSection('contact')
      return
    }
    setSelectedExercise(action)
    setOpenSection('exercise')
  }

  const exercise = useMemo(() => ({
    steps: t(`exercises.${selectedExercise}.steps`, { returnObjects: true }),
    title: t(`exercises.${selectedExercise}.title`),
  }), [selectedExercise, t])

  return (
    <div className="wellbeing-center" id="wellbeing-center">
      <header className="wellbeing-hero">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p>{t(`intro.${ageLanguage}`)}</p>
      </header>

      {status && <p className="form-success" role="status" aria-live="polite">{status}</p>}

      <CompanionProfilePanel mode="compact" surface="wellbeing" />

      <CompactWellbeingSection
        id="wellbeing-checkin"
        isOpen={openSection === 'checkIn'}
        meta={latestCheckIn ? t('checkIn.saved') : t('checkIn.private')}
        title={t('checkIn.title')}
        onToggle={() => toggleSection('checkIn')}
      >
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
      </CompactWellbeingSection>

      <CompactWellbeingSection
        id="wellbeing-actions"
        isOpen={openSection === 'quick'}
        title={t('quick.title')}
        onToggle={() => toggleSection('quick')}
      >
        <div className="wellbeing-quick-grid">
          {quickActions.map((action) => (
            <button key={action} type="button" onClick={() => chooseQuickAction(action)}>
              <span aria-hidden="true">{t(`quick.${action}.icon`)}</span>
              <strong>{t(`quick.${action}.title`)}</strong>
            </button>
          ))}
        </div>
      </CompactWellbeingSection>

      <CompactWellbeingSection
        id="wellbeing-exercise"
        isOpen={openSection === 'exercise'}
        title={exercise.title}
        onToggle={() => toggleSection('exercise')}
      >
        <div className="wellbeing-inline-action">
          <button type="button" onClick={() => setSelectedExercise('breathe')}>{t('exercises.stop')}</button>
        </div>
        <ol className="wellbeing-steps">
          {Array.isArray(exercise.steps) ? exercise.steps.map((step) => <li key={step}>{step}</li>) : null}
        </ol>
        <p className="estimate-note">{t('exercises.limits')}</p>
      </CompactWellbeingSection>

      <CompactWellbeingSection
        id="wellbeing-coach"
        isOpen={openSection === 'coach'}
        title={t('coach.title')}
        onToggle={() => toggleSection('coach')}
      >
        <div className="wellbeing-panel-heading">
          <div>
            <p className="eyebrow">{t('coach.eyebrow')}</p>
          </div>
          <span className="wellbeing-pill">{coachCapabilities.placeholder ? t('coach.preview') : t('coach.available')}</span>
        </div>
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
      </CompactWellbeingSection>

      <CompactWellbeingSection
        id="wellbeing-contact"
        isOpen={openSection === 'contact'}
        title={t('contact.title')}
        onToggle={() => toggleSection('contact')}
      >
        <label>{t('contact.name')}<input value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
        <label>{t('contact.message')}<textarea readOnly rows="3" value={preparedMessage} /></label>
        <p className="estimate-note">{t('contact.limit')}</p>
      </CompactWellbeingSection>

      <CompactWellbeingSection
        id="wellbeing-emergency"
        isOpen={openSection === 'emergency'}
        title={t('emergency.title')}
        onToggle={() => toggleSection('emergency')}
      >
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
      </CompactWellbeingSection>

      <CompactWellbeingSection
        id="wellbeing-plan"
        isOpen={openSection === 'plan'}
        meta={t('plan.private')}
        title={t('plan.title')}
        onToggle={() => toggleSection('plan')}
      >
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
      </CompactWellbeingSection>
    </div>
  )
}

export default WellbeingCenter

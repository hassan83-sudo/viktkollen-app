import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addRoutine,
  maxRoutineNameLength,
  maxRoutineStepLength,
  maxRoutines,
  maxStepsPerRoutine,
  readRoutines,
  removeRoutine,
  updateRoutine,
} from '../../services/accessibilityRoutines.js'
import AccessibilityFeedback from './AccessibilityFeedback.jsx'

// A11Y-7F: local, generic, user-authored task templates only - copied into
// the create form as a starting point, never treated as remote content and
// never medical/medication related. stepCount must match the real length of
// the matching accessibility.routines.templates.<id>.steps array in i18n.
const routineTemplates = [
  { id: 'morning', stepCount: 4 },
  { id: 'evening', stepCount: 4 },
  { id: 'readyToGo', stepCount: 4 },
  { id: 'walk', stepCount: 5 },
]

function emptyForm() {
  return { name: '', steps: [''] }
}

// A11Y-7F: this is the ONE step-by-step routine implementation, reached both
// from the AccessibilityHub "Steg för steg" section and (structurally)
// reusable anywhere else that might need it later - a generic task list, not
// a medical/medication compliance tool.
function AccessibilityRoutines() {
  const { t } = useTranslation('settings')
  const [routines, setRoutines] = useState(() => readRoutines())
  // 'list' | 'form' | 'run' | 'complete'
  const [view, setView] = useState('list')
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [formStatus, setFormStatus] = useState(null)
  const [deleteId, setDeleteId] = useState('')
  const [runRoutine, setRunRoutine] = useState(null)
  const [runStepIndex, setRunStepIndex] = useState(0)

  function openCreateForm() {
    setEditingId('')
    setForm(emptyForm())
    setFormStatus(null)
    setView('form')
  }

  function openEditForm(routine) {
    setEditingId(routine.id)
    setForm({ name: routine.name, steps: [...routine.steps] })
    setFormStatus(null)
    setView('form')
  }

  function applyTemplate(templateId, stepCount) {
    setForm({
      name: t(`accessibility.routines.templates.${templateId}.name`),
      steps: Array.from({ length: stepCount }, (_, index) => t(`accessibility.routines.templates.${templateId}.steps.${index}`)),
    })
    setFormStatus(null)
  }

  function updateStepText(index, value) {
    setForm((current) => ({ ...current, steps: current.steps.map((step, i) => (i === index ? value : step)) }))
  }

  function addStep() {
    setForm((current) => (
      current.steps.length >= maxStepsPerRoutine ? current : { ...current, steps: [...current.steps, ''] }
    ))
  }

  function removeStep(index) {
    setForm((current) => (
      current.steps.length <= 1 ? current : { ...current, steps: current.steps.filter((_, i) => i !== index) }
    ))
  }

  function moveStep(index, direction) {
    setForm((current) => {
      const target = index + direction
      if (target < 0 || target >= current.steps.length) return current
      const steps = [...current.steps]
      ;[steps[index], steps[target]] = [steps[target], steps[index]]
      return { ...current, steps }
    })
  }

  function cancelForm() {
    setView('list')
  }

  function submitForm(event) {
    event.preventDefault()
    const result = editingId
      ? updateRoutine(editingId, form)
      : addRoutine(form)

    if (result.error) {
      setFormStatus({ message: t(`accessibility.routines.${result.error}`), tone: 'error' })
      return
    }

    setRoutines(result.routines)
    setFormStatus(null)
    setView('list')
  }

  function requestDeleteRoutine(id) {
    setDeleteId(id)
  }

  function cancelDeleteRoutine() {
    setDeleteId('')
  }

  function confirmDeleteRoutine(routine) {
    setRoutines(removeRoutine(routine.id))
    setDeleteId('')
  }

  function startRun(routine) {
    setRunRoutine(routine)
    setRunStepIndex(0)
    setView('run')
  }

  function goBackStep() {
    setRunStepIndex((current) => Math.max(0, current - 1))
  }

  function goNextStep() {
    if (runStepIndex >= runRoutine.steps.length - 1) {
      setView('complete')
      return
    }
    setRunStepIndex((current) => current + 1)
  }

  // Run progress is intentionally not persisted anywhere (no storage write
  // here at all) - if the app closes mid-routine, starting over later is
  // the expected, accepted behavior for this sprint's scope.
  function exitRun() {
    setRunRoutine(null)
    setRunStepIndex(0)
    setView('list')
  }

  function runAgain() {
    setRunStepIndex(0)
    setView('run')
  }

  function closeCompletion() {
    setRunRoutine(null)
    setRunStepIndex(0)
    setView('list')
  }

  if (view === 'run' && runRoutine) {
    const isLastStep = runStepIndex >= runRoutine.steps.length - 1
    return (
      <section className="accessibility-routine-run" aria-label={runRoutine.name}>
        <p className="eyebrow">{runRoutine.name}</p>
        <p role="status">{t('accessibility.routines.run.progress', { current: runStepIndex + 1, total: runRoutine.steps.length })}</p>
        <h3 className="accessibility-routine-current-step">
          <span aria-hidden="true" className="accessibility-routine-step-number">{runStepIndex + 1}</span>
          <span>{runRoutine.steps[runStepIndex]}</span>
        </h3>
        <div className="accessibility-communication-actions">
          {runStepIndex > 0 && (
            <button className="secondary-button" type="button" onClick={goBackStep}>
              {t('accessibility.routines.run.back')}
            </button>
          )}
          <button className="primary-button" type="button" onClick={goNextStep}>
            {isLastStep ? t('accessibility.routines.run.done') : t('accessibility.routines.run.next')}
          </button>
          <button className="secondary-button" type="button" onClick={exitRun}>
            {t('accessibility.routines.run.exit')}
          </button>
        </div>
      </section>
    )
  }

  if (view === 'complete' && runRoutine) {
    return (
      <article className="accessibility-preview-card" aria-live="polite">
        <h3>{t('accessibility.routines.run.complete')}</h3>
        <p>{runRoutine.name}</p>
        <div className="accessibility-communication-actions">
          <button className="primary-button" type="button" onClick={closeCompletion}>
            {t('accessibility.routines.run.close')}
          </button>
          <button className="secondary-button" type="button" onClick={runAgain}>
            {t('accessibility.routines.run.runAgain')}
          </button>
        </div>
      </article>
    )
  }

  if (view === 'form') {
    return (
      <section aria-label={t(editingId ? 'accessibility.routines.editTitle' : 'accessibility.routines.createTitle')}>
        <h3>{t(editingId ? 'accessibility.routines.editTitle' : 'accessibility.routines.createTitle')}</h3>

        {!editingId && (
          <div className="accessibility-option-grid" aria-label={t('accessibility.routines.templatesLabel')}>
            {routineTemplates.map((template) => (
              <button
                className="accessibility-option-card"
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template.id, template.stepCount)}
              >
                {t(`accessibility.routines.templates.${template.id}.name`)}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submitForm}>
          <label>
            <span>{t('accessibility.routines.nameLabel')}</span>
            <input
              maxLength={maxRoutineNameLength}
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>

          <ol className="accessibility-routine-step-list">
            {form.steps.map((step, index) => (
              <li className="accessibility-routine-step-row" key={index}>
                <label>
                  <span>{t('accessibility.routines.stepLabel', { number: index + 1 })}</span>
                  <input
                    maxLength={maxRoutineStepLength}
                    type="text"
                    value={step}
                    onChange={(event) => updateStepText(index, event.target.value)}
                  />
                </label>
                <div className="accessibility-communication-actions">
                  <button
                    aria-label={t('accessibility.routines.moveUpAria', { number: index + 1 })}
                    disabled={index === 0}
                    type="button"
                    onClick={() => moveStep(index, -1)}
                  >
                    {t('accessibility.routines.moveUp')}
                  </button>
                  <button
                    aria-label={t('accessibility.routines.moveDownAria', { number: index + 1 })}
                    disabled={index === form.steps.length - 1}
                    type="button"
                    onClick={() => moveStep(index, 1)}
                  >
                    {t('accessibility.routines.moveDown')}
                  </button>
                  <button
                    aria-label={t('accessibility.routines.removeStepAria', { number: index + 1 })}
                    disabled={form.steps.length <= 1}
                    type="button"
                    onClick={() => removeStep(index)}
                  >
                    {t('accessibility.routines.removeStep')}
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <button className="secondary-button" disabled={form.steps.length >= maxStepsPerRoutine} type="button" onClick={addStep}>
            {t('accessibility.routines.addStep')}
          </button>

          <AccessibilityFeedback message={formStatus?.message} tone={formStatus?.tone} />

          <div className="accessibility-communication-actions">
            <button className="primary-button" type="submit">{t('accessibility.routines.save')}</button>
            <button className="secondary-button" type="button" onClick={cancelForm}>{t('accessibility.routines.cancel')}</button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="accessibility-routines" aria-label={t('accessibility.routines.title')}>
      <p className="accessibility-communication-privacy">{t('accessibility.routines.privacy')}</p>

      {routines.length === 0 ? (
        <p>{t('accessibility.routines.emptyList')}</p>
      ) : (
        <ul className="accessibility-routine-list">
          {routines.map((routine) => (
            <li className="accessibility-routine-card" key={routine.id}>
              <div>
                <strong>{routine.name}</strong>
                <span>{t('accessibility.routines.stepCount', { count: routine.steps.length })}</span>
              </div>
              <div className="accessibility-communication-actions">
                <button className="primary-button" type="button" onClick={() => startRun(routine)}>
                  {t('accessibility.routines.run.start')}
                </button>
                <button className="secondary-button" type="button" onClick={() => openEditForm(routine)}>
                  {t('accessibility.routines.edit')}
                </button>
                {deleteId === routine.id ? (
                  <div className="accessibility-my-phrase-delete-confirm" role="alert">
                    <p>{t('accessibility.routines.deleteConfirm', { name: routine.name })}</p>
                    <div className="accessibility-communication-actions">
                      <button className="secondary-button" type="button" onClick={() => confirmDeleteRoutine(routine)}>
                        {t('accessibility.routines.deleteYes')}
                      </button>
                      <button className="secondary-button" type="button" onClick={cancelDeleteRoutine}>
                        {t('accessibility.routines.deleteNo')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    aria-label={t('accessibility.routines.deleteAria', { name: routine.name })}
                    className="secondary-button"
                    type="button"
                    onClick={() => requestDeleteRoutine(routine.id)}
                  >
                    {t('accessibility.routines.delete')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <button className="primary-button" disabled={routines.length >= maxRoutines} type="button" onClick={openCreateForm}>
        {t('accessibility.routines.create')}
      </button>
    </section>
  )
}

export default AccessibilityRoutines

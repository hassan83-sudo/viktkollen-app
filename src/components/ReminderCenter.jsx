import { useEffect, useMemo, useRef, useState } from 'react'
import {
  archiveReminder,
  completeReminder,
  pauseReminder,
  restoreReminder,
  resumeReminder,
  skipReminder,
  snoozeReminder,
} from '../services/reminders/reminderActions.js'
import { normalizeReminder, normalizeReminderState, reminderTypes, validateReminder } from '../services/reminders/reminderModel.js'
import { buildReminderStatus, getDueReminders, getNextReminderAt } from '../services/reminders/reminderScheduler.js'
import { requestReminderNotificationPermission } from '../services/reminders/reminderNotifications.js'

const typeLabels = {
  check_in: 'Check-in',
  custom: 'Egen',
  goal: 'Mål',
  habit: 'Vana',
  meal_log: 'Måltid',
  monthly_report: 'Månadsrapport',
  steps: 'Steg',
  weekly_report: 'Veckorapport',
  weight: 'Vikt',
  workout: 'Träning',
}

const initialDraft = {
  description: '',
  scheduleType: 'daily',
  time: '09:00',
  title: '',
  type: 'custom',
}

function ReminderCenter({ goalsHabits = {}, onRemindersChange, reminderState = {}, schedulerStatus = {} }) {
  const titleRef = useRef(null)
  const [draft, setDraft] = useState(initialDraft)
  const [editingId, setEditingId] = useState('')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const state = useMemo(() => normalizeReminderState(reminderState), [reminderState])
  const due = useMemo(() => getDueReminders(state), [state])
  const status = useMemo(() => ({ ...buildReminderStatus(state), ...schedulerStatus }), [schedulerStatus, state])
  const activeReminders = state.reminders.filter((reminder) => !reminder.archivedAt)
  const archivedReminders = state.reminders.filter((reminder) => reminder.archivedAt)
  const linkedGoalsHabitsCount = [
    ...(Array.isArray(goalsHabits.goals) ? goalsHabits.goals : []),
    ...(Array.isArray(goalsHabits.habits) ? goalsHabits.habits : []),
  ].filter((item) => item.reminder?.enabled).length

  useEffect(() => {
    if (editingId) titleRef.current?.focus()
  }, [editingId])

  function persist(nextState, message) {
    onRemindersChange?.(normalizeReminderState(nextState))
    setStatusMessage(message)
    setError('')
  }

  function resetDraft() {
    setDraft(initialDraft)
    setEditingId('')
  }

  function submitReminder(event) {
    event.preventDefault()
    const now = new Date().toISOString()
    const reminder = normalizeReminder({
      ...draft,
      createdAt: editingId ? state.reminders.find((entry) => entry.id === editingId)?.createdAt : now,
      id: editingId || `reminder-${draft.type}-${now}`,
      source: 'user',
      updatedAt: now,
    }, { now })
    const validation = validateReminder(reminder)

    if (!validation.ok) {
      setError(validation.errors.join(' '))
      return
    }

    persist({
      ...state,
      reminders: [
        ...state.reminders.filter((entry) => entry.id !== reminder.id),
        validation.reminder,
      ],
      updatedAt: now,
    }, editingId ? 'Påminnelsen sparades.' : 'Påminnelsen skapades.')
    resetDraft()
  }

  function editReminder(reminder) {
    setDraft({
      description: reminder.description,
      scheduleType: reminder.scheduleType,
      time: reminder.time,
      title: reminder.title,
      type: reminder.type,
    })
    setEditingId(reminder.id)
  }

  async function requestPermission() {
    const result = await requestReminderNotificationPermission()
    setStatusMessage(result.ok ? 'Webbläsarnotiser är aktiverade.' : 'Webbläsarnotiser är inte aktiverade. Påminnelser i appen fungerar ändå.')
  }

  function updateByAction(action, reminderId, message, ...args) {
    persist(action(state, reminderId, ...args), message)
  }

  return (
    <section className="panel reminder-center" id="reminder-center" aria-labelledby="reminder-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Påminnelser</p>
          <h2 id="reminder-center-heading">Smarta påminnelser</h2>
        </div>
        <span className="insight-coverage">{status.dueCount} förfallna</span>
      </div>

      {statusMessage && <p className="form-success" role="status" aria-live="polite">{statusMessage}</p>}
      {error && <p className="analysis-status" id="reminder-error" role="alert">{error}</p>}

      <div className="reminder-summary-grid">
        <span>Nästa: {status.nextReminderAt ? new Date(status.nextReminderAt).toLocaleString('sv-SE') : 'Ingen planerad'}</span>
        <span>Aktiva: {status.enabledCount}</span>
        <span>Uppskjutna: {status.snoozedCount}</span>
        <span>Notiser: {status.permissionState}</span>
      </div>

      <form className="inline-edit-form" onSubmit={submitReminder} aria-describedby={error ? 'reminder-error' : undefined}>
        <h3>{editingId ? 'Redigera påminnelse' : 'Skapa påminnelse'}</h3>
        <label>
          <span>Typ</span>
          <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}>
            {reminderTypes.map((type) => <option key={type} value={type}>{typeLabels[type] || type}</option>)}
          </select>
        </label>
        <label>
          <span>Titel</span>
          <input ref={titleRef} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} aria-invalid={Boolean(error)} required />
        </label>
        <label>
          <span>Beskrivning</span>
          <input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
        </label>
        <label>
          <span>Tid</span>
          <input type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} />
        </label>
        <div className="habit-actions">
          <button type="submit" className="primary-button">{editingId ? 'Spara' : 'Skapa'}</button>
          {editingId && <button type="button" onClick={resetDraft}>Avbryt</button>}
          <button type="button" className="secondary-button" onClick={requestPermission}>Aktivera webbläsarnotiser</button>
        </div>
      </form>

      <div className="reminder-columns">
        <article>
          <h3>Förfallna</h3>
          <ReminderList reminders={due} onArchive={updateByAction} onComplete={updateByAction} onEdit={editReminder} onPause={updateByAction} onRestore={updateByAction} onResume={updateByAction} onSkip={updateByAction} onSnooze={updateByAction} />
        </article>
        <article>
          <h3>Kommande och pausade</h3>
          <ReminderList reminders={activeReminders} onArchive={updateByAction} onComplete={updateByAction} onEdit={editReminder} onPause={updateByAction} onRestore={updateByAction} onResume={updateByAction} onSkip={updateByAction} onSnooze={updateByAction} />
        </article>
      </div>

      <details>
        <summary>Arkiv och historik</summary>
        <ReminderList reminders={archivedReminders} onArchive={updateByAction} onComplete={updateByAction} onEdit={editReminder} onPause={updateByAction} onRestore={updateByAction} onResume={updateByAction} onSkip={updateByAction} onSnooze={updateByAction} />
        <p className="estimate-note">{state.history.length} historikhändelser. {linkedGoalsHabitsCount} kopplade mål/vanor har påminnelser.</p>
      </details>
    </section>
  )
}

function ReminderList({ reminders, onArchive, onComplete, onEdit, onPause, onRestore, onResume, onSkip, onSnooze }) {
  if (!reminders.length) return <p className="estimate-note">Inga påminnelser här.</p>

  return (
    <ul className="goals-list reminder-card-list">
      {reminders.map((reminder) => (
        <li key={reminder.id}>
          <strong>{reminder.title}</strong>
          <span>{reminder.description}</span>
          <span>Nästa: {getNextReminderAt(reminder) ? new Date(getNextReminderAt(reminder)).toLocaleString('sv-SE') : 'Ej schemalagd'}</span>
          <div className="habit-actions">
            <button type="button" onClick={() => onEdit(reminder)}>Redigera</button>
            <button type="button" onClick={() => onComplete(completeReminder, reminder.id, 'Markerad klar.')}>Klar</button>
            <button type="button" onClick={() => onSnooze(snoozeReminder, reminder.id, 'Visas igen om 30 minuter.', 30)}>Visa senare</button>
            <button type="button" onClick={() => onSkip(skipReminder, reminder.id, 'Påminnelsen hoppades över.')}>Hoppa över</button>
            {reminder.pausedAt
              ? <button type="button" onClick={() => onResume(resumeReminder, reminder.id, 'Påminnelsen återupptogs.')}>Återuppta</button>
              : <button type="button" onClick={() => onPause(pauseReminder, reminder.id, 'Påminnelsen pausades.')}>Pausa</button>}
            {reminder.archivedAt
              ? <button type="button" onClick={() => onRestore(restoreReminder, reminder.id, 'Påminnelsen återställdes avstängd.')}>Återställ</button>
              : <button type="button" onClick={() => onArchive(archiveReminder, reminder.id, 'Påminnelsen arkiverades.')}>Arkivera</button>}
          </div>
        </li>
      ))}
    </ul>
  )
}

export default ReminderCenter

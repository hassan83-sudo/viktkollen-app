import { useEffect, useMemo, useRef, useState } from 'react'
import {
  acceptWeeklyFocus,
  buildGoalsHabitsReportSummary,
  buildGoalsHabitsViewModel,
  configureGoalsHabitsReminder,
  createDefaultHabits,
  createGoal,
  createHabit,
  deleteArchivedGoalsHabitsItem,
  goalsHabitsStorageKey,
  markManualHabitDone,
  moveWeeklyFocusToNextWeek,
  normalizeGoalsHabitsState,
  restoreGoalsHabitsItem,
  undoManualHabitDone,
  updateGoal,
  updateGoalsHabitsItemStatus,
  updateHabit,
  updateWeeklyFocus,
} from '../services/goalsHabits.js'
import { buildAiNutritionCoachInsights } from '../services/aiNutritionInsights.js'

const goalOptions = [
  ['protein', 'Proteinmål', 'g', 'day'],
  ['steps', 'Stegmål', 'steg', 'day'],
  ['workout', 'Träningspass', 'pass', 'week'],
  ['custom', 'Eget mål', 'gånger', 'week'],
]

const habitOptions = [
  ['meal_logging', 'Logga måltid', 'automatic'],
  ['check_in', 'Gör check-in', 'automatic'],
  ['steps', 'Nå stegmålet', 'automatic'],
  ['workout', 'Registrera träning', 'automatic'],
  ['custom', 'Egen vana', 'manual'],
]

function toDraft(item = {}, kind = 'goal') {
  return {
    activeDays: item.activeDays || [],
    category: item.category || (kind === 'goal' ? 'protein' : 'custom'),
    description: item.description || '',
    frequency: item.frequency || 'daily',
    id: item.id || '',
    kind,
    linkedDataSource: item.linkedDataSource || item.category || '',
    period: item.period || 'week',
    reminderEnabled: item.reminder?.enabled || false,
    reminderTime: item.reminder?.time || '09:00',
    status: item.status || 'active',
    target: item.target ?? item.targetCount ?? '',
    targetDate: item.targetDate || '',
    title: item.title || '',
    trackingMode: item.trackingMode || 'automatic',
    unit: item.unit || '',
  }
}

function GoalsHabitsPanel({
  analysisDate,
  checkIn,
  checkIns = [],
  goalsHabits,
  meals = [],
  nutritionGoals = {},
  onGoalsHabitsChange,
  profile = {},
  weights = [],
}) {
  const editFormRef = useRef(null)
  const lastTriggerRef = useRef(null)
  const [goalDraft, setGoalDraft] = useState({ category: 'protein', target: '120', title: 'Nå proteinmålet' })
  const [habitDraft, setHabitDraft] = useState({ category: 'custom', title: 'Kvällspromenad', trackingMode: 'manual' })
  const [editing, setEditing] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [showArchive, setShowArchive] = useState(false)
  const [focusDraft, setFocusDraft] = useState(null)
  const [pendingSubmit, setPendingSubmit] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [fieldError, setFieldError] = useState('')
  const state = useMemo(() => normalizeGoalsHabitsState(goalsHabits), [goalsHabits])
  const data = useMemo(() => ({
    checkIn,
    checkIns,
    meals,
    nutritionGoals,
    profile,
    weights,
  }), [checkIn, checkIns, meals, nutritionGoals, profile, weights])
  const viewModel = useMemo(
    () => buildGoalsHabitsViewModel(state, data, { analysisDate }),
    [analysisDate, data, state],
  )
  const reportSummary = useMemo(
    () => buildGoalsHabitsReportSummary(state, data, { analysisDate }),
    [analysisDate, data, state],
  )
  const insightReport = useMemo(() => buildAiNutritionCoachInsights(data, { analysisDate }), [analysisDate, data])
  const focusSuggestion = insightReport.actionPlan[0]

  useEffect(() => {
    if (editing && editFormRef.current) editFormRef.current.focus()
  }, [editing])

  function persist(nextState, message) {
    onGoalsHabitsChange?.(normalizeGoalsHabitsState(nextState))
    setStatusMessage(message)
    setFieldError('')
  }

  function addStarterHabits() {
    persist({
      ...state,
      habits: [...state.habits, ...createDefaultHabits()],
    }, 'Startvanor har lagts till.')
  }

  function addGoal(event) {
    event.preventDefault()
    if (pendingSubmit) return
    setPendingSubmit(true)
    const option = goalOptions.find(([category]) => category === goalDraft.category)
    const goal = createGoal({
      category: goalDraft.category,
      period: option?.[3] || 'week',
      progressMode: goalDraft.category === 'custom' ? 'manual' : 'automatic',
      target: goalDraft.target,
      title: goalDraft.title,
      unit: option?.[2] || 'gånger',
    }, { state })

    if (!goal) {
      setFieldError('Målet kunde inte skapas. Kontrollera nivå, text och kategori.')
      setPendingSubmit(false)
      return
    }

    persist({ ...state, goals: [...state.goals, goal] }, 'Mål skapat.')
    setPendingSubmit(false)
  }

  function addHabit(event) {
    event.preventDefault()
    if (pendingSubmit) return
    setPendingSubmit(true)
    const option = habitOptions.find(([category]) => category === habitDraft.category)
    const habit = createHabit({
      category: habitDraft.category,
      title: habitDraft.title,
      trackingMode: habitDraft.trackingMode || option?.[2] || 'automatic',
    })

    if (!habit) {
      setFieldError('Vanan kunde inte skapas. Välj en neutral och realistisk formulering.')
      setPendingSubmit(false)
      return
    }

    persist({ ...state, habits: [...state.habits, habit] }, 'Vana skapad.')
    setPendingSubmit(false)
  }

  function updateStatus(kind, id, status) {
    persist(updateGoalsHabitsItemStatus(state, kind, id, status), status === 'archived' ? 'Objektet arkiverades.' : 'Status uppdaterad.')
  }

  function startEdit(kind, item, event) {
    lastTriggerRef.current = event?.currentTarget || null
    setEditing({ id: item.id, kind })
    setEditDraft(toDraft(item, kind))
    setFieldError('')
  }

  function closeEdit() {
    setEditing(null)
    setEditDraft(null)
    setFieldError('')
    lastTriggerRef.current?.focus?.()
  }

  function saveEdit(event) {
    event.preventDefault()
    if (!editing || !editDraft || pendingSubmit) return
    setPendingSubmit(true)
    const result = editing.kind === 'goal'
      ? updateGoal(state, editing.id, {
        description: editDraft.description,
        linkedDataSource: editDraft.linkedDataSource,
        period: editDraft.period,
        status: editDraft.status,
        target: editDraft.target,
        targetDate: editDraft.targetDate,
        title: editDraft.title,
        unit: editDraft.unit,
      })
      : updateHabit(state, editing.id, {
        activeDays: editDraft.activeDays,
        category: editDraft.category,
        frequency: editDraft.frequency,
        linkedDataSource: editDraft.linkedDataSource,
        status: editDraft.status,
        targetCount: editDraft.target,
        title: editDraft.title,
        trackingMode: editDraft.trackingMode,
      })

    if (result.error) {
      setFieldError(result.error)
      setPendingSubmit(false)
      return
    }

    const withReminder = editDraft.reminderEnabled
      ? configureGoalsHabitsReminder(result.state, editing.kind, editing.id, {
        enabled: true,
        time: editDraft.reminderTime,
      })
      : result.state
    persist(withReminder, 'Ändringar sparade.')
    setPendingSubmit(false)
    closeEdit()
  }

  function markDone(habitId) {
    persist(markManualHabitDone(state, habitId, analysisDate), 'Vanan markerades klar.')
  }

  function undoDone(habitId) {
    persist(undoManualHabitDone(state, habitId, analysisDate), 'Markeringen ångrades.')
  }

  function prepareFocus() {
    if (!focusSuggestion) return
    setFocusDraft({
      action: focusSuggestion.action || focusSuggestion.why || '',
      linkedInsightId: focusSuggestion.insightId,
      reason: focusSuggestion.why,
      title: focusSuggestion.title,
    })
  }

  function acceptFocus(event) {
    event?.preventDefault()
    if (!focusDraft && !focusSuggestion) return
    const source = focusDraft || {
      linkedInsightId: focusSuggestion.insightId,
      reason: focusSuggestion.why,
      title: focusSuggestion.title,
    }
    persist(acceptWeeklyFocus(state, source, { analysisDate }), 'Veckofokus aktiverat.')
    setFocusDraft(null)
  }

  const archivedItems = [
    ...viewModel.archivedGoals.map((goal) => ({ item: goal, kind: 'goal' })),
    ...viewModel.archivedHabits.map((habit) => ({ item: habit, kind: 'habit' })),
  ]

  return (
    <section className="panel goals-habits-panel" id="mal-vanor" aria-labelledby="goals-habits-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Mål & vanor</p>
          <h2 id="goals-habits-heading">Veckofokus och vardagsvanor</h2>
        </div>
        <span className="insight-coverage">{viewModel.completionRate}% i dag</span>
      </div>

      {statusMessage && <p className="form-success" role="status" aria-live="polite">{statusMessage}</p>}
      {fieldError && <p className="analysis-status" id="goals-habits-error" role="alert">{fieldError}</p>}

      {viewModel.empty && (
        <div className="empty-state">
          <h3>Börja smått</h3>
          <p>Lägg till några automatiska startvanor eller skapa ett eget mål. Streaks visas neutralt och kan alltid startas om.</p>
          <button type="button" className="primary-button" onClick={addStarterHabits}>Lägg till startvanor</button>
        </div>
      )}

      <div className="weekly-focus-band">
        <div>
          <h3>Veckofokus</h3>
          <p>{reportSummary.summary} {reportSummary.positiveProgress}</p>
        </div>
        {focusSuggestion && <button type="button" className="secondary-button" onClick={prepareFocus}>Gör insikt till fokus</button>}
      </div>

      {focusDraft && (
        <form className="inline-edit-form" onSubmit={acceptFocus}>
          <h3>Redigera veckofokus före lagring</h3>
          <label>
            <span>Titel</span>
            <input value={focusDraft.title} onChange={(event) => setFocusDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>Handling</span>
            <input value={focusDraft.action} onChange={(event) => setFocusDraft((current) => ({ ...current, action: event.target.value }))} />
          </label>
          <div className="habit-actions">
            <button type="submit" className="primary-button">Aktivera fokus</button>
            <button type="button" onClick={() => setFocusDraft(null)}>Avstå</button>
          </div>
        </form>
      )}

      <div className="goals-habits-grid">
        <article>
          <h3>Aktiva mål</h3>
          {viewModel.activeGoals.length === 0 ? <p>Inga extra mål ännu. Befintlig målvikt och nutritionmål används där de finns.</p> : (
            <ul className="goals-list">
              {viewModel.activeGoals.map(({ goal, progress }) => (
                <li key={goal.id}>
                  <strong>{goal.title}</strong>
                  <span>{progress?.label || 'Följs automatiskt när data finns'}</span>
                  <progress max="100" value={Math.max(0, Math.min(100, progress?.percent || 0))}>{progress?.percent || 0}%</progress>
                  <div className="habit-actions">
                    <button type="button" onClick={(event) => startEdit('goal', goal, event)}>Redigera</button>
                    <button type="button" onClick={() => updateStatus('goal', goal.id, 'completed')}>Klar</button>
                    <button type="button" onClick={() => updateStatus('goal', goal.id, 'archived')}>Arkivera</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article>
          <h3>Dagens vanor</h3>
          <p className="estimate-note">{viewModel.todaySummary.done}/{viewModel.todaySummary.scheduled} schemalagda klara. {viewModel.todaySummary.automaticDone} automatiska, {viewModel.todaySummary.manualDone} manuella.</p>
          {viewModel.todayHabits.length === 0 ? <p>Inga vanor ännu.</p> : (
            <ul className="goals-list">
              {viewModel.todayHabits.map(({ habit, status, streak }) => (
                <li key={habit.id}>
                  <strong>{habit.title}</strong>
                  <span>{status.done ? 'Klar idag' : status.paused ? 'Pausad' : 'Väntar idag'} · {streak.message}</span>
                  <div className="habit-actions">
                    {habit.trackingMode === 'manual' && habit.status === 'active' && (
                      status.done
                        ? <button type="button" aria-pressed="true" onClick={() => undoDone(habit.id)}>Ångra</button>
                        : <button type="button" aria-pressed="false" onClick={() => markDone(habit.id)}>Markera klar</button>
                    )}
                    <button type="button" onClick={(event) => startEdit('habit', habit, event)}>Redigera</button>
                    <button type="button" onClick={() => updateStatus('habit', habit.id, habit.status === 'paused' ? 'active' : 'paused')}>
                      {habit.status === 'paused' ? 'Återuppta' : 'Pausa'}
                    </button>
                    <button type="button" onClick={() => updateStatus('habit', habit.id, 'archived')}>Arkivera</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      {editing && editDraft && (
        <form className="inline-edit-form" onSubmit={saveEdit} aria-describedby={fieldError ? 'goals-habits-error' : undefined}>
          <h3 tabIndex="-1" ref={editFormRef}>Redigera {editing.kind === 'goal' ? 'mål' : 'vana'}</h3>
          <label>
            <span>Rubrik</span>
            <input value={editDraft.title} aria-invalid={Boolean(fieldError)} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} required />
          </label>
          {editing.kind === 'goal' && (
            <label>
              <span>Beskrivning</span>
              <input value={editDraft.description} onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))} />
            </label>
          )}
          <label>
            <span>Nivå</span>
            <input type="number" value={editDraft.target} onChange={(event) => setEditDraft((current) => ({ ...current, target: event.target.value }))} />
          </label>
          <label>
            <span>Status</span>
            <select value={editDraft.status} onChange={(event) => setEditDraft((current) => ({ ...current, status: event.target.value }))}>
              <option value="active">Aktiv</option>
              <option value="paused">Pausad</option>
              <option value="archived">Arkiverad</option>
              {editing.kind === 'goal' && <option value="completed">Slutförd</option>}
            </select>
          </label>
          {editing.kind === 'habit' && (
            <>
              <label>
                <span>Frekvens</span>
                <select value={editDraft.frequency} onChange={(event) => setEditDraft((current) => ({ ...current, frequency: event.target.value }))}>
                  <option value="daily">Daglig</option>
                  <option value="weekly">Veckovis</option>
                </select>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={editDraft.reminderEnabled} onChange={(event) => setEditDraft((current) => ({ ...current, reminderEnabled: event.target.checked }))} />
                <span>Frivillig påminnelse</span>
              </label>
              <label>
                <span>Tid</span>
                <input type="time" value={editDraft.reminderTime} onChange={(event) => setEditDraft((current) => ({ ...current, reminderTime: event.target.value }))} />
              </label>
            </>
          )}
          <div className="habit-actions">
            <button type="submit" className="primary-button" disabled={pendingSubmit}>{pendingSubmit ? 'Sparar...' : 'Spara'}</button>
            <button type="button" onClick={closeEdit}>Stäng</button>
          </div>
          <p className="estimate-note">ID och skapad historik bevaras. Ändrad frekvens skriver inte om tidigare dagar.</p>
        </form>
      )}

      <div className="goals-habits-forms">
        <form onSubmit={addGoal}>
          <h3>Skapa mål</h3>
          <label>
            <span>Kategori</span>
            <select value={goalDraft.category} onChange={(event) => setGoalDraft((current) => ({ ...current, category: event.target.value }))}>
              {goalOptions.map(([category, label]) => <option key={category} value={category}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Rubrik</span>
            <input value={goalDraft.title} onChange={(event) => setGoalDraft((current) => ({ ...current, title: event.target.value }))} required />
          </label>
          <label>
            <span>Nivå</span>
            <input type="number" min="1" value={goalDraft.target} onChange={(event) => setGoalDraft((current) => ({ ...current, target: event.target.value }))} required />
          </label>
          <button type="submit" className="primary-button" disabled={pendingSubmit}>Skapa mål</button>
        </form>

        <form onSubmit={addHabit}>
          <h3>Skapa vana</h3>
          <label>
            <span>Typ</span>
            <select value={habitDraft.category} onChange={(event) => {
              const option = habitOptions.find(([category]) => category === event.target.value)
              setHabitDraft((current) => ({ ...current, category: event.target.value, trackingMode: option?.[2] || 'automatic' }))
            }}>
              {habitOptions.map(([category, label]) => <option key={category} value={category}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Rubrik</span>
            <input value={habitDraft.title} onChange={(event) => setHabitDraft((current) => ({ ...current, title: event.target.value }))} required />
          </label>
          <p>Uppföljning: {habitDraft.trackingMode === 'manual' ? 'manuell markering' : 'automatisk från appdata'}</p>
          <button type="submit" className="primary-button" disabled={pendingSubmit}>Skapa vana</button>
        </form>
      </div>

      <div className="archive-toggle-row">
        <button type="button" className="secondary-button" onClick={() => setShowArchive((value) => !value)}>
          {showArchive ? 'Dölj arkiv' : `Visa arkiv (${archivedItems.length})`}
        </button>
      </div>
      {showArchive && (
        <article className="goals-habits-archive">
          <h3>Arkiv och historik</h3>
          {archivedItems.length === 0 ? <p>Inga arkiverade eller slutförda objekt ännu.</p> : (
            <ul className="goals-list">
              {archivedItems.map(({ item, kind }) => (
                <li key={`${kind}-${item.id}`}>
                  <strong>{item.title}</strong>
                  <span>{item.status === 'completed' ? 'Slutfört' : 'Arkiverat'} {item.archivedAt || item.completedAt || ''}</span>
                  <div className="habit-actions">
                    <button type="button" onClick={() => persist(restoreGoalsHabitsItem(state, kind, item.id), 'Objektet återställdes.')}>Återställ</button>
                    {item.status === 'archived' && (
                      <button type="button" onClick={() => {
                        if (window.confirm('Vill du ta bort det arkiverade objektet permanent?')) {
                          persist(deleteArchivedGoalsHabitsItem(state, kind, item.id), 'Objektet togs bort permanent.')
                        }
                      }}>Ta bort permanent</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h4>Senaste händelser</h4>
          {viewModel.recentHistory.length === 0 ? <p>Historik skapas när du redigerar, pausar, markerar eller arkiverar.</p> : (
            <ul className="compact-history-list">
              {viewModel.recentHistory.map((entry) => (
                <li key={entry.id}>{entry.detail || entry.type}</li>
              ))}
            </ul>
          )}
        </article>
      )}

      {viewModel.activeFocus.length > 0 && (
        <article className="goals-habits-focus-list">
          <h3>Aktiva veckofokus</h3>
          <ul className="goals-list">
            {viewModel.activeFocus.map((focus) => (
              <li key={focus.id}>
                <strong>{focus.title}</strong>
                <span>{focus.action || focus.reason}</span>
                <div className="habit-actions">
                  <button type="button" onClick={() => persist(updateWeeklyFocus(state, focus.id, { status: 'completed' }), 'Veckofokus markerades klart.')}>Klar</button>
                  <button type="button" onClick={() => persist(moveWeeklyFocusToNextWeek(state, focus.id), 'Veckofokus flyttades till nästa vecka.')}>Flytta</button>
                  <button type="button" onClick={() => persist(updateWeeklyFocus(state, focus.id, { declined: true, status: 'archived' }), 'Veckofokus arkiverades.')}>Avstå</button>
                </div>
              </li>
            ))}
          </ul>
        </article>
      )}

      <p className="estimate-note">Lagring: {goalsHabitsStorageKey}. Inga befintliga mål eller check-ins kopieras.</p>
    </section>
  )
}

export default GoalsHabitsPanel

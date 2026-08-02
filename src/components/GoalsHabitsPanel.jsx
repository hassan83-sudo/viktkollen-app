import { useMemo, useState } from 'react'
import {
  acceptWeeklyFocus,
  buildGoalsHabitsViewModel,
  createDefaultHabits,
  createGoal,
  createHabit,
  goalsHabitsStorageKey,
  markManualHabitDone,
  normalizeGoalsHabitsState,
  updateGoalsHabitsItemStatus,
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
  const [goalDraft, setGoalDraft] = useState({ category: 'protein', target: '120', title: 'Nå proteinmålet' })
  const [habitDraft, setHabitDraft] = useState({ category: 'custom', title: 'Kvällspromenad', trackingMode: 'manual' })
  const [statusMessage, setStatusMessage] = useState('')
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
  const insightReport = useMemo(() => buildAiNutritionCoachInsights(data, { analysisDate }), [analysisDate, data])
  const focusSuggestion = insightReport.actionPlan[0]

  function persist(nextState, message) {
    onGoalsHabitsChange?.(normalizeGoalsHabitsState(nextState))
    setStatusMessage(message)
  }

  function addStarterHabits() {
    persist({
      ...state,
      habits: [...state.habits, ...createDefaultHabits()],
    }, 'Startvanor har lagts till.')
  }

  function addGoal(event) {
    event.preventDefault()
    const option = goalOptions.find(([category]) => category === goalDraft.category)
    const goal = createGoal({
      category: goalDraft.category,
      period: option?.[3] || 'week',
      progressMode: goalDraft.category === 'custom' ? 'manual' : 'automatic',
      target: goalDraft.target,
      title: goalDraft.title,
      unit: option?.[2] || 'gånger',
    })

    if (!goal) {
      setStatusMessage('Målet kunde inte skapas. Kontrollera nivå och kategori.')
      return
    }

    const duplicateWeightGoal = goal.category === 'weight' && state.goals.some((item) => item.category === 'weight' && item.status === 'active')
    if (duplicateWeightGoal) {
      setStatusMessage('Viktmålet finns redan i profilen och dupliceras inte här.')
      return
    }

    persist({ ...state, goals: [...state.goals, goal] }, 'Mål skapat.')
  }

  function addHabit(event) {
    event.preventDefault()
    const option = habitOptions.find(([category]) => category === habitDraft.category)
    const habit = createHabit({
      category: habitDraft.category,
      title: habitDraft.title,
      trackingMode: habitDraft.trackingMode || option?.[2] || 'automatic',
    })

    persist({ ...state, habits: [...state.habits, habit] }, 'Vana skapad.')
  }

  function updateStatus(kind, id, status) {
    persist(updateGoalsHabitsItemStatus(state, kind, id, status), status === 'archived' ? 'Objektet arkiverades.' : 'Status uppdaterad.')
  }

  function markDone(habitId) {
    persist(markManualHabitDone(state, habitId, analysisDate), 'Vanan markerades klar.')
  }

  function acceptFocus() {
    if (!focusSuggestion) return
    persist(acceptWeeklyFocus(state, {
      linkedInsightId: focusSuggestion.insightId,
      reason: focusSuggestion.why,
      title: focusSuggestion.title,
    }, { analysisDate }), 'Veckofokus aktiverat.')
  }

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
          <p>Max tre fokusområden åt gången. Förslag sparas bara när du väljer det.</p>
        </div>
        {focusSuggestion && <button type="button" className="secondary-button" onClick={acceptFocus}>Gör insikt till fokus</button>}
      </div>

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
                  <button type="button" onClick={() => updateStatus('goal', goal.id, 'archived')}>Arkivera</button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article>
          <h3>Dagens vanor</h3>
          {viewModel.todayHabits.length === 0 ? <p>Inga vanor ännu.</p> : (
            <ul className="goals-list">
              {viewModel.todayHabits.map(({ habit, status, streak }) => (
                <li key={habit.id}>
                  <strong>{habit.title}</strong>
                  <span>{status.done ? 'Klar idag' : status.paused ? 'Pausad' : 'Inte klar ännu'} · {streak.message}</span>
                  <div className="habit-actions">
                    {habit.trackingMode === 'manual' && habit.status === 'active' && (
                      <button type="button" aria-pressed={status.done} onClick={() => markDone(habit.id)} disabled={status.done}>Markera klar</button>
                    )}
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
          <button type="submit" className="primary-button">Skapa mål</button>
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
          <button type="submit" className="primary-button">Skapa vana</button>
        </form>
      </div>

      <p className="estimate-note">Lagring: {goalsHabitsStorageKey}. Inga befintliga mål eller check-ins kopieras.</p>
    </section>
  )
}

export default GoalsHabitsPanel

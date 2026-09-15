import { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'viktkollen.activity.v1'
const ACTIVITY_TYPES = ['Promenad', 'Jogg', 'Cykling', 'Fotboll', 'Hockey', 'Annan aktivitet']

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function readState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      dailySteps: parsed.dailySteps || {},
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      active: parsed.active || null,
    }
  } catch {
    return { dailySteps: {}, sessions: [], active: null }
  }
}

function formatDuration(seconds = 0) {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours} h ${rest} min` : `${minutes} min`
}

function ActivitySection() {
  const [state, setState] = useState(readState)
  const [activityType, setActivityType] = useState('Promenad')
  const [stepsInput, setStepsInput] = useState(() => String(readState().dailySteps[todayKey()] || ''))
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (!state.active) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [state.active])

  const today = todayKey()
  const todaySessions = useMemo(
    () => state.sessions.filter((session) => String(session.startedAt || '').slice(0, 10) === today),
    [state.sessions, today],
  )
  const activeSeconds = state.active ? Math.max(0, Math.floor((now - state.active.startedAtMs) / 1000)) : 0
  const completedSeconds = todaySessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0)
  const distanceKm = todaySessions.reduce((sum, session) => sum + Number(session.distanceKm || 0), 0)
  const activeCalories = todaySessions.reduce((sum, session) => sum + Number(session.calories || 0), 0)
  const steps = Number(state.dailySteps[today] || 0)

  function saveSteps(event) {
    event.preventDefault()
    const value = Math.max(0, Math.round(Number(stepsInput) || 0))
    setState((current) => ({ ...current, dailySteps: { ...current.dailySteps, [today]: value } }))
    setStepsInput(String(value))
  }

  function startActivity() {
    if (state.active) return
    const startedAt = new Date().toISOString()
    setNow(Date.now())
    setState((current) => ({
      ...current,
      active: { type: activityType, startedAt, startedAtMs: Date.now() },
    }))
  }

  function stopActivity() {
    if (!state.active) return
    const durationSeconds = Math.max(1, Math.floor((Date.now() - state.active.startedAtMs) / 1000))
    const session = {
      id: `${state.active.startedAtMs}-${state.active.type}`,
      type: state.active.type,
      startedAt: state.active.startedAt,
      endedAt: new Date().toISOString(),
      durationSeconds,
      distanceKm: 0,
      calories: 0,
    }
    setState((current) => ({ ...current, active: null, sessions: [session, ...current.sessions].slice(0, 100) }))
  }

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - index)
    const key = date.toISOString().slice(0, 10)
    const sessions = state.sessions.filter((session) => String(session.startedAt || '').slice(0, 10) === key)
    return {
      key,
      steps: Number(state.dailySteps[key] || 0),
      minutes: Math.round(sessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60),
    }
  })

  return (
    <div id="activity-center" className="activity-section">
      <article className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Hälsa & vikt</p><h2>Aktivitet</h2></div></div>
        <p>Steg, rörelse och träningspass samlade på ett ställe. GPS-rutt och automatisk hälsodata kopplas på separat utan att ändra Familjekartan.</p>
      </article>

      <article className="panel">
        <h3>Idag</h3>
        <div className="stats-grid">
          <div><strong>{steps.toLocaleString('sv-SE')}</strong><small> Steg</small></div>
          <div><strong>{activeCalories || '—'}</strong><small> Aktiva kcal</small></div>
          <div><strong>{distanceKm ? distanceKm.toFixed(1) : '—'}</strong><small> km</small></div>
          <div><strong>{formatDuration(completedSeconds + activeSeconds)}</strong><small> Aktiv tid</small></div>
        </div>
        <form className="form-grid" onSubmit={saveSteps}>
          <label>Steg idag<input min="0" inputMode="numeric" type="number" value={stepsInput} onChange={(event) => setStepsInput(event.target.value)} placeholder="t.ex. 6240" /></label>
          <button className="secondary-button" type="submit">Spara steg</button>
        </form>
      </article>

      <article className="panel">
        <h3>Starta aktivitet</h3>
        {!state.active ? (
          <>
            <label>Aktivitet<select value={activityType} onChange={(event) => setActivityType(event.target.value)}>{ACTIVITY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <button className="primary-button" type="button" onClick={startActivity}>Starta aktivitet</button>
          </>
        ) : (
          <div>
            <p><strong>{state.active.type}</strong> · {formatDuration(activeSeconds)}</p>
            <button className="primary-button" type="button" onClick={stopActivity}>Avsluta aktivitet</button>
          </div>
        )}
      </article>

      <article className="panel">
        <h3>Veckoöversikt</h3>
        {lastSevenDays.map((day) => <p key={day.key}><strong>{day.key}</strong> · {day.steps.toLocaleString('sv-SE')} steg · {day.minutes} aktiva min</p>)}
      </article>

      <article className="panel">
        <h3>AI Coach</h3>
        <p>Aktivitetsdata är strukturerad för att kunna användas av AI Coach. Nästa koppling gör att coachen kan använda steg och träningspass i sina råd utan att GPS-data behöver delas med familjen.</p>
      </article>
    </div>
  )
}

export default ActivitySection

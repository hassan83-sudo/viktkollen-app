import { useEffect, useMemo, useState } from 'react'
import {
  addPlannedMeal, getLocalDateString, getMealPlanWeek, getMealPlanWeekStart,
  readMealPlans, removePlannedMeal, updatePlannedMeal, writeMealPlans,
} from '../../services/nutrition/mealPlanner.js'

const mealTypes = ['Frukost', 'Lunch', 'Middag', 'Kvällsmat']
const dayFormat = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })
const dateFrom = (date) => new Date(date + 'T12:00:00')
const dateKey = (date) => getLocalDateString(date)
function shift(date, days) {
  const next = dateFrom(date)
  next.setDate(next.getDate() + days)
  return dateKey(next)
}
function datesForMonth(selected) {
  const d = dateFrom(selected)
  const year = d.getFullYear(), month = d.getMonth()
  const length = new Date(year, month + 1, 0).getDate()
  return Array.from({ length }, (_, i) => dateKey(new Date(year, month, i + 1, 12)))
}

export default function ManualMealCalendar() {
  const [mode, setMode] = useState('week')
  const [selected, setSelected] = useState(() => getLocalDateString())
  const [plans, setPlans] = useState(() => readMealPlans())
  const [drafts, setDrafts] = useState({})
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const dates = useMemo(() => mode === 'month'
    ? datesForMonth(selected)
    : Array.from({ length: 7 }, (_, i) => shift(getMealPlanWeekStart(selected), i)), [mode, selected])
  const selectedWeek = getMealPlanWeek(plans, getMealPlanWeekStart(selected))
  const selectedMeals = selectedWeek.days[selected] || []
  const updatePlans = (next) => {
    const saved = writeMealPlans(next)
    setPlans(saved)
    window.dispatchEvent(new Event('viktkollen:meal-plan-updated'))
  }
  const save = (type) => {
    const key = selected + ':' + type
    const draft = drafts[key] || {}
    const title = (draft.title || '').trim()
    if (!title) { setNotice('Skriv namnet på din rätt först.'); return }
    const weekStart = getMealPlanWeekStart(selected)
    const meal = { date: selected, title, text: (draft.notes || title).trim(), mealType: type,
      scheduledTime: draft.time || '', sourceType: 'custom' }
    const next = editing?.key === key
      ? updatePlannedMeal(plans, weekStart, editing.id, meal)
      : addPlannedMeal(plans, weekStart, meal)
    updatePlans(next)
    setDrafts((old) => ({ ...old, [key]: {} }))
    setEditing(null)
    setNotice('Måltiden är sparad.')
  }
  const edit = (meal) => {
    const key = selected + ':' + meal.mealType
    setDrafts((old) => ({ ...old, [key]: { title: meal.title, notes: meal.notes || '', time: meal.scheduledTime || '' } }))
    setEditing({ key, id: meal.id })
  }
  const changeDraft = (key, field, value) => setDrafts((old) => ({
    ...old, [key]: { ...old[key], [field]: value },
  }))
  useEffect(() => {
    const sync = () => setPlans(readMealPlans())
    window.addEventListener('viktkollen:meal-plan-updated', sync)
    return () => window.removeEventListener('viktkollen:meal-plan-updated', sync)
  }, [])
  return (
    <section className="manual-meal-calendar" aria-label="Manuell matplanering">
      <h3>Min matplan</h3>
      <p>Du bestämmer själv vad du vill äta. Inga rätter läggs in automatiskt.</p>
      <div className="manual-meal-toolbar">
        <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Vecka</button>
        <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Månad</button>
        <button type="button" onClick={() => setSelected((d) => mode === 'week' ? shift(d, -7) : dateKey(new Date(dateFrom(d).getFullYear(), dateFrom(d).getMonth() - 1, Math.min(dateFrom(d).getDate(), 28), 12)))} aria-label="Föregående period">‹</button>
        <button type="button" onClick={() => setSelected(getLocalDateString())}>Idag</button>
        <button type="button" onClick={() => setSelected((d) => mode === 'week' ? shift(d, 7) : dateKey(new Date(dateFrom(d).getFullYear(), dateFrom(d).getMonth() + 1, Math.min(dateFrom(d).getDate(), 28), 12)))} aria-label="Nästa period">›</button>
      </div>
      <div className="manual-meal-dates" aria-label="Välj dag">
        {dates.map((day) => {
          const week = getMealPlanWeek(plans, getMealPlanWeekStart(day))
          const count = (week.days[day] || []).length
          return <button type="button" key={day} aria-pressed={day === selected} onClick={() => { setSelected(day); setEditing(null); setNotice('') }}>
            {dayFormat.format(dateFrom(day))}{count ? <small> · {count}</small> : null}
          </button>
        })}
      </div>
      <h4>{dayFormat.format(dateFrom(selected))}</h4>
      {mealTypes.map((type) => {
        const key = selected + ':' + type
        const draft = drafts[key] || {}
        const entries = selectedMeals.filter((meal) => meal.mealType === type)
        return <div className="manual-meal-slot" key={key}>
          <strong>{type}</strong>
          {entries.map((meal) => <div className="manual-meal-entry" key={meal.id}>
            <span>{meal.scheduledTime ? meal.scheduledTime + ' · ' : ''}{meal.title}</span>
            <button type="button" onClick={() => edit(meal)} aria-label={'Redigera ' + meal.title}>Ändra</button>
            <button type="button" onClick={() => { updatePlans(removePlannedMeal(plans, getMealPlanWeekStart(selected), meal.id)); setNotice('Rätten togs bort.') }} aria-label={'Ta bort ' + meal.title}>Ta bort</button>
          </div>)}
          <label>Din rätt eller ditt recept
            <input maxLength={120} placeholder="Skriv själv..." value={draft.title || ''} onChange={(e) => changeDraft(key, 'title', e.target.value)} />
          </label>
          <label>Anteckning (valfritt)
            <textarea rows={2} maxLength={500} value={draft.notes || ''} onChange={(e) => changeDraft(key, 'notes', e.target.value)} />
          </label>
          <label>Tid (valfritt)
            <input type="time" value={draft.time || ''} onChange={(e) => changeDraft(key, 'time', e.target.value)} />
          </label>
          <button type="button" onClick={() => save(type)}>{editing?.key === key ? 'Spara ändring' : '+ Spara rätt'}</button>
        </div>
      })}
      {notice && <p role="status">{notice}</p>}
      <p className="manual-meal-note">Matplanen sparas på denna enhet. Tiderna är planeringstider, inte aktiverade mobilnotiser.</p>
    </section>
  )
}

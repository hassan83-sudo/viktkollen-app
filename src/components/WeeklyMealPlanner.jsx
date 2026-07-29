import { useMemo, useState } from 'react'
import {
  addLocalDays,
  addManualShoppingListItem,
  addPlannedMeal,
  buildMealPlanInsights,
  buildMealPlanSuggestions,
  buildPlannedDaySummary,
  buildPlannedWeekSummary,
  categorizeShoppingListItems,
  clearCheckedShoppingListItems,
  clearMealPlanWeek,
  clearShoppingListWeek,
  copyPlannedDay,
  createPlannedMealFromDraft,
  createPlannedMealFromTemplate,
  filterTemplatesByDietaryPreferences,
  formatShoppingListForClipboard,
  getLocalDateString,
  getMealPlanWeek,
  getMealPlanWeekDates,
  getMealPlanWeekLabel,
  getMealPlanWeekStart,
  getShoppingList,
  normalizeMealTemplates,
  plannedMealToMeal,
  plannedMealTypes,
  readMealPlans,
  readShoppingLists,
  removePlannedMeal,
  removeShoppingListItem,
  toggleShoppingListItem,
  updatePlannedMeal,
  updateShoppingListFromMealPlan,
  writeMealPlans,
  writeShoppingLists,
} from '../services/nutrition/nutritionEngine.js'

const dayNames = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']

function formatNumber(value, suffix) {
  return Number.isFinite(value) && value > 0
    ? `${Math.round(value).toLocaleString('sv-SE')} ${suffix}`
    : `Saknas`
}

function emptyDraft(date) {
  return {
    date,
    ingredients: '',
    mealType: 'Lunch',
    notes: '',
    scheduledTime: '',
    text: '',
    title: '',
  }
}

function splitIngredientInput(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function PlannedMealCard({
  meal,
  onEdit,
  onMove,
  onRegister,
  onRemove,
  weekDates,
}) {
  const [moveDate, setMoveDate] = useState(meal.date)

  return (
    <article className="planned-meal-card">
      <div className="planned-meal-heading">
        <div>
          <span className="nutrition-pill">{meal.mealType}</span>
          <h5>{meal.title}</h5>
        </div>
        <span>{meal.scheduledTime || 'Tid saknas'}</span>
      </div>
      <p>{meal.text || 'Ingen beskrivning.'}</p>
      <dl className="meal-template-preview">
        <div><dt>Planerat protein</dt><dd>{formatNumber(meal.nutritionPreview?.protein, 'g')}</dd></div>
        <div><dt>Planerade kalorier</dt><dd>{formatNumber(meal.nutritionPreview?.calories, 'kcal')}</dd></div>
      </dl>
      {meal.ingredients.length > 0 && <small>Ingredienser: {meal.ingredients.join(', ')}</small>}
      <div className="meal-planner-inline-actions">
        <label className="field">
          <span>Flytta till</span>
          <select
            aria-label={`Flytta ${meal.title} till dag`}
            value={moveDate}
            onChange={(event) => setMoveDate(event.target.value)}
          >
            {weekDates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={() => onMove(meal.id, moveDate)}>Flytta</button>
      </div>
      <div className="nutrition-actions">
        <button type="button" onClick={() => onRegister(meal)}>Registrera som måltid</button>
        <button className="secondary-button" type="button" onClick={() => onEdit(meal)}>Redigera</button>
        <button className="secondary-button danger-button" type="button" aria-label={`Ta bort ${meal.title}`} onClick={() => onRemove(meal.id)}>Ta bort</button>
      </div>
    </article>
  )
}

function PlannedMealForm({
  draft,
  errors,
  mode,
  onCancel,
  onChange,
  onSubmit,
  weekDates,
}) {
  return (
    <form className="meal-planner-form" onSubmit={onSubmit}>
      <div className="meal-template-form-grid">
        <label className="field">
          <span>Titel</span>
          <input value={draft.title} onChange={(event) => onChange('title', event.target.value)} />
          {errors.title && <small className="form-error">{errors.title}</small>}
        </label>
        <label className="field">
          <span>Datum</span>
          <select value={draft.date} onChange={(event) => onChange('date', event.target.value)}>
            {weekDates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
          {errors.date && <small className="form-error">{errors.date}</small>}
        </label>
        <label className="field">
          <span>Måltidstyp</span>
          <select value={draft.mealType} onChange={(event) => onChange('mealType', event.target.value)}>
            {plannedMealTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Tid</span>
          <input type="time" value={draft.scheduledTime} onChange={(event) => onChange('scheduledTime', event.target.value)} />
          {errors.scheduledTime && <small className="form-error">{errors.scheduledTime}</small>}
        </label>
      </div>
      <label className="field">
        <span>Beskrivning</span>
        <textarea rows="2" value={draft.text} onChange={(event) => onChange('text', event.target.value)} />
      </label>
      <label className="field">
        <span>Ingredienser</span>
        <textarea rows="2" value={draft.ingredients} onChange={(event) => onChange('ingredients', event.target.value)} placeholder="500 g kyckling, 1 kg potatis" />
      </label>
      <label className="field">
        <span>Anteckning</span>
        <input value={draft.notes} onChange={(event) => onChange('notes', event.target.value)} />
      </label>
      <div className="nutrition-actions">
        <button type="submit">{mode === 'edit' ? 'Spara ändring' : 'Lägg till planerad måltid'}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>Avbryt</button>
      </div>
    </form>
  )
}

function ShoppingListPanel({
  list,
  onAddManualItem,
  onClearChecked,
  onClearList,
  onCopy,
  onRemoveItem,
  onToggleItem,
  onUpdateFromPlan,
  status,
}) {
  const [manualItem, setManualItem] = useState('')
  const groups = useMemo(() => categorizeShoppingListItems(list.items), [list.items])

  return (
    <section className="nutrition-card shopping-list-panel" aria-labelledby="shopping-list-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Inköpslista</p>
          <h3 id="shopping-list-title">Veckans varor</h3>
        </div>
        <div className="nutrition-actions">
          <button type="button" onClick={onUpdateFromPlan}>{list.items.length ? 'Uppdatera från plan' : 'Generera inköpslista'}</button>
          <button className="secondary-button" type="button" onClick={onCopy}>Kopiera inköpslista</button>
        </div>
      </div>
      {status && <p className="nutrition-edit-status" role="status">{status}</p>}
      <form
        className="shopping-list-manual-form"
        onSubmit={(event) => {
          event.preventDefault()
          onAddManualItem(manualItem)
          setManualItem('')
        }}
      >
        <label className="field">
          <span>Lägg till egen vara</span>
          <input value={manualItem} onChange={(event) => setManualItem(event.target.value)} placeholder="t.ex. kaffe" />
        </label>
        <button className="secondary-button" type="submit">Lägg till vara</button>
      </form>
      {groups.length ? groups.map((group) => (
        <section className="shopping-list-category" key={group.category}>
          <h4>{group.category}</h4>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <label>
                  <input checked={item.checked} type="checkbox" onChange={() => onToggleItem(item.id)} />
                  <span>{item.name}{item.quantity !== null && item.unit ? ` – ${item.quantity.toLocaleString('sv-SE')} ${item.unit}` : ''}</span>
                </label>
                <details>
                  <summary>Källa</summary>
                  <span>{item.manual ? 'Manuell vara' : `${item.sourcePlannedMealIds.length} planerade måltider`}</span>
                </details>
                <button className="secondary-button danger-button" type="button" aria-label={`Ta bort ${item.name}`} onClick={() => onRemoveItem(item.id)}>Ta bort</button>
              </li>
            ))}
          </ul>
        </section>
      )) : (
        <div className="nutrition-empty">
          <strong>Ingen inköpslista ännu.</strong>
          <span>Generera listan från veckoplanens ingredienser.</span>
        </div>
      )}
      <div className="nutrition-actions">
        <button className="secondary-button" type="button" onClick={onClearChecked}>Rensa markerade</button>
        <button className="secondary-button danger-button" type="button" onClick={onClearList}>Rensa inköpslista</button>
      </div>
    </section>
  )
}

function WeeklyMealPlanner({
  dietaryPreferences,
  meals,
  nutritionGoals,
  onMealsChange,
  templates,
}) {
  const [plans, setPlans] = useState(() => readMealPlans())
  const [shoppingLists, setShoppingLists] = useState(() => readShoppingLists())
  const [weekStart, setWeekStart] = useState(() => getMealPlanWeekStart())
  const [draft, setDraft] = useState(() => emptyDraft(getMealPlanWeekStart()))
  const [editingMealId, setEditingMealId] = useState('')
  const [errors, setErrors] = useState({})
  const [templateSearch, setTemplateSearch] = useState('')
  const [copySourceDate, setCopySourceDate] = useState('')
  const [copyTargetDate, setCopyTargetDate] = useState('')
  const [copyScope, setCopyScope] = useState('date')
  const [copyMode, setCopyMode] = useState('append')
  const [status, setStatus] = useState('')
  const [shoppingStatus, setShoppingStatus] = useState('')
  const [registeringId, setRegisteringId] = useState('')

  const week = useMemo(() => getMealPlanWeek(plans, weekStart), [plans, weekStart])
  const weekDates = useMemo(() => getMealPlanWeekDates(weekStart), [weekStart])
  const summary = useMemo(() => buildPlannedWeekSummary(week, nutritionGoals), [nutritionGoals, week])
  const insights = useMemo(() => buildMealPlanInsights(week, nutritionGoals), [nutritionGoals, week])
  const suggestions = useMemo(
    () => buildMealPlanSuggestions({ dietaryPreferences, goals: nutritionGoals, templates, week }),
    [dietaryPreferences, nutritionGoals, templates, week],
  )
  const shoppingList = useMemo(() => getShoppingList(shoppingLists, weekStart), [shoppingLists, weekStart])
  const normalizedTemplates = useMemo(() => normalizeMealTemplates(templates), [templates])
  const compatibleTemplateIds = useMemo(
    () => new Set(filterTemplatesByDietaryPreferences(normalizedTemplates, dietaryPreferences).map((template) => template.id)),
    [dietaryPreferences, normalizedTemplates],
  )
  const visibleTemplates = useMemo(() => {
    const search = templateSearch.trim().toLocaleLowerCase('sv-SE')
    return normalizedTemplates
      .filter((template) => !search || [template.name, template.text, template.mealType].join(' ').toLocaleLowerCase('sv-SE').includes(search))
      .sort((first, second) => Number(!compatibleTemplateIds.has(first.id)) - Number(!compatibleTemplateIds.has(second.id)))
      .slice(0, 8)
  }, [compatibleTemplateIds, normalizedTemplates, templateSearch])

  function savePlans(nextPlans) {
    const saved = writeMealPlans(nextPlans)
    setPlans(saved)
    return saved
  }

  function saveShoppingLists(nextLists) {
    const saved = writeShoppingLists(nextLists)
    setShoppingLists(saved)
    return saved
  }

  function resetForm(date = weekDates[0]) {
    setDraft(emptyDraft(date))
    setEditingMealId('')
    setErrors({})
  }

  function changeDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function addTemplate(template, date = weekDates[0]) {
    const result = createPlannedMealFromTemplate(template, { date })
    if (!result.meal) return
    savePlans(addPlannedMeal(plans, weekStart, result.meal))
    setStatus(`${result.meal.title} lades till i planen.`)
  }

  function submitDraft(event) {
    event.preventDefault()
    const result = createPlannedMealFromDraft({
      ...draft,
      ingredients: splitIngredientInput(draft.ingredients),
    })
    setErrors(result.errors)
    if (!result.meal) return

    if (editingMealId) {
      savePlans(updatePlannedMeal(plans, weekStart, editingMealId, result.meal))
      setStatus('Planerad måltid uppdaterad.')
    } else {
      savePlans(addPlannedMeal(plans, weekStart, result.meal))
      setStatus('Planerad måltid tillagd.')
    }
    resetForm(result.meal.date)
  }

  function editMeal(meal) {
    setEditingMealId(meal.id)
    setDraft({
      date: meal.date,
      ingredients: meal.ingredients.join(', '),
      mealType: meal.mealType,
      notes: meal.notes,
      scheduledTime: meal.scheduledTime,
      text: meal.text,
      title: meal.title,
    })
  }

  function removeMeal(mealId) {
    if (!window.confirm('Vill du ta bort den planerade måltiden?')) return
    savePlans(removePlannedMeal(plans, weekStart, mealId))
    setStatus('Planerad måltid borttagen.')
  }

  function moveMeal(mealId, targetDate) {
    savePlans(updatePlannedMeal(plans, weekStart, mealId, { date: targetDate }))
    setStatus('Planerad måltid flyttad.')
  }

  function copyDay() {
    if (!copySourceDate) return
    if (copyMode === 'replace' && !window.confirm('Vill du ersätta befintliga måltider på måldagarna?')) return
    savePlans(copyPlannedDay(plans, weekStart, copySourceDate, { date: copyTargetDate, mode: copyMode, scope: copyScope }))
    setStatus('Dagens plan kopierades.')
  }

  function registerAsMeal(plannedMeal) {
    if (registeringId) return
    setRegisteringId(plannedMeal.id)
    const meal = plannedMealToMeal(plannedMeal)
    if (!meal) {
      setStatus('Måltiden kunde inte registreras.')
      setRegisteringId('')
      return
    }
    onMealsChange([meal, ...meals])
    if (window.confirm('Måltiden registrerades. Vill du ta bort den från planen?')) {
      savePlans(removePlannedMeal(plans, weekStart, plannedMeal.id))
    }
    setStatus('Planerad måltid registrerades som faktisk måltid.')
    setRegisteringId('')
  }

  function clearWeek() {
    if (!window.confirm('Vill du rensa vald veckoplan?')) return
    savePlans(clearMealPlanWeek(plans, weekStart))
    setStatus('Veckoplanen rensades.')
  }

  function updateShopping() {
    const result = updateShoppingListFromMealPlan(shoppingLists, week)
    saveShoppingLists(result.lists)
    setShoppingStatus(result.summary)
  }

  function toggleShopping(itemId) {
    const nextList = toggleShoppingListItem(shoppingList, itemId)
    saveShoppingLists({ ...shoppingLists, weeks: { ...shoppingLists.weeks, [weekStart]: nextList } })
  }

  function addManualItem(name) {
    const nextList = addManualShoppingListItem(shoppingList, { name })
    saveShoppingLists({ ...shoppingLists, weeks: { ...shoppingLists.weeks, [weekStart]: nextList } })
    setShoppingStatus('Vara tillagd.')
  }

  function removeShoppingItem(itemId) {
    const nextList = removeShoppingListItem(shoppingList, itemId)
    saveShoppingLists({ ...shoppingLists, weeks: { ...shoppingLists.weeks, [weekStart]: nextList } })
  }

  function clearChecked() {
    const nextList = clearCheckedShoppingListItems(shoppingList)
    saveShoppingLists({ ...shoppingLists, weeks: { ...shoppingLists.weeks, [weekStart]: nextList } })
    setShoppingStatus('Markerade varor rensades.')
  }

  function clearShopping() {
    if (!window.confirm('Vill du rensa vald veckas inköpslista?')) return
    saveShoppingLists(clearShoppingListWeek(shoppingLists, weekStart))
    setShoppingStatus('Inköpslistan rensades.')
  }

  async function copyShoppingList() {
    const text = formatShoppingListForClipboard(shoppingList)
    try {
      await navigator.clipboard.writeText(text)
      setShoppingStatus('Inköpslistan kopierades.')
    } catch {
      setShoppingStatus(text ? 'Kopiering misslyckades. Markera listan manuellt.' : 'Det finns ingen lista att kopiera.')
    }
  }

  return (
    <section className="nutrition-card weekly-meal-planner" aria-labelledby="weekly-meal-planner-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Veckoplanering</p>
          <h3 id="weekly-meal-planner-title">Planera måltider</h3>
          <span>Planerade värden är uppskattningar och räknas inte som registrerat intag.</span>
        </div>
      </div>

      <nav className="meal-planner-week-nav" aria-label="Veckonavigation">
        <button className="secondary-button" type="button" onClick={() => setWeekStart(addLocalDays(weekStart, -7))}>Föregående vecka</button>
        <strong>{getMealPlanWeekLabel(weekStart)}</strong>
        <button className="secondary-button" type="button" onClick={() => setWeekStart(addLocalDays(weekStart, 7))}>Nästa vecka</button>
        <button className="secondary-button" type="button" onClick={() => setWeekStart(getMealPlanWeekStart(getLocalDateString()))}>Denna vecka</button>
      </nav>

      {status && <p className="nutrition-edit-status" role="status">{status}</p>}

      <div className="meal-planner-summary-grid">
        <div><span>Planerade dagar</span><strong>{summary.plannedDayCount}/7</strong></div>
        <div><span>Planerade måltider</span><strong>{summary.mealCount}</strong></div>
        <div><span>Snitt protein</span><strong>{summary.averageProtein ? `${Math.round(summary.averageProtein)} g` : 'Saknas'}</strong></div>
        <div><span>Snitt kalorier</span><strong>{summary.averageCalories ? `${Math.round(summary.averageCalories)} kcal` : 'Saknas'}</strong></div>
      </div>

      <div className="meal-planner-layout">
        <section className="meal-planner-days">
          {weekDates.map((date, index) => {
            const dayMeals = week.days[date] || []
            const daySummary = buildPlannedDaySummary(dayMeals, nutritionGoals)
            return (
              <article className="meal-planner-day" key={date}>
                <div className="meal-planner-day-heading">
                  <div>
                    <h4>{dayNames[index]}</h4>
                    <span>{date}</span>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => resetForm(date)}>Lägg till måltid</button>
                </div>
                <dl className="meal-planner-day-stats">
                  <div><dt>Antal</dt><dd>{daySummary.mealCount}</dd></div>
                  <div><dt>Planerat protein</dt><dd>{formatNumber(daySummary.totals.protein, 'g')}</dd></div>
                  <div><dt>Planerade kalorier</dt><dd>{formatNumber(daySummary.totals.calories, 'kcal')}</dd></div>
                </dl>
                {dayMeals.length ? dayMeals.map((meal) => (
                  <PlannedMealCard
                    key={meal.id}
                    meal={meal}
                    weekDates={weekDates}
                    onEdit={editMeal}
                    onMove={moveMeal}
                    onRegister={registerAsMeal}
                    onRemove={removeMeal}
                  />
                )) : (
                  <div className="nutrition-empty"><span>Inga måltider planerade.</span></div>
                )}
              </article>
            )
          })}
        </section>

        <aside className="meal-planner-sidebar">
          <section className="nutrition-card">
            <div className="nutrition-card-heading">
              <div>
                <p className="eyebrow">Lägg till</p>
                <h4>Egen planerad måltid</h4>
              </div>
            </div>
            <PlannedMealForm
              draft={draft}
              errors={errors}
              mode={editingMealId ? 'edit' : 'new'}
              weekDates={weekDates}
              onCancel={() => resetForm()}
              onChange={changeDraft}
              onSubmit={submitDraft}
            />
          </section>

          <section className="nutrition-card">
            <div className="nutrition-card-heading">
              <div>
                <p className="eyebrow">Mallar</p>
                <h4>Lägg till från mall</h4>
              </div>
            </div>
            <label className="field">
              <span>Sök mall</span>
              <input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} />
            </label>
            <div className="meal-planner-template-list">
              {visibleTemplates.map((template) => (
                <article key={template.id}>
                  <strong>{template.name}</strong>
                  <span>{compatibleTemplateIds.has(template.id) ? 'Matchar matval' : 'Kan användas manuellt'}</span>
                  <button className="secondary-button" type="button" onClick={() => addTemplate(template, draft.date || weekDates[0])}>Lägg till</button>
                </article>
              ))}
            </div>
          </section>

          <section className="nutrition-card">
            <div className="nutrition-card-heading">
              <div>
                <p className="eyebrow">Kopiera</p>
                <h4>Kopiera dagens plan</h4>
              </div>
            </div>
            <div className="meal-template-form-grid">
              <label className="field">
                <span>Från dag</span>
                <select value={copySourceDate} onChange={(event) => setCopySourceDate(event.target.value)}>
                  <option value="">Välj dag</option>
                  {weekDates.map((date) => <option key={date} value={date}>{date}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Till</span>
                <select value={copyScope} onChange={(event) => setCopyScope(event.target.value)}>
                  <option value="date">Vald dag</option>
                  <option value="weekdays">Vardagar</option>
                  <option value="week">Hela veckan</option>
                </select>
              </label>
              {copyScope === 'date' && (
                <label className="field">
                  <span>Måldag</span>
                  <select value={copyTargetDate} onChange={(event) => setCopyTargetDate(event.target.value)}>
                    <option value="">Välj dag</option>
                    {weekDates.map((date) => <option key={date} value={date}>{date}</option>)}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Läge</span>
                <select value={copyMode} onChange={(event) => setCopyMode(event.target.value)}>
                  <option value="append">Lägg till efter befintliga</option>
                  <option value="replace">Ersätt befintliga</option>
                </select>
              </label>
            </div>
            <button type="button" onClick={copyDay}>Kopiera dagens plan</button>
          </section>

          <section className="nutrition-card">
            <div className="nutrition-card-heading">
              <div>
                <p className="eyebrow">Insikter</p>
                <h4>Planeringsstöd</h4>
              </div>
            </div>
            <ul className="meal-planner-insights">
              {insights.map((insight) => <li key={insight}>{insight}</li>)}
            </ul>
            <ul className="meal-planner-insights">
              {suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
            </ul>
            <button className="secondary-button danger-button" type="button" onClick={clearWeek}>Rensa veckoplan</button>
          </section>
        </aside>
      </div>

      <ShoppingListPanel
        list={shoppingList}
        status={shoppingStatus}
        onAddManualItem={addManualItem}
        onClearChecked={clearChecked}
        onClearList={clearShopping}
        onCopy={copyShoppingList}
        onRemoveItem={removeShoppingItem}
        onToggleItem={toggleShopping}
        onUpdateFromPlan={updateShopping}
      />
    </section>
  )
}

export default WeeklyMealPlanner

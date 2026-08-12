import { useMemo, useState } from 'react'
import {
  buildMealTemplateDraft,
  createMealCopy,
  createMealFromTemplate,
  createMealTemplate,
  filterMealTemplates,
  filterTemplatesByDietaryPreferences,
  getMealTemplatePreview,
  getRecentUniqueMeals,
  hasDietaryPreferences,
  markMealTemplateUsed,
  mealTemplateTypes,
  normalizeMealTemplates,
  updateMealTemplate,
} from '../../services/nutrition/nutritionEngine.js'
import MealTemplateForm from './MealTemplateForm.jsx'

function formatMacro(value, unit) {
  return value === null || value === undefined
    ? 'Saknas'
    : `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function makeCopyDraft(date, time = '') {
  return {
    date,
    time,
  }
}

function MealTemplateCard({
  onAdd,
  onDelete,
  onEdit,
  onToggleFavorite,
  template,
}) {
  const preview = getMealTemplatePreview(template)

  return (
    <article className="meal-template-card">
      <div className="meal-template-card-heading">
        <div>
          <span className="nutrition-pill">{template.mealType}</span>
          <h4>{template.name}</h4>
        </div>
        <button
          aria-label={`${template.isFavorite ? 'Ta bort favorit' : 'Markera favorit'} ${template.name}`}
          aria-pressed={template.isFavorite}
          className="secondary-button meal-template-icon-button"
          type="button"
          onClick={() => onToggleFavorite(template)}
        >
          {template.isFavorite ? '★' : '☆'}
        </button>
      </div>
      <p>{template.text}</p>
      <dl className="meal-template-preview">
        <div><dt>Kalorier</dt><dd>{formatMacro(preview.totals.calories, 'kcal')}</dd></div>
        <div><dt>Protein</dt><dd>{formatMacro(preview.totals.protein, 'g')}</dd></div>
      </dl>
      <small>
        Använd {template.useCount.toLocaleString('sv-SE')} gånger
        {template.defaultTime ? ` · standardtid ${template.defaultTime}` : ''}
      </small>
      <div className="nutrition-actions">
        <button type="button" onClick={() => onAdd(template)}>Lägg till</button>
        <button className="secondary-button" type="button" onClick={() => onEdit(template)}>Redigera</button>
        <button className="secondary-button danger-button" type="button" onClick={() => onDelete(template)}>Radera</button>
      </div>
    </article>
  )
}

function RecentMealCard({ meal, onAddAgain, onCopy }) {
  const preview = getMealTemplatePreview({
    name: meal.name,
    text: meal.text || meal.description,
    mealType: meal.type,
    nutritionOverride: meal.nutritionOverride,
  })

  return (
    <article className="meal-template-card">
      <div>
        <span className="nutrition-pill">{meal.type}</span>
        <h4>{meal.name}</h4>
      </div>
      <p>{meal.text || meal.description}</p>
      <dl className="meal-template-preview">
        <div><dt>Kalorier</dt><dd>{formatMacro(preview.totals.calories, 'kcal')}</dd></div>
        <div><dt>Protein</dt><dd>{formatMacro(preview.totals.protein, 'g')}</dd></div>
      </dl>
      <small>{meal.date} kl. {meal.time}</small>
      <div className="nutrition-actions">
        <button type="button" onClick={() => onAddAgain(meal)}>Lägg till igen</button>
        <button className="secondary-button" type="button" onClick={() => onCopy(meal)}>Kopiera till dag</button>
      </div>
    </article>
  )
}

function MealQuickAdd({
  dietaryPreferences,
  meals,
  onMealsChange,
  onTemplatesChange,
  selectedMealDate,
  templates,
}) {
  const [copyDraft, setCopyDraft] = useState(() => makeCopyDraft(selectedMealDate))
  const [copySourceMeal, setCopySourceMeal] = useState(null)
  const [errors, setErrors] = useState({})
  const [filters, setFilters] = useState({ search: '', type: 'Alla' })
  const [formMode, setFormMode] = useState('')
  const [submittingKey, setSubmittingKey] = useState('')
  const [templateCompatibilityFilter, setTemplateCompatibilityFilter] = useState('all')
  const [templateDraft, setTemplateDraft] = useState(() => buildMealTemplateDraft())
  const [templateId, setTemplateId] = useState('')
  const [status, setStatus] = useState('')

  const normalizedTemplates = useMemo(() => normalizeMealTemplates(templates), [templates])
  const templatesAfterCompatibilityFilter = useMemo(
    () => templateCompatibilityFilter === 'matching'
      ? filterTemplatesByDietaryPreferences(normalizedTemplates, dietaryPreferences)
      : normalizedTemplates,
    [dietaryPreferences, normalizedTemplates, templateCompatibilityFilter],
  )
  const visibleTemplates = useMemo(
    () => filterMealTemplates(templatesAfterCompatibilityFilter, filters),
    [filters, templatesAfterCompatibilityFilter],
  )
  const recentMeals = useMemo(
    () => getRecentUniqueMeals(meals, { limit: 5, today: selectedMealDate }),
    [meals, selectedMealDate],
  )

  function changeTemplateDraft(key, value) {
    setTemplateDraft((current) => ({ ...current, [key]: value }))
  }

  function changeTemplateNutrition(key, value) {
    setTemplateDraft((current) => ({
      ...current,
      nutritionOverride: {
        ...(current.nutritionOverride || {}),
        [key]: value,
      },
    }))
  }

  function saveTemplates(nextTemplates) {
    onTemplatesChange(normalizeMealTemplates(nextTemplates))
  }

  function resetTemplateForm() {
    setFormMode('')
    setTemplateId('')
    setTemplateDraft(buildMealTemplateDraft())
    setErrors({})
  }

  function saveTemplate(event) {
    event.preventDefault()

    const result = formMode === 'edit'
      ? updateMealTemplate(normalizedTemplates.find((template) => template.id === templateId), templateDraft)
      : createMealTemplate(templateDraft)

    setErrors(result.errors)

    if (!result.template) return

    const nextTemplates = formMode === 'edit'
      ? [result.template, ...normalizedTemplates.filter((template) => template.id !== result.template.id)]
      : [result.template, ...normalizedTemplates]

    saveTemplates(nextTemplates)
    resetTemplateForm()
    setStatus(formMode === 'edit' ? 'Mallen har uppdaterats.' : 'Mallen har sparats.')
  }

  function startNewTemplate() {
    setFormMode('new')
    setTemplateId('')
    setTemplateDraft(buildMealTemplateDraft({ mealType: 'Automatiskt' }))
    setErrors({})
    setStatus('')
  }

  function editTemplate(template) {
    setFormMode('edit')
    setTemplateId(template.id)
    setTemplateDraft(buildMealTemplateDraft(template))
    setErrors({})
    setStatus('')
  }

  function addTemplateAsMeal(template) {
    if (submittingKey) return

    setSubmittingKey(template.id)
    const meal = createMealFromTemplate(template, { date: selectedMealDate })

    if (!meal) {
      setStatus('Mallen kunde inte läggas till.')
      setSubmittingKey('')
      return
    }

    onMealsChange([meal, ...meals])
    const usedTemplates = markMealTemplateUsed(
      template.id,
      {
        getItem: () => JSON.stringify(normalizedTemplates),
        setItem: (_key, value) => {
          saveTemplates(JSON.parse(value))
        },
      },
    )
    saveTemplates(usedTemplates)
    setStatus(`${template.name} lades till ${selectedMealDate}.`)
    setSubmittingKey('')
  }

  function addRecentMealAgain(meal) {
    if (submittingKey) return

    setSubmittingKey(meal.id)
    const copiedMeal = createMealCopy(meal, { date: selectedMealDate })

    if (copiedMeal) {
      onMealsChange([copiedMeal, ...meals])
      setStatus(`${meal.name} lades till igen.`)
    }

    setSubmittingKey('')
  }

  function copyMealToDate(event) {
    event.preventDefault()

    const copiedMeal = createMealCopy(copySourceMeal, copyDraft)

    if (!copiedMeal) {
      setStatus('Måltiden kunde inte kopieras.')
      return
    }

    onMealsChange([copiedMeal, ...meals])
    setCopySourceMeal(null)
    setCopyDraft(makeCopyDraft(selectedMealDate))
    setStatus(`${copiedMeal.name} kopierades till ${copiedMeal.date}.`)
  }

  function deleteTemplate(template) {
    const shouldDelete = window.confirm(`Vill du ta bort mallen "${template.name}"?`)

    if (!shouldDelete) return

    saveTemplates(normalizedTemplates.filter((entry) => entry.id !== template.id))
    setStatus('Mallen har tagits bort. Sparade måltider påverkas inte.')
  }

  function toggleFavorite(template) {
    saveTemplates(
      normalizedTemplates.map((entry) =>
        entry.id === template.id
          ? { ...entry, isFavorite: !entry.isFavorite, updatedAt: new Date().toISOString() }
          : entry,
      ),
    )
  }

  return (
    <section className="nutrition-card meal-quick-add">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Snabbtillägg</p>
          <h3>Mallar och senaste måltider</h3>
        </div>
        <button className="secondary-button" type="button" onClick={startNewTemplate}>
          Ny mall
        </button>
      </div>

      <div className="meal-template-toolbar">
        <label className="field">
          <span>Sök mall</span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Sök namn eller innehåll"
          />
        </label>
        <label className="field">
          <span>Visa</span>
          <select
            value={filters.type}
            onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
          >
            <option>Alla</option>
            <option>Favoriter</option>
            {mealTemplateTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
      </div>

      {status && <p className="nutrition-edit-status" role="status">{status}</p>}

      {formMode && (
        <MealTemplateForm
          draft={templateDraft}
          errors={errors}
          mode={formMode}
          onCancel={resetTemplateForm}
          onChange={changeTemplateDraft}
          onNutritionChange={changeTemplateNutrition}
          onSubmit={saveTemplate}
        />
      )}

      <div className="meal-template-section-heading">
        <h4>Sparade mallar</h4>
        <div className="segmented-control meal-template-filter-toggle" aria-label="Filtrera mallar efter matpreferenser">
          <button
            aria-pressed={templateCompatibilityFilter === 'all'}
            className={templateCompatibilityFilter === 'all' ? 'active' : ''}
            type="button"
            onClick={() => setTemplateCompatibilityFilter('all')}
          >
            Alla mallar
          </button>
          <button
            aria-label={!hasDietaryPreferences(dietaryPreferences) ? 'Matchande mallar kräver sparade matpreferenser' : undefined}
            aria-pressed={templateCompatibilityFilter === 'matching'}
            className={templateCompatibilityFilter === 'matching' ? 'active' : ''}
            disabled={!hasDietaryPreferences(dietaryPreferences)}
            title={!hasDietaryPreferences(dietaryPreferences) ? 'Spara matpreferenser för att filtrera matchande mallar.' : undefined}
            type="button"
            onClick={() => setTemplateCompatibilityFilter('matching')}
          >
            Matchar mina matval
          </button>
        </div>
        <span>{visibleTemplates.length} mallar</span>
      </div>
      {visibleTemplates.length === 0 ? (
        <div className="nutrition-empty">
          <strong>Inga mallar ännu.</strong>
          <span>Spara en återkommande måltid som mall för snabbare registrering.</span>
        </div>
      ) : (
        <div className="meal-template-grid">
          {visibleTemplates.map((template) => (
            <MealTemplateCard
              key={template.id}
              template={template}
              onAdd={addTemplateAsMeal}
              onDelete={deleteTemplate}
              onEdit={editTemplate}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      )}

      <div className="meal-template-section-heading">
        <h4>Senaste måltider</h4>
        <span>Max 5 unika</span>
      </div>
      {recentMeals.length === 0 ? (
        <div className="nutrition-empty">
          <strong>Inga tidigare måltider att återanvända.</strong>
          <span>När du loggar mat visas snabba genvägar här.</span>
        </div>
      ) : (
        <div className="meal-template-grid">
          {recentMeals.map((meal) => (
            <RecentMealCard
              key={meal.id}
              meal={meal}
              onAddAgain={addRecentMealAgain}
              onCopy={(entry) => {
                setCopySourceMeal(entry)
                setCopyDraft(makeCopyDraft(selectedMealDate, entry.time))
              }}
            />
          ))}
        </div>
      )}

      {copySourceMeal && (
        <form className="meal-copy-form" onSubmit={copyMealToDate}>
          <div>
            <strong>Kopiera {copySourceMeal.name}</strong>
            <span>Välj nytt datum och tid.</span>
          </div>
          <label className="field">
            <span>Datum</span>
            <input
              required
              type="date"
              value={copyDraft.date}
              onChange={(event) => setCopyDraft((current) => ({ ...current, date: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Tid</span>
            <input
              required
              type="time"
              value={copyDraft.time}
              onChange={(event) => setCopyDraft((current) => ({ ...current, time: event.target.value }))}
            />
          </label>
          <div className="nutrition-actions">
            <button type="submit">Kopiera</button>
            <button className="secondary-button" type="button" onClick={() => setCopySourceMeal(null)}>
              Avbryt
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

export default MealQuickAdd

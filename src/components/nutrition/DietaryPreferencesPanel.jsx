import { useMemo, useState } from 'react'
import {
  createUpdatedDietaryPreferences,
  getDietaryPreferencesSummary,
  hasDietaryPreferences,
  normalizeDietaryPreferences,
  validateDietaryPreferences,
} from '../../services/nutrition/nutritionEngine.js'

const dietTypeLabels = {
  custom: 'Egna val',
  omnivore: 'Allätare',
  pescatarian: 'Pescetariskt',
  vegan: 'Veganskt',
  vegetarian: 'Vegetariskt',
}

function makeDraft(preferences) {
  const normalized = normalizeDietaryPreferences(preferences)

  return normalized
}

function draftToPreferences(draft, current) {
  return createUpdatedDietaryPreferences(current, {
    avoidedFoods: draft.avoidedFoods,
    dietType: draft.dietType,
    notes: draft.notes,
    preferences: draft.preferences,
    preferredFoods: draft.preferredFoods,
  })
}

function FoodTagInput({
  error,
  helpText,
  id,
  items,
  label,
  onChange,
}) {
  const [value, setValue] = useState('')
  const [inputError, setInputError] = useState('')
  const safeItems = Array.isArray(items) ? items : []

  function addItem() {
    const trimmed = value.replace(/\s+/g, ' ').trim()

    if (!trimmed) {
      setInputError('Skriv en matvara innan du lägger till.')
      return
    }

    onChange([...safeItems, trimmed])
    setValue('')
    setInputError('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      addItem()
    }
  }

  function removeItem(item) {
    onChange(safeItems.filter((entry) => entry !== item))
  }

  return (
    <div className="field dietary-food-tag-field">
      <label htmlFor={id}>{label}</label>
      <div className="dietary-food-tag-input-row">
        <input
          id={id}
          type="text"
          value={value}
          aria-describedby={`${id}-help${error || inputError ? ` ${id}-error` : ''}`}
          onChange={(event) => {
            setValue(event.target.value)
            setInputError('')
          }}
          onKeyDown={handleKeyDown}
          placeholder="Skriv matvara och tryck Enter"
        />
        <button className="secondary-button" type="button" onClick={addItem}>
          Lägg till
        </button>
      </div>
      <small id={`${id}-help`}>{helpText}</small>
      {safeItems.length > 0 && (
        <div className="dietary-food-tags" aria-label={`${label}: sparade matvaror`}>
          {safeItems.map((item) => (
            <span className="nutrition-pill dietary-food-tag" key={item}>
              {item}
              <button
                aria-label={`Ta bort ${item}`}
                className="dietary-food-tag-remove"
                type="button"
                onClick={() => removeItem(item)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {(error || inputError) && <span className="form-error" id={`${id}-error`}>{error || inputError}</span>}
    </div>
  )
}

function DietaryPreferencesPanel({
  dietaryPreferences,
  onClear,
  onSave,
}) {
  const normalized = useMemo(
    () => normalizeDietaryPreferences(dietaryPreferences),
    [dietaryPreferences],
  )
  const [draft, setDraft] = useState(() => makeDraft(normalized))
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('')
  const summary = getDietaryPreferencesSummary(normalized)
  const hasSavedPreferences = hasDietaryPreferences(normalized)

  function resetDraft() {
    setDraft(makeDraft(normalized))
    setErrors({})
    setStatus('')
  }

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updatePreference(key, value) {
    setDraft((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        [key]: value,
      },
    }))
  }

  function save(event) {
    event.preventDefault()
    const next = draftToPreferences(draft, normalized)
    const nextErrors = validateDietaryPreferences(next)

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    const saved = onSave(next)

    setDraft(makeDraft(saved || next))
    setStatus('Matpreferenser sparade.')
  }

  function clear() {
    const shouldClear = window.confirm('Vill du ta bort dina sparade matpreferenser?')

    if (!shouldClear) return

    const cleared = onClear()

    setDraft(makeDraft(cleared))
    setErrors({})
    setStatus('Matpreferenser rensade.')
  }

  return (
    <section className="nutrition-card dietary-preferences-panel" aria-labelledby="dietary-preferences-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Matpreferenser</p>
          <h3 id="dietary-preferences-title">Rekommendationsfilter</h3>
        </div>
        <span className="nutrition-pill">{hasSavedPreferences ? summary : 'Inga särskilda matval är angivna.'}</span>
      </div>

      <form className="dietary-preferences-form" onSubmit={save}>
        <fieldset className="dietary-preferences-fieldset">
          <legend>Kosttyp</legend>
          <div className="segmented-control dietary-diet-type-control">
            {Object.entries(dietTypeLabels).map(([value, label]) => (
              <button
                aria-pressed={draft.dietType === value}
                className={draft.dietType === value ? 'active' : ''}
                key={value}
                type="button"
                onClick={() => updateDraft('dietType', value)}
              >
                {label}
              </button>
            ))}
          </div>
          {errors.dietType && <span className="form-error">{errors.dietType}</span>}
        </fieldset>

        <fieldset className="dietary-preferences-fieldset">
          <legend>Övriga preferenser</legend>
          <div className="dietary-preferences-options">
            <label>
              <input
                checked={draft.preferences.lactoseFree}
                type="checkbox"
                onChange={(event) => updatePreference('lactoseFree', event.target.checked)}
              />
              Laktosfritt
            </label>
            <label>
              <input
                checked={draft.preferences.glutenFree}
                type="checkbox"
                onChange={(event) => updatePreference('glutenFree', event.target.checked)}
              />
              Glutenfritt
            </label>
            <label>
              <input
                checked={draft.preferences.halalPreferred}
                type="checkbox"
                onChange={(event) => updatePreference('halalPreferred', event.target.checked)}
              />
              Halal prioriteras
            </label>
          </div>
        </fieldset>

        <p className="dietary-preferences-note">
          Använd listan för personliga matval. Funktionen ersätter inte medicinsk rådgivning eller kontroll av ingrediensförteckningar.
        </p>

        <div className="dietary-food-tag-grid">
          <FoodTagInput
            error={errors.avoidedFoods || errors.foodConflict}
            helpText="Matvaror som inte ska rekommenderas automatiskt."
            id="dietary-avoided-foods"
            items={draft.avoidedFoods}
            label="Vill undvika"
            onChange={(items) => updateDraft('avoidedFoods', items)}
          />
          <FoodTagInput
            error={errors.preferredFoods}
            helpText="Matvaror som kan prioriteras när de också matchar dina övriga val."
            id="dietary-preferred-foods"
            items={draft.preferredFoods}
            label="Föredrar"
            onChange={(items) => updateDraft('preferredFoods', items)}
          />
        </div>

        {draft.preferences.halalPreferred && (
          <p className="dietary-preferences-note">
            Förslagen undviker uppenbart icke-halal innehåll, men appen kan inte verifiera hur en produkt är tillverkad eller certifierad.
          </p>
        )}
        <label className="field">
          <span>Anteckning</span>
          <textarea
            rows="2"
            value={draft.notes}
            onChange={(event) => updateDraft('notes', event.target.value)}
            placeholder="Valfritt, t.ex. vad som brukar fungera i vardagen"
          />
        </label>

        {Object.keys(errors).length > 0 && !errors.avoidedFoods && !errors.preferredFoods && !errors.dietType && (
          <p className="form-error" role="alert">{Object.values(errors)[0]}</p>
        )}
        {status && <p className="nutrition-edit-status" role="status">{status}</p>}

        <div className="nutrition-actions">
          <button type="submit">Spara</button>
          <button className="secondary-button" type="button" onClick={resetDraft}>Avbryt</button>
          <button className="secondary-button danger-button" type="button" onClick={clear}>Rensa</button>
        </div>
      </form>
    </section>
  )
}

export default DietaryPreferencesPanel

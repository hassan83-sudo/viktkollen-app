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

function listToInput(items = []) {
  return items.join(', ')
}

function inputToList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function makeDraft(preferences) {
  const normalized = normalizeDietaryPreferences(preferences)

  return {
    ...normalized,
    avoidedFoodsInput: listToInput(normalized.avoidedFoods),
    preferredFoodsInput: listToInput(normalized.preferredFoods),
  }
}

function draftToPreferences(draft, current) {
  return createUpdatedDietaryPreferences(current, {
    avoidedFoods: inputToList(draft.avoidedFoodsInput),
    dietType: draft.dietType,
    notes: draft.notes,
    preferences: draft.preferences,
    preferredFoods: inputToList(draft.preferredFoodsInput),
  })
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
        {hasSavedPreferences && <span className="nutrition-pill">{summary}</span>}
      </div>

      <form className="dietary-preferences-form" onSubmit={save}>
        <div className="meal-template-toolbar">
          <label className="field">
            <span>Kosttyp</span>
            <select value={draft.dietType} onChange={(event) => updateDraft('dietType', event.target.value)}>
              {Object.entries(dietTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Undvik livsmedel</span>
            <input
              type="text"
              value={draft.avoidedFoodsInput}
              onChange={(event) => updateDraft('avoidedFoodsInput', event.target.value)}
              placeholder="t.ex. fläsk, mjölk"
            />
          </label>
          <label className="field">
            <span>Föredra livsmedel</span>
            <input
              type="text"
              value={draft.preferredFoodsInput}
              onChange={(event) => updateDraft('preferredFoodsInput', event.target.value)}
              placeholder="t.ex. tofu, lax"
            />
          </label>
        </div>

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

        <label className="field">
          <span>Anteckning</span>
          <textarea
            rows="2"
            value={draft.notes}
            onChange={(event) => updateDraft('notes', event.target.value)}
            placeholder="Valfritt, t.ex. vad som brukar fungera i vardagen"
          />
        </label>

        {Object.keys(errors).length > 0 && (
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

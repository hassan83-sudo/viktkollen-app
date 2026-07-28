import { mealTemplateTypes } from '../../services/nutrition/nutritionEngine.js'

const macroFields = [
  ['calories', 'Kalorier', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Kolhydrater', 'g'],
  ['fat', 'Fett', 'g'],
]

function FieldError({ message }) {
  return message ? <small className="field-error">{message}</small> : null
}

function MealTemplateForm({
  draft,
  errors,
  mode,
  onCancel,
  onChange,
  onNutritionChange,
  onSubmit,
}) {
  return (
    <form className="meal-template-form" onSubmit={onSubmit}>
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Mall</p>
          <h4>{mode === 'edit' ? 'Redigera mall' : 'Spara måltidsmall'}</h4>
        </div>
      </div>

      <div className="meal-template-form-grid">
        <label className="field">
          <span>Namn</span>
          <input
            type="text"
            value={draft.name}
            onChange={(event) => onChange('name', event.target.value)}
            placeholder="Till exempel vardagsfrukost"
          />
          <FieldError message={errors.name} />
        </label>
        <label className="field">
          <span>Standardtid</span>
          <input
            type="time"
            value={draft.defaultTime}
            onChange={(event) => onChange('defaultTime', event.target.value)}
          />
          <FieldError message={errors.defaultTime} />
        </label>
        <label className="field">
          <span>Måltidstyp</span>
          <select value={draft.mealType} onChange={(event) => onChange('mealType', event.target.value)}>
            {mealTemplateTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="toggle-row meal-template-favorite-toggle">
          <input
            checked={draft.isFavorite}
            type="checkbox"
            onChange={(event) => onChange('isFavorite', event.target.checked)}
          />
          <span>Favorit</span>
        </label>
      </div>

      <label className="field">
        <span>Måltid</span>
        <textarea
          rows="3"
          value={draft.text}
          onChange={(event) => onChange('text', event.target.value)}
          placeholder="Vad brukar måltiden innehålla?"
        />
        <FieldError message={errors.text} />
      </label>

      <details className="nutrition-details">
        <summary>Manuell näring i mallen</summary>
        <div className="meal-template-form-grid">
          {macroFields.map(([key, label, unit]) => (
            <label className="field" key={key}>
              <span>{label} ({unit})</span>
              <input
                min="0"
                max="100000"
                step="0.1"
                type="number"
                value={draft.nutritionOverride?.[key] ?? ''}
                onChange={(event) => onNutritionChange(key, event.target.value)}
              />
              <FieldError message={errors[key]} />
            </label>
          ))}
        </div>
      </details>

      <label className="field">
        <span>Anteckning</span>
        <input
          type="text"
          value={draft.correctionNote}
          onChange={(event) => onChange('correctionNote', event.target.value)}
          placeholder="Valfri notering"
        />
      </label>

      <div className="nutrition-actions">
        <button type="submit">{mode === 'edit' ? 'Spara ändringar' : 'Spara mall'}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  )
}

export default MealTemplateForm

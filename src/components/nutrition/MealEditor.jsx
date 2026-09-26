import { useEffect, useRef } from 'react'
import { mealTypes } from '../../services/nutritionService.js'

const numericFields = [
  ['calories', 'Kalorier', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Kolhydrater', 'g'],
  ['fat', 'Fett', 'g'],
  ['fiber', 'Fibrer', 'g'],
]

function FieldError({ message }) {
  return message ? <small className="field-error">{message}</small> : null
}

function MealEditor({
  draft,
  errors,
  isEditing,
  onCancel,
  onChange,
  onReset,
  onSubmit,
}) {
  // A11Y-8Z3 (8Y C14): a submit with errors marks the fields aria-invalid and
  // moves focus to the first one (its label includes the error text), so the
  // error is announced; a closed "Näring och portion" is opened first.
  const formRef = useRef(null)
  useEffect(() => {
    if (!errors || Object.keys(errors).length === 0) return
    const first = formRef.current?.querySelector('[aria-invalid="true"]')
    const details = first?.closest('details')
    if (details && !details.open) details.open = true
    first?.focus()
  }, [errors])
  const invalid = (key) => (errors?.[key] ? 'true' : undefined)

  return (
    <form className="nutrition-card meal-editor" ref={formRef} onSubmit={onSubmit}>
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Måltidsredaktör</p>
          <h3>{isEditing ? 'Redigera måltid' : 'Lägg till måltid'}</h3>
        </div>
      </div>

      <div className="meal-editor-grid">
        <label className="field">
          <span>Datum</span>
          <input
            aria-invalid={invalid('date')}
            type="date"
            value={draft.date}
            onChange={(event) => onChange('date', event.target.value)}
          />
          <FieldError message={errors.date} />
        </label>
        <label className="field">
          <span>Tid</span>
          <input
            aria-invalid={invalid('time')}
            type="time"
            value={draft.time}
            onChange={(event) => onChange('time', event.target.value)}
          />
          <FieldError message={errors.time} />
        </label>
        <label className="field">
          <span>Måltidstyp</span>
          <select value={draft.type} onChange={(event) => onChange('type', event.target.value)}>
            {mealTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Namn</span>
          <input
            aria-invalid={invalid('name')}
            type="text"
            value={draft.name}
            onChange={(event) => onChange('name', event.target.value)}
            placeholder="Till exempel kyckling med ris"
          />
          <FieldError message={errors.name} />
        </label>
      </div>

      <label className="field">
        <span>Beskrivning</span>
        <textarea
          value={draft.description}
          onChange={(event) => onChange('description', event.target.value)}
          placeholder="Vad åt eller drack du?"
          rows="3"
        />
      </label>

      <details className="nutrition-details">
        <summary>Näring och portion</summary>
        <div className="meal-editor-grid">
          {numericFields.map(([key, label, unit]) => (
            <label className="field" key={key}>
              <span>{label} ({unit})</span>
              <input
                aria-invalid={invalid(key)}
                type="number"
                min="0"
                max="100000"
                step="0.1"
                value={draft[key]}
                onChange={(event) => onChange(key, event.target.value)}
              />
              <FieldError message={errors[key]} />
            </label>
          ))}
          <label className="field">
            <span>Portionsstorlek</span>
            <input
              type="text"
              value={draft.portionSize}
              onChange={(event) => onChange('portionSize', event.target.value)}
              placeholder="Till exempel 1 tallrik"
            />
          </label>
          <label className="field">
            <span>Antal portioner</span>
            <input
              aria-invalid={invalid('portionCount')}
              type="number"
              min="1"
              max="100"
              step="0.25"
              value={draft.portionCount}
              onChange={(event) => onChange('portionCount', event.target.value)}
            />
            <FieldError message={errors.portionCount} />
          </label>
        </div>
      </details>

      <label className="field">
        <span>Anteckning</span>
        <input
          type="text"
          value={draft.note}
          onChange={(event) => onChange('note', event.target.value)}
          placeholder="Valfri notering"
        />
      </label>

      <div className="nutrition-actions">
        <button type="submit">{isEditing ? 'Spara ändringar' : 'Spara måltid'}</button>
        <button className="secondary-button" type="button" onClick={onReset}>
          Återställ formulär
        </button>
        {isEditing && (
          <button className="secondary-button" type="button" onClick={onCancel}>
            Avbryt
          </button>
        )}
      </div>
    </form>
  )
}

export default MealEditor

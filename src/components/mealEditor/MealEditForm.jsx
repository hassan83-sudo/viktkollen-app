const mealTypeOptions = [
  'Automatiskt',
  'Frukost',
  'Mellanmål',
  'Lunch',
  'Middag',
  'Kvällsmål',
  'Nattmål',
  'Måltid',
]

const nutritionFields = [
  ['protein', 'Protein', 'g'],
  ['calories', 'Kalorier', 'kcal'],
  ['carbs', 'Kolhydrater', 'g'],
  ['fat', 'Fett', 'g'],
]

function FieldError({ message }) {
  return message ? <small className="field-error">{message}</small> : null
}

function MealEditForm({
  draft,
  errors,
  onCancel,
  onChange,
  onNutritionChange,
  onResetAutomatic,
  onSubmit,
}) {
  return (
    <form className="nutrition-card meal-editor" onSubmit={onSubmit}>
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Redigera måltid</p>
          <h3>Ändra sparad måltid</h3>
        </div>
      </div>

      <div className="meal-editor-grid">
        <label className="field">
          <span>Datum</span>
          <input type="date" value={draft.date} onChange={(event) => onChange('date', event.target.value)} />
          <FieldError message={errors.date} />
        </label>
        <label className="field">
          <span>Tid</span>
          <input type="time" value={draft.time} onChange={(event) => onChange('time', event.target.value)} />
          <FieldError message={errors.time} />
        </label>
        <label className="field">
          <span>Måltidstyp</span>
          <select value={draft.mealType} onChange={(event) => onChange('mealType', event.target.value)}>
            {mealTypeOptions.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Måltidstext</span>
          <input
            type="text"
            value={draft.description}
            onChange={(event) => onChange('description', event.target.value)}
            placeholder="Till exempel 200 g kyckling och ris"
          />
          <FieldError message={errors.description} />
        </label>
      </div>

      <details className="nutrition-details" open>
        <summary>Manuella näringsvärden</summary>
        <div className="meal-editor-grid">
          {nutritionFields.map(([key, label, unit]) => (
            <label className="field" key={key}>
              <span>{label} ({unit})</span>
              <input
                inputMode="decimal"
                type="text"
                value={draft.nutritionOverride?.[key] ?? ''}
                onChange={(event) => onNutritionChange(key, event.target.value)}
                placeholder="Tomt = automatisk analys"
              />
              <FieldError message={errors[key]} />
            </label>
          ))}
        </div>
      </details>

      <label className="field">
        <span>Korrigeringsanteckning</span>
        <input
          type="text"
          value={draft.correctionNote}
          onChange={(event) => onChange('correctionNote', event.target.value)}
          placeholder="Valfritt, till exempel vägd portion"
        />
      </label>

      <div className="nutrition-actions">
        <button type="submit">Spara ändringar</button>
        <button className="secondary-button" type="button" onClick={onResetAutomatic}>
          Återställ automatisk analys
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  )
}

export default MealEditForm

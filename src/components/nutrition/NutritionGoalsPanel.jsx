const goalFields = [
  ['calories', 'Dagligt kalorimål', 'kcal'],
  ['protein', 'Dagligt proteinmål', 'g'],
  ['fiber', 'Dagligt fibermål', 'g'],
  ['carbs', 'Kolhydratmål', 'g'],
  ['fat', 'Fettmål', 'g'],
]

function NutritionGoalsPanel({ draft, errors, onChange, onClear, onSave }) {
  return (
    <section className="nutrition-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Kostmål</p>
          <h3>Lokala dagsmål</h3>
        </div>
      </div>
      <div className="meal-editor-grid">
        {goalFields.map(([key, label, unit]) => (
          <label className="field" key={key}>
            <span>{label} ({unit})</span>
            <input
              type="number"
              min="0"
              max="100000"
              step="0.1"
              value={draft[key] ?? ''}
              onChange={(event) => onChange(key, event.target.value)}
            />
            {errors[key] && <small className="field-error">{errors[key]}</small>}
          </label>
        ))}
      </div>
      <p className="settings-note">
        Målen är frivilliga och används bara som lokalt stöd, inte som medicinska råd.
      </p>
      <div className="nutrition-actions">
        <button type="button" onClick={onSave}>Spara kostmål</button>
        <button className="secondary-button" type="button" onClick={onClear}>Rensa mål</button>
      </div>
    </section>
  )
}

export default NutritionGoalsPanel

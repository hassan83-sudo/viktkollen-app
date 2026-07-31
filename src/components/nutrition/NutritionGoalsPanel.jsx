const goalFields = [
  ['protein', 'Dagligt proteinmål', 'g'],
  ['calories', 'Dagligt kalorimål', 'kcal'],
  ['carbs', 'Kolhydratmål', 'g'],
  ['fat', 'Fettmål', 'g'],
  ['fiber', 'Fibermål', 'g'],
]

function formatGoalValue(value, unit) {
  return Number.isFinite(value)
    ? `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
    : 'Inget mål satt'
}

function sourceText(source) {
  return source === 'suggested'
    ? 'Förslag baserat på profil, valt av dig'
    : source === 'manual'
      ? 'Manuellt mål'
      : 'Inget mål satt'
}

function inputValue(value) {
  return Number.isFinite(value) || typeof value === 'string' ? value : ''
}

function SuggestedGoalCard({ children, disabled, explanation, missingFields = [], onUse, title }) {
  return (
    <article className="nutrition-goal-suggestion">
      <div>
        <h4>{title}</h4>
        <p>{explanation}</p>
        {missingFields.length > 0 && (
          <small>Saknas: {missingFields.join(', ')}.</small>
        )}
      </div>
      {children}
      <button className="secondary-button" disabled={disabled} type="button" onClick={onUse}>
        Använd förslag
      </button>
    </article>
  )
}

function ProteinDistributionPlan({ plan }) {
  if (!plan) {
    return (
      <div className="nutrition-goal-plan">
        <strong>Proteinfördelning</strong>
        <span>Sätt ett proteinmål för att se en enkel dagsplan.</span>
      </div>
    )
  }

  return (
    <div className="nutrition-goal-plan">
      <strong>Proteinfördelning</strong>
      <span>{plan.explanation}</span>
      {plan.targets.length > 0 && (
        <ul>
          {plan.targets.map((target) => (
            <li key={target.label}>
              <span>{target.label}</span>
              <strong>{target.rangeText}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NutritionGoalsPanel({
  draft,
  errors,
  onCancel,
  onChange,
  onClear,
  onSave,
  onUseSuggestedCalorieGoal,
  onUseSuggestedProteinGoal,
  proteinDistributionPlan,
  suggestedCalorieGoal,
  suggestedProteinGoal,
}) {
  return (
    <section className="nutrition-card nutrition-goals-panel">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Kostmål</p>
          <h3>Nutrition Goals & Smart Targets</h3>
        </div>
      </div>

      <div className="nutrition-goal-current-grid">
        {goalFields.map(([key, label, unit]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{formatGoalValue(draft[key], unit)}</strong>
            <small>{sourceText(draft[`${key}GoalSource`])}</small>
          </div>
        ))}
      </div>

      <div className="meal-editor-grid">
        {goalFields.map(([key, label, unit]) => (
          <label className="field" key={key}>
            <span>{label} ({unit})</span>
            <input
              aria-describedby={errors[key] ? `${key}-goal-error` : undefined}
              aria-invalid={errors[key] ? 'true' : undefined}
              type="number"
              min="0"
              max="100000"
              step="0.1"
              value={inputValue(draft[key])}
              onChange={(event) => onChange(key, event.target.value)}
            />
            {errors[key] && <small className="field-error" id={`${key}-goal-error`}>{errors[key]}</small>}
          </label>
        ))}
      </div>

      <div className="nutrition-goal-suggestion-grid">
        <SuggestedGoalCard
          disabled={!suggestedProteinGoal}
          explanation={
            suggestedProteinGoal?.explanation ||
            'Saknar giltig vikt för ett rimligt proteinförslag.'
          }
          onUse={onUseSuggestedProteinGoal}
          title="Föreslaget proteinmål"
        >
          {suggestedProteinGoal && (
            <strong>{suggestedProteinGoal.minimumGrams}–{suggestedProteinGoal.maximumGrams} g per dag</strong>
          )}
        </SuggestedGoalCard>
        <SuggestedGoalCard
          disabled={!suggestedCalorieGoal?.suggestedGoal}
          explanation={
            suggestedCalorieGoal?.explanation ||
            'Det finns inte tillräckligt med profiluppgifter för ett rimligt kaloriförslag.'
          }
          missingFields={suggestedCalorieGoal?.missingFields || []}
          onUse={onUseSuggestedCalorieGoal}
          title="Föreslaget kalorimål"
        >
          {suggestedCalorieGoal?.suggestedGoal && (
            <strong>{suggestedCalorieGoal.suggestedGoal.toLocaleString('sv-SE')} kcal per dag</strong>
          )}
        </SuggestedGoalCard>
      </div>

      <ProteinDistributionPlan plan={proteinDistributionPlan} />

      <p className="settings-note">
        Målen är frivilliga riktmärken och automatiska förslag är generella uppskattningar, inte medicinska råd.
      </p>
      <div className="nutrition-actions">
        <button type="button" onClick={onSave}>Spara mål</button>
        <button className="secondary-button" type="button" onClick={onCancel}>Avbryt</button>
        <button className="secondary-button danger-button" type="button" onClick={onClear}>Återställ mål</button>
      </div>
    </section>
  )
}

export default NutritionGoalsPanel

import { recipeCategories } from '../../services/nutrition/nutritionEngine.js'
import RecipeIngredientEditor from './RecipeIngredientEditor.jsx'
import RecipeNutritionSummary from './RecipeNutritionSummary.jsx'

const nutritionFields = [
  ['calories', 'Kalorier', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Kolhydrater', 'g'],
  ['fat', 'Fett', 'g'],
]

function RecipeEditor({
  draft,
  errors,
  mode,
  onCancel,
  onChange,
  onSubmit,
}) {
  const errorId = (field) => `recipe-${field}-error`

  return (
    <form className="recipe-editor nutrition-card" onSubmit={onSubmit}>
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Recept</p>
          <h3>{mode === 'edit' ? 'Redigera recept' : 'Skapa recept'}</h3>
        </div>
      </div>

      <div className="meal-template-form-grid">
        <label className="field">
          <span>Namn</span>
          <input
            aria-describedby={errors.name ? errorId('name') : undefined}
            aria-invalid={errors.name ? 'true' : undefined}
            value={draft.name}
            onChange={(event) => onChange('name', event.target.value)}
          />
          {errors.name && <small className="form-error" id={errorId('name')}>{errors.name}</small>}
        </label>
        <label className="field">
          <span>Kategori</span>
          <select value={draft.category} onChange={(event) => onChange('category', event.target.value)}>
            {recipeCategories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Portioner</span>
          <input
            aria-describedby={errors.servings ? errorId('servings') : undefined}
            aria-invalid={errors.servings ? 'true' : undefined}
            min="1"
            type="number"
            value={draft.servings}
            onChange={(event) => onChange('servings', event.target.value)}
          />
          {errors.servings && <small className="form-error" id={errorId('servings')}>{errors.servings}</small>}
        </label>
        <label className="field">
          <span>Tillagningstid</span>
          <input min="0" type="number" value={draft.cookingTimeMinutes} onChange={(event) => onChange('cookingTimeMinutes', event.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Beskrivning</span>
        <textarea rows="2" value={draft.description} onChange={(event) => onChange('description', event.target.value)} />
      </label>

      <RecipeIngredientEditor ingredients={draft.ingredients} onChange={(ingredients) => onChange('ingredients', ingredients)} />
      {errors.ingredients && <small className="form-error" id={errorId('ingredients')}>{errors.ingredients}</small>}

      <details className="nutrition-details">
        <summary>Manuella näringsvärden</summary>
        <div className="meal-editor-grid">
          {nutritionFields.map(([key, label, unit]) => (
            <label className="field" key={key}>
              <span>{label} ({unit})</span>
              <input
                inputMode="decimal"
                type="text"
                value={draft.nutritionOverride?.[key] ?? ''}
                onChange={(event) => onChange('nutritionOverride', {
                  ...(draft.nutritionOverride || {}),
                  [key]: event.target.value,
                })}
                placeholder="Tomt = saknas"
              />
            </label>
          ))}
        </div>
      </details>

      <label className="field">
        <span>Instruktioner</span>
        <textarea rows="4" value={draft.instructions} onChange={(event) => onChange('instructions', event.target.value)} />
      </label>

      <label className="field">
        <span>Taggar</span>
        <input value={draft.tags} onChange={(event) => onChange('tags', event.target.value)} placeholder="proteinrik, vardag, vegetarisk" />
      </label>

      <RecipeNutritionSummary recipe={draft} />

      <div className="nutrition-actions">
        <button type="submit">{mode === 'edit' ? 'Spara recept' : 'Skapa recept'}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>Avbryt</button>
      </div>
    </form>
  )
}

export default RecipeEditor

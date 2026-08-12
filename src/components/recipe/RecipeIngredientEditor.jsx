import { recipeUnits } from '../../services/nutrition/nutritionEngine.js'

function emptyIngredient() {
  return {
    amount: '',
    comment: '',
    name: '',
    unit: 'g',
  }
}

function RecipeIngredientEditor({ ingredients, onChange }) {
  const rows = ingredients.length ? ingredients : [emptyIngredient()]

  function updateRow(index, key, value) {
    onChange(rows.map((ingredient, rowIndex) => (rowIndex === index ? { ...ingredient, [key]: value } : ingredient)))
  }

  function removeRow(index) {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index)

    onChange(nextRows.length ? nextRows : [emptyIngredient()])
  }

  return (
    <div className="recipe-ingredient-editor">
      <div className="recipe-ingredient-heading">
        <strong>Ingredienser</strong>
        <button className="secondary-button" type="button" onClick={() => onChange([...rows, emptyIngredient()])}>
          Lägg till ingrediens
        </button>
      </div>
      {rows.map((ingredient, index) => (
        <div className="recipe-ingredient-row" key={`${ingredient.name}-${index}`}>
          <label className="field">
            <span>Mängd</span>
            <input value={ingredient.amount} inputMode="decimal" onChange={(event) => updateRow(index, 'amount', event.target.value)} />
          </label>
          <label className="field">
            <span>Enhet</span>
            <select value={ingredient.unit} onChange={(event) => updateRow(index, 'unit', event.target.value)}>
              <option value="">Ingen</option>
              {recipeUnits.map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Namn</span>
            <input value={ingredient.name} onChange={(event) => updateRow(index, 'name', event.target.value)} />
          </label>
          <label className="field">
            <span>Kommentar</span>
            <input value={ingredient.comment} onChange={(event) => updateRow(index, 'comment', event.target.value)} />
          </label>
          <button className="secondary-button danger-button" type="button" onClick={() => removeRow(index)}>
            {rows.length > 1 ? 'Ta bort' : 'Rensa'}
          </button>
        </div>
      ))}
    </div>
  )
}

export default RecipeIngredientEditor

import { mealTypes } from '../../services/nutritionService.js'

function formatMacro(value, unit) {
  return value === null || value === undefined
    ? 'Saknas'
    : `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function MealHistory({
  filters,
  meals,
  onClearFilters,
  onCopyMeal,
  onDeleteMeal,
  onEditMeal,
  onFilterChange,
  onSaveFavorite,
  onSaveTemplate,
}) {
  return (
    <section className="nutrition-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Historik</p>
          <h3>{meals.length} träffar</h3>
        </div>
        <button className="secondary-button" type="button" onClick={onClearFilters}>
          Rensa filter
        </button>
      </div>

      <div className="nutrition-filter-grid">
        <label className="field">
          <span>Sök</span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) => onFilterChange('search', event.target.value)}
            placeholder="Sök namn eller beskrivning"
          />
        </label>
        <label className="field">
          <span>Typ</span>
          <select value={filters.type} onChange={(event) => onFilterChange('type', event.target.value)}>
            <option value="Alla">Alla</option>
            {mealTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Från datum</span>
          <input type="date" value={filters.from} onChange={(event) => onFilterChange('from', event.target.value)} />
        </label>
        <label className="field">
          <span>Till datum</span>
          <input type="date" value={filters.to} onChange={(event) => onFilterChange('to', event.target.value)} />
        </label>
        <label className="field">
          <span>Sortera</span>
          <select value={filters.sort} onChange={(event) => onFilterChange('sort', event.target.value)}>
            <option value="newest">Nyast först</option>
            <option value="oldest">Äldst först</option>
            <option value="caloriesHigh">Högst kalorier</option>
            <option value="caloriesLow">Lägst kalorier</option>
            <option value="proteinHigh">Högst protein</option>
            <option value="proteinLow">Lägst protein</option>
          </select>
        </label>
      </div>

      {meals.length === 0 ? (
        <div className="nutrition-empty">
          <strong>Inga måltider matchar filtren.</strong>
          <span>Justera sökningen eller registrera en ny måltid.</span>
        </div>
      ) : (
        <div className="nutrition-meal-list">
          {meals.map((meal) => (
            <article className="nutrition-meal-card" key={meal.id}>
              <div>
                <span className="nutrition-pill">{meal.type}</span>
                <h4>{meal.name}</h4>
                <p>{meal.description || 'Ingen beskrivning.'}</p>
                <small>{meal.date} kl. {meal.time} · {meal.source}</small>
              </div>
              <dl>
                <div><dt>Kalorier</dt><dd>{formatMacro(meal.calories, 'kcal')}</dd></div>
                <div><dt>Protein</dt><dd>{formatMacro(meal.protein, 'g')}</dd></div>
                <div><dt>Fibrer</dt><dd>{formatMacro(meal.fiber, 'g')}</dd></div>
              </dl>
              <div className="nutrition-actions">
                <button aria-label={`Redigera ${meal.name}`} className="secondary-button" type="button" onClick={() => onEditMeal(meal)}>Redigera</button>
                <button aria-label={`Kopiera ${meal.name}`} className="secondary-button" type="button" onClick={() => onCopyMeal(meal)}>Kopiera</button>
                <button aria-label={`Spara ${meal.name} som favorit`} className="secondary-button" type="button" onClick={() => onSaveFavorite(meal)}>Spara favorit</button>
                <button aria-label={`Spara ${meal.name} som mall`} className="secondary-button" type="button" onClick={() => onSaveTemplate(meal)}>Spara mall</button>
                <button aria-label={`Ta bort ${meal.name}`} className="secondary-button danger-button" type="button" onClick={() => onDeleteMeal(meal.id)}>Ta bort</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default MealHistory

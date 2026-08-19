import { mealTypes } from '../../services/nutritionService.js'
import { getEffectiveMealNutrition, getMealProvenance } from '../../services/nutrition/nutritionEngine.js'

const sourceFilterOptions = [
  ['Alla', 'Alla källor'],
  ['manual', 'Manuell'],
  ['photo_analysis', 'Fotoanalys'],
  ['quick_add', 'Snabbval'],
  ['template', 'Mall'],
  ['recipe', 'Recept'],
  ['planned', 'Planerad'],
  ['imported', 'Importerad'],
]

const provenanceFilterOptions = [
  ['Alla', 'All näring'],
  ['user_entered', 'Användarangivet'],
  ['user_confirmed', 'Bekräftat AI-estimat'],
  ['ai_estimated', 'AI-estimat'],
  ['derived', 'Beräknat'],
  ['imported', 'Importerad'],
  ['missing', 'Saknas'],
]

function formatMacro(value, unit) {
  return value === null || value === undefined
    ? 'Saknas'
    : `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function MealHistory({
  filters,
  historyRange,
  historyRangeOptions = [],
  historySummary,
  meals,
  onClearFilters,
  onCopyMeal,
  onDeleteMeal,
  onEditMeal,
  onFilterChange,
  onHistoryRangeChange,
  onSaveFavorite,
  onSaveTemplate,
}) {
  const summary = historySummary || { calories: 0, mealCount: meals.length, protein: 0 }

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

      <div className="segmented-control meal-history-range" aria-label="Välj period för måltidshistorik">
        {historyRangeOptions.map((option) => (
          <button
            aria-pressed={historyRange === option.id}
            className={historyRange === option.id ? 'active' : ''}
            key={option.id}
            type="button"
            onClick={() => onHistoryRangeChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="meal-history-summary" aria-label="Måltidshistorik i valt intervall">
        <div><span>Måltider</span><strong>{summary.mealCount.toLocaleString('sv-SE')}</strong></div>
        <div><span>Kalorier</span><strong>{formatMacro(summary.calories, 'kcal')}</strong></div>
        <div><span>Protein</span><strong>{formatMacro(summary.protein, 'g')}</strong></div>
        <div><span>Registreringar</span><strong>{meals.length.toLocaleString('sv-SE')}</strong></div>
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
          <span>Källa</span>
          <select value={filters.source || 'Alla'} onChange={(event) => onFilterChange('source', event.target.value)}>
            {sourceFilterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Näringskälla</span>
          <select value={filters.provenance || 'Alla'} onChange={(event) => onFilterChange('provenance', event.target.value)}>
            {provenanceFilterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
                <span className="nutrition-pill">{getEffectiveMealNutrition(meal).confidence.label}</span>
                <span className="nutrition-pill">{getMealProvenance(meal).nutritionProvenanceLabel}</span>
                <h4>{meal.name}</h4>
                <p>{meal.description || 'Ingen beskrivning.'}</p>
                <small>{meal.date} kl. {meal.time} · {getMealProvenance(meal).sourceLabel}</small>
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

import {
  evaluateRecipeDietaryCompatibility,
  formatRecipeIngredient,
} from '../../services/nutrition/nutritionEngine.js'
import RecipeNutritionSummary from './RecipeNutritionSummary.jsx'

function RecipeCard({
  dietaryPreferences,
  onCreateTemplate,
  onDelete,
  onDuplicate,
  onEdit,
  onToggleFavorite,
  recipe,
}) {
  const compatibility = evaluateRecipeDietaryCompatibility(recipe, dietaryPreferences)

  return (
    <article className="recipe-card">
      <div className="recipe-card-heading">
        <div>
          <span className="nutrition-pill">{recipe.category}</span>
          <h4>{recipe.name}</h4>
        </div>
        <button
          className="secondary-button"
          type="button"
          aria-pressed={recipe.favorite}
          onClick={() => onToggleFavorite(recipe.id)}
        >
          {recipe.favorite ? 'Favorit' : 'Markera favorit'}
        </button>
      </div>
      {recipe.description && <p>{recipe.description}</p>}
      <small>{recipe.servings} portioner{recipe.cookingTimeMinutes ? ` · ${recipe.cookingTimeMinutes} min` : ''}</small>
      <RecipeNutritionSummary recipe={recipe} />
      {recipe.ingredients.length > 0 && (
        <details>
          <summary>Ingredienser</summary>
          <ul>
            {recipe.ingredients.map((ingredient, index) => <li key={`${ingredient.name}-${index}`}>{formatRecipeIngredient(ingredient)}</li>)}
          </ul>
        </details>
      )}
      {recipe.tags.length > 0 && <small>Taggar: {recipe.tags.join(', ')}</small>}
      <small>{compatibility.compatible ? 'Matchar matval' : compatibility.explanation}</small>
      <div className="nutrition-actions">
        <button className="secondary-button" type="button" onClick={() => onCreateTemplate(recipe)}>Skapa mall</button>
        <button className="secondary-button" type="button" onClick={() => onDuplicate(recipe.id)}>Duplicera</button>
        <button className="secondary-button" type="button" onClick={() => onEdit(recipe)}>Redigera</button>
        <button className="secondary-button danger-button" type="button" onClick={() => onDelete(recipe.id)}>Ta bort</button>
      </div>
    </article>
  )
}

export default RecipeCard

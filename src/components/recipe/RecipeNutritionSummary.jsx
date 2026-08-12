import { calculateRecipeNutrition } from '../../services/nutrition/nutritionEngine.js'
import { formatCalories, formatGrams } from '../../services/healthFormatting.js'

function formatNumber(value, unit) {
  return unit === 'kcal' ? formatCalories(value) : formatGrams(value, { unit })
}

function RecipeNutritionSummary({ recipe }) {
  const nutrition = calculateRecipeNutrition(recipe)
  const hasManualField = (field) =>
    Object.prototype.hasOwnProperty.call(recipe?.nutritionOverride || {}, field) &&
    recipe.nutritionOverride[field] !== '' &&
    recipe.nutritionOverride[field] !== null &&
    recipe.nutritionOverride[field] !== undefined
  const valueOrMissing = (field, value, unit) =>
    recipe && (nutrition.known || hasManualField(field)) ? formatNumber(value, unit) : 'Saknas'

  return (
    <dl className="recipe-nutrition-summary">
      <div><dt>Per portion</dt><dd>{valueOrMissing('calories', nutrition.perServing.calories, 'kcal')}</dd></div>
      <div><dt>Protein</dt><dd>{valueOrMissing('protein', nutrition.perServing.protein, 'g')}</dd></div>
      <div><dt>Kolhydrater</dt><dd>{valueOrMissing('carbs', nutrition.perServing.carbs, 'g')}</dd></div>
      <div><dt>Fett</dt><dd>{valueOrMissing('fat', nutrition.perServing.fat, 'g')}</dd></div>
    </dl>
  )
}

export default RecipeNutritionSummary

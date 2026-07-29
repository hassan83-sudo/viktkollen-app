import { calculateRecipeNutrition } from '../../services/nutrition/nutritionEngine.js'

function formatNumber(value, unit) {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value).toLocaleString('sv-SE')} ${unit}` : 'Saknas'
}

function RecipeNutritionSummary({ recipe }) {
  const nutrition = calculateRecipeNutrition(recipe)

  return (
    <dl className="recipe-nutrition-summary">
      <div><dt>Per portion</dt><dd>{formatNumber(nutrition.perServing.calories, 'kcal')}</dd></div>
      <div><dt>Protein</dt><dd>{formatNumber(nutrition.perServing.protein, 'g')}</dd></div>
      <div><dt>Kolhydrater</dt><dd>{formatNumber(nutrition.perServing.carbs, 'g')}</dd></div>
      <div><dt>Fett</dt><dd>{formatNumber(nutrition.perServing.fat, 'g')}</dd></div>
    </dl>
  )
}

export default RecipeNutritionSummary

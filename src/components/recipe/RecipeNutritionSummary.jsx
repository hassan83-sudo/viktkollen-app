import { calculateRecipeNutrition } from '../../services/nutrition/nutritionEngine.js'
import { formatCalories, formatGrams } from '../../services/healthFormatting.js'

function formatNumber(value, unit) {
  return unit === 'kcal' ? formatCalories(value) : formatGrams(value, { unit })
}

function RecipeNutritionSummary({ recipe }) {
  const nutrition = calculateRecipeNutrition(recipe)
  const valueOrMissing = (value, unit) => (recipe ? formatNumber(value, unit) : 'Saknas')

  return (
    <dl className="recipe-nutrition-summary">
      <div><dt>Per portion</dt><dd>{valueOrMissing(nutrition.perServing.calories, 'kcal')}</dd></div>
      <div><dt>Protein</dt><dd>{valueOrMissing(nutrition.perServing.protein, 'g')}</dd></div>
      <div><dt>Kolhydrater</dt><dd>{valueOrMissing(nutrition.perServing.carbs, 'g')}</dd></div>
      <div><dt>Fett</dt><dd>{valueOrMissing(nutrition.perServing.fat, 'g')}</dd></div>
    </dl>
  )
}

export default RecipeNutritionSummary

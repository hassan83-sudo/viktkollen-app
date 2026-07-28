export { nutritionFoods, getNutritionFoodById } from './nutritionDatabase.js'
export { calculateDailyNutritionSummary } from './dailyNutritionSummary.js'
export { analyzeMealText } from './mealAnalyzer.js'
export { buildNutritionAdvice } from './nutritionAdvice.js'
export {
  buildMealFlags,
  calculateNutritionForGrams,
  formatApproxCalories,
  formatApproxGrams,
  formatNutritionValue,
  multiplyFoodNutrition,
  sumMealNutrition,
} from './nutritionCalculator.js'
export {
  calculateProteinGoalContribution,
  parseProteinGoal,
} from './nutritionGoals.js'
export {
  convertAmountToGrams,
  normalizeUnit,
  parseQuantityTokens,
} from './nutritionUnits.js'

import { analyzeMealText } from './mealAnalyzer.js'
import { buildNutritionAdvice } from './nutritionAdvice.js'

export function analyzeNutritionMessage(message, options = {}) {
  const analysis = analyzeMealText(message, options)

  return {
    advice: buildNutritionAdvice(analysis, options),
    analysis,
  }
}

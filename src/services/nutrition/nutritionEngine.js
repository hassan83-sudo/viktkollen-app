export { nutritionFoods, getNutritionFoodById } from './nutritionDatabase.js'
export { calculateDailyNutritionSummary } from './dailyNutritionSummary.js'
export {
  buildMealComparisons,
  describeLatestMeal,
  describeMealByType,
  describeMealCount,
  describeMealMemory,
  describeMostProteinMeal,
  describeTodayMeals,
  findMealByType,
  getLatestMeal,
} from './mealHistory.js'
export {
  createUpdatedMealRecord,
  createMealEditDraft,
  getEffectiveMealNutrition,
  mealCorrectionFields,
  normalizeMealRecord,
  normalizeNutritionOverride,
  parseCorrectionNumber,
  resetMealNutritionOverride,
  validateMealEditDraft,
} from './mealCorrections.js'
export {
  addMealTemplate,
  buildMealTemplateDraft,
  createMealCopy,
  createMealFromTemplate,
  createMealTemplate,
  createMealTemplateFromMeal,
  deleteMealTemplate,
  filterMealTemplates,
  getMealTemplatePreview,
  getRecentUniqueMeals,
  markMealTemplateUsed,
  mealTemplateStorageKey,
  mealTemplateTypes,
  normalizeMealTemplate,
  normalizeMealTemplates,
  readMealTemplates,
  toggleMealTemplateFavorite,
  updateMealTemplate,
  updateStoredMealTemplate,
  validateMealTemplateDraft,
  writeMealTemplates,
} from './mealTemplates.js'
export { buildMealMemory, buildMealMemoryInsights } from './mealMemory.js'
export { buildMealTimeline } from './mealTimeline.js'
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
  buildProteinDistributionPlan,
  calculateSuggestedCalorieGoal,
  calculateSuggestedProteinGoal,
  calculateProteinGoalContribution,
  createUpdatedNutritionGoals,
  getLatestValidWeight,
  makeNutritionGoalProgress,
  normalizeNutritionGoals,
  parseProteinGoal,
  validateNutritionGoals,
} from './nutritionGoals.js'
export {
  buildDailyNutritionBreakdown,
  buildNextWeekNutritionFocus,
  buildWeeklyNutritionInsights,
  buildWeeklyNutritionReport,
  buildWeeklyNutritionSummary,
  buildWeeklyNutritionTextSummary,
  classifyDailyGoalProgress,
  classifyWeeklyDataCoverage,
  compareNutritionWeeks,
  getWeeklyNutritionRange,
  weeklyNutritionInternals,
} from './weeklyNutritionSummary.js'
export {
  buildMonthlyDailyBreakdown,
  buildMonthlyExportPayload,
  buildMonthlyNutritionInsights,
  buildMonthlyNutritionReport,
  buildMonthlyNutritionSummary,
  buildMonthlyTextReport,
  buildMonthlyWeightNutritionRelation,
  buildNextMonthNutritionFocus,
  classifyMonthlyDataCoverage,
  compareNutritionMonths,
  getMonthlyNutritionRange,
  monthlyNutritionInternals,
} from './monthlyNutritionSummary.js'
export {
  convertAmountToGrams,
  normalizeUnit,
  parseQuantityTokens,
} from './nutritionUnits.js'
export {
  buildMealsNeedingReview,
  buildNutritionConfidenceExplanation,
  buildNutritionDataQualitySummary,
  buildNutritionImprovementTips,
  classifyNutritionConfidence,
  describeNutritionDataQuality,
  evaluateMealNutritionConfidence,
  evaluateNutritionFieldConfidence,
  getNutritionConfidenceLabel,
  nutritionConfidenceFields,
} from './nutritionConfidence.js'
export {
  buildMealQualityEntries,
  buildMealQualityReviewModel,
} from './mealQuality.js'

import { analyzeMealText } from './mealAnalyzer.js'
import { buildNutritionAdvice } from './nutritionAdvice.js'

export function analyzeNutritionMessage(message, options = {}) {
  const analysis = analyzeMealText(message, options)

  return {
    advice: buildNutritionAdvice(analysis, options),
    analysis,
  }
}

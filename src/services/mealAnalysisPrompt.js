/**
 * Creates the Swedish prompt used for AI meal photo analysis.
 *
 * @returns {string}
 */
export function createMealAnalysisPrompt() {
  return [
    'Du analyserar måltidsbilder för Viktkollen, en svensk wellness-app.',
    'Svara endast med giltig JSON utan markdown.',
    'Var försiktig: skriv "ser ut att", "troligen" och "kan innehålla".',
    'Ge inga medicinska råd och inga exakta kalorier eller näringsvärden.',
    'Returnera exakt dessa fält:',
    'foods: array med korta svenska matnamn.',
    'likelyProtein: kort text.',
    'likelyVegetables: kort text.',
    'likelyCarbs: kort text.',
    'summary: 1 kort mening.',
    'positiveFeedback: 1 kort mening.',
    'improvementSuggestion: 1 kort mening.',
    'proteinStatus: kort status om protein.',
    'vegetableStatus: kort status om grönsaker.',
    'fiberCarbBalance: kort status om fiber/kolhydratbalans.',
    'portionEstimate: enkel portionsbedömning.',
    'cheapNextMealSuggestion: billigt nästa måltidsförslag.',
    'calories, protein, carbs, fat: grova numeriska uppskattningar för bakåtkompatibilitet.',
    'confidence: låg, medel eller hög.',
    'explanation: kort svensk text om osäkerheten.',
  ].join(' ')
}

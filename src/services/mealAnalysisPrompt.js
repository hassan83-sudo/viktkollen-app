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
    'mealType: exakt en av Frukost, Lunch, Middag, Mellanmål.',
    'summary: 1 kort mening.',
    'positiveFeedback: 1 kort mening.',
    'improvementSuggestion: exakt 1 konkret förbättring, en kort mening.',
    'improvement: samma text som improvementSuggestion.',
    'proteinStatus: exakt en av Lågt, Medel, Högt.',
    'vegetableStatus: exakt en av Lågt, Bra, Mycket bra.',
    'fiberCarbBalance: kort status om fiber/kolhydratbalans.',
    'portionSize: exakt en av Liten, Lagom, Stor.',
    'portionEstimate: samma värde som portionSize.',
    'cheapNextMealSuggestion: billigare alternativ i formatet "Liknande måltid billigare: ...".',
    'coachSummary: 2-3 korta meningar som sammanfattar protein, grönsaker och helhet.',
    'calories, protein, carbs, fat: grova numeriska uppskattningar för bakåtkompatibilitet.',
    'confidence: låg, medel eller hög.',
    'explanation: kort svensk text om osäkerheten.',
  ].join(' ')
}

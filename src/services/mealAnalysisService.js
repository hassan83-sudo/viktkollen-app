const MEAL_ANALYSIS_ENDPOINT = '/api/meal-analysis'

export const fallbackMealAnalysis = {
  calories: 540,
  carbs: 58,
  cheapNextMealSuggestion:
    'Billigt nästa mål: ägg, potatis och frysta grönsaker.',
  confidence: 'låg',
  explanation:
    'Detta är en försiktig uppskattning. Bildanalys kan missa mängder, ingredienser och tillagning.',
  fat: 18,
  fiberCarbBalance:
    'Kolhydratdelen ser rimlig ut. Lägg gärna till fullkorn eller grönsaker för mer fiber.',
  foods: ['trolig proteinkälla', 'troliga grönsaker', 'trolig kolhydratkälla'],
  improvementSuggestion:
    'Ett enkelt nästa steg kan vara att lägga till lite mer grönsaker.',
  likelyCarbs: 'kan innehålla ris, potatis, pasta eller annan kolhydratkälla',
  likelyProtein: 'ser ut att innehålla en proteinkälla',
  likelyVegetables: 'troligen grönsaker eller sallad',
  portionEstimate: 'Portionen ser medelstor ut.',
  positiveFeedback: 'Bra att måltiden verkar ha flera delar som kan ge mättnad.',
  protein: 32,
  proteinStatus: 'Protein verkar finnas i måltiden.',
  source: 'mock',
  summary:
    'Måltiden ser ut att ha protein, någon grönsak och en kolhydratkälla.',
  vegetableStatus: 'Grönsaker verkar finnas, men mängden är osäker.',
}

/**
 * Normalizes a meal analysis into the UI model.
 *
 * @param {object} analysis
 * @returns {object}
 */
export function normalizeMealAnalysis(analysis = {}) {
  return {
    ...fallbackMealAnalysis,
    ...analysis,
    foods: Array.isArray(analysis.foods)
      ? analysis.foods.map(String).slice(0, 8)
      : fallbackMealAnalysis.foods,
  }
}

/**
 * Requests meal photo analysis from the backend.
 *
 * @param {{checkIn: object, foods: object[], image: string, meals: object[], profile: object | null}} payload
 * @returns {Promise<object>}
 */
export async function analyzeMealPhoto(payload) {
  try {
    const response = await fetch(MEAL_ANALYSIS_ENDPOINT, {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || 'Kunde inte analysera måltiden just nu.')
    }

    return normalizeMealAnalysis({
      ...data.analysis,
      source: data.source === 'openai' ? 'openai' : 'mock',
    })
  } catch {
    return normalizeMealAnalysis(fallbackMealAnalysis)
  }
}

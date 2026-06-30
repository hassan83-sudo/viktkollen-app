const PROACTIVE_COACH_ENDPOINT = '/api/proactive-coach'

function getWeightTrend(weights = []) {
  if (!Array.isArray(weights) || weights.length < 2) {
    return 'stabil'
  }

  const firstWeight = Number(weights[0]?.value)
  const latestWeight = Number(weights.at(-1)?.value)

  if (!Number.isFinite(firstWeight) || !Number.isFinite(latestWeight)) {
    return 'stabil'
  }

  const change = latestWeight - firstWeight

  if (change < -0.3) {
    return 'nedåt'
  }

  if (change > 0.3) {
    return 'uppåt'
  }

  return 'stabil'
}

function hasProtein(meals = [], mealHistory = []) {
  const text = [
    ...meals.map((meal) => meal.text),
    ...mealHistory.map((meal) => meal.analysis?.proteinStatus || ''),
  ]
    .join(' ')
    .toLocaleLowerCase('sv-SE')

  return ['protein', 'ägg', 'kyckling', 'fisk', 'keso', 'kvarg', 'bön'].some(
    (keyword) => text.includes(keyword),
  )
}

function hasVegetables(mealHistory = []) {
  const text = mealHistory
    .map((meal) => meal.analysis?.vegetableStatus || meal.analysis?.likelyVegetables || '')
    .join(' ')
    .toLocaleLowerCase('sv-SE')

  return ['grön', 'sallad', 'frukt', 'tomat', 'gurka'].some((keyword) =>
    text.includes(keyword),
  )
}

/**
 * Creates proactive coach insights from local app data.
 *
 * @param {{bodyAnalysisHistory?: object[], checkIn: object, mealHistory?: object[], meals?: object[], weights?: object[]}} data
 * @returns {{budgetMealIdea: string, dailyRisk: string, dailyStrength: string, nextBestAction: string, recoveryAdvice: string, source: string}}
 */
export function makeProactiveCoachInsights(data) {
  const steps = Number(data.checkIn?.steps)
  const energy = Number(data.checkIn?.energy)
  const mealHistory = data.mealHistory || []
  const meals = data.meals || []
  const weightTrend = getWeightTrend(data.weights)
  const proteinLogged = hasProtein(meals, mealHistory)
  const vegetablesLogged = hasVegetables(mealHistory)
  const hasBodyHistory = (data.bodyAnalysisHistory || []).length > 0

  return {
    budgetMealIdea: proteinLogged
      ? 'Potatis, frysta grönsaker och ägg.'
      : 'Kvarg, banan och havre eller bönor med ris.',
    dailyRisk:
      energy <= 3
        ? 'Låg energi kan göra matvalen svårare senare.'
        : Number.isFinite(steps) && steps < 5000
          ? 'Lite rörelse hittills kan göra dagen trög.'
          : vegetablesLogged
            ? 'Största risken är att hoppa över nästa enkla rutin.'
            : 'Grönsaker eller frukt saknas lätt i dag.',
    dailyStrength:
      weightTrend === 'nedåt'
        ? 'Vikttrenden går åt rätt håll över tid.'
        : proteinLogged
          ? 'Du har fått in protein i dagens matbild.'
          : hasBodyHistory
            ? 'Du följer utvecklingen med bildhistorik.'
            : 'Du har data att bygga ett tydligare mönster från.',
    nextBestAction:
      !proteinLogged
        ? 'Lägg till en enkel proteinkälla i nästa måltid.'
        : !vegetablesLogged
          ? 'Lägg till frukt eller grönsaker nästa gång.'
          : 'Håll nästa steg litet: vatten och en kort promenad.',
    recoveryAdvice:
      energy <= 4
        ? 'Välj återhämtning och en enkel måltid framför hård kompensation.'
        : 'Planera en lugn kvällsrutin så dagens vanor håller i morgon också.',
    source: 'mock',
  }
}

/**
 * Loads proactive coach insights from API with local fallback.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function getProactiveCoachInsights(data) {
  const fallback = makeProactiveCoachInsights(data)

  try {
    const response = await fetch(PROACTIVE_COACH_ENDPOINT, {
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok || !result.insights) {
      return fallback
    }

    return {
      ...fallback,
      ...result.insights,
      source: result.source === 'openai' ? 'openai' : 'mock',
    }
  } catch {
    return fallback
  }
}

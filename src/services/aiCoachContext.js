function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function pickProfile(profile = {}) {
  return {
    activityLevel: profile.activityLevel || '',
    goal: profile.goal || '',
    goalWeight: profile.goalWeight || '',
    name: profile.name || '',
  }
}

function getWeightContext(weights = [], currentWeight) {
  const validWeights = safeArray(weights).filter((entry) =>
    Number.isFinite(Number(entry?.value)),
  )
  const firstWeight = validWeights[0]
  const latestWeight = validWeights.at(-1)
  const latestValue = Number(currentWeight ?? latestWeight?.value)

  return {
    changeSinceStart:
      firstWeight && Number.isFinite(latestValue)
        ? Number((latestValue - Number(firstWeight.value)).toFixed(1))
        : null,
    currentWeight: Number.isFinite(latestValue) ? latestValue : null,
    entries: validWeights.slice(-5),
    startWeight: firstWeight?.value ?? null,
  }
}

function getMealContext({ meals, mealHistory }) {
  const latestMealAnalysis = safeArray(mealHistory)[0] || null

  return {
    loggedMealsToday: safeArray(meals).slice(-6),
    latestMealAnalysis,
    mealAnalysisCount: safeArray(mealHistory).length,
  }
}

function getBodyAnalysisContext(bodyAnalysisHistory) {
  const history = safeArray(bodyAnalysisHistory)
  const latestAnalysis = history[0] || null

  return {
    analysisCount: history.length,
    latestAnalysis: latestAnalysis
      ? {
          generatedAt: latestAnalysis.createdAt || latestAnalysis.generatedAt,
          source: latestAnalysis.result?.source || latestAnalysis.source,
          summary: latestAnalysis.result?.summary || latestAnalysis.summary,
        }
      : null,
  }
}

function getRecentConversation(chatHistory = []) {
  return safeArray(chatHistory)
    .slice(-10)
    .map((message) => ({
      role: message.role,
      text: message.text,
    }))
}

function getRelevantKeys(intent) {
  const map = {
    bodyAnalysis: ['profile', 'bodyAnalysis', 'conversation'],
    calories: ['profile', 'meals', 'checkIn', 'conversation'],
    checkIn: ['profile', 'checkIn', 'conversation'],
    food: ['profile', 'meals', 'checkIn', 'conversation'],
    goalWeight: ['profile', 'weight', 'conversation'],
    habits: ['profile', 'checkIn', 'foods', 'conversation'],
    mealAnalysis: ['profile', 'meals', 'conversation'],
    motivation: ['profile', 'weight', 'checkIn', 'foods', 'conversation'],
    protein: ['profile', 'weight', 'meals', 'conversation'],
    recipe: ['profile', 'meals', 'conversation'],
    sleep: ['profile', 'checkIn', 'conversation'],
    stress: ['profile', 'checkIn', 'conversation'],
    training: ['profile', 'checkIn', 'weight', 'conversation'],
    weeklyReport: ['profile', 'weight', 'meals', 'bodyAnalysis', 'weeklyReport', 'conversation'],
    weight: ['profile', 'weight', 'conversation'],
  }

  return map[intent] || ['profile', 'checkIn', 'conversation']
}

/**
 * Builds a small, intent-aware context object for the AI coach.
 *
 * @param {object} params
 * @param {string} params.intent
 * @returns {object}
 */
export function buildAiCoachContext({
  bodyAnalysisHistory = [],
  chatHistory = [],
  checkIn = {},
  currentWeight,
  foods = [],
  intent,
  latestCoachReply = '',
  latestWeeklyReport = null,
  mealHistory = [],
  meals = [],
  profile = {},
  weights = [],
}) {
  const fullContext = {
    bodyAnalysis: getBodyAnalysisContext(bodyAnalysisHistory),
    checkIn,
    conversation: {
      latestCoachReply,
      recentMessages: getRecentConversation(chatHistory),
    },
    foods: safeArray(foods).map((item) => ({
      done: Boolean(item.done),
      id: item.id,
      label: item.label,
    })),
    meals: getMealContext({ mealHistory, meals }),
    profile: pickProfile(profile),
    weeklyReport: latestWeeklyReport,
    weight: getWeightContext(weights, currentWeight),
  }

  return getRelevantKeys(intent).reduce(
    (context, key) => ({
      ...context,
      [key]: fullContext[key],
    }),
    { intent },
  )
}

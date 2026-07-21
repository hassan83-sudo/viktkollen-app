import { getUnifiedWeightContext } from './healthCalculations.js'

let lastContextKey = ''
let lastContextValue = null

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function compactProfile(profile = {}) {
  return {
    activityLevel: profile.activityLevel || '',
    goal: profile.goal || '',
    goalWeight: profile.goalWeight || '',
    name: profile.name || '',
  }
}

function getWeightContext(weights = [], currentWeight, profile = {}) {
  const weightContext = getUnifiedWeightContext({
    currentWeight,
    profile,
    weights,
  })

  return {
    changeSinceStart: weightContext.changeSinceStart,
    completePercent: weightContext.completePercent,
    currentWeight: weightContext.currentWeight,
    goalWeight: weightContext.goalWeight,
    history: weightContext.history.slice(-10),
    latestWeight: weightContext.latestWeight,
    percentRemaining: weightContext.percentRemaining,
    remainingKg: weightContext.remainingKg,
    startWeight: weightContext.startWeight,
    trend: weightContext.trend,
  }
}

function getMealsContext(meals = [], mealHistory = []) {
  const loggedMealsToday = safeArray(meals).slice(-10)
  const history = safeArray(mealHistory).slice(0, 10)

  return {
    history,
    latestMealAnalysis: history[0] || null,
    latestAnalysis: history[0] || null,
    mealAnalysisCount: safeArray(mealHistory).length,
    loggedMealsToday,
    totalAnalyses: safeArray(mealHistory).length,
  }
}

function getBodyContext(bodyAnalysisHistory = []) {
  const history = safeArray(bodyAnalysisHistory).slice(0, 10)

  return {
    analysisCount: safeArray(bodyAnalysisHistory).length,
    history,
    latestAnalysis: history[0] || null,
    totalAnalyses: safeArray(bodyAnalysisHistory).length,
  }
}

function getRecentCoachConversation(chatHistory = []) {
  return safeArray(chatHistory)
    .slice(-10)
    .map((message) => ({
      role: message.role,
      text: message.text,
    }))
}

/**
 * Builds the shared user context used by all AI features.
 *
 * @param {object} data
 * @returns {object}
 */
export function buildAiUserContext(data = {}) {
  const cacheKey = JSON.stringify({
    bodyAnalysisHistory: data.bodyAnalysisHistory,
    chatHistory: data.chatHistory,
    checkIn: data.checkIn,
    currentWeight: data.currentWeight,
    foods: data.foods,
    latestWeeklyReport: data.latestWeeklyReport,
    mealHistory: data.mealHistory,
    meals: data.meals,
    profile: data.profile,
    weights: data.weights,
  })

  if (cacheKey === lastContextKey && lastContextValue) {
    return lastContextValue
  }

  lastContextKey = cacheKey
  lastContextValue = {
    bodyAnalysis: getBodyContext(data.bodyAnalysisHistory),
    checkIn: data.checkIn || {},
    coachConversation: getRecentCoachConversation(data.chatHistory),
    foods: safeArray(data.foods).map((item) => ({
      done: Boolean(item.done),
      id: item.id,
      label: item.label,
    })),
    generatedAt: new Date().toISOString(),
    latestWeeklyReport: data.latestWeeklyReport || null,
    meals: getMealsContext(data.meals, data.mealHistory),
    profile: compactProfile(data.profile),
    weight: getWeightContext(data.weights, data.currentWeight, data.profile),
  }

  return lastContextValue
}

/**
 * Picks only the parts of the shared user context that matter for an AI intent.
 *
 * @param {object} userContext
 * @param {string} intent
 * @returns {object}
 */
export function pickAiUserContextForIntent(userContext, intent) {
  const map = {
    bodyAnalysis: ['profile', 'bodyAnalysis', 'weight', 'coachConversation'],
    calories: ['profile', 'meals', 'checkIn', 'coachConversation'],
    checkIn: ['profile', 'checkIn', 'foods', 'coachConversation'],
    food: ['profile', 'meals', 'checkIn', 'foods', 'coachConversation'],
    lateMeal: ['profile', 'meals', 'checkIn', 'foods', 'coachConversation'],
    goalWeight: ['profile', 'weight', 'coachConversation'],
    habits: ['profile', 'checkIn', 'foods', 'coachConversation'],
    mealAnalysis: ['profile', 'meals', 'checkIn', 'coachConversation'],
    motivation: ['profile', 'weight', 'checkIn', 'foods', 'coachConversation'],
    protein: ['profile', 'weight', 'meals', 'coachConversation'],
    recipe: ['profile', 'meals', 'coachConversation'],
    sleep: ['profile', 'checkIn', 'coachConversation'],
    stress: ['profile', 'checkIn', 'coachConversation'],
    training: ['profile', 'checkIn', 'weight', 'coachConversation'],
    weeklyReport: [
      'profile',
      'weight',
      'meals',
      'bodyAnalysis',
      'latestWeeklyReport',
      'coachConversation',
    ],
    weight: ['profile', 'weight', 'coachConversation'],
  }
  const keys = map[intent] || ['profile', 'checkIn', 'coachConversation']

  return keys.reduce(
    (context, key) => ({
      ...context,
      [key]: userContext[key],
    }),
    { intent },
  )
}

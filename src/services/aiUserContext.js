import { getUnifiedWeightContext } from './healthCalculations.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import { getLatestBodyScanEstimatedWeight } from './weightProvenance.js'

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
    provenance: profile.weightProvenance || null,
    remainingKg: weightContext.remainingKg,
    startWeight: weightContext.startWeight,
    trend: weightContext.trend,
  }
}

function getMealsContext(meals = [], mealHistory = [], loggedMealsToday = meals) {
  const todayMeals = safeArray(loggedMealsToday).slice(-10)
  const history = safeArray(mealHistory).slice(0, 10)

  return {
    history,
    latestMealAnalysis: history[0] || null,
    latestAnalysis: history[0] || null,
    mealAnalysisCount: safeArray(mealHistory).length,
    loggedMealsToday: todayMeals,
    totalAnalyses: safeArray(mealHistory).length,
  }
}

function getBodyContext(bodyAnalysisHistory = []) {
  const history = safeArray(bodyAnalysisHistory).slice(0, 10)
  const latestEstimatedWeight = getLatestBodyScanEstimatedWeight(bodyAnalysisHistory)

  return {
    analysisCount: safeArray(bodyAnalysisHistory).length,
    history,
    latestAnalysis: history[0] || null,
    latestEstimatedWeight,
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
    nutritionGoals: data.nutritionGoals,
    profile: data.profile,
    today: data.today,
    weights: data.weights,
  })

  if (cacheKey === lastContextKey && lastContextValue) {
    return lastContextValue
  }

  const snapshot = data.healthSnapshot || buildHealthSnapshot(data)
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
    healthSnapshot: snapshot,
    meals: getMealsContext(snapshot.nutrition.actualMeals, data.mealHistory, snapshot.nutrition.mealsToday),
    profile: compactProfile(data.profile),
    weight: getWeightContext(snapshot.weight.dailyWeights, data.currentWeight ?? snapshot.weight.current, {
      ...data.profile,
      weightProvenance: snapshot.weight.provenance,
    }),
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

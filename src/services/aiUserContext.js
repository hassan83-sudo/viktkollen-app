import { getUnifiedWeightContext } from './healthCalculations.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import { describeMealProvenanceSummary, summarizeMealProvenance } from './nutrition/nutritionProvenance.js'
import { buildCompactProfileContext } from './profileService.js'
import { buildRoutineCoachContext } from './routines/dailyRoutinePlan.js'
import { getLatestBodyScanEstimatedWeight } from './weightProvenance.js'

let lastContextKey = ''
let lastContextValue = null

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function compactProfile(profile = {}) {
  const compact = buildCompactProfileContext(profile)

  return {
    activityLevel: compact.activityLevel,
    activityLevelLabel: compact.activityLevelLabel,
    dietaryPreferences: compact.dietaryPreferences,
    displayName: compact.displayName,
    goalWeight: compact.goalWeight,
    heightCm: compact.heightCm,
    name: compact.displayName,
    provenance: compact.provenance,
    units: compact.units,
    weightDirection: compact.weightDirection,
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
  const provenance = summarizeMealProvenance(todayMeals)

  return {
    history,
    latestMealAnalysis: history[0] || null,
    latestAnalysis: history[0] || null,
    mealAnalysisCount: safeArray(mealHistory).length,
    loggedMealsToday: todayMeals,
    provenance,
    provenanceSummary: describeMealProvenanceSummary(provenance),
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
    goalsHabits: data.goalsHabits,
    latestWeeklyReport: data.latestWeeklyReport,
    mealHistory: data.mealHistory,
    meals: data.meals,
    nutritionGoals: data.nutritionGoals,
    profile: data.profile,
    reminderState: data.reminderState,
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
    nutrition: {
      caloriesToday: snapshot.nutrition.caloriesToday,
      goals: snapshot.nutrition.goals,
      mealCountToday: snapshot.nutrition.mealCountToday,
      proteinToday: snapshot.nutrition.proteinToday,
    },
    nutritionGoals: data.nutritionGoals || snapshot.nutrition.goals,
    profile: compactProfile(data.profile),
    routines: buildRoutineCoachContext({
      goalsHabits: data.goalsHabits,
      reminderState: data.reminderState,
    }, { today: snapshot.date, now: `${snapshot.date}T12:00:00.000Z` }),
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
    calories: ['profile', 'meals', 'nutrition', 'checkIn', 'coachConversation'],
    checkIn: ['profile', 'checkIn', 'foods', 'coachConversation'],
    food: ['profile', 'meals', 'nutrition', 'checkIn', 'foods', 'coachConversation'],
    lateMeal: ['profile', 'meals', 'checkIn', 'foods', 'coachConversation'],
    goalWeight: ['profile', 'weight', 'coachConversation'],
    habits: ['profile', 'checkIn', 'foods', 'routines', 'coachConversation'],
    mealAnalysis: ['profile', 'meals', 'checkIn', 'coachConversation'],
    motivation: ['profile', 'weight', 'checkIn', 'foods', 'coachConversation'],
    protein: ['profile', 'weight', 'meals', 'nutrition', 'coachConversation'],
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
      'routines',
    ],
    weight: ['profile', 'weight', 'coachConversation'],
  }
  const keys = map[intent] || [
    'profile',
    'checkIn',
    'weight',
    'meals',
    'nutrition',
    'coachConversation',
  ]

  return keys.reduce(
    (context, key) => ({
      ...context,
      [key]: userContext[key],
    }),
    { intent },
  )
}

import {
  buildAiUserContext,
  pickAiUserContextForIntent,
} from './aiUserContext.js'

function getRecentConversation(chatHistory = []) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .slice(-10)
    .map((message) => ({
      role: message.role,
      text: message.text,
    }))
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
  healthSnapshot,
  intent,
  latestCoachReply = '',
  latestWeeklyReport = null,
  mealHistory = [],
  meals = [],
  nutritionGoals,
  profile = {},
  weights = [],
}) {
  const userContext = buildAiUserContext({
    bodyAnalysisHistory,
    chatHistory,
    checkIn,
    currentWeight,
    foods,
    healthSnapshot,
    latestWeeklyReport,
    mealHistory,
    meals,
    nutritionGoals,
    profile,
    weights,
  })
  const pickedContext = pickAiUserContextForIntent(userContext, intent)

  return {
    ...pickedContext,
    conversation: {
      latestCoachReply,
      recentMessages: getRecentConversation(chatHistory),
    },
    weeklyReport: pickedContext.latestWeeklyReport,
  }
}

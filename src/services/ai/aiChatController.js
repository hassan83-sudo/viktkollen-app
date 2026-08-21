import { requestAiEndpoint } from '../aiApiService.js'
import {
  loadAiCoachAppContext,
  loadAiConversationMemory,
  loadAiDeterministicReplies,
} from './aiRuntimeLoader.js'

const noopMemoryWriter = () => {}

export function makeRecentCoachChatHistory(chatHistory = []) {
  return chatHistory.slice(-10).map((chatMessage) => ({
    createdAt: chatMessage.createdAt,
    role: chatMessage.role,
    text: chatMessage.text,
  }))
}

export function buildCoachChatRemotePayload(appData = {}, message, chatHistory = []) {
  const snapshot = appData.healthSnapshot || {}
  const latestCoachReply = [...chatHistory]
    .reverse()
    .find((entry) => entry?.role === 'assistant')?.text || ''

  return {
    action: 'chat',
    bodyAnalysisHistory: Array.isArray(appData.bodyAnalysisHistory)
      ? appData.bodyAnalysisHistory.slice(0, 2)
      : [],
    chatHistory,
    checkIn: appData.checkIn || {},
    currentWeight: snapshot.weight?.current ?? appData.currentWeight,
    foods: Array.isArray(appData.foods) ? appData.foods.slice(0, 12) : [],
    latestCoachReply,
    latestWeeklyReport: appData.latestWeeklyReport || null,
    mealHistory: Array.isArray(appData.mealHistory) ? appData.mealHistory.slice(0, 5) : [],
    meals: Array.isArray(appData.meals) ? appData.meals.slice(-10) : [],
    message,
    nutritionGoals: appData.nutritionGoals || {},
    profile: {
      goal: appData.profile?.goal,
      goalWeight: appData.profile?.goalWeight,
      name: appData.profile?.name || appData.profile?.displayName,
      startWeight: appData.profile?.startWeight,
      weightDirection: appData.profile?.weightDirection,
    },
    weights: Array.isArray(appData.weights) ? appData.weights.slice(-14) : [],
  }
}

export async function prepareCoachChatSubmission({
  chatMessages = [],
  createdAt,
  text,
}) {
  let pendingChatHistory = [
    ...chatMessages,
    {
      createdAt,
      role: 'user',
      text,
    },
  ]
  let addMemory = noopMemoryWriter

  try {
    const [{ makePendingCoachChatHistory }, { addAiConversationMemory }] = await Promise.all([
      loadAiCoachAppContext(),
      loadAiConversationMemory(),
    ])

    pendingChatHistory = makePendingCoachChatHistory(chatMessages, text, createdAt)
    addMemory = addAiConversationMemory
  } catch {
    // Optional memory/context chunks must not block the visible chat flow.
  }

  return {
    addMemory,
    pendingChatHistory,
  }
}

export async function buildCurrentAiCoachContext(appData, chatHistory) {
  const { buildAiCoachAppContextFromData } = await loadAiCoachAppContext()

  return buildAiCoachAppContextFromData({
    ...appData,
    chatHistory,
  })
}

export async function createDeterministicChatReply({ appData, chatHistory, message }) {
  try {
    const [{ createDeterministicAiCoachReply }, context] = await Promise.all([
      loadAiDeterministicReplies(),
      buildCurrentAiCoachContext(appData, chatHistory),
    ])
    const reply = createDeterministicAiCoachReply({
      chatHistory: context.chatHistory,
      context,
      message,
    })

    return reply
      ? {
        reply,
        source: 'mock',
      }
      : null
  } catch {
    return null
  }
}

export async function createLocalSmartChatReply({
  appData,
  chatHistory,
  fallbackReply,
  message,
}) {
  try {
    const [{ createDeterministicAiCoachReply }, context] = await Promise.all([
      loadAiDeterministicReplies(),
      buildCurrentAiCoachContext(appData, chatHistory),
    ])

    return {
      reply: createDeterministicAiCoachReply({
        chatHistory: context.chatHistory,
        context,
        message,
      }),
      source: 'mock',
    }
  } catch {
    return {
      reply: await fallbackReply(),
      source: 'mock',
    }
  }
}

export async function requestCoachChatReply({
  appData,
  chatHistory,
  fallbackReply,
  message,
}) {
  const recentChatHistory = makeRecentCoachChatHistory(chatHistory)
  const remote = await requestAiEndpoint(
    buildCoachChatRemotePayload(appData, message, recentChatHistory),
  )
  const remoteReply = remote.ok && typeof remote.data?.reply === 'string'
    ? remote.data.reply.trim()
    : ''

  if (remoteReply) {
    return {
      reply: remoteReply,
      source: remote.source === 'openai' ? 'openai' : 'mock',
    }
  }

  return (await createDeterministicChatReply({
    appData,
    chatHistory: recentChatHistory,
    message,
  })) ||
    createLocalSmartChatReply({
      appData,
      chatHistory: recentChatHistory,
      fallbackReply,
      message,
    })
}

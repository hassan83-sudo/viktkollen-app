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

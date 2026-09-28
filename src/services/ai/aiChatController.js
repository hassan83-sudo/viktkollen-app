import {
  loadAiCoachAppContext,
  loadAiConversationMemory,
  loadAiDeterministicReplies,
} from './aiRuntimeLoader.js'
import { loadReadyState } from '../../features/ready/readyStore.js'

const noopMemoryWriter = () => {}
let memoryGeneration = 0
let memoryWriteQueue = Promise.resolve()

// Clear only the shared AI conversation memory, without touching other app data.
// Invalidate pending lazy writers so they cannot repopulate a cleared conversation.
export async function clearCoachConversationMemory() {
  memoryGeneration += 1
  await memoryWriteQueue.catch(() => {})
  const { setAiConversationMemory } = await loadAiConversationMemory()
  setAiConversationMemory([])
}

const readyLevelContext = {
  preschool: {
    id: 'preschool',
    label: 'Förskola',
    instruction: 'Anpassa språk, förklaringar, övningar, studietips och exempel till förskolenivå.',
  },
  f3: {
    id: 'f3',
    label: 'F–3',
    instruction: 'Anpassa språk, förklaringar, övningar, studietips och exempel till årskurs F–3.',
  },
  mid46: {
    id: 'mid46',
    label: '4–6',
    instruction: 'Anpassa språk, förklaringar, övningar, studietips och exempel till årskurs 4–6.',
  },
  mid79: {
    id: 'mid79',
    label: '7–9',
    instruction: 'Anpassa språk, förklaringar, övningar, studietips och exempel till årskurs 7–9.',
  },
  highschool: {
    id: 'highschool',
    label: 'Gymnasiet',
    instruction: 'Anpassa språk, förklaringar, övningar, studietips och exempel till gymnasienivå.',
  },
}

function getReadyEducationLevel() {
  try {
    const levelId = loadReadyState()?.levelId
    return readyLevelContext[levelId] || null
  } catch {
    return null
  }
}

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
  const pendingChatHistory = makeRecentCoachChatHistory([
    ...chatMessages,
    {
      createdAt,
      role: 'user',
      text,
    },
  ])

  const generation = memoryGeneration
  const addMemory = (entry) => {
    memoryWriteQueue = memoryWriteQueue
      .catch(() => {})
      .then(async () => {
        if (generation !== memoryGeneration) return
        const { addAiConversationMemory = noopMemoryWriter } = await loadAiConversationMemory()
        if (generation !== memoryGeneration) return
        addAiConversationMemory(entry)
      })
      .catch(() => {})
  }

  return {
    addMemory,
    pendingChatHistory,
  }
}

export async function buildCurrentAiCoachContext(appData, chatHistory) {
  const { buildAiCoachAppContextFromData } = await loadAiCoachAppContext()
  const educationLevel = getReadyEducationLevel()

  return buildAiCoachAppContextFromData({
    ...appData,
    profile: {
      ...(appData.profile || {}),
      educationLevel,
    },
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

export async function requestCoachRealtimeSession() {
  return {
    available: false,
    message: 'Röstsamtal med premium-AI är avstängt i gratisläget.',
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

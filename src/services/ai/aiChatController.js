import { requestAiEndpoint } from '../aiApiService.js'
import {
  loadAiCoachAppContext,
  loadAiConversationMemory,
  loadAiDeterministicReplies,
} from './aiRuntimeLoader.js'
import { loadReadyState } from '../../features/ready/readyStore.js'

const noopMemoryWriter = () => {}

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

function compactLiveWeather(weather) {
  if (!weather?.hasLiveWeather) return null
  return {
    city: weather.city || '',
    condition: weather.condition || '',
    feelsLikeC: Number.isFinite(Number(weather.feelsLikeC)) ? weather.feelsLikeC : null,
    hasLiveWeather: true,
    precipitationRiskPercent: Number.isFinite(Number(weather.precipitationRiskPercent))
      ? weather.precipitationRiskPercent
      : null,
    sunriseLabel: weather.sunriseLabel || '',
    sunsetLabel: weather.sunsetLabel || '',
    temperatureC: Number.isFinite(Number(weather.temperatureC)) ? weather.temperatureC : null,
    windSpeedMs: Number.isFinite(Number(weather.windSpeedMs)) ? weather.windSpeedMs : null,
  }
}

function compactClothingAdvice(advice) {
  if (!advice?.available || !Array.isArray(advice.lines)) return null
  return {
    available: true,
    lines: advice.lines.slice(0, 4),
  }
}

export function makeRecentCoachChatHistory(chatHistory = []) {
  return chatHistory.slice(-10).map((chatMessage) => ({
    createdAt: chatMessage.createdAt,
    role: chatMessage.role,
    text: chatMessage.text,
  }))
}

export function buildCoachChatRemotePayload(appData = {}, message, chatHistory = []) {
  const snapshot = appData.healthSnapshot || {}
  const educationLevel = getReadyEducationLevel()
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
      educationLevel,
      goal: appData.profile?.goal,
      goalWeight: appData.profile?.goalWeight,
      name: appData.profile?.name || appData.profile?.displayName,
      startWeight: appData.profile?.startWeight,
      weightDirection: appData.profile?.weightDirection,
    },
    clothingAdvice: compactClothingAdvice(appData.clothingAdvice),
    liveWeather: compactLiveWeather(appData.liveWeather),
    surface: appData.surface || 'coach',
    weights: Array.isArray(appData.weights) ? appData.weights.slice(-14) : [],
  }
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

  let memoryWriterPromise = null
  const addMemory = (entry) => {
    if (!memoryWriterPromise) {
      memoryWriterPromise = loadAiConversationMemory()
        .then(({ addAiConversationMemory }) => addAiConversationMemory)
        .catch(() => noopMemoryWriter)
    }

    void memoryWriterPromise.then((writeMemory) => writeMemory(entry))
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

export function buildCoachRealtimeSessionPayload(appData = {}, chatHistory = []) {
  return {
    ...buildCoachChatRemotePayload(appData, 'starta röstsamtal', chatHistory),
    action: 'realtime-session',
  }
}

export async function requestCoachRealtimeSession({
  appData,
  chatHistory = [],
} = {}) {
  const remote = await requestAiEndpoint(
    buildCoachRealtimeSessionPayload(appData, makeRecentCoachChatHistory(chatHistory)),
  )
  const clientSecret = remote.ok && typeof remote.data?.clientSecret === 'string'
    ? remote.data.clientSecret.trim()
    : ''

  if (!remote.ok || remote.data?.available === false || !clientSecret) {
    return {
      available: false,
      message: remote.data?.message || remote.reason || 'Röstsamtal är inte tillgängligt just nu.',
    }
  }

  return {
    available: true,
    clientSecret,
    expiresAt: remote.data.expiresAt || null,
    idleTimeoutMs: Number(remote.data.idleTimeoutMs) || 45000,
    maxSessionMs: Number(remote.data.maxSessionMs) || 180000,
    model: remote.data.model || '',
  }
}

export async function requestCoachChatReply({
  appData,
  chatHistory,
  fallbackReply,
  message,
}) {
  const recentChatHistory = makeRecentCoachChatHistory(chatHistory)
  const isSimpleGreeting = /^(hej|hejsan|hallå|tjena|god morgon|god kväll)[!.\s]*$/i.test(
    String(message || '').trim(),
  )

  if (isSimpleGreeting) {
    return {
      reply: await fallbackReply(),
      source: 'mock',
    }
  }

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

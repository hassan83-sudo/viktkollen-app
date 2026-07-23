import {
  getAiConversationMemory as readAiConversationMemory,
  saveAiConversationMemory,
} from './userDataRepository.js'

const MAX_MEMORY_MESSAGES = 10

function normalizeMessage(message) {
  if (!message || typeof message.text !== 'string') {
    return null
  }

  return {
    createdAt: message.createdAt || new Date().toISOString(),
    feature: message.feature || 'ai-coach',
    role: message.role === 'assistant' ? 'assistant' : 'user',
    text: message.text,
  }
}

/**
 * Reads the shared AI conversation memory.
 *
 * @returns {object[]}
 */
export function getAiConversationMemory() {
  try {
    const parsed = readAiConversationMemory([])

    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeMessage)
      .filter(Boolean)
      .slice(-MAX_MEMORY_MESSAGES)
  } catch {
    return []
  }
}

/**
 * Writes the shared AI conversation memory.
 *
 * @param {object[]} messages
 * @returns {object[]}
 */
export function setAiConversationMemory(messages) {
  const normalizedMessages = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter(Boolean)
    .slice(-MAX_MEMORY_MESSAGES)

  saveAiConversationMemory(normalizedMessages)

  return normalizedMessages
}

/**
 * Adds one message to the shared AI conversation memory.
 *
 * @param {object} message
 * @returns {object[]}
 */
export function addAiConversationMemory(message) {
  return setAiConversationMemory([...getAiConversationMemory(), message])
}

/**
 * Gets the latest shared AI conversation messages.
 *
 * @param {number} limit
 * @returns {object[]}
 */
export function getRecentAiConversation(limit = MAX_MEMORY_MESSAGES) {
  return getAiConversationMemory().slice(-limit)
}

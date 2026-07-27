import { includesAny, normalizeAiCoachText } from './coachText.js'

export function getLastUserMessage(chatHistory = []) {
  return [...(Array.isArray(chatHistory) ? chatHistory : [])]
    .reverse()
    .find((message) => message?.role === 'user' && message?.text)
    ?.text
}

export function getLastAssistantMessage(chatHistory = []) {
  return [...(Array.isArray(chatHistory) ? chatHistory : [])]
    .reverse()
    .find((message) => message?.role === 'assistant' && message?.text)
    ?.text
}

export function getRecentConversationText(chatHistory = [], limit = 10) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .slice(-limit)
    .map((message) => message?.text || '')
    .filter(Boolean)
    .join(' ')
}

export function getRecentAssistantTexts(chatHistory = []) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .filter((message) => message?.role === 'assistant' && message?.text)
    .slice(-5)
    .map((message) => message.text)
}

export function isClarifyFollowUp(normalized) {
  return [
    'hur menar du',
    'varfor',
    'varfor da',
    'vad menar du',
    'kan du forklara',
    'kan du utveckla',
    'utveckla',
    'hur da',
    'ar du saker',
    'vad ska jag gora da',
    'ge ett exempel',
    'galler det mig',
  ].some((phrase) => normalized.plain === phrase)
}

export function shouldUsePreviousContext(normalized) {
  return [
    'det',
    'den',
    'sa',
    'så',
    'och sen',
    'och sedan',
    'varfor',
    'varfor da',
    'hur da',
    'vad menar du',
    'kan du forklara',
    'kan du utveckla',
    'ar du saker',
    'vad ska jag gora da',
    'ge ett exempel',
    'galler det mig',
    'var det dumt',
    'var det daligt',
    'var det bra',
    'dumt',
  ].some((phrase) => normalized.plain === phrase)
}

export function getIntentSourceText(message, chatHistory = []) {
  const normalized = normalizeAiCoachText(message)

  if (!shouldUsePreviousContext(normalized)) {
    return message
  }

  const previousText = getLastUserMessage(chatHistory) ||
    getRecentConversationText(chatHistory, 5)

  return previousText ? `${previousText} ${message}` : message
}

export function getLastDiscussedTopic(chatHistory = []) {
  const text = normalizeAiCoachText(getRecentConversationText(chatHistory, 8)).plain

  if (includesAny(text, ['pizza', 'chips', 'godis', 'lask', 'hamburgare'])) {
    return 'food'
  }

  if (includesAny(text, ['vikt', 'mal', 'gatt ner', 'vager'])) {
    return 'weight'
  }

  if (includesAny(text, ['gym', 'promenad', 'traning', 'vilodag'])) {
    return 'training'
  }

  if (includesAny(text, ['stress', 'motivation', 'dalig dag'])) {
    return 'motivation'
  }

  if (includesAny(text, ['somn', 'sov', 'trott'])) {
    return 'sleep'
  }

  return ''
}

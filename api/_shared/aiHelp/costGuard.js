import { createHash } from 'node:crypto'

// Paid-call limits are reserved in the shared AI Help cost store.
// This module only prices a call and hashes the authenticated user id.
export const AI_HELP_LIMIT_SCOPE = 'shared-store'

export const AI_HELP_DEFAULT_LIMIT = 8
export const AI_HELP_DEFAULT_WINDOW_MS = 10 * 60 * 1000
export const AI_HELP_MAX_MESSAGE_CHARS = 600
export const AI_HELP_MAX_HISTORY = 8
export const AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS = 400
export const AI_HELP_INPUT_USD_PER_MILLION = 0.25
export const AI_HELP_OUTPUT_USD_PER_MILLION = 2

export function hashAiHelpScope(userId) {
  return createHash('sha256').update(String(userId || '')).digest('hex').slice(0, 24)
}

export function aiHelpSekPerUsd(env = process.env) {
  const configured = Number(env.AI_HELP_SEK_PER_USD)
  return Number.isFinite(configured) && configured > 0 ? configured : 9.93
}

export function billableOutputTokens(outputTokens = 0, reasoningTokens = 0) {
  const output = Number(outputTokens) || 0
  const reasoning = Number(reasoningTokens) || 0
  if (reasoning > output) return output + reasoning
  return Math.max(output, reasoning)
}

export function aiHelpCostSek({
  inputTokens = 0,
  outputTokens = 0,
  reasoningTokens = 0,
  sekPerUsd = 9.93,
  inputUsdPerMillion = AI_HELP_INPUT_USD_PER_MILLION,
  outputUsdPerMillion = AI_HELP_OUTPUT_USD_PER_MILLION,
} = {}) {
  const billable = billableOutputTokens(outputTokens, reasoningTokens)
  const usd = (Number(inputTokens) * inputUsdPerMillion + billable * outputUsdPerMillion) / 1_000_000
  return Math.round((usd * sekPerUsd) * 1_000_000) / 1_000_000
}

export function estimateAiHelpCostSek(input) {
  return aiHelpCostSek(input)
}

export function reservedInputTokens(text, messageCount = 1) {
  const bytes = new TextEncoder().encode(String(text || '')).length
  const messages = Number.isInteger(messageCount) && messageCount > 0 ? messageCount : 1
  return bytes + 64 + messages * 32
}

export function modelCallHoldSek({
  inputText = '',
  maxOutputTokens = AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS,
  messageCount = 1,
  sekPerUsd = 9.93,
} = {}) {
  return aiHelpCostSek({
    inputTokens: reservedInputTokens(inputText, messageCount),
    outputTokens: maxOutputTokens,
    reasoningTokens: 0,
    sekPerUsd,
  })
}

export function clearAiHelpRateLimitForTests() {}

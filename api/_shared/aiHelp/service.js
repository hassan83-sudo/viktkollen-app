import { getLanguageDefinition, normalizeLanguageCode } from '../../../src/i18n/languages.js'
import { isKnowledgeId } from '../../../src/features/aiHelp/knowledgeCatalog.js'
import { localHelpResult } from '../../../src/features/aiHelp/helpRouter.js'
import { helpDomain } from '../../../src/features/sharedAi/helpDomain.js'
import { sanitizeHelpTool } from '../../../src/features/aiHelp/aiHelpTools.js'
import {
  AI_HELP_DEFAULT_LIMIT,
  AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS,
  AI_HELP_DEFAULT_WINDOW_MS,
  AI_HELP_MAX_HISTORY,
  AI_HELP_MAX_MESSAGE_CHARS,
  aiHelpSekPerUsd,
  hashAiHelpScope,
  reservedInputTokens,
} from './costGuard.js'
import { createCostStoreFromEnv } from './supabaseCostStore.js'
import { preliminaryPlanFacts, verifiedPriceMajors } from './planFacts.js'
import { buildAiHelpInstructions } from './prompt.js'
import { recordUnansweredQuestion } from './unansweredStore.js'

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5-mini'
const REQUEST_TIMEOUT_MS = 20000
const DEFAULT_BUDGET_PERIOD_SECONDS = 30 * 24 * 60 * 60

let costStoreOverride = null

export function setAiHelpCostStoreForTests(store = null) {
  costStoreOverride = store
}

function positiveInteger(value, fallback) {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function limitedModelResult(language, retryAfterSeconds) {
  return {
    code: 'MODEL_LIMITED',
    language,
    ok: false,
    retryAfterSeconds: retryAfterSeconds || 60,
    status: 429,
  }
}

function localFallbackResult(route, language) {
  return {
    ...localHelpResult(route.fallbackEntry, {
      extra: route.fallbackEntry.id === 'settings.plan' ? preliminaryPlanFacts() : '',
      source: 'local-fallback',
    }),
    language,
  }
}
const claimedAccountActionPattern = /har sagt upp|har raderat|abonnemanget är uppsagt|kontot är raderat|jag har avslutat|jag har öppnat/i
const secretPattern = /sk-[A-Za-z0-9_-]{8,}|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE|Bearer\s+[A-Za-z0-9._-]{12,}/i
const personalPricePattern = /ditt abonnemang kostar|din plan kostar|du betalar\s+\d/i
const foreignMoneyPattern = /\$\s*\d|\d[\d\s.,]*\s*€/i

export function answerIsAllowed(answer) {
  const text = String(answer || '')
  if (secretPattern.test(text) || claimedAccountActionPattern.test(text) || personalPricePattern.test(text) || foreignMoneyPattern.test(text)) {
    return false
  }
  const allowed = new Set(verifiedPriceMajors())
  const amounts = [...text.matchAll(/\b(\d{1,6})(?:[.,]\d{1,2})?\s*(?:kr|sek|kronor)\b/gi)]
    .map((match) => Number(match[1]))
  return amounts.every((amount) => allowed.has(amount))
}

function clampText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseBodyMessages(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((message) => {
      const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : ''
      const content = clampText(message?.content, AI_HELP_MAX_MESSAGE_CHARS)
      return role && content ? { content, role } : null
    })
    .filter(Boolean)
    .slice(-AI_HELP_MAX_HISTORY)
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim()
  return data?.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text)
    ?.filter(Boolean)
    ?.join('\n')
    ?.trim() || ''
}

function parseModelJson(text) {
  const source = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(source.slice(start, end + 1))
  } catch {
    return null
  }
}

function languagePayload(languageCode) {
  const definition = getLanguageDefinition(languageCode)
  return {
    code: definition.code,
    direction: definition.direction === 'rtl' ? 'rtl' : 'ltr',
    fallback: definition.code !== languageCode,
  }
}

export function validateAiHelpRequest(body = {}) {
  const requestedLanguage = clampText(body.language, 32)
  const normalizedLanguage = normalizeLanguageCode(requestedLanguage)
  const language = languagePayload(normalizedLanguage)
  language.fallback = Boolean(requestedLanguage) && requestedLanguage.toLowerCase() !== normalizedLanguage.toLowerCase()
  const messages = parseBodyMessages(body.messages)
  const featureIds = (Array.isArray(body.featureIds) ? body.featureIds : [])
    .map((id) => clampText(id, 80))
    .filter(isKnowledgeId)
    .slice(0, 8)
  const latest = messages[messages.length - 1]

  if (!latest || latest.role !== 'user') {
    return { error: 'invalid_request', language }
  }

  return { featureIds, language, messages }
}

async function keepReservation(store, reservationId) {
  try {
    await store.markUncertain({ reservationId })
  } catch {
    // The row stays reserved, so the hold is not reused.
  }
}

export async function answerAiHelpQuestion({
  body = {},
  costStore = null,
  env = process.env,
  fetchImpl = fetch,
  userId,
} = {}) {
  const validated = validateAiHelpRequest(body)
  if (validated.error) {
    return { ok: false, status: 400, code: 'INVALID_REQUEST', language: validated.language }
  }

  const route = helpDomain.route({
    languageCode: validated.language.code,
    messages: validated.messages,
    pinnedIds: validated.featureIds,
  })
  if (route.kind === 'local') {
    return {
      ...localHelpResult(route.entry, {
        extra: route.entry.id === 'settings.plan' ? preliminaryPlanFacts() : '',
      }),
      language: validated.language,
    }
  }
  if (route.kind === 'out-of-scope') {
    return {
      answer: '',
      featureIds: [],
      language: validated.language,
      ok: true,
      source: 'out-of-scope',
      status: 'unanswered',
    }
  }
  if (route.kind === 'gap') {
    const recorded = recordUnansweredQuestion({
      language: validated.language.code,
      question: validated.messages[validated.messages.length - 1].content,
      userId,
    })
    return {
      answer: '',
      featureIds: [],
      language: validated.language,
      ok: true,
      source: 'knowledge-gap',
      status: 'unanswered',
      unansweredId: recorded.id,
    }
  }

  const entries = route.entries

  if (!env.OPENAI_API_KEY) {
    return { code: 'PROVIDER_NOT_CONFIGURED', language: validated.language, ok: false, status: 503 }
  }

  const model = env.AI_HELP_MODEL || DEFAULT_MODEL
  const requestedTokens = Number(env.AI_HELP_MAX_OUTPUT_TOKENS)
  const maxOutputTokens = Math.min(
    AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS,
    Number.isFinite(requestedTokens) && requestedTokens > 0 ? requestedTokens : AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS,
  )
  const instructions = buildAiHelpInstructions({
    entries,
    languageCode: validated.language.code,
    planFacts: entries.some((entry) => entry.id === 'settings.plan') ? preliminaryPlanFacts() : '',
  })
  const input = [
    { role: 'developer', content: [{ text: instructions, type: 'input_text' }] },
    ...validated.messages.map((message) => ({
      content: [message.role === 'assistant'
        ? { annotations: [], text: message.content, type: 'output_text' }
        : { text: message.content, type: 'input_text' }],
      role: message.role,
    })),
  ]
  const budgetSek = Number(env.AI_HELP_BUDGET_SEK)
  if (!Number.isFinite(budgetSek) || budgetSek <= 0) {
    if (route.fallbackEntry) return localFallbackResult(route, validated.language)
    return limitedModelResult(validated.language, 60)
  }

  const store = costStore || costStoreOverride || createCostStoreFromEnv(env, fetchImpl)
  const preparedText = [instructions, ...validated.messages.map((message) => message.content)].join('\n')
  const reservation = await store.reserve({
    budgetSek,
    maxInputTokens: reservedInputTokens(preparedText, validated.messages.length + 1),
    maxOutputTokens,
    periodSeconds: positiveInteger(env.AI_HELP_BUDGET_PERIOD_SECONDS, DEFAULT_BUDGET_PERIOD_SECONDS),
    sekPerUsd: aiHelpSekPerUsd(env),
    userHash: hashAiHelpScope(userId),
    userLimit: positiveInteger(env.AI_HELP_RATE_LIMIT_MAX, AI_HELP_DEFAULT_LIMIT),
    windowSeconds: Math.max(1, Math.round(positiveInteger(env.AI_HELP_RATE_WINDOW_MS, AI_HELP_DEFAULT_WINDOW_MS) / 1000)),
  })
  if (!reservation.ok) {
    if (route.fallbackEntry) return localFallbackResult(route, validated.language)
    return limitedModelResult(validated.language, reservation.retryAfterSeconds)
  }

  let providerResponse
  try {
    providerResponse = await fetchImpl(OPENAI_API_URL, {
      body: JSON.stringify({
        input,
        max_output_tokens: maxOutputTokens,
        model,
        reasoning: { effort: 'low' },
        text: { verbosity: 'low' },
      }),
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    await keepReservation(store, reservation.reservationId)
    return { code: 'PROVIDER_UNAVAILABLE', language: validated.language, ok: false, status: 503 }
  }

  if (!providerResponse.ok) {
    await keepReservation(store, reservation.reservationId)
    return { code: 'PROVIDER_UNAVAILABLE', language: validated.language, ok: false, status: 503 }
  }

  let payload
  try {
    payload = await providerResponse.json()
  } catch {
    await keepReservation(store, reservation.reservationId)
    return { code: 'PROVIDER_INVALID_RESPONSE', language: validated.language, ok: false, status: 502 }
  }

  const usage = payload?.usage || {}
  const inputTokens = Number(usage.input_tokens)
  const outputTokens = Number(usage.output_tokens)
  const reasoningTokens = Number(usage.output_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0)
  const usageIsComplete = Number.isInteger(inputTokens) && inputTokens >= 0
    && Number.isInteger(outputTokens) && outputTokens >= 0
    && Number.isInteger(reasoningTokens) && reasoningTokens >= 0
  if (!usageIsComplete) {
    await keepReservation(store, reservation.reservationId)
  } else {
    await store.settle({
      inputTokens,
      outputTokens,
      reasoningTokens,
      reservationId: reservation.reservationId,
    })
  }

  const outputWasCut = payload?.status === 'incomplete' || payload?.incomplete_details?.reason === 'max_output_tokens'
  const parsed = outputWasCut ? null : parseModelJson(extractResponseText(payload))
  if (!parsed || (parsed.status !== 'answered' && parsed.status !== 'unanswered')) {
    return { code: 'PROVIDER_INVALID_RESPONSE', language: validated.language, ok: false, status: 502 }
  }

  const answer = clampText(parsed.answer, 1200)
  if (parsed.status === 'answered' && !answer) {
    return { code: 'PROVIDER_INVALID_RESPONSE', language: validated.language, ok: false, status: 502 }
  }
  const featureIds = (Array.isArray(parsed.featureIds) ? parsed.featureIds : [])
    .map((id) => clampText(id, 80))
    .filter((id) => entries.some((entry) => entry.id === id))
    .slice(0, 4)
  if (parsed.status === 'answered' && answer && !answerIsAllowed(answer)) {
    return {
      answer: '',
      featureIds: [],
      language: validated.language,
      ok: true,
      source: 'withheld',
      status: 'unanswered',
    }
  }
  const answered = parsed.status === 'answered' && answer && answerIsAllowed(answer)

  if (!answered) {
    const recorded = recordUnansweredQuestion({
      language: validated.language.code,
      question: validated.messages[validated.messages.length - 1].content,
      userId,
    })
    return {
      answer: '',
      featureIds: [],
      language: validated.language,
      ok: true,
      source: 'knowledge-gap',
      status: 'unanswered',
      unansweredId: recorded.id,
    }
  }

  return {
    answer,
    featureIds,
    language: validated.language,
    model,
    ok: true,
    source: 'openai',
    status: 'answered',
    tool: sanitizeHelpTool(parsed.tool, entries),
  }
}

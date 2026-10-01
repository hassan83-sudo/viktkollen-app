import { getLanguageDefinition, normalizeLanguageCode } from '../../../src/i18n/languages.js'
import { isCoachKnowledgeId } from '../../../src/features/aiCoach/coachKnowledge.js'
import { selectCoachModelContext } from '../../../src/features/aiCoach/coachContext.js'
import { explainCoachRoute } from '../../../src/features/aiCoach/coachRouter.js'
import { coachDomain } from '../../../src/features/sharedAi/coachDomain.js'
import {
  AI_HELP_DEFAULT_LIMIT,
  AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS,
  AI_HELP_DEFAULT_WINDOW_MS,
  AI_HELP_MAX_HISTORY,
  AI_HELP_MAX_MESSAGE_CHARS,
  aiHelpSekPerUsd,
  hashAiHelpScope,
  reservedInputTokens,
} from '../aiHelp/costGuard.js'

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5-mini'
const DEFAULT_BUDGET_PERIOD_SECONDS = 30 * 24 * 60 * 60

function blockedFetch() {
  throw new Error('openai_call_blocked')
}

let costStoreOverride = null

export function setCoachCostStoreForTests(store = null) {
  costStoreOverride = store
}

function clampText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseMessages(value) {
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

function languagePayload(languageCode) {
  const definition = getLanguageDefinition(languageCode)
  return {
    code: definition.code,
    direction: definition.direction === 'rtl' ? 'rtl' : 'ltr',
    fallback: definition.code !== languageCode,
  }
}

function positiveInteger(value, fallback) {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function kilogramClaims(text) {
  return [...String(text || '').matchAll(/(\d+(?:[.,]\d+)?)\s*kg/gi)].map((match) => match[1].replace(',', '.'))
}

export function coachAnswerIsAllowed(answer, context) {
  const text = String(answer || '')
  if (/\b(jag har öppnat|jag öppnade|jag har loggat|jag har ändrat|har ändrat ditt mål|har raderat)\b/i.test(text)) return false
  if (/\bdu har (diabetes|cancer|depression|en ätstörning|hjärtinfarkt)\b/i.test(text)) return false
  const allowed = JSON.stringify(context || {})
  return kilogramClaims(text).every((amount) => allowed.includes(amount))
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
  const source = String(text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(source.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function answerCoachQuestion({
  body = {},
  contextProvider = null,
  costStore = null,
  env = process.env,
  fetchImpl = blockedFetch,
  userId,
} = {}) {
  const requestedLanguage = clampText(body.language, 32)
  const normalizedLanguage = normalizeLanguageCode(requestedLanguage)
  const language = languagePayload(normalizedLanguage)
  const messages = parseMessages(body.messages)
  const pinnedIds = (Array.isArray(body.featureIds) ? body.featureIds : [])
    .map((id) => clampText(id, 80))
    .filter(isCoachKnowledgeId)
    .slice(0, 4)
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return { code: 'INVALID_REQUEST', language, ok: false, status: 400 }
  }

  const personal = coachDomain.context(contextProvider)
  const context = personal.ok ? personal.data : null
  const route = coachDomain.route({
    context,
    languageCode: language.code,
    messages,
    pinnedIds,
  })
  const local = explainCoachRoute(route, context)
  if (local) {
    return { ...local, handoff: local.handoff === true, language, ok: true, performed: local.performed === true, tool: null }
  }

  if (!env.OPENAI_API_KEY) {
    return { code: 'PROVIDER_NOT_CONFIGURED', language, ok: false, status: 503 }
  }

  const budgetSek = Number(env.AI_HELP_BUDGET_SEK)
  if (!Number.isFinite(budgetSek) || budgetSek <= 0) {
    if (route.fallbackEntry) {
      return {
        ...explainCoachRoute({ entry: route.fallbackEntry, kind: 'local' }, context),
        handoff: false,
        language,
        ok: true,
        performed: false,
        source: 'local-fallback',
        tool: null,
      }
    }
    return { code: 'MODEL_LIMITED', language, ok: false, status: 429 }
  }
  const store = costStoreOverride || costStore
  if (!store) {
    return { code: 'PROVIDER_NOT_CONFIGURED', language, ok: false, status: 503 }
  }

  const model = env.AI_HELP_MODEL || DEFAULT_MODEL
  const maxOutputTokens = AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS
  const instructions = coachDomain.instructions({
    context: selectCoachModelContext(messages[messages.length - 1].content, context),
    entries: route.entries,
    languageCode: language.code,
  })
  const input = [
    { role: 'developer', content: [{ text: instructions, type: 'input_text' }] },
    ...messages.map((message) => ({
      content: [message.role === 'assistant'
        ? { annotations: [], text: message.content, type: 'output_text' }
        : { text: message.content, type: 'input_text' }],
      role: message.role,
    })),
  ]
  const preparedText = [instructions, ...messages.map((message) => message.content)].join('\n')
  const reservation = await store.reserve({
    budgetSek,
    maxInputTokens: reservedInputTokens(preparedText, messages.length + 1),
    maxOutputTokens,
    periodSeconds: positiveInteger(env.AI_HELP_BUDGET_PERIOD_SECONDS, DEFAULT_BUDGET_PERIOD_SECONDS),
    sekPerUsd: aiHelpSekPerUsd(env),
    userHash: hashAiHelpScope(userId),
    userLimit: positiveInteger(env.AI_HELP_RATE_LIMIT_MAX, AI_HELP_DEFAULT_LIMIT),
    windowSeconds: Math.max(1, Math.round(positiveInteger(env.AI_HELP_RATE_WINDOW_MS, AI_HELP_DEFAULT_WINDOW_MS) / 1000)),
  })
  if (!reservation?.ok) {
    if (route.fallbackEntry) {
      return {
        ...explainCoachRoute({ entry: route.fallbackEntry, kind: 'local' }, context),
        handoff: false,
        language,
        ok: true,
        performed: false,
        source: 'local-fallback',
        tool: null,
      }
    }
    return { code: 'MODEL_LIMITED', language, ok: false, retryAfterSeconds: reservation?.retryAfterSeconds || 60, status: 429 }
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
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    if (reservation.reservationId) await store.markUncertain?.({ reservationId: reservation.reservationId })
    return { code: 'PROVIDER_UNAVAILABLE', language, ok: false, status: 503 }
  }

  if (!providerResponse?.ok) {
    if (reservation.reservationId) await store.markUncertain?.({ reservationId: reservation.reservationId })
    return { code: 'PROVIDER_UNAVAILABLE', language, ok: false, status: 503 }
  }

  const payload = await providerResponse.json()
  const usage = payload?.usage || {}
  if (Number.isInteger(usage.input_tokens) && Number.isInteger(usage.output_tokens)) {
    await store.settle?.({
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0),
      reservationId: reservation.reservationId,
    })
  } else if (reservation.reservationId) {
    await store.markUncertain?.({ reservationId: reservation.reservationId })
  }

  const outputWasCut = payload?.status === 'incomplete' || payload?.incomplete_details?.reason === 'max_output_tokens'
  const parsed = outputWasCut ? null : parseModelJson(extractResponseText(payload))
  const answer = clampText(parsed?.answer, 1200)
  const knowledgeIds = (Array.isArray(parsed?.knowledgeIds) ? parsed.knowledgeIds : [])
    .filter((id) => route.entries.some((entry) => entry.id === id))
  if (parsed?.status !== 'answered' || !answer || !coachAnswerIsAllowed(answer, context)) {
    return { answer: '', knowledgeIds: [], language, ok: true, source: 'withheld', status: 'unanswered', tool: null }
  }

  return {
    answer,
    handoff: false,
    knowledgeIds,
    language,
    model,
    ok: true,
    performed: false,
    source: 'openai',
    status: 'answered',
    tool: null,
  }
}

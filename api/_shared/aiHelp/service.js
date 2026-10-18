import { getLanguageDefinition, normalizeLanguageCode } from '../../../src/i18n/languages.js'
import { getKnowledgeEntry, isKnowledgeId } from '../../../src/features/aiHelp/knowledgeCatalog.js'
import { localHelpResult } from '../../../src/features/aiHelp/helpRouter.js'
import { helpDomain } from '../../../src/features/sharedAi/helpDomain.js'
import { sanitizeHelpTool } from '../../../src/features/aiHelp/aiHelpTools.js'
import { directHelpDestination } from '../../../src/features/aiHelp/navigationRequest.js'
import { helpChrome } from '../../../src/features/aiHelp/uiChrome.js'
import { followUpsFor } from '../../../src/features/aiHelp/launchGuidance.js'
import { selectCustomerConversation } from './customerConversation.js'
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
import {
  loadCustomerContext,
  renderAccountAnswer,
  renderCancelOffer,
  renderHostedCheckoutOffer,
  renderPlanChangeOffer,
  renderReceiptAnswer,
  renderRefundAnswer,
  renderTransactionAnswer,
  renderUndoCancelOffer,
  renderVerifiedAnswer,
  verifiedPriceMinor,
} from './customerContext.js'
import { preliminaryPlanFacts, verifiedPriceMajors } from './planFacts.js'
import { buildAiHelpInstructions } from './prompt.js'
import { recordUnansweredQuestion } from './unansweredStore.js'
import { renderCaseControl } from './caseOutcome.js'
import { renderTroubleAnswer } from './troubleshooting.js'

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
const claimedAccountActionPattern = /har sagt upp|har raderat|abonnemanget är uppsagt|kontot är raderat|jag har avslutat|jag har öppnat|i (?:have )?(?:cancelled|canceled|deleted|changed|opened)|your (?:account|subscription) (?:is|has been) (?:deleted|cancelled|canceled)|he (?:cancelado|eliminado|cambiado)|(?:cuenta|suscripción) (?:ha sido|está) (?:eliminada|cancelada)|(?:تم|لقد) (?:حذف|إلغاء|تغيير|إيقاف) (?:حسابك|اشتراكك)/iu
const secretPattern = /sk-[A-Za-z0-9_-]{8,}|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE|Bearer\s+[A-Za-z0-9._-]{12,}/i
const personalPricePattern = /ditt abonnemang kostar|din plan kostar|du betalar\s+\d|your (?:plan|subscription) costs|you pay\s+\d|tu (?:plan|suscripción) cuesta|تدفع|سعر اشتراكك/iu
const foreignMoneyPattern = /\$\s*\d|\d[\d\s.,]*\s*€/i

export function answerIsAllowed(answer, { verifiedPriceMinor: serverPriceMinor = null } = {}) {
  const text = String(answer || '')
  if (secretPattern.test(text) || claimedAccountActionPattern.test(text) || foreignMoneyPattern.test(text)) {
    return false
  }
  const verifiedMajor = Number.isInteger(serverPriceMinor) && serverPriceMinor % 100 === 0
    ? serverPriceMinor / 100
    : null
  if (personalPricePattern.test(text)) {
    const stated = [...text.matchAll(/\b(\d{1,6})(?:[.,]\d{1,2})?\s*(?:kr|sek|kronor)\b/gi)]
      .map((match) => Number(match[1]))
    if (verifiedMajor == null || stated.length === 0 || stated.some((amount) => amount !== verifiedMajor)) return false
  }
  const allowed = new Set(verifiedPriceMajors())
  if (verifiedMajor != null) allowed.add(verifiedMajor)
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

function verifiedCustomerResult(validated, selection, customer, account = null) {
  const accountKind = selection.deleteAccount
    ? 'delete-account'
    : selection.passwordReset
      ? 'password-reset'
      : selection.secretRefused
        ? 'secret-refused'
        : selection.emailChange
          ? 'email-change'
          : selection.profileChange
            ? 'profile-change'
            : selection.deleteHelp
              ? 'delete-help'
              : selection.passwordHelp
                ? 'password-help'
                : selection.accountRead
                  ? 'read'
                  : ''
  const rendered = selection.caseControl
    ? renderCaseControl({ control: selection.caseControl, languageCode: validated.language.code })
    : accountKind
    ? renderAccountAnswer({ account, kind: accountKind, languageCode: validated.language.code })
    : selection.trouble
      ? renderTroubleAnswer({ account, context: customer, languageCode: validated.language.code, selection })
      : selection.cancel
    ? renderCancelOffer({ context: customer, languageCode: validated.language.code })
    : selection.undoCancel
      ? renderUndoCancelOffer({ context: customer, languageCode: validated.language.code })
      : selection.planChange
        ? renderPlanChangeOffer({ context: customer, languageCode: validated.language.code, planId: selection.planId })
        : selection.refundRequest
          ? renderRefundAnswer({ context: customer, languageCode: validated.language.code })
          : selection.receiptRequest
            ? renderReceiptAnswer({ context: customer, languageCode: validated.language.code })
            : selection.transactionRequest
              ? renderTransactionAnswer({ context: customer, languageCode: validated.language.code })
              : selection.hostedCheckout
                ? renderHostedCheckoutOffer({ context: customer, languageCode: validated.language.code, planId: selection.planId })
                : { answer: renderVerifiedAnswer({ context: customer, languageCode: validated.language.code, selection }), confirmation: null }
  const paymentFollowUp = ['hosted-checkout', 'refund', 'receipt', 'transactions'].includes(selection.focus)
  const accountFollowUp = ['account', 'delete-account', 'delete-help', 'email-change', 'password-help', 'password-reset', 'profile-change', 'secret-refused'].includes(selection.focus)
  const focus = accountFollowUp
    ? 'login'
    : selection.focus === 'plan-change' || selection.focus === 'undo'
    ? 'subscription'
    : (paymentFollowUp ? 'payment' : selection.focus)
  return {
    answer: rendered.answer,
    featureIds: ['settings.plan'],
    followUps: rendered.followUps || followUpsFor(focus, validated.language.code),
    handoff: typeof rendered.handoff === 'boolean'
      ? rendered.handoff
      : focus === 'login' || focus === 'access' || focus === 'payment',
    language: validated.language,
    ok: true,
    source: 'verified-customer',
    status: 'answered',
    ...(rendered.confirmation ? { confirmation: rendered.confirmation } : {}),
  }
}

export async function answerAiHelpQuestion({
  account = null,
  body = {},
  costStore = null,
  customerReaders = null,
  env = process.env,
  fetchImpl = fetch,
  userId,
} = {}) {
  const validated = validateAiHelpRequest(body)
  if (validated.error) {
    return { ok: false, status: 400, code: 'INVALID_REQUEST', language: validated.language }
  }

  const question = validated.messages[validated.messages.length - 1].content
  const destination = directHelpDestination(question)
  if (destination) return {
    ok: true, status: 'answered', source: 'local', language: validated.language,
    answer: helpChrome(validated.language.code).navigate,
    featureIds: [destination.id],
    tool: sanitizeHelpTool({ name: 'open-section', sectionId: destination.sectionId, targetId: destination.targetId }),
  }
  const selection = selectCustomerConversation(validated.messages)
  let customer = null
  if (selection.personal) {
    customer = userId
      ? await loadCustomerContext({
        feature: selection.feature,
        readers: customerReaders,
        slices: selection.slices,
        userId,
      })
      : { available: false, reason: 'unauthenticated' }
    if (selection.cancel || selection.undoCancel || selection.planChange || selection.hostedCheckout || selection.refundRequest || selection.receiptRequest || selection.transactionRequest || selection.direct || !customer.available || !env.OPENAI_API_KEY) {
      return verifiedCustomerResult(validated, selection, customer, account)
    }
  }

  const route = customer ? { kind: 'model', entries: [getKnowledgeEntry('settings.plan')] } : helpDomain.route({
    languageCode: validated.language.code,
    messages: validated.messages,
    pinnedIds: validated.featureIds,
  })
  if (route.kind === 'local') {
    if (customer) return verifiedCustomerResult(validated, selection, customer, account)
    return {
      ...localHelpResult(route.entry, {
        extra: route.entry.id === 'settings.plan' ? preliminaryPlanFacts() : '',
      }),
      followUps: followUpsFor('default', validated.language.code),
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
    if (customer) return verifiedCustomerResult(validated, selection, customer, account)
    return { code: 'PROVIDER_NOT_CONFIGURED', language: validated.language, ok: false, status: 503 }
  }

  const model = env.AI_HELP_MODEL || DEFAULT_MODEL
  const requestedTokens = Number(env.AI_HELP_MAX_OUTPUT_TOKENS)
  const maxOutputTokens = Math.min(
    AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS,
    Number.isFinite(requestedTokens) && requestedTokens > 0 ? requestedTokens : AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS,
  )
  const instructions = buildAiHelpInstructions({
    customerFacts: customer,
    entries,
    languageCode: validated.language.code,
    planFacts: customer ? '' : (entries.some((entry) => entry.id === 'settings.plan') ? preliminaryPlanFacts() : ''),
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
    if (customer) return verifiedCustomerResult(validated, selection, customer, account)
    if (route.fallbackEntry && validated.language.code === 'sv') return localFallbackResult(route, validated.language)
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
    if (customer) return verifiedCustomerResult(validated, selection, customer, account)
    if (route.fallbackEntry && validated.language.code === 'sv') return localFallbackResult(route, validated.language)
    if (reservation.reason === 'store_unavailable') {
      return { code: 'PROVIDER_UNAVAILABLE', language: validated.language, ok: false, status: 503, retryAfterSeconds: reservation.retryAfterSeconds || 60 }
    }
    return limitedModelResult(validated.language, reservation.retryAfterSeconds)
  }

  // Never return partial/provider text or repeat a paid call. Reuse only the
  // same verified answers already used when the model budget is unavailable.
  function invalidProviderResult(reason) {
    console.warn('[ai-help] invalid provider response', { reason })
    if (customer) return verifiedCustomerResult(validated, selection, customer, account)
    if (route.fallbackEntry && validated.language.code === 'sv') return localFallbackResult(route, validated.language)
    return { code: 'PROVIDER_INVALID_RESPONSE', language: validated.language, ok: false, status: 502 }
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
    if (customer) return verifiedCustomerResult(validated, selection, customer, account)
    return { code: 'PROVIDER_UNAVAILABLE', language: validated.language, ok: false, status: 503 }
  }

  if (!providerResponse.ok) {
    await keepReservation(store, reservation.reservationId)
    if (customer) return verifiedCustomerResult(validated, selection, customer, account)
    return { code: 'PROVIDER_UNAVAILABLE', language: validated.language, ok: false, status: 503 }
  }

  let payload
  try {
    payload = await providerResponse.json()
  } catch {
    await keepReservation(store, reservation.reservationId)
    return invalidProviderResult('invalid_json')
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
    return invalidProviderResult(outputWasCut ? 'incomplete_output' : 'invalid_contract')
  }

  const answer = clampText(parsed.answer, 1200)
  if (parsed.status === 'answered' && !answer) {
    return invalidProviderResult('empty_answer')
  }
  const featureIds = (Array.isArray(parsed.featureIds) ? parsed.featureIds : [])
    .map((id) => clampText(id, 80))
    .filter((id) => entries.some((entry) => entry.id === id))
    .slice(0, 4)
  const priceMinor = verifiedPriceMinor(customer)
  if (parsed.status === 'answered' && answer && !answerIsAllowed(answer, { verifiedPriceMinor: priceMinor })) {
    if (customer) return verifiedCustomerResult(validated, selection, customer, account)
    return {
      answer: '',
      featureIds: [],
      language: validated.language,
      ok: true,
      source: 'withheld',
      status: 'unanswered',
    }
  }
  const answered = parsed.status === 'answered' && answer && answerIsAllowed(answer, { verifiedPriceMinor: priceMinor })

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

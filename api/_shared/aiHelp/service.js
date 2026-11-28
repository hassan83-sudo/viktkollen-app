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
import { buildAiHelpInstructions } from './prompt.js'
import { answerPlanQuestion, planQuestion } from './planAnswers.js'
import { recordUnansweredQuestion } from './unansweredStore.js'
import { renderCaseControl } from './caseOutcome.js'
import { renderTroubleAnswer } from './troubleshooting.js'


// Exact, general FAQs only; personal billing questions continue to verified readers.
const supportFaq = [
  [/^(?:vilka är |vad har ni för )?öppettider(?: för kundtjänst)?[?!.]*$/iu, ['Kundtjänsten finns vanligtvis tillgänglig alla dagar kl. 09–22.','Vi försöker svara inom 30 minuter, men det kan ta upp till 24 timmar.']],
  [/^(?:hur lång (?:är )?svarstid(?:en)?|när får jag svar|hur länge måste jag vänta på support)[?!.]*$/iu, ['Vi försöker svara inom 30 minuter, men ibland tar det upp till 24 timmar.','Du kan lämna appen och läsa svaret senare i kundtjänsten.']],
  [/^(?:kan gratisanvändare få (?:personlig )?support|är kundtjänst gratis|kan jag kontakta kundtjänst utan abonnemang)[?!.]*$/iu, ['Gratisanvändare kan använda AI-Hjälp och personlig support för betalningsärenden.','Betalande kunder kan även få personlig hjälp med andra ärenden.']],
  [/^(?:måste jag vänta i appen|måste appen vara öppen för att få svar|kan jag stänga appen medan jag väntar)[?!.]*$/iu, ['Nej. Supportsvaret sparas i ditt ärende.','Du kan öppna kundtjänsten senare och läsa svaret.']],
  [/^(?:får jag pushnotiser från kundtjänst|hur ser jag nya supportsvar|var ser jag supportsvar)[?!.]*$/iu, ['Nya supportsvar visas med en olästmarkering vid meddelandeikonen i appen.','Kundtjänsten skickar inte pushnotiser till kunder.']],
  [/^(?:är matskanningen exakt|är matscanningen exakt|stämmer kalorierna alltid)[?!.]*$/iu, ['Nej. Bildanalysen uppskattar mängder och näringsvärden.','Kontrollera ingredienser och mängder innan du sparar måltiden.']],
  [/^(?:är kroppsskanningen exakt|är kroppsscanningen exakt)[?!.]*$/iu, ['Nej. Kroppsscanningen ger uppskattningar.','Resultaten är inte medicinska mätningar eller diagnoser.']],
]


const translatedSupportFaq = {
  "en": [
    [
      "What are your opening hours?",
      "Customer service is usually available every day from 09:00 to 22:00. We aim to reply within 30 minutes, but it may take up to 24 hours."
    ],
    [
      "When will I get a reply?",
      "We aim to reply within 30 minutes, but it may take up to 24 hours. You can leave the app and read the reply later."
    ],
    [
      "Can free users contact support?",
      "Free users can use AI Help and human support for billing issues. Paid subscribers can also receive human support for other issues."
    ],
    [
      "Can I close the app while waiting?",
      "Yes. Replies are saved in your support ticket. You can read them later."
    ],
    [
      "Where can I see support replies?",
      "Unread replies are indicated by the message icon in the app. Customers do not receive support push notifications."
    ],
    [
      "Is food scanning accurate?",
      "Food scanning estimates quantities and nutrition. Check ingredients and quantities before saving."
    ],
    [
      "Is body scanning accurate?",
      "Body scanning provides estimates, not medical measurements or diagnoses."
    ]
  ],
  "es": [
    [
      "¿Cuál es el horario de atención?",
      "Normalmente atendemos todos los días de 09:00 a 22:00. Intentamos responder en 30 minutos, pero podemos tardar hasta 24 horas."
    ],
    [
      "¿Cuándo recibiré una respuesta?",
      "Intentamos responder en 30 minutos, pero podemos tardar hasta 24 horas. Puedes salir de la aplicación y leer la respuesta después."
    ],
    [
      "¿Los usuarios gratuitos pueden contactar con soporte?",
      "Los usuarios gratuitos pueden usar la ayuda IA y recibir atención humana para problemas de pago. Los suscriptores de pago también pueden recibir atención humana para otros asuntos."
    ],
    [
      "¿Puedo cerrar la aplicación mientras espero?",
      "Sí. Las respuestas se guardan en tu solicitud de asistencia."
    ],
    [
      "¿Dónde veo las respuestas de soporte?",
      "El icono de mensajes indica las respuestas no leídas. No enviamos notificaciones push de soporte a clientes."
    ],
    [
      "¿Es exacto el escaneo de alimentos?",
      "Las cantidades y los nutrientes son estimaciones. Comprueba los ingredientes y las cantidades antes de guardar."
    ],
    [
      "¿Es exacto el escaneo corporal?",
      "Son estimaciones, no mediciones médicas ni diagnósticos."
    ]
  ],
  "ar": [
    [
      "ما ساعات عمل خدمة العملاء؟",
      "تتوفر خدمة العملاء عادةً يوميًا من الساعة 09:00 إلى 22:00. نحاول الرد خلال 30 دقيقة، وقد يستغرق الرد حتى 24 ساعة."
    ],
    [
      "متى سأحصل على رد؟",
      "نحاول الرد خلال 30 دقيقة، وقد يستغرق الرد حتى 24 ساعة. يمكنك مغادرة التطبيق وقراءة الرد لاحقًا."
    ],
    [
      "هل يمكن للمستخدمين المجانيين التواصل مع الدعم؟",
      "يمكن للمستخدمين المجانيين استخدام المساعدة الذكية والدعم البشري لمشكلات الدفع. ويمكن للمشتركين المدفوعين الحصول على الدعم البشري للمشكلات الأخرى أيضًا."
    ],
    [
      "هل يمكنني إغلاق التطبيق أثناء الانتظار؟",
      "نعم، تُحفظ الردود في طلب الدعم ويمكنك قراءتها لاحقًا."
    ],
    [
      "أين أجد ردود الدعم؟",
      "يشير رمز الرسائل إلى الردود غير المقروءة. لا نرسل إشعارات دفع للعملاء بشأن الدعم."
    ],
    [
      "هل مسح الطعام دقيق؟",
      "الكميات والقيم الغذائية تقديرية. تحقق من المكونات والكميات قبل الحفظ."
    ],
    [
      "هل مسح الجسم دقيق؟",
      "النتائج تقديرية وليست قياسات طبية أو تشخيصات."
    ]
  ],
  "zh-CN": [
    [
      "客服工作时间是什么？",
      "客服通常每天09:00至22:00提供服务。我们尽量在30分钟内回复，但最长可能需要24小时。"
    ],
    [
      "什么时候能收到回复？",
      "我们尽量在30分钟内回复，但最长可能需要24小时。您可以退出应用，稍后查看回复。"
    ],
    [
      "免费用户可以联系人工客服吗？",
      "免费用户可以使用AI帮助，并就付款问题联系人工客服。付费订阅用户还可以就其他问题联系人工客服。"
    ],
    [
      "等待回复时可以关闭应用吗？",
      "可以。回复会保存在您的客服工单中，您可以稍后查看。"
    ],
    [
      "在哪里查看客服回复？",
      "应用中的消息图标会提示未读回复。客服不会向客户发送推送通知。"
    ],
    [
      "食物扫描准确吗？",
      "食物扫描提供食物分量和营养成分的估算值。保存前请核对食材和分量。"
    ],
    [
      "身体扫描准确吗？",
      "身体扫描结果仅为估算，不属于医学测量或诊断。"
    ]
  ]
}
const normalizeFaq = value => value.normalize('NFKC').toLowerCase().replace(/[?!.؟。！]+$/u, '').trim()

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
    ...localHelpResult(route.fallbackEntry, { source: 'local-fallback' }),
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
    const stated = [...text.matchAll(/\b(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:kr|sek|kronor)\b/gi)]
      .map((match) => Number(match[1].replace(',', '.')))
    if (verifiedMajor == null || stated.length === 0 || stated.some((amount) => amount !== verifiedMajor)) return false
  }
  // Public prices are answered from the live plan reader, never from model
  // text or a static price allowlist. Only verified personal prices may pass.
  const allowed = new Set(verifiedMajor == null ? [] : [verifiedMajor])
  const amounts = [...text.matchAll(/\b(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:kr|sek|kronor)\b/gi)]
    .map((match) => Number(match[1].replace(',', '.')))
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
  if (validated.language.code === 'sv') {
    const match = supportFaq.find(([pattern]) => pattern.test(question.trim()))
    if (match) return { ok: true, status: 'answered', source: 'local', language: validated.language, answer: match[1].join(' '), featureIds: [], followUps: ['Vilka är öppettider?', 'Kan gratisanvändare få support?'] }
  }
  const translatedPack = translatedSupportFaq[validated.language.code]
  const translatedMatch = translatedPack?.find(([prompt]) => normalizeFaq(prompt) === normalizeFaq(question))
  if (translatedMatch) return { ok: true, status: 'answered', source: 'local', language: validated.language, answer: translatedMatch[1], featureIds: [], followUps: translatedPack.filter(item => item !== translatedMatch).slice(0, 2).map(item => item[0]) }
  const destination = directHelpDestination(question)
  if (destination) return {
    ok: true, status: 'answered', source: 'local', language: validated.language,
    answer: helpChrome(validated.language.code).navigate,
    featureIds: [destination.id],
    tool: sanitizeHelpTool({ name: 'open-section', sectionId: destination.sectionId, targetId: destination.targetId }),
  }
  const selection = selectCustomerConversation(validated.messages)
  const catalogQuestion = planQuestion(validated.messages)
  if (!selection.personal && catalogQuestion) {
    return answerPlanQuestion({ question: catalogQuestion, userId, language: validated.language })
  }
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
      ...localHelpResult(route.entry),
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

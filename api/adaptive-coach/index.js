import {
  callOpenAiJson,
  createSafeRequestId,
  getAiGatewayConfig,
} from '../_shared/openaiGateway.js'
import {
  normalizeCoachAiResponse,
  validateCoachAiResponse,
} from '../_shared/coachResponseSchema.js'
import { aiRouteErrorCodes, mapGatewayErrorCode, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { createAiRequestFingerprint, runDedupedAiRequest } from '../_shared/aiRequestDeduper.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

const MAX_PAYLOAD_BYTES = 12000
const allowedMemoryCategories = ['weight', 'nutrition', 'activity', 'goals', 'reminders', 'recovery', 'planning']
const allowedCoachStyles = ['neutral', 'lugn', 'uppmuntrande', 'rak', 'coachande']
const allowedActionSizes = ['mycket liten', 'liten', 'normal']
const allowedPlanCategories = ['weight', 'nutrition', 'activity', 'goals', 'reminders', 'recovery', 'planning', 'general']

function getHeader(request, name) {
  const headers = request.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

function safeText(value, fallback = '', max = 400) {
  const text = String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (/script|javascript:|auth|session|token|userId|deviceId|prompt|providerresponse|base64|localStorage/i.test(text)) {
    return ''
  }
  return text.slice(0, max)
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    if (Buffer.concat(chunks).length > MAX_PAYLOAD_BYTES) {
      return { error: { code: aiRouteErrorCodes.REQUEST_TOO_LARGE, status: 413 } }
    }
  }

  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  } catch {
    return { error: { code: aiRouteErrorCodes.INVALID_REQUEST, status: 400 } }
  }
}

function sanitizeFacts(payload = {}) {
  const memory = payload.memoryContext && typeof payload.memoryContext === 'object' && !Array.isArray(payload.memoryContext)
    ? {
        actionSize: allowedActionSizes.includes(payload.memoryContext.actionSize) ? payload.memoryContext.actionSize : 'normal',
        activePriorityCategories: Array.isArray(payload.memoryContext.activePriorityCategories)
          ? payload.memoryContext.activePriorityCategories.filter((item) => allowedMemoryCategories.includes(item)).slice(0, 4)
          : [],
        coachStyle: allowedCoachStyles.includes(payload.memoryContext.coachStyle) ? payload.memoryContext.coachStyle : 'neutral',
        declinedStrategyCategories: Array.isArray(payload.memoryContext.declinedStrategyCategories)
          ? payload.memoryContext.declinedStrategyCategories.filter((item) => allowedMemoryCategories.includes(item)).slice(0, 2)
          : [],
        excludedFocusAreas: Array.isArray(payload.memoryContext.excludedFocusAreas)
          ? payload.memoryContext.excludedFocusAreas.filter((item) => allowedMemoryCategories.includes(item)).slice(0, 4)
          : [],
        limitations: Array.isArray(payload.memoryContext.limitations)
          ? payload.memoryContext.limitations.map((item) => safeText(item, '', 120)).filter(Boolean).slice(0, 3)
          : [],
        recentContext: payload.memoryContext.recentContext && typeof payload.memoryContext.recentContext === 'object'
          ? {
              activeActionCount: Number.isFinite(Number(payload.memoryContext.recentContext.activeActionCount)) ? Math.max(0, Math.min(12, Number(payload.memoryContext.recentContext.activeActionCount))) : 0,
              currentCoverage: Number.isFinite(Number(payload.memoryContext.recentContext.currentCoverage)) ? Math.max(0, Math.min(1, Number(payload.memoryContext.recentContext.currentCoverage))) : 0,
              currentMomentum: safeText(payload.memoryContext.recentContext.currentMomentum, 'insufficient', 40),
              safeWeeklySummary: safeText(payload.memoryContext.recentContext.safeWeeklySummary, '', 160),
            }
          : {},
        recurringBarrierCategories: Array.isArray(payload.memoryContext.recurringBarrierCategories)
          ? payload.memoryContext.recurringBarrierCategories.filter((item) => allowedMemoryCategories.includes(item)).slice(0, 2)
          : [],
        remoteAllowed: payload.memoryContext.remoteAllowed === true,
        selectedFocusAreas: Array.isArray(payload.memoryContext.selectedFocusAreas)
          ? payload.memoryContext.selectedFocusAreas.filter((item) => allowedMemoryCategories.includes(item)).slice(0, 4)
          : [],
        successfulStrategyCategories: Array.isArray(payload.memoryContext.successfulStrategyCategories)
          ? payload.memoryContext.successfulStrategyCategories.filter((item) => allowedMemoryCategories.includes(item)).slice(0, 3)
          : [],
      }
    : null
  const actionPlan = payload.actionPlanContext && typeof payload.actionPlanContext === 'object' && !Array.isArray(payload.actionPlanContext)
    ? {
        categories: Array.isArray(payload.actionPlanContext.categories)
          ? payload.actionPlanContext.categories.filter((item) => allowedPlanCategories.includes(item)).slice(0, 5)
          : [],
        completed: Number.isFinite(Number(payload.actionPlanContext.completed)) ? Math.max(0, Math.min(21, Number(payload.actionPlanContext.completed))) : 0,
        confidence: Number.isFinite(Number(payload.actionPlanContext.confidence)) ? Math.max(0, Math.min(1, Number(payload.actionPlanContext.confidence))) : null,
        pending: Number.isFinite(Number(payload.actionPlanContext.pending)) ? Math.max(0, Math.min(21, Number(payload.actionPlanContext.pending))) : 0,
        remoteAllowed: payload.actionPlanContext.remoteAllowed === true,
        skipped: Number.isFinite(Number(payload.actionPlanContext.skipped)) ? Math.max(0, Math.min(21, Number(payload.actionPlanContext.skipped))) : 0,
        weekStatus: safeText(payload.actionPlanContext.weekStatus, '', 140),
      }
    : null
  const allowed = {
    activeGoals: Array.isArray(payload.activeGoals) ? payload.activeGoals.map((item) => safeText(item, '', 120)).filter(Boolean).slice(0, 6) : [],
    analysisDate: safeText(payload.analysisDate, '', 20),
    attentionItems: Array.isArray(payload.attentionItems) ? payload.attentionItems.map((item) => safeText(item, '', 160)).filter(Boolean).slice(0, 6) : [],
    confidence: Number.isFinite(Number(payload.confidence)) ? Math.max(0, Math.min(1, Number(payload.confidence))) : 0,
    coverage: Number.isFinite(Number(payload.coverage)) ? Math.max(0, Math.min(1, Number(payload.coverage))) : 0,
    highlights: Array.isArray(payload.highlights) ? payload.highlights.map((item) => safeText(item, '', 160)).filter(Boolean).slice(0, 6) : [],
    actionPlanContext: actionPlan?.remoteAllowed ? actionPlan : null,
    locale: safeText(payload.locale, 'sv-SE', 12),
    metrics: payload.metrics && typeof payload.metrics === 'object' && !Array.isArray(payload.metrics)
      ? {
          activity: safeText(payload.metrics.activity, '', 160),
          goals: safeText(payload.metrics.goals, '', 160),
          nutrition: safeText(payload.metrics.nutrition, '', 160),
          reminders: safeText(payload.metrics.reminders, '', 160),
          weight: safeText(payload.metrics.weight, '', 160),
        }
      : {},
    memoryContext: memory?.remoteAllowed ? memory : null,
    period: safeText(payload.period, '30d', 12),
    question: safeText(payload.question, '', 220),
    weeklyFocus: safeText(payload.weeklyFocus, '', 160),
  }

  return allowed
}

function hasBlockedFields(value = {}) {
  const text = JSON.stringify(value)
  return /auth|session|email|token|deviceId|userId|localStorage|base64|image|diagnostics|supabase|rawMeals|rawWeights|chatHistory|model|prompt|max_output/i.test(text)
}

function buildCoachPrompt(facts, requestId) {
  return [
    {
      content: [
        {
          text: [
            'Du ar Viktkollens coachformulerare. Returnera endast JSON.',
            'Anvand bara facts i payloaden. Hitta inte pa vikt, kalorier, diagnoser eller prognoser.',
            'Memory ar osaker sammanfattad kontext: anvand bara hog-confidence preferenser och observationer, och ignorera low confidence eller begransat underlag.',
            'Action plan context ar endast minimerade counts och kategorier. Be om bekraftelse innan du formulerar om planen.',
            'Skriv inte att du minns allt om anvandaren. Harled inte personlighet, diagnos eller medicinska behov.',
            'Ge max tre korta, neutrala och konstruktiva rekommendationer.',
            'Ingen medicinsk radgivning, ingen diagnos, ingen extrem viktminskning, ingen skuld.',
            'Schema: summary, recommendations, rationale, limitations, safetyNote, confidence, dataUsed.',
            'Recommendation schema: id, title, description, reason, priority, category, suggestedActionType, sourceFacts, confidence, requiresConfirmation, safetyCategory.',
            `requestId: ${requestId}`,
          ].join(' '),
          type: 'input_text',
        },
        {
          text: JSON.stringify(facts),
          type: 'input_text',
        },
      ],
      role: 'user',
    },
  ]
}

export default async function handler(request, response) {
  const requestId = createSafeRequestId('coach')
  setNoStoreHeaders(response)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, { code: aiRouteErrorCodes.INVALID_REQUEST, requestId, status: 405 })
  }

  if (!getHeader(request, 'content-type').includes('application/json')) {
    return sendSafeAiError(response, { code: aiRouteErrorCodes.INVALID_REQUEST, requestId, status: 415 })
  }

  const parsed = await readJsonBody(request)
  if (parsed.error) {
    return sendSafeAiError(response, { code: parsed.error.code, requestId, status: parsed.error.status || 400 })
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }

  if (parsed.value?.consent !== true) {
    return sendSafeAiError(response, { code: aiRouteErrorCodes.CONSENT_REQUIRED, requestId, status: 403 })
  }

  if (hasBlockedFields(parsed.value)) {
    return sendSafeAiError(response, { code: aiRouteErrorCodes.INVALID_REQUEST, requestId, status: 400 })
  }

  const config = getAiGatewayConfig('coach')
  const rateLimit = checkAiRouteRateLimit({
    limit: config.rateLimitMax,
    route: 'adaptiveCoach',
    userId: auth.user.id,
  })
  if (rateLimit.limited) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.RATE_LIMITED,
      requestId,
      retryable: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      status: 429,
    })
  }

  const facts = sanitizeFacts(parsed.value)
  if (facts.coverage < 0.2 || facts.confidence < 0.2) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Coachen behöver mer underlag innan remote AI används.',
      status: 422,
    })
  }

  const fingerprint = createAiRequestFingerprint(facts)
  const { promise: providerPromise } = runDedupedAiRequest({
    fingerprint,
    route: 'adaptiveCoach',
    userId: auth.user.id,
  }, () => callOpenAiJson({
      input: buildCoachPrompt(facts, requestId),
      maxOutputTokens: 700,
      requestId,
      temperature: 0.2,
      timeoutMs: config.timeoutMs,
      type: 'coach',
    }))
  const result = await providerPromise

  if (!result.ok) {
    const code = mapGatewayErrorCode(result.error?.code)
    const status = code === aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED ? 503
      : code === aiRouteErrorCodes.PROVIDER_TIMEOUT ? 504
        : code === aiRouteErrorCodes.RATE_LIMITED ? 429
          : 502
    return sendSafeAiError(response, { code, requestId, retryable: result.error?.retryable === true, status })
  }

  const normalized = normalizeCoachAiResponse(result.value, { requestId })
  const validation = validateCoachAiResponse(normalized)
  if (!validation.ok) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE,
      requestId,
      retryable: true,
      status: 502,
    })
  }

  setNoStoreHeaders(response)
  return response.status(200).json({
    coach: normalized,
    ok: true,
    providerType: 'openai',
    requestId,
  })
}

export const adaptiveCoachRouteInternals = {
  buildCoachPrompt,
  hasBlockedFields,
  sanitizeFacts,
}

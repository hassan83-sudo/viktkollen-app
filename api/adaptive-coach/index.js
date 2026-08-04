import {
  callOpenAiJson,
  checkRateLimit,
  createSafeRequestId,
  getAiGatewayConfig,
  getAnonymousClientScope,
  makeAiError,
} from '../_shared/openaiGateway.js'
import {
  normalizeCoachAiResponse,
  validateCoachAiResponse,
} from '../_shared/coachResponseSchema.js'

const MAX_PAYLOAD_BYTES = 12000

function getHeader(request, name) {
  const headers = request.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

function safeText(value, fallback = '', max = 400) {
  return String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    if (Buffer.concat(chunks).length > MAX_PAYLOAD_BYTES) {
      return { error: makeAiError('oversizedRequest', 'AI-underlaget ar for stort.', 413, false).error }
    }
  }

  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  } catch {
    return { error: makeAiError('invalidRequest', 'Ogiltig JSON.', 400, false).error }
  }
}

function sanitizeFacts(payload = {}) {
  const allowed = {
    activeGoals: Array.isArray(payload.activeGoals) ? payload.activeGoals.map((item) => safeText(item, '', 120)).filter(Boolean).slice(0, 6) : [],
    analysisDate: safeText(payload.analysisDate, '', 20),
    attentionItems: Array.isArray(payload.attentionItems) ? payload.attentionItems.map((item) => safeText(item, '', 160)).filter(Boolean).slice(0, 6) : [],
    confidence: Number.isFinite(Number(payload.confidence)) ? Math.max(0, Math.min(1, Number(payload.confidence))) : 0,
    coverage: Number.isFinite(Number(payload.coverage)) ? Math.max(0, Math.min(1, Number(payload.coverage))) : 0,
    highlights: Array.isArray(payload.highlights) ? payload.highlights.map((item) => safeText(item, '', 160)).filter(Boolean).slice(0, 6) : [],
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
    period: safeText(payload.period, '30d', 12),
    question: safeText(payload.question, '', 220),
    weeklyFocus: safeText(payload.weeklyFocus, '', 160),
  }

  return allowed
}

function hasBlockedFields(value = {}) {
  const text = JSON.stringify(value)
  return /auth|session|email|token|deviceId|localStorage|base64|image|diagnostics|supabase|rawMeals|rawWeights|chatHistory/i.test(text)
}

function buildCoachPrompt(facts, requestId) {
  return [
    {
      content: [
        {
          text: [
            'Du ar Viktkollens coachformulerare. Returnera endast JSON.',
            'Anvand bara facts i payloaden. Hitta inte pa vikt, kalorier, diagnoser eller prognoser.',
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
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json(makeAiError('invalidRequest', 'Endast POST stods.', 405, false, requestId))
  }

  if (!getHeader(request, 'content-type').includes('application/json')) {
    return response.status(415).json(makeAiError('invalidRequest', 'Skicka JSON.', 415, false, requestId))
  }

  const parsed = await readJsonBody(request)
  if (parsed.error) {
    return response.status(parsed.error.status || 400).json({ error: { ...parsed.error, requestId }, ok: false })
  }

  if (parsed.value?.consent !== true) {
    return response.status(403).json(makeAiError('consentRequired', 'Remote AI kraver aktivt samtycke.', 403, false, requestId))
  }

  if (hasBlockedFields(parsed.value)) {
    return response.status(400).json(makeAiError('invalidRequest', 'Payload innehaller otillatna falt.', 400, false, requestId))
  }

  const config = getAiGatewayConfig('coach')
  const scope = getAnonymousClientScope(request)
  const rateLimit = checkRateLimit({
    limit: config.rateLimitMax,
    scope,
    type: 'coach',
  })
  if (rateLimit.limited) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return response.status(429).json(makeAiError('rateLimited', 'For manga coachanrop just nu.', 429, true, requestId))
  }

  const facts = sanitizeFacts(parsed.value)
  if (facts.coverage < 0.2 || facts.confidence < 0.2) {
    return response.status(422).json(makeAiError('lowCoverage', 'Coachen behover mer underlag innan remote AI anvands.', 422, false, requestId))
  }

  const result = await callOpenAiJson({
    input: buildCoachPrompt(facts, requestId),
    maxOutputTokens: 700,
    requestId,
    temperature: 0.2,
    timeoutMs: config.timeoutMs,
    type: 'coach',
  })

  if (!result.ok) {
    const status = result.error?.code === 'aiNotConfigured' ? 503
      : result.error?.code === 'timeout' ? 504
        : result.error?.code === 'rateLimited' ? 429
          : 502
    return response.status(status).json({ error: result.error, ok: false })
  }

  const normalized = normalizeCoachAiResponse(result.value, { requestId })
  const validation = validateCoachAiResponse(normalized)
  if (!validation.ok) {
    return response.status(502).json(makeAiError('invalidProviderResponse', 'AI-svaret kunde inte valideras.', 502, true, requestId))
  }

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

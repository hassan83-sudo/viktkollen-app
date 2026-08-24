import { buildAiCoachContext } from '../../src/services/aiCoachContext.js'
import { createDeterministicAiCoachReply } from '../../src/services/aiCoachDeterministicReplies.js'
import { classifyAiCoachIntent } from '../../src/services/aiCoachIntentService.js'
import {
  createAiCoachPrompt,
  createLocalAiCoachReply,
  createVoiceCoachInstructions,
} from '../../src/services/aiCoachPrompt.js'
import { createRealtimeVoiceSession } from '../_shared/openaiGateway.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-4.1-mini'
const validRecommendationCategories = new Set(['nutrition', 'protein', 'weight', 'activity', 'recovery', 'consistency', 'logging', 'goal', 'general'])
const validRecommendationPriorities = new Set(['low', 'medium', 'high'])
const validRecommendationConfidence = new Set(['low', 'medium', 'high'])
const unsafeCoachPattern = /diagnos|läkemedel|medicin|svält|straff|förbjud|crash|extrem|garanterat|exakt kroppsfett/i

function parseBody(request) {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body)
  }

  return request.body || {}
}

function extractText(data) {
  if (typeof data.output_text === 'string') {
    return data.output_text
  }

  return (
    data.output
      ?.flatMap((item) => item.content || [])
      ?.map((content) => content.text)
      ?.filter(Boolean)
      ?.join('\n') || ''
  )
}

function parseJson(text) {
  return JSON.parse(
    text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim(),
  )
}

function clampText(value, fallback = '', maxLength = 220) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  const safe = text || fallback

  return safe.length > maxLength ? `${safe.slice(0, maxLength - 1).trim()}…` : safe
}

function sanitizeEvidence(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      const source = typeof item === 'string' ? { text: item } : item || {}
      const text = clampText(source.text, '', 140)
      const provenance = ['measured', 'user_entered', 'ai_estimated', 'derived', 'missing'].includes(source.provenance)
        ? source.provenance
        : 'derived'

      return text ? { provenance, text } : null
    })
    .filter(Boolean)
    .slice(0, 3)
}

export function sanitizeCoachRecommendations(value = []) {
  const seen = new Set()

  return (Array.isArray(value) ? value : [])
    .map((recommendation) => {
      const source = recommendation && typeof recommendation === 'object' ? recommendation : {}
      const title = clampText(source.title, '', 72)
      const action = clampText(source.action, '', 180)
      const reasoningSummary = clampText(source.reasoningSummary, 'Bygger på aktuell Viktkollen-data.', 180)

      if (!title || !action || unsafeCoachPattern.test(`${title} ${action} ${reasoningSummary}`)) return null

      return {
        action,
        category: validRecommendationCategories.has(source.category) ? source.category : 'general',
        confidence: validRecommendationConfidence.has(source.confidence) ? source.confidence : 'medium',
        evidence: sanitizeEvidence(source.evidence),
        id: clampText(source.id, `server-rec-${title}`, 90),
        priority: validRecommendationPriorities.has(source.priority) ? source.priority : 'medium',
        reasoningSummary,
        title,
      }
    })
    .filter(Boolean)
    .filter((recommendation) => {
      const key = `${recommendation.category}|${recommendation.title}|${recommendation.action}`.toLocaleLowerCase('sv-SE')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 4)
}

function getModel() {
  return process.env.OPENAI_MODEL || process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL
}

function makeFallbackInsights(data = {}) {
  const energy = Number(data.checkIn?.energy)
  const steps = Number(data.checkIn?.steps)
  const mealHistory = Array.isArray(data.mealHistory) ? data.mealHistory : []
  const hasMealHistory = mealHistory.length > 0
  const hasProtein = mealHistory.some((meal) =>
    String(meal.analysis?.proteinStatus || '')
      .toLocaleLowerCase('sv-SE')
      .includes('protein'),
  )

  return {
    budgetMealIdea: hasProtein
      ? 'Ägg, potatis och frysta grönsaker.'
      : 'Bönor med ris eller kvarg med havre.',
    dailyRisk:
      energy <= 3
        ? 'Låg energi kan göra kvällen svårare.'
        : Number.isFinite(steps) && steps < 5000
          ? 'Dagens rörelse är låg hittills.'
          : 'Nästa måltid kan lätt bli oplanerad.',
    dailyStrength: hasMealHistory
      ? 'Du har måltidsdata som gör coachningen mer konkret.'
      : 'Du har kommit igång med dagens registrering.',
    nextBestAction: hasProtein
      ? 'Lägg till något grönt eller frukt nästa gång.'
      : 'Lägg till en billig proteinkälla i nästa måltid.',
    recoveryAdvice:
      energy <= 4
        ? 'Håll kvällen enkel och prioritera återhämtning.'
        : 'Avsluta dagen med en lugn rutin och tillräckligt med sömn.',
  }
}

function makeFallbackReport(data = {}) {
  const steps = Number(data.checkIn?.steps)
  const mealHistory = Array.isArray(data.mealHistory) ? data.mealHistory : []
  const hasMealHistory = mealHistory.length > 0

  return {
    biggestProgress: hasMealHistory
      ? 'Du har byggt mer konkret matdata under veckan.'
      : 'Du har en tydlig startpunkt att bygga vidare från.',
    biggestRisk: 'Att göra nästa vecka för komplicerad.',
    focusNextWeek: 'Upprepa en enkel matvana och en enkel rörelsevana.',
    mealPattern: hasMealHistory
      ? `${mealHistory.length} måltidsanalyser finns i historiken.`
      : 'Matmönstret blir tydligare med fler loggade måltider.',
    movement: Number.isFinite(steps)
      ? `${steps.toLocaleString('sv-SE')} steg i senaste check-in.`
      : 'Stegdata saknas just nu.',
    nextSteps: [
      'Lägg till protein i en måltid per dag.',
      'Lägg till frukt eller grönsaker dagligen.',
      'Ta en kort promenad på en fast tid.',
    ],
    nutritionStatus:
      'Protein och grönsaker bedöms bäst över flera måltidsanalyser.',
    recovery: 'Planera återhämtning så rutinen går att upprepa.',
    summary:
      'Veckan visar att enkel, konsekvent loggning ger bäst underlag för nästa steg.',
    weightTrend:
      Array.isArray(data.weights) && data.weights.length >= 2
        ? 'Vikttrenden går att följa över tid.'
        : 'Mer viktdata behövs för en säkrare trend.',
  }
}

function makeDailyCoachFallback(data = {}) {
  const energy = Number(data.checkIn?.energy)
  const steps = Number(data.checkIn?.steps)
  const meals = Array.isArray(data.meals) ? data.meals : []

  return energy <= 4
    ? 'Energin verkar låg i dag. Håll det enkelt: en vanlig måltid, vatten och återhämtning räcker långt.'
    : Number.isFinite(steps) && steps < 6000
      ? 'Dagens bästa lilla steg är en kort promenad och en enkel måltid med protein.'
      : meals.length > 0
        ? 'Du har måltider loggade och en bra grund. Fortsätt med samma enkla struktur resten av dagen.'
        : 'Logga nästa måltid och välj en enkel bas med protein, grönsaker eller frukt.'
}

function getChatEngineData(data = {}) {
  const intent = classifyAiCoachIntent({
    chatHistory: data.chatHistory,
    message: data.message,
  })
  const context = buildAiCoachContext({
    bodyAnalysisHistory: data.bodyAnalysisHistory,
    chatHistory: data.chatHistory,
    checkIn: data.checkIn,
    currentWeight: data.currentWeight,
    foods: data.foods,
    healthSnapshot: data.healthSnapshot,
    intent: intent.intent,
    latestCoachReply: data.latestCoachReply,
    latestWeeklyReport: data.latestWeeklyReport,
    mealHistory: data.mealHistory,
    meals: data.meals,
    nutritionGoals: data.nutritionGoals,
    profile: data.profile,
    weights: data.weights,
  })

  return {
    context,
    fallbackReply: createLocalAiCoachReply({
      context,
      intent,
      message: data.message,
    }),
    intent,
  }
}

function makeStudyBuddyFallback(data = {}) {
  const subject = data.subject || 'ämnet'

  return `Titta på nyckelorden i ${subject} och uteslut svar som inte passar. Försök hitta metoden innan du väljer alternativ.`
}

async function callOpenAI({ maxOutputTokens, prompt, userData }) {
  const openaiResponse = await fetch(OPENAI_API_URL, {
    body: JSON.stringify({
      input: [
        {
          content: [
            {
              text: prompt,
              type: 'input_text',
            },
            {
              text: JSON.stringify(userData),
              type: 'input_text',
            },
          ],
          role: 'user',
        },
      ],
      max_output_tokens: maxOutputTokens,
      model: getModel(),
    }),
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!openaiResponse.ok) {
    throw new Error(`OpenAI request failed: ${openaiResponse.status}`)
  }

  return parseJson(extractText(await openaiResponse.json()))
}

async function handleDailyCoach(data, response) {
  if (!process.env.OPENAI_API_KEY) {
    return response.status(200).json({
      source: 'mock',
      summary: makeDailyCoachFallback(data),
    })
  }

  try {
    const result = await callOpenAI({
      maxOutputTokens: 500,
      prompt:
        'Du är Viktkollens dagliga coach. Svara endast med JSON: {"summary":"..."} på svenska. Ge kort, trygg allmän wellness-coaching, inte medicinsk rådgivning.',
      userData: data,
    })

    return response.status(200).json({
      source: 'openai',
      summary: result.summary || makeDailyCoachFallback(data),
    })
  } catch (error) {
    console.warn('[api/ai] daily-coach OpenAI failed, using mock', {
      error: error instanceof Error ? error.message : String(error),
    })

    return response.status(200).json({
      source: 'mock',
      summary: makeDailyCoachFallback(data),
    })
  }
}

async function handleChat(data, response) {
  const chatEngine = getChatEngineData(data)
  const unsafeMessage = unsafeCoachPattern.test(String(data.message || ''))

  if (process.env.OPENAI_API_KEY && !unsafeMessage) {
    try {
      const result = await callOpenAI({
        maxOutputTokens: 800,
        prompt: createAiCoachPrompt({
          context: chatEngine.context,
          intent: chatEngine.intent,
        }),
        userData: {
          context: chatEngine.context,
          message: data.message,
          recentConversation: chatEngine.context.conversation?.recentMessages || [],
        },
      })

      if (result?.reply) {
        return response.status(200).json({
          intent: chatEngine.intent.intent,
          reply: result.reply,
          source: 'openai',
          sourceReason: 'openai',
        })
      }
    } catch (error) {
      console.warn('[api/ai] chat OpenAI failed, using mock', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const reply = createDeterministicAiCoachReply({
    chatHistory: data.chatHistory,
    context: chatEngine.context,
    intent: chatEngine.intent,
    message: data.message,
  }) || chatEngine.fallbackReply

  return response.status(200).json({
    intent: chatEngine.intent.intent,
    reply,
    source: 'mock',
    sourceReason: unsafeMessage
      ? 'safety'
      : process.env.OPENAI_API_KEY
        ? 'openai_fallback'
        : 'missing_api_key',
  })
}

async function handleRealtimeSession(data, response) {
  const chatEngine = getChatEngineData({
    ...data,
    message: data.message || 'starta röstsamtal',
  })
  const session = await createRealtimeVoiceSession({
    instructions: createVoiceCoachInstructions({
      context: chatEngine.context,
      intent: chatEngine.intent,
    }),
  })

  if (!session.ok || !session.available) {
    return response.status(200).json({
      available: false,
      message: 'Röstsamtal är inte tillgängligt just nu.',
      ok: true,
      source: 'unavailable',
    })
  }

  return response.status(200).json({
    available: true,
    clientSecret: session.clientSecret,
    expiresAt: session.expiresAt,
    idleTimeoutMs: session.idleTimeoutMs,
    maxSessionMs: session.maxSessionMs,
    model: session.model,
    ok: true,
    source: 'openai',
  })
}

async function handleStudyBuddy(data, response) {
  if (!process.env.OPENAI_API_KEY) {
    return response.status(200).json({
      hint: makeStudyBuddyFallback(data),
      source: 'mock',
    })
  }

  try {
    const result = await callOpenAI({
      maxOutputTokens: 400,
      prompt:
        'Du är en pedagogisk Study Buddy. Svara endast med JSON: {"hint":"..."} på svenska. Ge en kort hint utan att avslöja svaret direkt.',
      userData: data,
    })

    return response.status(200).json({
      hint: result.hint || makeStudyBuddyFallback(data),
      source: 'openai',
    })
  } catch (error) {
    console.warn('[api/ai] study-buddy OpenAI failed, using mock', {
      error: error instanceof Error ? error.message : String(error),
    })

    return response.status(200).json({
      hint: makeStudyBuddyFallback(data),
      source: 'mock',
    })
  }
}

async function handleProactiveCoach(data, response) {
  if (!process.env.OPENAI_API_KEY) {
    return response.status(200).json({
      insights: makeFallbackInsights(data),
      source: 'mock',
    })
  }

  try {
    const result = await callOpenAI({
      maxOutputTokens: 500,
      prompt:
        'Du är en proaktiv svensk wellness-coach. Svara endast med JSON med fälten dailyStrength, dailyRisk, nextBestAction, budgetMealIdea och recoveryAdvice. Var kort, konkret, trygg och använd bara allmän hälsocoaching, inte medicinska råd.',
      userData: {
        bodyAnalysisCount: Array.isArray(data.bodyAnalysisHistory)
          ? data.bodyAnalysisHistory.length
          : 0,
        checkIn: data.checkIn,
        mealHistoryCount: Array.isArray(data.mealHistory)
          ? data.mealHistory.length
          : 0,
        meals: data.meals,
        weights: data.weights,
      },
    })

    return response.status(200).json({
      insights: {
        ...makeFallbackInsights(data),
        ...result,
      },
      source: 'openai',
    })
  } catch (error) {
    console.warn('[api/ai] proactive-coach OpenAI failed, using mock', {
      error: error instanceof Error ? error.message : String(error),
    })

    return response.status(200).json({
      insights: makeFallbackInsights(data),
      source: 'mock',
    })
  }
}

async function handleWeeklyReport(data, response) {
  if (!process.env.OPENAI_API_KEY) {
    return response.status(200).json({
      report: makeFallbackReport(data),
      source: 'mock',
    })
  }

  try {
    const report = await callOpenAI({
      maxOutputTokens: 800,
      prompt:
        'Du skriver en svensk AI-veckorapport för Viktkollen. Svara endast med JSON med fälten summary, weightTrend, mealPattern, nutritionStatus, movement, recovery, biggestProgress, biggestRisk, focusNextWeek och nextSteps (array med exakt 3 korta steg). Ge bara allmän wellness-coaching, inte medicinsk rådgivning.',
      userData: {
        bodyAnalysisCount: Array.isArray(data.bodyAnalysisHistory)
          ? data.bodyAnalysisHistory.length
          : 0,
        checkIn: data.checkIn,
        mealHistoryCount: Array.isArray(data.mealHistory)
          ? data.mealHistory.length
          : 0,
        meals: data.meals,
        proactiveCoach: data.proactiveCoach,
        weights: data.weights,
      },
    })

    return response.status(200).json({
      report: {
        ...makeFallbackReport(data),
        ...report,
        recommendations: sanitizeCoachRecommendations(report.recommendations),
        nextSteps: Array.isArray(report.nextSteps)
          ? report.nextSteps.slice(0, 3)
          : makeFallbackReport(data).nextSteps,
      },
      source: 'openai',
    })
  } catch (error) {
    console.warn('[api/ai] weekly-report OpenAI failed, using mock', {
      error: error instanceof Error ? error.message : String(error),
    })

    return response.status(200).json({
      report: makeFallbackReport(data),
      source: 'mock',
    })
  }
}

export default async function handler(request, response) {
  const requestId = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast POST stöds.',
      status: 405,
    })
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }
  const rateLimit = checkAiRouteRateLimit({
    limit: process.env.OPENAI_LEGACY_AI_RATE_LIMIT_MAX,
    route: 'legacyAi',
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

  let body

  try {
    body = parseBody(request)
  } catch {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Ogiltig JSON i förfrågan.',
      status: 400,
    })
  }

  if (body.action === 'proactive-coach') {
    return handleProactiveCoach(body, response)
  }

  if (body.action === 'weekly-report') {
    return handleWeeklyReport(body, response)
  }

  if (body.action === 'daily-coach') {
    return handleDailyCoach(body, response)
  }

  if (body.action === 'chat') {
    return handleChat(body, response)
  }

  if (body.action === 'realtime-session') {
    return handleRealtimeSession(body, response)
  }

  if (body.action === 'study-buddy') {
    return handleStudyBuddy(body, response)
  }

  return sendSafeAiError(response, {
    code: aiRouteErrorCodes.INVALID_REQUEST,
    requestId,
    safeMessage: 'Okänd AI-åtgärd.',
    status: 400,
  })
}

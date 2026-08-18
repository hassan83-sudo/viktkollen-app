import { fallbackMealAnalysis } from '../../src/services/mealAnalysisService.js'
import { createMealAnalysisPrompt } from '../../src/services/mealAnalysisPrompt.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_VISION_MODEL = 'gpt-4.1-mini'
const MAX_IMAGE_DATA_URL_BYTES = 8 * 1024 * 1024

function sanitizeImage(value) {
  const image = typeof value === 'string' && value.startsWith('data:image/')
    ? value
    : ''

  if (!image || Buffer.byteLength(image, 'utf8') > MAX_IMAGE_DATA_URL_BYTES) {
    return ''
  }

  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)) {
    return ''
  }

  return image
}

function parseRequestBody(request) {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body)
  }

  return request.body ?? {}
}

function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }

  const textParts = data.output
    ?.flatMap((item) => item.content ?? [])
    ?.map((content) => content.text)
    ?.filter(Boolean)

  return textParts?.join('\n').trim() || ''
}

function parseAnalysisText(text) {
  const parsed = JSON.parse(
    text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim(),
  )

  return {
    ...fallbackMealAnalysis,
    ...parsed,
    foods: Array.isArray(parsed.foods)
      ? parsed.foods.map(String).slice(0, 8)
      : fallbackMealAnalysis.foods,
  }
}

function fallbackPayload(reason) {
  return {
    analysis: {
      ...fallbackMealAnalysis,
      source: 'mock',
    },
    fallbackReason: reason,
    source: 'mock',
  }
}

export default async function handler(request, response) {
  const requestId = `meal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    limit: process.env.MEAL_ANALYSIS_RATE_LIMIT_MAX,
    route: 'mealAnalysis',
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
    body = parseRequestBody(request)
  } catch {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Ogiltig JSON i förfrågan.',
      status: 400,
    })
  }

  const image = sanitizeImage(body.image)

  if (!image) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'En måltidsbild krävs.',
      status: 400,
    })
  }

  if (!process.env.OPENAI_API_KEY) {
    console.info('[api/meal-analysis] OPENAI_API_KEY missing, using mock')
    return response.status(200).json(fallbackPayload('missing_api_key'))
  }

  const model =
    process.env.OPENAI_VISION_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_VISION_MODEL
  const startedAt = Date.now()

  try {
    const openaiResponse = await fetch(OPENAI_API_URL, {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                text: createMealAnalysisPrompt(),
                type: 'input_text',
              },
              {
                image_url: image,
                type: 'input_image',
              },
            ],
            role: 'user',
          },
        ],
        max_output_tokens: 800,
        model,
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

    const data = await openaiResponse.json()
    const analysis = parseAnalysisText(extractResponseText(data))

    console.info('[api/meal-analysis] Analysis completed', {
      durationMs: Date.now() - startedAt,
      source: 'openai',
    })

    return response.status(200).json({
      analysis,
      source: 'openai',
    })
  } catch (error) {
    console.warn('[api/meal-analysis] AI failed, using mock', {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      source: 'mock',
    })

    return response.status(200).json(fallbackPayload('api_error'))
  }
}

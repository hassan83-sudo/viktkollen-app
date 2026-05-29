const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_VISION_MODEL = 'gpt-4.1-mini'

function isDevelopment() {
  return process.env.NODE_ENV !== 'production'
}

function sanitizeImage(value) {
  return typeof value === 'string' && value.startsWith('data:image/')
    ? value
    : ''
}

function makeMockAnalysis() {
  return {
    foods: ['okänd proteinkälla', 'grönsaker', 'kolhydratkälla'],
    calories: 540,
    protein: 32,
    carbs: 58,
    fat: 18,
    confidence: 'låg',
    explanation:
      'Mockanalysen kunde inte använda riktig bildtolkning. Se siffrorna som en grov uppskattning och justera efter portion och ingredienser.',
  }
}

function fallbackPayload(reason, details = {}) {
  const payload = {
    analysis: makeMockAnalysis(),
    source: 'mock',
    fallbackReason: reason,
  }

  if (isDevelopment()) {
    payload.debug = details
  }

  return payload
}

function parseRequestBody(request) {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body)
  }

  return request.body ?? {}
}

function parseAnalysisText(text) {
  const parsed = JSON.parse(text)

  return {
    foods: Array.isArray(parsed.foods)
      ? parsed.foods.map(String).slice(0, 8)
      : [],
    calories: Number(parsed.calories),
    protein: Number(parsed.protein),
    carbs: Number(parsed.carbs),
    fat: Number(parsed.fat),
    confidence: String(parsed.confidence || 'låg'),
    explanation: String(parsed.explanation || ''),
  }
}

function validateAnalysis(analysis) {
  return (
    Array.isArray(analysis.foods) &&
    analysis.foods.length > 0 &&
    Number.isFinite(analysis.calories) &&
    Number.isFinite(analysis.protein) &&
    Number.isFinite(analysis.carbs) &&
    Number.isFinite(analysis.fat) &&
    ['låg', 'medel', 'hög'].includes(analysis.confidence) &&
    analysis.explanation
  )
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

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  let body

  try {
    body = parseRequestBody(request)
  } catch (error) {
    console.error('[api/analyze-meal] Invalid JSON request body', error)
    return response.status(400).json({
      error: 'Invalid JSON request body',
      ...(isDevelopment() && { detail: error.message }),
    })
  }

  const image = sanitizeImage(body.image)
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || DEFAULT_VISION_MODEL

  console.info('[api/analyze-meal] Request received', {
    hasApiKey,
    hasImage: Boolean(image),
    model,
  })

  if (!image) {
    return response.status(400).json({ error: 'Image is required' })
  }

  if (!hasApiKey) {
    console.info('[api/analyze-meal] OPENAI_API_KEY missing, returning mock')
    return response.status(200).json(
      fallbackPayload('missing_openai_api_key', { hasApiKey, model }),
    )
  }

  try {
    console.info('[api/analyze-meal] Calling OpenAI vision model', { model })

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 500,
        instructions:
          'Du analyserar matbilder för en svensk wellness-app. Svara endast med giltig JSON utan markdown. Identifiera synliga livsmedel och uppskatta kalorier, protein, kolhydrater och fett för hela portionen. Svara på svenska. Var tydlig med att detta är en uppskattning. Confidence ska vara "låg", "medel" eller "hög". Ge inga medicinska råd.',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Returnera JSON med exakt dessa fält: foods (array av svenska matnamn), calories (number), protein (number gram), carbs (number gram), fat (number gram), confidence (låg/medel/hög), explanation (kort svensk förklaring om osäkerhet och antaganden).',
              },
              {
                type: 'input_image',
                image_url: image,
              },
            ],
          },
        ],
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      throw new Error(
        `OpenAI vision request failed: ${openaiResponse.status} ${errorText.slice(0, 500)}`,
      )
    }

    const data = await openaiResponse.json()
    const text = extractResponseText(data)
    const analysis = parseAnalysisText(text)

    if (!validateAnalysis(analysis)) {
      throw new Error('OpenAI vision response did not match expected schema')
    }

    console.info('[api/analyze-meal] OpenAI analysis received', {
      confidence: analysis.confidence,
      foods: analysis.foods,
    })

    return response.status(200).json({
      analysis,
      source: 'openai',
      ...(isDevelopment() && {
        debug: {
          model,
          executedOpenAIRequest: true,
        },
      }),
    })
  } catch (error) {
    console.error('[api/analyze-meal] OpenAI vision failed, returning mock', {
      error: error instanceof Error ? error.message : String(error),
      hasApiKey,
      model,
    })

    return response.status(200).json(
      fallbackPayload('openai_vision_failed', {
        hasApiKey,
        model,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

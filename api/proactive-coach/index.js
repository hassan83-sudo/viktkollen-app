const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-4.1-mini'

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

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  let data

  try {
    data = parseBody(request)
  } catch {
    return response.status(400).json({ error: 'Invalid JSON request body' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(200).json({
      insights: makeFallbackInsights(data),
      source: 'mock',
    })
  }

  try {
    const model =
      process.env.OPENAI_MODEL ||
      process.env.OPENAI_VISION_MODEL ||
      DEFAULT_MODEL
    const openaiResponse = await fetch(OPENAI_API_URL, {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                text:
                  'Du är en proaktiv svensk wellness-coach. Svara endast med JSON med fälten dailyStrength, dailyRisk, nextBestAction, budgetMealIdea och recoveryAdvice. Var kort, konkret, trygg och använd bara allmän hälsocoaching, inte medicinska råd.',
                type: 'input_text',
              },
              {
                text: JSON.stringify({
                  bodyAnalysisCount: Array.isArray(data.bodyAnalysisHistory)
                    ? data.bodyAnalysisHistory.length
                    : 0,
                  checkIn: data.checkIn,
                  mealHistoryCount: Array.isArray(data.mealHistory)
                    ? data.mealHistory.length
                    : 0,
                  meals: data.meals,
                  weights: data.weights,
                }),
                type: 'input_text',
              },
            ],
            role: 'user',
          },
        ],
        max_output_tokens: 500,
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

    const result = parseJson(extractText(await openaiResponse.json()))

    return response.status(200).json({
      insights: {
        ...makeFallbackInsights(data),
        ...result,
      },
      source: 'openai',
    })
  } catch (error) {
    console.warn('[api/proactive-coach] OpenAI failed, using mock', {
      error: error instanceof Error ? error.message : String(error),
    })

    return response.status(200).json({
      insights: makeFallbackInsights(data),
      source: 'mock',
    })
  }
}

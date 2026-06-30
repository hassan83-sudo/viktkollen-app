const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-4.1-mini'

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
      report: makeFallbackReport(data),
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
                  'Du skriver en svensk AI-veckorapport för Viktkollen. Svara endast med JSON med fälten summary, weightTrend, mealPattern, nutritionStatus, movement, recovery, biggestProgress, biggestRisk, focusNextWeek och nextSteps (array med exakt 3 korta steg). Ge bara allmän wellness-coaching, inte medicinsk rådgivning.',
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
                  proactiveCoach: data.proactiveCoach,
                  weights: data.weights,
                }),
                type: 'input_text',
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

    const report = parseJson(extractText(await openaiResponse.json()))

    return response.status(200).json({
      report: {
        ...makeFallbackReport(data),
        ...report,
        nextSteps: Array.isArray(report.nextSteps)
          ? report.nextSteps.slice(0, 3)
          : makeFallbackReport(data).nextSteps,
      },
      source: 'openai',
    })
  } catch (error) {
    console.warn('[api/weekly-report] OpenAI failed, using mock', {
      error: error instanceof Error ? error.message : String(error),
    })

    return response.status(200).json({
      report: makeFallbackReport(data),
      source: 'mock',
    })
  }
}

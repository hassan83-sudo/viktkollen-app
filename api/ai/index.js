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
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  let body

  try {
    body = parseBody(request)
  } catch {
    return response.status(400).json({ error: 'Invalid JSON request body' })
  }

  if (body.action === 'proactive-coach') {
    return handleProactiveCoach(body, response)
  }

  if (body.action === 'weekly-report') {
    return handleWeeklyReport(body, response)
  }

  return response.status(400).json({ error: 'Unknown AI action' })
}

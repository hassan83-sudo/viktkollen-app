const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-4.1-mini'

function isDevelopment() {
  return process.env.NODE_ENV !== 'production'
}

function sanitizeText(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  return value.trim().slice(0, 1000)
}

function parseWeight(value) {
  const numericValue = Number(String(value ?? '').replace(',', '.').replace(' kg', ''))

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

function countDoneFoods(foods = []) {
  return foods.filter((item) => item?.done).length
}

function formatContext(body) {
  const profile = body.profile ?? {}
  const checkIn = body.checkIn ?? {}
  const foods = Array.isArray(body.foods) ? body.foods : []
  const meals = Array.isArray(body.meals) ? body.meals : []
  const weights = Array.isArray(body.weights) ? body.weights : []
  const latestWeight = weights.at(-1)?.value ?? body.currentWeight ?? null
  const previousWeight = weights.at(-2)?.value ?? null
  const goal = sanitizeText(profile.goal, 'hållbara vanor')
  const trend =
    Number.isFinite(latestWeight) && Number.isFinite(previousWeight)
      ? Number((latestWeight - previousWeight).toFixed(1))
      : null

  return {
    profile: {
      name: sanitizeText(profile.name, 'användaren'),
      goal,
      startWeight: parseWeight(profile.startWeight),
      goalWeight:
        goal === 'gå ner i vikt' ? parseWeight(profile.goalWeight) : null,
      activityLevel: sanitizeText(profile.activityLevel),
    },
    current: {
      weight: latestWeight,
      weightTrend: trend,
      steps: checkIn.steps ?? 'okänt',
      energy: checkIn.energy ?? 'okänd',
      mood: sanitizeText(checkIn.mood, 'okänt'),
      workout: Boolean(checkIn.workout),
      checklistScore: `${countDoneFoods(foods)}/${foods.length || 0}`,
      checklist: foods
        .map((item) => `${item.label}: ${item.done ? 'klar' : 'ej klar'}`)
        .join(', '),
      meals:
        meals
          .slice(0, 6)
          .map((meal) => `${meal.type}: ${meal.text}`)
          .join(' | ') || 'inga måltider loggade',
    },
  }
}

function makeMockSummary(context) {
  const name = context.profile.name || 'du'
  const goal = context.profile.goal
  const checklist = context.current.checklistScore
  const steps =
    typeof context.current.steps === 'number'
      ? context.current.steps.toLocaleString('sv-SE')
      : context.current.steps
  const focus =
    goal === 'bygga muskler'
      ? 'protein och återhämtning'
      : goal === 'gå ner i vikt'
        ? 'enkla matval och jämn rörelse'
        : 'stabil energi och jämna måltider'

  return `${name}, dagens fokus:
• Satsa på ${focus}.
• Steg: ${steps}, energi: ${context.current.energy}/10.
• Matchecklistan är ${checklist}.

Välj en enkel måltid med protein och grönsaker.`
}

function fallbackPayload(context, reason, details = {}) {
  const payload = {
    summary: makeMockSummary(context),
    source: 'mock',
    fallbackReason: reason,
  }

  if (isDevelopment()) {
    payload.debug = details
  }

  return payload
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

function parseRequestBody(request) {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body)
  }

  return request.body ?? {}
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
    console.error('[api/daily-coach] Invalid JSON request body', error)
    return response.status(400).json({
      error: 'Invalid JSON request body',
      ...(isDevelopment() && { detail: error.message }),
    })
  }

  const context = formatContext(body)
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL

  console.info('[api/daily-coach] Request received', {
    hasApiKey,
    model,
    profileGoal: context.profile.goal,
  })

  if (!hasApiKey) {
    console.info('[api/daily-coach] OPENAI_API_KEY missing, returning mock')
    return response.status(200).json(
      fallbackPayload(context, 'missing_openai_api_key', { hasApiKey, model }),
    )
  }

  try {
    console.info('[api/daily-coach] Calling OpenAI Responses API', { model })

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 150,
        instructions:
          'Du är Viktkollens svenska AI-coach. Skriv en mycket kort daglig sammanfattning på svenska: max 3 korta bullets plus eventuell sista handlingsrad. Inga långa stycken. Upprepa inte nuvarande vikt eller målvikt om det inte behövs för viktutveckling. Upprepa ingen medicinsk disclaimer. Använd mål, måltider, matchecklista, steg, humör och energi. Om målet är "hålla vikten", prata inte om viktminskning eller avstånd till målvikt. Prata bara om viktminskning när målet är "gå ner i vikt". Prata bara om muskelbygge när målet är "bygga muskler". Ge inte diagnos, behandling eller extrema dieter.',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({ context }),
              },
            ],
          },
        ],
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      throw new Error(
        `OpenAI request failed: ${openaiResponse.status} ${errorText.slice(0, 500)}`,
      )
    }

    const data = await openaiResponse.json()
    const summary = extractResponseText(data)

    if (!summary) {
      throw new Error('OpenAI response had no text')
    }

    console.info('[api/daily-coach] OpenAI summary received', {
      length: summary.length,
    })

    return response.status(200).json({
      summary,
      source: 'openai',
      ...(isDevelopment() && {
        debug: {
          model,
          executedOpenAIRequest: true,
        },
      }),
    })
  } catch (error) {
    console.error('[api/daily-coach] OpenAI call failed, returning mock', {
      error: error instanceof Error ? error.message : String(error),
      hasApiKey,
      model,
    })

    return response.status(200).json(
      fallbackPayload(context, 'openai_request_failed', {
        hasApiKey,
        model,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

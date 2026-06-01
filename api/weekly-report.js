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

function formatDecimal(value) {
  return value.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })
}

function getAverageWeeklyChange(weights) {
  if (weights.length < 2) {
    return 0
  }

  const first = weights[0]
  const last = weights.at(-1)
  const days = Math.max(
    1,
    (new Date(last.date) - new Date(first.date)) / 86400000,
  )

  return Number((((last.value - first.value) / days) * 7).toFixed(1))
}

function formatContext(body) {
  const profile = body.profile ?? {}
  const checkIn = body.checkIn ?? {}
  const foods = Array.isArray(body.foods) ? body.foods : []
  const meals = Array.isArray(body.meals) ? body.meals : []
  const weights = Array.isArray(body.weights) ? body.weights : []
  const recentWeights = weights.slice(-7)
  const goal = sanitizeText(profile.goal, 'hållbara vanor')
  const weeklyChange = getAverageWeeklyChange(recentWeights)

  return {
    profile: {
      name: sanitizeText(profile.name, 'användaren'),
      goal,
      startWeight: parseWeight(profile.startWeight),
      goalWeight:
        goal === 'gå ner i vikt' ? parseWeight(profile.goalWeight) : null,
      activityLevel: sanitizeText(profile.activityLevel),
    },
    week: {
      currentWeight: recentWeights.at(-1)?.value ?? body.currentWeight ?? null,
      averageWeeklyChange: `${weeklyChange > 0 ? '+' : ''}${formatDecimal(weeklyChange)} kg`,
      weights: recentWeights,
      meals: meals.slice(0, 12),
      checklistCompletion: `${foods.filter((item) => item?.done).length}/${foods.length || 0}`,
      checklist: foods.map((item) => ({
        label: sanitizeText(item.label),
        done: Boolean(item.done),
      })),
      steps: checkIn.steps ?? 'okänt',
      energy: checkIn.energy ?? 'okänd',
      mood: sanitizeText(checkIn.mood, 'okänt'),
    },
  }
}

function makeMockReport(context) {
  const name = context.profile.name || 'du'
  const goal = context.profile.goal
  const goalText =
    goal === 'gå ner i vikt'
      ? 'Vikttrenden kan följas lugnt utan hårda regler.'
      : goal === 'bygga muskler'
        ? 'Låt styrka, protein och återhämtning vara huvudsignalerna.'
        : 'Stabil energi och upprepbara vanor är veckans viktigaste signaler.'

  return `### Veckans sammanfattning
- ${name}, ditt mål är att ${goal}. ${goalText}
- Vikt: genomsnittlig veckoförändring är ${context.week.averageWeeklyChange}.
- Mat: ${context.week.meals.length} måltider är loggade och checklistan är ${context.week.checklistCompletion}.
- Aktivitet: ${context.week.steps} steg, energi ${context.week.energy}/10 och humör ${context.week.mood}.

### Nästa fokus
- Välj en proteinbas till två måltider i förväg.
- Håll vattenmålet synligt under dagen.
- Gör en rimlig rörelseinsats som passar energin.

Det här är allmänt wellness-stöd, inte medicinsk rådgivning.`
}

function fallbackPayload(context, reason, details = {}) {
  const payload = {
    report: makeMockReport(context),
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
    console.error('[api/weekly-report] Invalid JSON request body', error)
    return response.status(400).json({
      error: 'Invalid JSON request body',
      ...(isDevelopment() && { detail: error.message }),
    })
  }

  const context = formatContext(body)
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL

  console.info('[api/weekly-report] Request received', {
    hasApiKey,
    model,
    profileGoal: context.profile.goal,
  })

  if (!hasApiKey) {
    return response.status(200).json(
      fallbackPayload(context, 'missing_openai_api_key', { hasApiKey, model }),
    )
  }

  try {
    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 520,
        instructions:
          'Du är Viktkollens svenska AI-coach. Skapa en veckorapport på svenska med rubriker och korta punktlistor. Analysera vikttrend, måltider, matchecklista, steg, energi och humör. Håll tonen stödjande, konkret och mobilvänlig. Om målet är "hålla vikten", prata inte om viktminskning eller avstånd till målvikt. Prata bara om viktminskning när målet är "gå ner i vikt". Prata bara om muskelbygge när målet är "bygga muskler". Ge inte medicinska råd, diagnoser, behandling eller extrema dieter.',
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
    const report = extractResponseText(data)

    if (!report) {
      throw new Error('OpenAI response had no text')
    }

    return response.status(200).json({
      report,
      source: 'openai',
      ...(isDevelopment() && {
        debug: {
          model,
          executedOpenAIRequest: true,
        },
      }),
    })
  } catch (error) {
    console.error('[api/weekly-report] OpenAI call failed, returning mock', {
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

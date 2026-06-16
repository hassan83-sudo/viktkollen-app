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

function formatWeight(value) {
  return `${formatDecimal(value)} kg`
}

function formatDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(date))
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

function getPeriodWeightChange(weights) {
  if (weights.length < 2) {
    return null
  }

  return Number((weights.at(-1).value - weights[0].value).toFixed(1))
}

function formatSignedWeight(value) {
  return `${value > 0 ? '+' : ''}${formatWeight(value)}`
}

function formatContext(body) {
  const profile = body.profile ?? {}
  const checkIn = body.checkIn ?? {}
  const foods = Array.isArray(body.foods) ? body.foods : []
  const meals = Array.isArray(body.meals) ? body.meals : []
  const weights = Array.isArray(body.weights)
    ? [...body.weights].sort((a, b) => new Date(a.date) - new Date(b.date))
    : []
  const recentWeights = weights.slice(-7)
  const previousWeights = weights.slice(-14, -7)
  const goal = sanitizeText(profile.goal, 'hållbara vanor')
  const weeklyTrend = getAverageWeeklyChange(recentWeights)
  const weeklyChange = getPeriodWeightChange(recentWeights)
  const previousChange = getPeriodWeightChange(previousWeights)
  const completedFoods = foods.filter((item) => item?.done).length
  const foodPercent = foods.length
    ? Math.round((completedFoods / foods.length) * 100)
    : 0
  const habitScore = Math.round(
    ((checkIn.energy >= 6 ? 1 : 0) +
      (checkIn.steps >= 7000 ? 1 : 0) +
      (checkIn.workout ? 1 : 0) +
      (foods.length ? completedFoods / foods.length : 0)) *
      25,
  )

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
      averageWeeklyChange: formatSignedWeight(weeklyTrend),
      changeSincePreviousWeek:
        previousChange === null || weeklyChange === null
          ? null
          : formatSignedWeight(Number((weeklyChange - previousChange).toFixed(1))),
      dateRange:
        recentWeights.length >= 2
          ? `${formatDate(recentWeights[0].date)}-${formatDate(recentWeights.at(-1).date)}`
          : null,
      foodPercent,
      habitScore,
      previousChange,
      weeklyChange,
      weights: recentWeights,
      meals: meals.slice(0, 12),
      checklistCompletion: `${completedFoods}/${foods.length || 0}`,
      checklist: foods.map((item) => ({
        label: sanitizeText(item.label),
        done: Boolean(item.done),
      })),
      steps: checkIn.steps ?? 'okänt',
      energy: checkIn.energy ?? 'okänd',
      mood: sanitizeText(checkIn.mood, 'okänt'),
      workout: Boolean(checkIn.workout),
    },
  }
}

function makeMockReport(context) {
  const name = context.profile.name || 'du'
  const goal = context.profile.goal
  const strengths = [
    context.week.foodPercent >= 75 ? 'Matchecklistan sitter starkt.' : '',
    context.week.steps >= 7000 ? 'Stegen ligger på en bra nivå.' : '',
    context.week.energy >= 6 ? 'Energin ser stabil ut.' : '',
    context.week.workout ? 'Du har träning med i rutinen.' : '',
    context.week.meals.length > 0
      ? `${context.week.meals.length} måltider är loggade.`
      : '',
  ].filter(Boolean)
  const recommendation =
    context.week.foodPercent < 75
      ? 'Välj en punkt i matchecklistan och gör den enkel att upprepa nästa vecka.'
      : context.week.steps < 7000
        ? 'Lägg in en kort promenad på samma tid varje dag för jämnare aktivitet.'
        : context.week.energy < 6
          ? 'Planera återhämtning och en enkel måltidsrutin för bättre energi.'
          : 'Fortsätt med samma bas och höj bara en liten vana åt gången.'
  const aiInsight =
    context.week.weeklyChange === null
      ? `${name}, logga några fler vägningar så blir vikttrenden säkrare.`
      : goal === 'gå ner i vikt' && context.week.weeklyChange <= 0
        ? `${name}, veckan rör sig i linje med ditt mål utan stora slutsatser.`
        : goal === 'bygga muskler'
          ? `${name}, följ styrka, mat och energi tillsammans med vikten för en mer rättvis bild.`
          : `${name}, stabila vanor verkar vara viktigare här än en enskild siffra på vågen.`

  return `### Veckorapport V2
• Viktförändring denna vecka: ${context.week.weeklyChange === null ? 'Inte tillräckligt med data' : formatSignedWeight(context.week.weeklyChange)} (${context.week.dateRange ?? 'för kort historik ännu'}).
• Förändring sedan förra veckan: ${context.week.changeSincePreviousWeek ?? 'Ingen jämförbar föregående vecka ännu.'}
• Snittsteg per dag: ${context.week.steps.toLocaleString('sv-SE')} steg.
• Matchecklista: ${context.week.foodPercent}% (${context.week.checklistCompletion}).
• Träningsstatus: ${context.week.workout ? 'Träning är markerad i veckans check-in.' : 'Ingen träning är markerad just nu.'}
• Vanepoäng: ${context.week.habitScore}%.
• Vikttrend per vecka: ${context.week.averageWeeklyChange}.

### Styrkor denna vecka
• ${strengths.length ? strengths.join('\n• ') : 'Du har en startpunkt att bygga vidare från.'}

### Rekommendation inför nästa vecka
• ${recommendation}

### Kort AI-insikt
• ${aiInsight}

Obs: Rapporten är allmänt stöd och inte medicinsk rådgivning.`
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
        max_output_tokens: 260,
        instructions:
          'Du är Viktkollens svenska AI-coach. Skapa Veckorapport V2 på svenska utifrån exakt användardata i context. Använd rubrikerna: "### Veckorapport V2", "### Styrkor denna vecka", "### Rekommendation inför nästa vecka", "### Kort AI-insikt". Ta med viktförändring denna vecka, förändring sedan förra veckan om den finns, snittsteg per dag, matchecklista %, träningsstatus och vanepoäng. Håll svaret kort, konkret och mobilvänligt. Prata bara om viktminskning när målet är "gå ner i vikt" och bara om muskelbygge när målet är "bygga muskler". Ge inte diagnos, behandling, kroppsfettanalys, viktuppskattning eller extrema dieter. Lägg till att rapporten är allmänt stöd och inte medicinsk rådgivning.',
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

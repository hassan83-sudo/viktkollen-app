const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-4.1-mini'

function isDevelopment() {
  return process.env.NODE_ENV !== 'production'
}

function logChatEvent(message, details = {}) {
  console.info('[api/chat]', message, details)
}

function logChatError(message, error, details = {}) {
  console.error('[api/chat]', message, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
  })
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
  const checklist = foods
    .map((item) => `${item.label}: ${item.done ? 'klar' : 'ej klar'}`)
    .join(', ')
  const mealNotes = meals
    .slice(0, 6)
    .map((meal) => `${meal.type}: ${meal.text}`)
    .join(' | ')
  const goal = sanitizeText(profile.goal, 'hållbara vanor')

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
      steps: checkIn.steps ?? 'okänt',
      energy: checkIn.energy ?? 'okänd',
      mood: sanitizeText(checkIn.mood, 'okänt'),
      workout: Boolean(checkIn.workout),
      checklistScore: `${countDoneFoods(foods)}/${foods.length || 0}`,
      checklist,
      meals: mealNotes || 'inga måltider loggade',
    },
  }
}

function detectPlanDays(message) {
  const lowerMessage = message.toLowerCase()
  const digitMatch = lowerMessage.match(/(\d+)\s*(dag|dagar)/)

  if (digitMatch) {
    return Math.min(Math.max(Number(digitMatch[1]), 2), 7)
  }

  if (
    lowerMessage.includes('flera dagar') ||
    lowerMessage.includes('veckoplan') ||
    lowerMessage.includes('matschema')
  ) {
    return 3
  }

  return 0
}

function makeMealPlanReply(message) {
  const days = detectPlanDays(message)

  if (!days) {
    return ''
  }

  const dayTemplates = [
    {
      lunch: 'Äggwrap med morot, vitkål och keso',
      dinner: 'Kyckling, potatis och frysta grönsaker',
      calories: 1750,
      protein: 115,
    },
    {
      lunch: 'Tonfisk med ris, majs och gurka',
      dinner: 'Linsgryta med potatis och yoghurt',
      calories: 1800,
      protein: 105,
    },
    {
      lunch: 'Keso, kokt ägg, knäckebröd och frukt',
      dinner: 'Tofuwok med nudlar och frysta wokgrönsaker',
      calories: 1700,
      protein: 100,
    },
    {
      lunch: 'Bönsallad med pasta, ägg och vitkål',
      dinner: 'Fiskpinnar, potatis och ärtor',
      calories: 1850,
      protein: 105,
    },
    {
      lunch: 'Kycklingrester i wrap med grönsaker',
      dinner: 'Chili på bönor med ris och yoghurt',
      calories: 1780,
      protein: 110,
    },
    {
      lunch: 'Havregrynsgröt, kvarg och bär',
      dinner: 'Omelett med potatis och grönsaker',
      calories: 1650,
      protein: 95,
    },
    {
      lunch: 'Tonfiskmackor med ägg och frukt',
      dinner: 'Kycklinggryta med ris och frysta grönsaker',
      calories: 1900,
      protein: 120,
    },
  ]
  const selectedDays = dayTemplates.slice(0, days)
  return `En enkel plan:
${selectedDays
  .map(
    (day, index) =>
      `Dag ${index + 1}: ${day.lunch} + ${day.dinner} (${day.calories} kcal, ${day.protein} g protein)`,
  )
  .join('\n')}

Handla: ägg, kyckling/tonfisk, linser/bönor, potatis/ris och frysta grönsaker.`
}

function makeMockReply(message, context) {
  const text = message.toLowerCase()
  const name = context.profile.name || 'du'
  const mealPlanReply = makeMealPlanReply(message)
  const steps = context.current.steps
  const energy = context.current.energy
  const checklistScore = context.current.checklistScore
  const intro = `${name}, håll det enkelt i dag:`

  if (mealPlanReply) {
    return mealPlanReply
  }

  if (text.includes('middag') || text.includes('ikväll') || text.includes('äta')) {
    return `Testa något enkelt ikväll:
• Kyckling + potatis + frysta grönsaker
• Äggwrap med keso och vitkål
• Linsgryta med ris

Välj det som går snabbast att laga.`
  }

  if (text.includes('mellanmål')) {
    return `Snabba mellanmål:
• Kvarg + bär
• Ägg på knäckebröd
• Keso + frukt

Ta det som kräver minst fix.`
  }

  if (text.includes('motivation')) {
    return `${intro}
• Sänk ribban till 5 minuter.
• Välj en sak: promenad, protein till nästa måltid eller vatten.
• Med ${steps} steg och energi ${energy}/10 räcker “lite” bra.

Gör första lilla steget nu.`
  }

  if (text.includes('protein') || text.includes('lunch')) {
    return `Billig proteinrik lunch:
• Tonfisk + ris + majs
• Äggwrap + keso + grönsaker
• Linsgryta + potatis

Välj en och upprepa den i veckan.`
  }

  return `${intro}
• Nästa måltid: protein + grönsak + potatis/ris/bröd.
• Checklistan är ${checklistScore}; välj enklaste punkten.
• Energi ${energy}/10: håll nivån rimlig.

Planera nästa måltid i en mening.`
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

function fallbackPayload(message, context, reason, details = {}) {
  const payload = {
    reply: makeMockReply(message, context),
    source: 'mock',
    fallbackReason: reason,
  }

  if (isDevelopment()) {
    payload.debug = details
  }

  return payload
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
    logChatError('Invalid JSON request body', error)
    return response.status(400).json({
      error: 'Invalid JSON request body',
      ...(isDevelopment() && { detail: error.message }),
    })
  }

  const message = sanitizeText(body.message)
  const context = formatContext(body)

  if (!message) {
    return response.status(400).json({ error: 'Message is required' })
  }

  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL

  logChatEvent('Request received', {
    hasApiKey,
    model,
    messageLength: message.length,
    profileGoal: context.profile.goal,
  })

  if (!process.env.OPENAI_API_KEY) {
    logChatEvent('OPENAI_API_KEY missing, returning mock fallback')
    return response.status(200).json(
      fallbackPayload(message, context, 'missing_openai_api_key', {
        hasApiKey,
        model,
      }),
    )
  }

  try {
    logChatEvent('Calling OpenAI Responses API', {
      url: OPENAI_API_URL,
      model,
    })

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 220,
        instructions:
          'Du är Viktkollens svenska AI-coach. Svara alltid på svenska, kort och praktiskt. Normal svarslängd: 3-5 korta bullets eller 2-4 korta rader. Inga långa stycken. Upprepa inte nuvarande vikt eller målvikt om användaren inte frågar om viktutveckling. Upprepa inte medicinska disclaimers. För "Vad ska jag äta ikväll?": ge 2-3 konkreta middagsalternativ. För mellanmål: ge 3 snabba alternativ. För billig proteinrik lunch: ge 3 konkreta luncher. För flerdagars matplan: använd kompakt format "Dag 1: ...", "Dag 2: ...", "Dag 3: ..." och högst en kort inköpsrad. Om målet är "hålla vikten", prata inte om viktminskning eller avstånd till målvikt. Prata bara om viktminskning när målet är "gå ner i vikt". Prata bara om muskelbygge när målet är "bygga muskler". Ge inte diagnos, behandling, extrema dieter eller fasta-råd. Avsluta med en enkel handling bara när det tillför något.',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  question: message,
                  context,
                  recentChat: Array.isArray(body.chatHistory)
                    ? body.chatHistory.slice(-8)
                    : [],
                }),
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
    const reply = extractResponseText(data)

    logChatEvent('OpenAI response received', {
      hasReply: Boolean(reply),
      outputItems: Array.isArray(data.output) ? data.output.length : 0,
    })

    if (!reply) {
      logChatEvent('OpenAI response had no text, returning mock fallback')
      return response.status(200).json(
        fallbackPayload(message, context, 'empty_openai_response', {
          hasApiKey,
          model,
        }),
      )
    }

    return response.status(200).json({
      reply,
      source: 'openai',
      ...(isDevelopment() && {
        debug: {
          model,
          executedOpenAIRequest: true,
        },
      }),
    })
  } catch (error) {
    logChatError('OpenAI call failed, returning mock fallback', error, {
      hasApiKey,
      model,
    })

    return response.status(200).json(
      fallbackPayload(message, context, 'openai_request_failed', {
        hasApiKey,
        model,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

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
  return typeof value === 'string' ? value.slice(0, 1000) : fallback
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
  const latestWeight = weights.at(-1)?.value ?? body.currentWeight ?? 'okänd'
  const checklist = foods
    .map((item) => `${item.label}: ${item.done ? 'klar' : 'ej klar'}`)
    .join(', ')
  const mealNotes = meals
    .slice(0, 6)
    .map((meal) => `${meal.type}: ${meal.text}`)
    .join(' | ')

  return {
    profile: {
      name: sanitizeText(profile.name, 'användaren'),
      goal: sanitizeText(profile.goal, 'hållbara vanor'),
      startWeight: sanitizeText(profile.startWeight, 'okänd'),
      goalWeight: sanitizeText(profile.goalWeight, 'okänd'),
      activityLevel: sanitizeText(profile.activityLevel, 'okänd'),
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

function makeMockReply(message, context) {
  const text = message.toLowerCase()
  const name = context.profile.name || 'du'
  const goal = context.profile.goal || 'ditt mål'
  const currentWeight = context.current.weight
  const goalWeight = context.profile.goalWeight
  const steps = context.current.steps
  const energy = context.current.energy
  const checklistScore = context.current.checklistScore
  const meals = context.current.meals
  const intro = `${name}, med målet att ${goal} kan du hålla det konkret och hållbart i dag. Nuvarande vikt är ${currentWeight} kg och målvikt är ${goalWeight} kg, så tänk riktning över tid snarare än hårda snabba regler.`
  const safety =
    'Det här är allmänt wellness-stöd, inte medicinsk rådgivning eller behandling.'

  if (text.includes('middag') || text.includes('ikväll') || text.includes('äta')) {
    return `${intro}

- Välj en middag med tydlig proteinbas: kyckling, lax, tofu, bönor eller ägg.
- Lägg till mycket grönsaker och en lagom kolhydratkälla som potatis, ris eller fullkornspasta.
- Exempel: lax med potatis och broccoli, kycklingbowl med ris och grönsaker, eller tofuwok med nudlar.
- Du har ${steps} steg, energi ${energy}/10 och checklistan är ${checklistScore}, så gör måltiden enkel nog att faktiskt bli av.
- Tidigare måltider: ${meals}.

${safety}

Dagens enkla handling: välj en proteinbas innan du bestämmer resten av middagen.`
  }

  if (text.includes('mellanmål')) {
    return `${intro}

- Ett bra mellanmål ska vara lätt att fixa och ge mättnad utan att bli ett stort projekt.
- Förslag: kvarg eller yoghurt med bär, ägg på knäckebröd, keso med frukt, eller hummus med morötter.
- Om du vill ha mer protein: välj kvarg, ägg, keso eller en enkel tonfiskmacka.
- Med energi ${energy}/10 är det smart att välja något som stabiliserar eftermiddagen utan extrema regler.
- Checklistan är ${checklistScore}, så välj gärna något som hjälper en sak till bli avklarad.

${safety}

Dagens enkla handling: förbered ett mellanmål som tar under fem minuter.`
  }

  if (text.includes('motivation')) {
    return `${intro}

- Motivation blir lättare när målet görs litet nog att klara även en vanlig dag.
- Välj en minsta nivå: 10 min promenad, en proteinrik måltid eller att kryssa en punkt i checklistan.
- Med ${steps} steg i dag kan du bygga vidare lugnt, inte jaga perfektion.
- Om humöret är ${context.current.mood}, sänk friktionen: lägg fram träningskläder eller planera nästa måltid.
- Se viktmålet som en kompass, inte ett dagligt betyg.

${safety}

Dagens enkla handling: gör en sak i fem minuter innan du utvärderar dagen.`
  }

  if (text.includes('protein') || text.includes('lunch')) {
    return `${intro}

- Billig proteinrik lunch: ägg, tonfisk, kyckling, linser, bönor, keso eller tofu.
- Konkreta alternativ: tonfisk med ris och majs, äggwrap med grönsaker, linsgryta med potatis, eller kycklingsallad med bröd.
- För ${goal}: håll proteinet tydligt och justera mängden ris, pasta eller potatis efter hunger och aktivitetsnivå.
- Du har energi ${energy}/10, så välj något som mättar utan att göra eftermiddagen tung.
- Checklistan är ${checklistScore}; lägg gärna till frukt eller grönsaker.

${safety}

Dagens enkla handling: välj en lunch där proteinet är bestämt först.`
  }

  return `${intro}

- Börja med nästa måltid: protein + grönsaker + en kolhydratkälla som passar hunger och energi.
- Konkreta val: yoghurt med bär, kyckling med potatis, tofu med ris, äggmacka eller bönsallad.
- Med ${steps} steg och energi ${energy}/10 är ett rimligt mål bättre än ett perfekt mål.
- Matchecklistan är ${checklistScore}; välj en punkt som känns enklast att klara.
- Undvik extrema upplägg. En jämn rutin vinner över snabba ryck.

${safety}

Dagens enkla handling: planera din nästa måltid i en mening.`
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
        max_output_tokens: 420,
        instructions:
          'Du är Viktkollens svenska AI-coach för allmänt välmående. Svara alltid endast på svenska. Tilltala användaren naturligt med namn när namnet finns. Skriv 100-250 ord. Använd korta punktlistor. Ge konkreta måltidsförslag med protein, grönsaker och rimliga kolhydrater. Använd användarens mål, profil, aktivitetsnivå, nuvarande vikt, målvikt, viktlogg, måltider, checklista, steg, energi och humör när det är relevant. Håll tonen varm, stödjande och praktisk. Ge inte medicinsk diagnos, behandlingsråd, extrema dieter, fasta-råd eller farliga råd. Föreslå hållbara vanor och säg vid behov att användaren bör kontakta vården vid medicinska frågor. Avsluta alltid med exakt en enkel handling för i dag, formulerad som: "Dagens enkla handling: ...".',
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

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

function hasBedtimeEatingContext(message, chatHistory = []) {
  const text = [
    ...chatHistory.slice(-4).map((entry) => entry?.text ?? ''),
    message,
  ]
    .join(' ')
    .toLowerCase()

  return (
    (text.includes('lägga mig') ||
      text.includes('sova') ||
      text.includes('läggdags') ||
      text.includes('innan jag ska lägga')) &&
    (text.includes('äter') ||
      text.includes('äta') ||
      text.includes('åt') ||
      text.includes('mat'))
  )
}

function asksIfHarmful(message) {
  const text = message.toLowerCase()

  return (
    text.includes('skadligt') ||
    text.includes('farligt') ||
    text.includes('dåligt för kroppen') ||
    text.includes('inte bra för kroppen')
  )
}

function makeMockReply(message, context, chatHistory = []) {
  const text = message.toLowerCase()
  const mealPlanReply = makeMealPlanReply(message)
  const currentWeight = context.current.weight
  const goal = context.profile.goal

  if (mealPlanReply) {
    return mealPlanReply
  }

  if (/^(hej|hejsan|hallå|tjena|god morgon|god kväll)[!.\s]*$/i.test(message.trim())) {
    return 'Hej! Hur kan jag hjälpa dig idag?'
  }

  if (asksIfHarmful(message) && hasBedtimeEatingContext(message, chatHistory)) {
    return 'För de flesta är det inte skadligt att äta nära läggdags. Däremot kan det påverka sömn, reflux, hunger­vanor eller göra det lättare att äta mer än man tänkt för vissa. Om du är hungrig sent kan du testa något lättare, som yoghurt, ägg, keso eller en liten macka. Prova också att ändra tajming och portionsstorlek några kvällar och se hur kroppen reagerar.'
  }

  if (asksIfHarmful(message)) {
    return 'Oftast beror det på vad det gäller, mängd och hur du mår av det. Det är sällan en enskild vana är “skadlig” i sig, men den kan påverka sömn, energi, mage eller rutiner. Berätta gärna vad du syftar på, så kan jag svara mer konkret.'
  }

  if (text.includes('hur mycket') && text.includes('väger')) {
    return Number.isFinite(Number(currentWeight))
      ? `Din senaste registrerade vikt är ${Number(currentWeight).toLocaleString('sv-SE', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })} kg.`
      : 'Jag hittar ingen giltig vikt i loggen just nu.'
  }

  if (text.includes('pizza') || text.includes('sugen')) {
    const goalHint =
      goal === 'gå ner i vikt'
        ? 'Om målet är viktnedgång kan du fortfarande äta pizza.'
        : 'Det kan absolut få plats i en vanlig rutin.'

    return `${goalHint} Ta en normal portion och komplettera gärna med sallad eller något proteinrikt om du vill bli mättare. Är det lunch eller middag du funderar på?`
  }

  if (
    (text.includes('åt') || text.includes('ätit')) &&
    (text.includes('dåligt') || text.includes('onyttigt') || text.includes('helgen'))
  ) {
    return `Det är lugnt, en helg förstör ingenting. Gör en enkel reset: drick vatten, ät en vanlig proteinrik måltid och ta en kort promenad om det känns bra. Försök gå tillbaka till rutinen utan att kompensera hårt. Vad var det som gjorde helgen svårast?`
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
    return `Det händer alla. Försök fokusera på nästa lilla steg i stället för hela målet. Det kan räcka med något väldigt enkelt i dag. Vad känns svårast just nu – maten, träningen eller att hålla rutinen?`
  }

  if (text.includes('protein') || text.includes('lunch')) {
    return `Billig proteinrik lunch:
• Tonfisk + ris + majs
• Äggwrap + keso + grönsaker
• Linsgryta + potatis

Välj en och upprepa den i veckan.`
  }

  if (text.includes('vikt') || text.includes('mål')) {
    if (goal === 'gå ner i vikt') {
      return 'Titta helst på vikttrenden över flera dagar, inte bara en enskild vägning. Vill du att jag jämför de senaste registreringarna åt dig?'
    }

    if (goal === 'bygga muskler') {
      return 'För muskelbygge är vikten bara en del av bilden. Det är ofta mer användbart att följa styrka, energi, protein och återhämtning.'
    }

    return 'Om målet är att hålla vikten är en stabil trend oftast ett bra tecken. Titta på veckosnittet snarare än en enskild dag.'
  }

  return 'Jag förstår. Vill du att jag hjälper dig med mat, motivation eller en enkel plan framåt?'
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
    reply: makeMockReply(message, context, details.chatHistory),
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
        chatHistory: Array.isArray(body.chatHistory)
          ? body.chatHistory.slice(-8)
          : [],
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
        max_output_tokens: 360,
        instructions:
          'Du är Viktkollens svenska wellness-assistent i chatten. Svara alltid på svenska och låt det kännas som ett naturligt samtal, inte en rapport. Svara på användarens faktiska fråga först och använd chatthistoriken för att förstå följdfrågor. Använd inte generiska fallbackfrågor om meddelandet kan tolkas utifrån historiken. För hälsningar som "hej", svara naturligt: "Hej! Hur kan jag hjälpa dig idag?" Kort som standard: 2-6 meningar. Använd punktlista bara när det gör svaret tydligare. Ställ gärna en kort följdfråga när det hjälper samtalet. Använd profil, mål, viktlogg, måltider, checklista, steg, energi och humör som tyst kontext. Nämn inte steg, energi eller checklista om frågan inte handlar om aktivitet, ork, daglig status eller planering. Upprepa inte vikt, målvikt, mål eller disclaimer om det inte är relevant. Om användaren frågar om något är skadligt eller farligt, svara direkt med säker generell wellness-vägledning utan medicinsk diagnos. Om historiken handlar om att äta precis innan läggdags och användaren frågar om det är skadligt: säg att det oftast inte är skadligt för de flesta, men att det kan påverka sömn, reflux, hungervanor eller kaloriintag för vissa; föreslå lättare alternativ om personen är hungrig och att testa tajming och portionsstorlek. Om användaren frågar "Hur mycket väger jag nu?", svara bara med senaste registrerade vikt. För "Jag åt dåligt hela helgen": svara empatiskt och ge en enkel reset-plan utan skuld eller hård kompensation. För pizza eller sug: normalisera, ge praktiskt portions-/balanstips och fråga om måltidssituation. För dålig motivation: var empatisk och fråga vad som känns svårast. För flerdagars matplan: använd kompakt format "Dag 1: ...". Använd chatthistoriken för att variera formuleringar och undvik att återanvända samma öppningsfras flera gånger. Om målet är "hålla vikten", prata inte om viktminskning eller avstånd till målvikt. Prata bara om viktminskning när målet är "gå ner i vikt". Prata bara om muskelbygge när målet är "bygga muskler". Wellness-stöd endast: ge inte diagnos, behandling, extrema dieter eller fasta-råd. Avsluta inte alltid med action item.',
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
          chatHistory: Array.isArray(body.chatHistory)
            ? body.chatHistory.slice(-8)
            : [],
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
        chatHistory: Array.isArray(body.chatHistory)
          ? body.chatHistory.slice(-8)
          : [],
        hasApiKey,
        model,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

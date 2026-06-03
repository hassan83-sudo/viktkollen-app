const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-4.1-mini'
const CHAT_INSTRUCTIONS = [
  'Du är Viktkollens smarta svenska wellness-assistent i chatten. Svara alltid på svenska och låt det kännas som ett naturligt samtal, ungefär som ChatGPT.',
  'Läs hela konversationen, förstå följdfrågor och svara på användarens faktiska fråga först. Använd hälsokontexten endast när den hjälper, och tvinga inte in coaching i varje svar.',
  'Identifiera användarens intention innan du svarar. Matcha inte bara nyckelord: en fråga om "hur många gram protein per dag" är nutrition-kunskap, inte lunchförslag. Ge lunchidéer bara när användaren faktiskt frågar efter lunch, måltid eller matförslag.',
  'Skilj tydligt mellan nutrition-kunskap, måltidsförslag, viktfrågor, sömnfrågor, motivation, träning och hälsningar.',
  'Om användaren ställer flera frågor i samma meddelande ska du svara på varje del, kort och tydligt. Exempel: om frågan gäller både vad personen ska äta idag och när det är bra att sova, ge både matförslag och sömnråd.',
  'Använd senaste chatthistoriken för att tolka referenser som "det", "så", "detta", "är det farligt?" och "är det skadligt?". Om senaste ämnet var att äta precis innan sömn ska "det" tolkas som att äta nära läggdags.',
  'Kort som standard: 2-6 meningar; längre bara när användaren ber om det. Ställ följdfrågor när det är användbart. Undvik repetitiva fraser och upprepa inte steg, energi, checklista, vikt, mål eller disclaimer om det inte är relevant.',
  'För hälsningar som "hej", svara naturligt. För sömnfrågor: säg att 7-9 timmar är en bra riktlinje för de flesta vuxna, rekommendera konsekvent läggtid och räkna enkelt bakåt om användaren nämner uppstigningstid.',
  'Om användaren frågar om något är skadligt eller farligt, svara direkt med säker generell wellness-vägledning utan medicinsk diagnos. Använd historiken om frågan är en följdfråga.',
  'För att äta nära läggdags: säg att det oftast inte är skadligt för de flesta, men kan påverka sömn, reflux, hungervanor eller kaloriintag; föreslå lättare alternativ om personen är hungrig och att testa tajming och portionsstorlek.',
  'För frågor som "hur kan jag gå ner 2 kg på en vecka": svara säkert, förklara att snabb viktnedgång kan vara svår att behålla och ofta delvis är vätska, föreslå realistiska vanor i stället för extrema dieter. Vägra bara om användaren ber om farlig metod.',
  'Om användaren frågar "Hur mycket väger jag nu?", svara bara med senaste registrerade vikt. För "Jag åt dåligt hela helgen": svara empatiskt och ge en enkel reset-plan utan skuld eller hård kompensation.',
  'Om målet är "hålla vikten", prata inte om viktminskning eller avstånd till målvikt. Prata bara om viktminskning när målet är "gå ner i vikt". Prata bara om muskelbygge när målet är "bygga muskler".',
  'Wellness-stöd endast: ge inte diagnos, behandling, extrema dieter eller fasta-råd. Bara om meddelandet är tomt eller omöjligt att förstå får du be användaren skriva om.',
].join(' ')

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

function sanitizeChatHistory(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .slice(-20)
    .map((entry) => ({
      role: entry?.role === 'assistant' ? 'assistant' : 'user',
      text: sanitizeText(entry?.text),
    }))
    .filter((entry) => entry.text)
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

function formatHealthContextForModel(context) {
  return [
    `Profil: ${JSON.stringify(context.profile)}`,
    `Vikt och trenddata: aktuell vikt ${context.current.weight ?? 'saknas'}`,
    `Måltider: ${context.current.meals}`,
    `Matchecklista: ${context.current.checklistScore} (${context.current.checklist})`,
    `Dagens check-in: ${context.current.steps} steg, energi ${context.current.energy}, humör ${context.current.mood}, träning/rörelse ${context.current.workout ? 'ja' : 'nej'}`,
  ].join('\n')
}

function buildConversationInput(message, context, chatHistory) {
  const conversation = chatHistory.map((entry) => ({
    role: entry.role,
    content: [
      {
        type: 'input_text',
        text: entry.text,
      },
    ],
  }))

  return [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: `Hälsokontext för Viktkollen. Använd bara när det hjälper svaret:\n${formatHealthContextForModel(context)}`,
        },
      ],
    },
    ...conversation,
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: message,
        },
      ],
    },
  ]
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
      text.includes('sover') ||
      text.includes('läggdags') ||
      text.includes('lägger mig') ||
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

function asksAboutRapidWeightLoss(message) {
  const text = message.toLowerCase()

  return (
    (text.includes('gå ner') ||
      text.includes('tappa') ||
      text.includes('minska')) &&
    text.includes('kg') &&
    (text.includes('vecka') ||
      text.includes('snabbt') ||
      text.includes('fort'))
  )
}

function asksAboutSleep(message) {
  const text = message.toLowerCase()

  return text.includes('sov') || text.includes('sömn') || text.includes('sova')
}

function asksAboutFood(message) {
  const text = message.toLowerCase()

  return (
    text.includes('mat') ||
    text.includes('äta') ||
    text.includes('äter') ||
    text.includes('middag') ||
    text.includes('ikväll')
  )
}

function asksAboutProteinKnowledge(message) {
  const text = message.toLowerCase()

  return (
    text.includes('protein') &&
    (text.includes('hur mycket') ||
      text.includes('hur många') ||
      text.includes('gram') ||
      text.includes('per dag') ||
      text.includes('om dagen') ||
      text.includes('rekommend') ||
      text.includes('bra för'))
  )
}

function asksForMealSuggestion(message) {
  const text = message.toLowerCase()

  return (
    text.includes('lunch') ||
    text.includes('middag') ||
    text.includes('ikväll') ||
    text.includes('mellanmål') ||
    text.includes('vad ska jag äta') ||
    text.includes('matförslag') ||
    (text.includes('billig') && text.includes('proteinrik'))
  )
}

function isMeaninglessMessage(message) {
  const text = message.trim().toLowerCase()

  return (
    text.length === 0 ||
    /^[^\p{L}\p{N}]+$/u.test(text) ||
    /^(ok|okej|mm|mhm|test|asdf|qwerty)$/i.test(text)
  )
}

function makeCommonWellnessReply(message) {
  const text = message.toLowerCase()

  if (text.includes('sov') || text.includes('sömn') || text.includes('sova')) {
    return 'För de flesta vuxna är 7–9 timmars sömn en bra riktlinje. 8 timmar är alltså ett bra mål, men det viktigaste är hur du mår på dagen och om sömnen känns återhämtande.'
  }

  if (text.includes('stress') || text.includes('stressad')) {
    return 'Stress påverkar både energi, hunger och motivation. Testa att sänka kraven för resten av dagen: ät något enkelt, ta fem lugna minuter och välj bara en sak som behöver bli gjord. Vad stressar mest just nu?'
  }

  if (text.includes('träna') || text.includes('träning') || text.includes('gym') || text.includes('promenad')) {
    return 'Ja, rörelse är oftast en bra idé om kroppen känns okej. Håll nivån efter dagsformen: promenad om du är trött, styrka eller intervaller om du har mer energi. Vad hade du tänkt träna?'
  }

  if (text.includes('vana') || text.includes('rutin') || text.includes('disciplin')) {
    return 'Börja mindre än du tycker behövs. En vana fastnar lättare om den är enkel att upprepa, till exempel samma frukost, en kort promenad eller att logga första måltiden. Vilken rutin vill du få ordning på?'
  }

  if (text.includes('mat') || text.includes('hungrig') || text.includes('äta')) {
    return 'Sikta på något enkelt: protein, en kolhydratkälla och frukt eller grönsaker. Till exempel äggmacka, kyckling med ris eller yoghurt med bär. Vill du ha förslag för frukost, lunch eller middag?'
  }

  return ''
}

function makeSleepReply(message) {
  const text = message.toLowerCase()
  const wakeMatch = text.match(/(?:vakna|går upp|upp)\s*(?:kl\.?|klockan)?\s*(\d{1,2})(?::|\.?)(\d{2})?/)
  const wakeHour = wakeMatch ? Number(wakeMatch[1]) : null
  const wakeMinute = wakeMatch?.[2] ? Number(wakeMatch[2]) : 0

  if (Number.isFinite(wakeHour) && wakeHour >= 0 && wakeHour <= 23) {
    const bedtimeStart = new Date(0, 0, 0, wakeHour, wakeMinute)
    bedtimeStart.setHours(bedtimeStart.getHours() - 9)
    const bedtimeEnd = new Date(0, 0, 0, wakeHour, wakeMinute)
    bedtimeEnd.setHours(bedtimeEnd.getHours() - 7)
    const formatTime = (date) =>
      date.toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
      })

    return `För de flesta vuxna är 7-9 timmars sömn en bra riktlinje. Om du ska gå upp ${formatTime(new Date(0, 0, 0, wakeHour, wakeMinute))} kan ett rimligt sovfönster vara ungefär ${formatTime(bedtimeStart)}-${formatTime(bedtimeEnd)}. Försök hålla tiden ganska jämn även på vardagar.`
  }

  return 'För de flesta vuxna är 7-9 timmars sömn en bra riktlinje. 8 timmar är ett bra mål, men försök framför allt ha en ganska konsekvent läggtid och se hur pigg du är dagen efter.'
}

function makeRapidWeightLossReply() {
  return 'Att gå ner 2 kg på en vecka kan hända, men mycket är ofta vätska och det kan vara svårt att behålla. Sikta hellre på vanor som går att upprepa: protein i varje måltid, mycket grönsaker, lagom portioner, vardagsrörelse och bra sömn. Undvik extrem svält eller hård kompensation. Vill du kan jag göra en enkel 7-dagars plan som är rimlig och inte extrem.'
}

function makeBedtimeEatingReply() {
  return 'För de flesta är det inte skadligt att äta nära läggdags. Det kan däremot påverka sömn, reflux, hungervanor eller göra det lättare att äta mer än man tänkt. Om du är hungrig sent, testa något lättare som yoghurt, ägg, keso eller en liten macka. Prova också tidigare middag eller mindre portion några kvällar och se vad som funkar.'
}

function makeProteinKnowledgeReply(message) {
  const text = message.toLowerCase()
  const weightMatch = text.match(/(\d{2,3})(?:\s?kg|\s?kilo)/)
  const bodyWeight = weightMatch ? Number(weightMatch[1]) : null

  if (Number.isFinite(bodyWeight)) {
    const lower = Math.round(bodyWeight * 1.2)
    const upper = Math.round(bodyWeight * 1.6)
    const activeUpper = Math.round(bodyWeight * 2)

    return `För en person som väger ${bodyWeight} kg är ett rimligt riktmärke ofta cirka ${lower}-${upper} g protein per dag. Om personen styrketränar mycket eller vill bygga muskler kan ungefär ${upper}-${activeUpper} g per dag vara mer relevant. Fördela gärna över 3-4 måltider, till exempel 25-40 g per måltid.`
  }

  return 'Ett vanligt riktmärke är cirka 1,2-1,6 g protein per kilo kroppsvikt per dag för en aktiv vardag. Vid mycket styrketräning kan behovet ligga högre, ofta runt 1,6-2,0 g/kg. Fördela det gärna över flera måltider.'
}

function makeMultiPartReply(message, chatHistory = []) {
  const parts = []

  if (asksForMealSuggestion(message) || asksAboutFood(message)) {
    parts.push(`Mat idag: välj något enkelt och mättande:
• Kyckling + potatis + frysta grönsaker
• Äggwrap med keso och vitkål
• Linsgryta med ris`)
  }

  if (asksAboutSleep(message)) {
    parts.push(makeSleepReply(message))
  }

  if (asksIfHarmful(message) && hasBedtimeEatingContext(message, chatHistory)) {
    parts.push(makeBedtimeEatingReply())
  }

  if (asksAboutRapidWeightLoss(message)) {
    parts.push(makeRapidWeightLossReply())
  }

  return parts.length > 1 ? parts.join('\n\n') : ''
}

function makeMockReply(message, context, chatHistory = []) {
  const text = message.toLowerCase()
  const mealPlanReply = makeMealPlanReply(message)
  const currentWeight = context.current.weight
  const goal = context.profile.goal

  if (isMeaninglessMessage(message)) {
    return 'Jag hängde inte riktigt med där. Skriv gärna frågan en gång till.'
  }

  const multiPartReply = makeMultiPartReply(message, chatHistory)

  if (multiPartReply) {
    return multiPartReply
  }

  if (mealPlanReply) {
    return mealPlanReply
  }

  if (/^(hej|hejsan|hallå|tjena|god morgon|god kväll)[!.\s]*$/i.test(message.trim())) {
    return 'Hej! Hur kan jag hjälpa dig idag?'
  }

  if (asksAboutRapidWeightLoss(message)) {
    return makeRapidWeightLossReply()
  }

  if (asksAboutProteinKnowledge(message)) {
    return makeProteinKnowledgeReply(message)
  }

  if (asksIfHarmful(message) && hasBedtimeEatingContext(message, chatHistory)) {
    return makeBedtimeEatingReply()
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

  if (
    text.includes('middag') ||
    text.includes('ikväll') ||
    text.includes('vad ska jag äta')
  ) {
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

  if (asksAboutSleep(message)) {
    return makeSleepReply(message)
  }

  if (text.includes('proteinrik lunch') || text.includes('lunch')) {
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

  return makeCommonWellnessReply(message) || 'Jag hängde inte riktigt med där. Kan du skriva lite mer om vad du menar?'
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
    reply: makeMockReply(message, context, details.chatHistory ?? []),
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
  const chatHistory = sanitizeChatHistory(body.chatHistory)

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
        chatHistory,
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
        instructions: CHAT_INSTRUCTIONS,
        input: buildConversationInput(message, context, chatHistory),
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
          chatHistory,
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
        chatHistory,
        hasApiKey,
        model,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

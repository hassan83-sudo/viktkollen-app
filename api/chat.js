const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-4.1-mini'

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

  if (text.includes('middag') || text.includes('ikväll') || text.includes('äta')) {
    return `${name}, välj en enkel middag för ${goal}: protein, mycket grönt och en lagom kolhydratkälla. Håll det snällt och hållbart.`
  }

  if (text.includes('mellanmål')) {
    return `Testa yoghurt eller kvarg med bär, eller ägg på knäckebröd. Bra när energin är ${context.current.energy}/10.`
  }

  if (text.includes('motivation')) {
    return `${name}, gör nästa steg litet: fyll i en vana, ta en kort promenad eller planera nästa måltid. Inget extremt behövs.`
  }

  if (text.includes('protein') || text.includes('lunch')) {
    return `Billigt och proteinrikt: ägg, tonfisk, bönor eller kyckling med ris/potatis och grönsaker. Anpassa portionen efter hunger.`
  }

  return `${name}, håll det enkelt: protein i nästa måltid, lite rörelse efter energi och en punkt till i checklistan. Allmänt stöd, inte medicinsk rådgivning.`
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

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  const body = request.body ?? {}
  const message = sanitizeText(body.message)
  const context = formatContext(body)

  if (!message) {
    return response.status(400).json({ error: 'Message is required' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(200).json({
      reply: makeMockReply(message, context),
      source: 'mock',
    })
  }

  try {
    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        max_output_tokens: 180,
        instructions:
          'Du är Viktkollens svenska AI-coach för allmänt välmående. Svara kort, varmt och mobilvänligt på svenska. Använd användarens profil, mål, viktlogg, måltider, checklista, steg, energi och humör. Ge inte medicinsk diagnos, behandlingsråd, extrema dieter eller farliga råd. Föreslå hållbara vanor och säg vid behov att användaren bör kontakta vården vid medicinska frågor.',
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
      throw new Error(`OpenAI request failed: ${openaiResponse.status}`)
    }

    const data = await openaiResponse.json()
    const reply = extractResponseText(data)

    return response.status(200).json({
      reply: reply || makeMockReply(message, context),
      source: reply ? 'openai' : 'mock',
    })
  } catch {
    return response.status(200).json({
      reply: makeMockReply(message, context),
      source: 'mock',
    })
  }
}

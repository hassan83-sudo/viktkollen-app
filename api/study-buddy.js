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

function sanitizeOptions(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((option) => sanitizeText(option)).filter(Boolean).slice(0, 4)
}

function makeFallbackHint(question, subject) {
  if (!question) {
    return 'Välj en fråga först, så kan jag ge en kort hint.'
  }

  return `Titta på nyckelorden i ${subject || 'ämnet'} och försök utesluta två svar som känns minst rimliga. Fokusera på metoden, inte på att gissa direkt.`
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

function fallbackPayload(question, subject, reason, details = {}) {
  const message =
    reason === 'missing_openai_api_key'
      ? 'OPENAI_API_KEY saknas på servern. Fyll i .env.local eller hostingens miljövariabler för riktiga AI-hints.'
      : 'AI Study Buddy använder fallback-hint just nu.'

  return {
    hint: makeFallbackHint(question, subject),
    message,
    source: 'mock',
    fallbackReason: reason,
    ...(isDevelopment() && { debug: details }),
  }
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
    return response.status(400).json({
      error: 'Invalid JSON request body',
      ...(isDevelopment() && { detail: error.message }),
    })
  }

  const subject = sanitizeText(body.subject, 'okänt ämne')
  const question = sanitizeText(body.question)
  const options = sanitizeOptions(body.options)
  const answer = sanitizeText(body.answer)

  if (!question) {
    return response.status(400).json({ error: 'Question is required' })
  }

  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL

  if (!hasApiKey) {
    return response.status(200).json(
      fallbackPayload(question, subject, 'missing_openai_api_key', {
        hasApiKey,
        model,
      }),
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
        max_output_tokens: 90,
        instructions:
          'Du är PluggArenas AI Study Buddy. Svara alltid på svenska. Ge en kort pedagogisk hint, max 2 meningar. Hjälp eleven förstå metoden. Avslöja inte hela svaret och skriv inte "rätt svar är".',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  `Ämne: ${subject}`,
                  `Fråga: ${question}`,
                  `Svarsalternativ: ${options.join(', ')}`,
                  `Rätt svar, endast för din förståelse och får inte avslöjas direkt: ${answer}`,
                ].join('\n'),
              },
            ],
          },
        ],
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      throw new Error(`OpenAI request failed: ${openaiResponse.status} ${errorText.slice(0, 400)}`)
    }

    const data = await openaiResponse.json()
    const hint = extractResponseText(data)

    if (!hint) {
      return response.status(200).json(
        fallbackPayload(question, subject, 'empty_openai_response', {
          hasApiKey,
          model,
        }),
      )
    }

    return response.status(200).json({
      hint,
      source: 'openai',
      ...(isDevelopment() && {
        debug: {
          executedOpenAIRequest: true,
          model,
        },
      }),
    })
  } catch (error) {
    console.error('[api/study-buddy] OpenAI call failed, returning fallback', {
      error: error instanceof Error ? error.message : String(error),
      model,
    })

    return response.status(200).json(
      fallbackPayload(question, subject, 'openai_request_failed', {
        error: error instanceof Error ? error.message : String(error),
        hasApiKey,
        model,
      }),
    )
  }
}

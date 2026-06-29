/* global process */

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_VISION_MODEL = 'gpt-4.1-mini'
const OPENAI_TIMEOUT_MS = 30000

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

function parseJsonResponse(text) {
  const trimmedText = text.trim()
  const jsonText = trimmedText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  return JSON.parse(jsonText)
}

function createTimeoutSignal() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  return {
    clear: () => clearTimeout(timeoutId),
    signal: controller.signal,
  }
}

/**
 * Analyzes body images with OpenAI Vision.
 *
 * @param {{dataUrl: string}} frontImage
 * @param {{dataUrl: string}} sideImage
 * @param {string} prompt
 * @param {object | null} previousAnalysis
 * @returns {Promise<object>}
 */
export async function analyzeBodyImages(
  frontImage,
  sideImage,
  prompt,
  previousAnalysis = null,
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing')
  }

  const model =
    process.env.OPENAI_VISION_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_VISION_MODEL
  const timeout = createTimeoutSignal()

  try {
    void previousAnalysis

    const response = await fetch(OPENAI_API_URL, {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                text: prompt,
                type: 'input_text',
              },
              {
                image_url: frontImage.dataUrl,
                type: 'input_image',
              },
              {
                image_url: sideImage.dataUrl,
                type: 'input_image',
              },
            ],
            role: 'user',
          },
        ],
        max_output_tokens: 900,
        model,
      }),
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: timeout.signal,
    })

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`)
    }

    const data = await response.json()
    const text = extractResponseText(data)

    if (!text) {
      throw new Error('OpenAI returned an empty response')
    }

    return parseJsonResponse(text)
  } finally {
    timeout.clear()
  }
}
